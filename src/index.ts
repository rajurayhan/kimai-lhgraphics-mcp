#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KimaiClient, loadKimaiConfigFromEnv } from "./kimai-client.js";

function asStringRecord(
  raw: Record<string, unknown>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean")
      out[k] = String(v);
  }
  return out;
}

function toolJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

async function main() {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  dotenv.config({
    path: path.join(projectRoot, ".env"),
    // Prefer project .env over inherited shell/Cursor env (avoids stale KIMAI_*).
    override: true,
  });

  const cfg = loadKimaiConfigFromEnv();
  const client = new KimaiClient(cfg);

  const server = new Server(
    {
      name: "kimai-mcp",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "kimai_ping",
        description: "Test Kimai API connectivity (returns pong).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "kimai_version",
        description: "Get Kimai server version and release info.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "kimai_me",
        description: "Get the current API user (GET /api/users/me).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "kimai_list_customers",
        description: "List customers. Optional search term.",
        inputSchema: {
          type: "object",
          properties: {
            term: { type: "string", description: "Free-text search" },
            visible: {
              type: "string",
              description: "1=visible, 2=hidden, 3=both",
            },
            orderBy: { type: "string", enum: ["id", "name"] },
            order: { type: "string", enum: ["ASC", "DESC"] },
          },
        },
      },
      {
        name: "kimai_list_projects",
        description: "List projects. Filter by customer id or search term.",
        inputSchema: {
          type: "object",
          properties: {
            customer: { type: "string", description: "Customer ID" },
            term: { type: "string" },
            visible: { type: "string" },
            orderBy: { type: "string", enum: ["id", "name", "customer"] },
            order: { type: "string", enum: ["ASC", "DESC"] },
          },
        },
      },
      {
        name: "kimai_list_activities",
        description:
          "List activities. Filter by project id(s) or search term.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Single project ID" },
            projects: {
              type: "string",
              description: "Comma-separated project IDs",
            },
            term: { type: "string" },
            globals: { type: "string", description: "'true' for global only" },
            orderBy: { type: "string", enum: ["id", "name", "project"] },
            order: { type: "string", enum: ["ASC", "DESC"] },
          },
        },
      },
      {
        name: "kimai_list_tags",
        description: "List all tags, optionally filtered by name prefix/search.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Filter by tag name" },
          },
        },
      },
      {
        name: "kimai_timesheet_config",
        description: "Instance timesheet rules (running entry limits, etc.).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "kimai_list_timesheets",
        description:
          "List timesheet records with filters and pagination (GET /api/timesheets).",
        inputSchema: {
          type: "object",
          properties: {
            user: {
              type: "string",
              description: "User id or 'all' (requires permission)",
            },
            begin: {
              type: "string",
              description: "ISO/HTML5 datetime lower bound",
            },
            end: {
              type: "string",
              description: "ISO/HTML5 datetime upper bound",
            },
            active: { type: "string", description: "0=stopped, 1=active" },
            exported: { type: "string", description: "0 or 1" },
            billable: { type: "string", description: "0 or 1" },
            projects: {
              type: "string",
              description: "Comma-separated project IDs",
            },
            activities: {
              type: "string",
              description: "Comma-separated activity IDs",
            },
            customers: {
              type: "string",
              description: "Comma-separated customer IDs",
            },
            tags: { type: "string", description: "Comma-separated tag names" },
            term: { type: "string" },
            page: { type: "string" },
            size: { type: "string" },
            orderBy: { type: "string", enum: ["id", "begin", "end", "rate"] },
            order: { type: "string", enum: ["ASC", "DESC"] },
            full: {
              type: "string",
              description: "Pass 'true' for expanded serialization",
            },
          },
        },
      },
      {
        name: "kimai_active_timers",
        description: "Running timesheet entries for the current user.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "kimai_recent_timesheets",
        description:
          "Recent unique customer/project/activity combos (GET /api/timesheets/recent).",
        inputSchema: {
          type: "object",
          properties: {
            user: { type: "string" },
            begin: { type: "string" },
            size: { type: "string" },
          },
        },
      },
      {
        name: "kimai_get_timesheet",
        description: "Fetch one timesheet by id.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
      {
        name: "kimai_create_timesheet",
        description:
          "Create a timesheet record (start timer with no end, or log past time with end). Required: begin (ISO datetime), project id, activity id.",
        inputSchema: {
          type: "object",
          properties: {
            begin: { type: "string" },
            end: {
              type: "string",
              description: "Omit for running entry",
            },
            project: { type: "integer" },
            activity: { type: "integer" },
            description: { type: "string" },
            tags: { type: "string", description: "Comma-separated tag names" },
            billable: { type: "boolean" },
            user: {
              type: "integer",
              description: "User id (needs permission to book for others)",
            },
            full: {
              type: "string",
              description: "Pass 'true' for TimesheetEntityExpanded response",
            },
          },
          required: ["begin", "project", "activity"],
        },
      },
      {
        name: "kimai_update_timesheet",
        description: "PATCH an existing timesheet (partial update).",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "integer" },
            patch: {
              type: "object",
              description:
                "Subset of TimesheetEditForm: begin, end, project, activity, description, tags, billable, exported, fixedRate, hourlyRate, user",
            },
          },
          required: ["id", "patch"],
        },
      },
      {
        name: "kimai_stop_timesheet",
        description: "Stop a running timesheet record by id.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
      {
        name: "kimai_restart_timesheet",
        description:
          "Restart a stopped record for the current user (optionally copy=all).",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "integer" },
            copy: {
              type: "string",
              description: "Optional: all | tags | rates | meta | description",
            },
            begin: { type: "string", description: "Optional restart begin time" },
          },
          required: ["id"],
        },
      },
      {
        name: "kimai_delete_timesheet",
        description: "Delete a timesheet record (irreversible).",
        inputSchema: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
      {
        name: "kimai_hive_create_timesheet",
        description:
          "Hive & GPTs API: create a timesheet (POST /api/hive/timesheets). Simpler than core API; accepts datetime strings like '2024-03-20 10:00:00' per Kimai plugin docs.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "integer", description: "Project ID" },
            activity: { type: "integer", description: "Activity ID" },
            begin: {
              type: "string",
              description: "Start datetime (plugin format, e.g. YYYY-MM-DD HH:MM:SS)",
            },
            end: { type: "string", description: "End datetime (optional)" },
            duration: {
              type: "integer",
              description: "Duration in seconds (optional)",
            },
            description: { type: "string" },
          },
          required: ["project", "activity"],
        },
      },
      {
        name: "kimai_hive_get_project_budget",
        description:
          "Hive & GPTs API: get project budget settings (GET /api/hive/projects/{id}/budget).",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "integer", description: "Project ID" },
          },
          required: ["project_id"],
        },
      },
      {
        name: "kimai_hive_update_project_budget",
        description:
          "Hive & GPTs API: update project budget (PUT /api/hive/projects/{id}/budget). budgetType: 1=money, 2=time (per spec).",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "integer", description: "Project ID" },
            budgetType: {
              type: "integer",
              enum: [1, 2],
              description: "1 = money, 2 = time",
            },
            budgetAmount: { type: "number" },
            recurringBudgetAmount: {
              type: "number",
              description: "Optional; defaults to budgetAmount if omitted",
            },
            interval: {
              type: "string",
              description: "Optional ISO duration e.g. P0Y1M0D",
            },
            nextIntervalDate: {
              type: "string",
              description: "Optional date YYYY-MM-DD",
            },
          },
          required: ["project_id", "budgetType", "budgetAmount"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      if (name === "kimai_ping") {
        const r = await client.request("GET", "/api/ping");
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_version") {
        const r = await client.request("GET", "/api/version");
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_me") {
        const r = await client.request("GET", "/api/users/me");
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_list_customers") {
        const q = asStringRecord(args as Record<string, unknown>);
        const r = await client.request("GET", "/api/customers", { query: q });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_list_projects") {
        const q = asStringRecord(args as Record<string, unknown>);
        const r = await client.request("GET", "/api/projects", { query: q });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_list_activities") {
        const q = asStringRecord(args as Record<string, unknown>);
        const r = await client.request("GET", "/api/activities", { query: q });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_list_tags") {
        const q = asStringRecord(args as Record<string, unknown>);
        const r = await client.request("GET", "/api/tags", { query: q });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_timesheet_config") {
        const r = await client.request("GET", "/api/config/timesheet");
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_list_timesheets") {
        const q = asStringRecord(args as Record<string, unknown>);
        const r = await client.request("GET", "/api/timesheets", { query: q });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_active_timers") {
        const r = await client.request("GET", "/api/timesheets/active");
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_recent_timesheets") {
        const q = asStringRecord(args as Record<string, unknown>);
        const r = await client.request("GET", "/api/timesheets/recent", {
          query: q,
        });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_get_timesheet") {
        const id = Number(args.id);
        const r = await client.request("GET", `/api/timesheets/${id}`);
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_create_timesheet") {
        const full =
          args.full !== undefined ? String(args.full) : undefined;
        const body: Record<string, unknown> = {
          begin: args.begin,
          project: args.project,
          activity: args.activity,
        };
        if (args.end !== undefined) body.end = args.end;
        if (args.description !== undefined) body.description = args.description;
        if (args.tags !== undefined) body.tags = args.tags;
        if (args.billable !== undefined) body.billable = args.billable;
        if (args.user !== undefined) body.user = args.user;
        const r = await client.request("POST", "/api/timesheets", {
          query: full !== undefined ? { full } : undefined,
          body,
        });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_update_timesheet") {
        const id = Number(args.id);
        const patch = args.patch as Record<string, unknown>;
        const r = await client.request("PATCH", `/api/timesheets/${id}`, {
          body: patch,
        });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_stop_timesheet") {
        const id = Number(args.id);
        const r = await client.request("PATCH", `/api/timesheets/${id}/stop`);
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_restart_timesheet") {
        const id = Number(args.id);
        const body: Record<string, unknown> = {};
        if (args.copy !== undefined) body.copy = args.copy;
        if (args.begin !== undefined) body.begin = args.begin;
        const r = await client.request(
          "PATCH",
          `/api/timesheets/${id}/restart`,
          {
            body: Object.keys(body).length ? body : undefined,
          },
        );
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_delete_timesheet") {
        const id = Number(args.id);
        const r = await client.request("DELETE", `/api/timesheets/${id}`);
        return {
          content: [
            {
              type: "text",
              text: toolJson({
                status: r.status,
                body: r.json ?? (r.text || null),
              }),
            },
          ],
        };
      }
      if (name === "kimai_hive_create_timesheet") {
        const body: Record<string, unknown> = {
          project: args.project,
          activity: args.activity,
        };
        if (args.begin !== undefined) body.begin = args.begin;
        if (args.end !== undefined) body.end = args.end;
        if (args.duration !== undefined) body.duration = args.duration;
        if (args.description !== undefined) body.description = args.description;
        const r = await client.request("POST", "/api/hive/timesheets", {
          body,
        });
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_hive_get_project_budget") {
        const pid = Number(args.project_id);
        const r = await client.request(
          "GET",
          `/api/hive/projects/${pid}/budget`,
        );
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }
      if (name === "kimai_hive_update_project_budget") {
        const pid = Number(args.project_id);
        const body: Record<string, unknown> = {
          budgetType: args.budgetType,
          budgetAmount: args.budgetAmount,
        };
        if (args.recurringBudgetAmount !== undefined) {
          body.recurringBudgetAmount = args.recurringBudgetAmount;
        }
        if (args.interval !== undefined) body.interval = args.interval;
        if (args.nextIntervalDate !== undefined) {
          body.nextIntervalDate = args.nextIntervalDate;
        }
        const r = await client.request(
          "PUT",
          `/api/hive/projects/${pid}/budget`,
          { body },
        );
        return {
          content: [
            {
              type: "text",
              text: toolJson({ status: r.status, body: r.json ?? r.text }),
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: toolJson({ error: message }) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
