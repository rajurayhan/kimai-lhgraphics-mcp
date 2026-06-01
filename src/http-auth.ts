import type { IncomingHttpHeaders } from "node:http";
import {
  KimaiClient,
  loadKimaiConfigFromEnv,
  type KimaiConfig,
} from "./kimai-client.js";

function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const raw = headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function loadHttpServerConfig(): {
  sharedSecret: string | undefined;
  kimaiBaseUrl: string;
  allowedHosts: string[] | undefined;
} {
  const baseUrl = process.env.KIMAI_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("Set KIMAI_BASE_URL for HTTP mode");
  }

  const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  return {
    sharedSecret: process.env.MCP_SHARED_SECRET?.trim() || undefined,
    kimaiBaseUrl: baseUrl.replace(/\/+$/, ""),
    allowedHosts: allowedHosts?.length ? allowedHosts : undefined,
  };
}

export function verifySharedSecret(
  headers: IncomingHttpHeaders,
  sharedSecret: string | undefined,
): boolean {
  if (!sharedSecret) return true;
  const auth = headerValue(headers, "authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice("Bearer ".length) === sharedSecret;
}

export function resolveKimaiConfigFromHeaders(
  headers: IncomingHttpHeaders,
  kimaiBaseUrl: string,
): KimaiConfig {
  const username =
    headerValue(headers, "x-kimai-user") ??
    headerValue(headers, "x-auth-user") ??
    process.env.KIMAI_USERNAME ??
    process.env.KIMAI_USER ??
    "";
  const apiToken =
    headerValue(headers, "x-kimai-token") ??
    headerValue(headers, "x-auth-token") ??
    process.env.KIMAI_API_TOKEN ??
    process.env.KIMAI_TOKEN ??
    "";

  if (!username || !apiToken) {
    throw new Error(
      "Missing Kimai credentials. Send X-KIMAI-USER and X-KIMAI-TOKEN headers, or set KIMAI_USERNAME and KIMAI_API_TOKEN on the server.",
    );
  }

  return {
    baseUrl: kimaiBaseUrl,
    username,
    apiToken,
  };
}

export function createKimaiClientFromHeaders(
  headers: IncomingHttpHeaders,
  kimaiBaseUrl: string,
): KimaiClient {
  return new KimaiClient(resolveKimaiConfigFromHeaders(headers, kimaiBaseUrl));
}

export function createKimaiClientForStdio(): KimaiClient {
  return new KimaiClient(loadKimaiConfigFromEnv());
}
