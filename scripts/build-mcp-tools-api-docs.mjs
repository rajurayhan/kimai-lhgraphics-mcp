#!/usr/bin/env node
/**
 * Build mcp-tools-api-docs.json from doc.json for the MCP tools we expose.
 * Sanitizes Kimai's Swagger quirks and emits OpenAPI 3.0 for strict validators (e.g. MCPConnect).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import swagger2openapi from "swagger2openapi";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(fs.readFileSync(path.join(root, "doc.json"), "utf8"));

const toolEndpoints = [
  { tool: "kimai_ping", method: "get", path: "/api/ping" },
  { tool: "kimai_version", method: "get", path: "/api/version" },
  { tool: "kimai_me", method: "get", path: "/api/users/me" },
  { tool: "kimai_list_customers", method: "get", path: "/api/customers" },
  { tool: "kimai_list_projects", method: "get", path: "/api/projects" },
  { tool: "kimai_list_activities", method: "get", path: "/api/activities" },
  { tool: "kimai_list_tags", method: "get", path: "/api/tags" },
  { tool: "kimai_timesheet_config", method: "get", path: "/api/config/timesheet" },
  { tool: "kimai_list_timesheets", method: "get", path: "/api/timesheets" },
  { tool: "kimai_active_timers", method: "get", path: "/api/timesheets/active" },
  { tool: "kimai_recent_timesheets", method: "get", path: "/api/timesheets/recent" },
  { tool: "kimai_get_timesheet", method: "get", path: "/api/timesheets/{id}" },
  { tool: "kimai_create_timesheet", method: "post", path: "/api/timesheets" },
  { tool: "kimai_update_timesheet", method: "patch", path: "/api/timesheets/{id}" },
  { tool: "kimai_stop_timesheet", method: "patch", path: "/api/timesheets/{id}/stop" },
  { tool: "kimai_restart_timesheet", method: "patch", path: "/api/timesheets/{id}/restart" },
  { tool: "kimai_delete_timesheet", method: "delete", path: "/api/timesheets/{id}" },
  { tool: "kimai_hive_create_timesheet", method: "post", path: "/api/hive/timesheets" },
  {
    tool: "kimai_hive_get_project_budget",
    method: "get",
    path: "/api/hive/projects/{id}/budget",
  },
  {
    tool: "kimai_hive_update_project_budget",
    method: "put",
    path: "/api/hive/projects/{id}/budget",
  },
  { tool: "kimai_payroll_ping", method: "get", path: "/api/payroll/ping" },
  { tool: "kimai_payroll_statuses", method: "get", path: "/api/payroll/statuses" },
  { tool: "kimai_payroll_period", method: "get", path: "/api/payroll/period" },
  { tool: "kimai_payroll_biweekly", method: "get", path: "/api/payroll/biweekly" },
  { tool: "kimai_payroll_queues", method: "get", path: "/api/payroll/queues" },
  { tool: "kimai_payroll_users", method: "get", path: "/api/payroll/users" },
  {
    tool: "kimai_payroll_users_accessible",
    method: "get",
    path: "/api/payroll/users/accessible",
  },
  { tool: "kimai_payroll_approvals_list", method: "get", path: "/api/payroll/approvals" },
  { tool: "kimai_payroll_approval_get", method: "get", path: "/api/payroll/approvals/{id}" },
  { tool: "kimai_payroll_submit", method: "post", path: "/api/payroll/approvals" },
  {
    tool: "kimai_payroll_update_status",
    method: "post",
    path: "/api/payroll/approvals/{id}/status",
  },
  {
    tool: "kimai_payroll_resubmit",
    method: "post",
    path: "/api/payroll/approvals/{id}/resubmit",
  },
];

const NUMERIC_KEYS = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "multipleOf",
]);

/** Kimai exports some integer constraints as strings ("60", "1"). */
function sanitizeNumericConstraints(value) {
  if (Array.isArray(value)) return value.map(sanitizeNumericConstraints);
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (NUMERIC_KEYS.has(key) && typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw)) {
      out[key] = Number(raw);
    } else {
      out[key] = sanitizeNumericConstraints(raw);
    }
  }
  return out;
}

