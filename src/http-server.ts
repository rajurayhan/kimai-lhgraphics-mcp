#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadProjectEnv } from "./load-env.js";
import {
  createKimaiClientFromHeaders,
  loadHttpServerConfig,
  verifySharedSecret,
} from "./http-auth.js";
import { createKimaiMcpServer } from "./kimai-server.js";

type SessionEntry = {
  transport: StreamableHTTPServerTransport;
};

function jsonRpcError(res: Response, status: number, message: string) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

async function main() {
  loadProjectEnv();
  const { sharedSecret, kimaiBaseUrl, allowedHosts } = loadHttpServerConfig();
  const host = process.env.MCP_HOST ?? "0.0.0.0";
  const port = Number(process.env.MCP_PORT ?? "3000");
  const path = process.env.MCP_PATH ?? "/mcp";

  const app = createMcpExpressApp({ host, allowedHosts });
  const sessions: Record<string, SessionEntry> = {};

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "kimai-mcp" });
  });

  const handleMcp = async (
    req: import("express").Request,
    res: Response,
  ) => {
    if (!verifySharedSecret(req.headers, sharedSecret)) {
      jsonRpcError(res, 401, "Unauthorized");
      return;
    }

    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader)
      ? sessionIdHeader[0]
      : sessionIdHeader;

    try {
      let entry: SessionEntry | undefined =
        sessionId !== undefined ? sessions[sessionId] : undefined;

      if (!entry && !sessionId && isInitializeRequest(req.body)) {
        const client = createKimaiClientFromHeaders(req.headers, kimaiBaseUrl);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions[sid] = { transport };
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions[sid]) delete sessions[sid];
        };

        const server = createKimaiMcpServer(client);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!entry) {
        jsonRpcError(res, 400, "Bad Request: No valid session ID provided");
        return;
      }

      await entry.transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        jsonRpcError(res, 500, message);
      }
    }
  };

  app.post(path, handleMcp);
  app.get(path, async (req, res) => {
    if (!verifySharedSecret(req.headers, sharedSecret)) {
      res.status(401).send("Unauthorized");
      return;
    }

    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader)
      ? sessionIdHeader[0]
      : sessionIdHeader;
    const entry = sessionId !== undefined ? sessions[sessionId] : undefined;

    if (!entry) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    await entry.transport.handleRequest(req, res);
  });

  app.delete(path, async (req, res) => {
    if (!verifySharedSecret(req.headers, sharedSecret)) {
      res.status(401).send("Unauthorized");
      return;
    }

    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader)
      ? sessionIdHeader[0]
      : sessionIdHeader;
    const entry = sessionId !== undefined ? sessions[sessionId] : undefined;

    if (!entry) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    await entry.transport.handleRequest(req, res);
    if (sessionId && sessions[sessionId]) delete sessions[sessionId];
  });

  app.listen(port, host, () => {
    console.error(
      `Kimai MCP HTTP server listening on http://${host}:${port}${path}`,
    );
    if (sharedSecret) {
      console.error("Team gate enabled via MCP_SHARED_SECRET (Bearer token).");
    } else {
      console.error(
        "Warning: MCP_SHARED_SECRET is not set. Protect this endpoint with a reverse proxy or set a shared secret.",
      );
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