/** Deep Team graphs break strict dereferencing in some OpenAPI importers. */
const TEAM_LITE = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    color: { type: "string", description: "HTML hex color, e.g. #dd1d00" },
  },
};

const DEFINITION_OVERRIDES = {
  Team: TEAM_LITE,
  TeamMember: {
    type: "object",
    properties: {
      teamlead: { type: "boolean" },
      user: { $ref: "#/definitions/User" },
    },
  },
};

function collectRefNames(value, names = new Set()) {
  if (!value || typeof value !== "object") return names;
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefNames(item, names));
    return names;
  }
  if (typeof value.$ref === "string") {
    const match = value.$ref.match(/^#\/definitions\/(.+)$/);
    if (match) names.add(match[1]);
  }
  for (const v of Object.values(value)) collectRefNames(v, names);
  return names;
}

function buildPaths() {
  const paths = {};
  const missing = [];

  for (const ep of toolEndpoints) {
    const pathItem = doc.paths[ep.path];
    if (!pathItem?.[ep.method]) {
      missing.push(`${ep.tool}: ${ep.method.toUpperCase()} ${ep.path}`);
      continue;
    }
    if (!paths[ep.path]) paths[ep.path] = {};
    paths[ep.path][ep.method] = structuredClone(pathItem[ep.method]);
  }

  if (missing.length) {
    console.warn("Missing endpoints:", missing);
  }

  return paths;
}

function buildDefinitions(paths) {
  const needed = collectRefNames(paths);
  let changed = true;

  while (changed) {
    changed = false;
    for (const name of [...needed]) {
      const def = DEFINITION_OVERRIDES[name] ?? doc.definitions[name];
      if (!def) continue;
      const refs = collectRefNames(def);
      for (const ref of refs) {
        if (!needed.has(ref)) {
          needed.add(ref);
          changed = true;
        }
      }
    }
  }

  const definitions = {};
  for (const name of [...needed].sort()) {
    const source = DEFINITION_OVERRIDES[name] ?? doc.definitions[name];
    if (source) definitions[name] = structuredClone(source);
  }

  return definitions;
}

const FALLBACK_SCHEMAS = {
  "/api/ping": {
    get: {
      "200": {
        type: "object",
        properties: { message: { type: "string", example: "pong" } },
      },
    },
  },
};

/** Kimai sometimes ships description-only responses or invalid examples arrays. */
function sanitizeResponses(paths) {
  for (const [route, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === "parameters" || !operation?.responses) continue;

      for (const [status, response] of Object.entries(operation.responses)) {
        if (Array.isArray(response.examples)) {
          delete response.examples;
        } else if (response.examples && typeof response.examples !== "object") {
          delete response.examples;
        }

        const code = Number(status);
        if (code === 204) {
          delete response.schema;
          continue;
        }

        if (code >= 200 && code < 300 && !response.schema && !response.$ref) {
          response.schema =
            FALLBACK_SCHEMAS[route]?.[method]?.[status] ?? {
              type: "object",
              additionalProperties: true,
              description: "Response body.",
            };
        }
      }
    }
  }
  return paths;
}

async function toOpenApi3(swaggerDoc) {
  const { openapi } = await swagger2openapi.convert(swaggerDoc, {
    patch: true,
    warnOnly: true,
  });
  openapi.servers = [{ url: "/" }];
  return openapi;
}

function stripExtensionFields(value) {
  if (Array.isArray(value)) return value.map(stripExtensionFields);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.startsWith("x-")) continue;
    out[key] = stripExtensionFields(raw);
  }
  return out;
}

const paths = sanitizeNumericConstraints(sanitizeResponses(buildPaths()));
const definitions = sanitizeNumericConstraints(buildDefinitions(paths));

const swagger = {
  swagger: doc.swagger,
  info: doc.info,
  securityDefinitions: doc.securityDefinitions,
  paths,
  definitions,
};

const out = stripExtensionFields(await toOpenApi3(swagger));

const outPath = path.join(root, "mcp-tools-api-docs.json");
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(
  `paths=${Object.keys(paths).length} definitions=${Object.keys(definitions).length} tools=${toolEndpoints.length}`,
);
