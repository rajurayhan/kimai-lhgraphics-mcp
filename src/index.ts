#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadProjectEnv } from "./load-env.js";
import { createKimaiClientForStdio } from "./http-auth.js";
import { createKimaiMcpServer } from "./kimai-server.js";

async function main() {
  loadProjectEnv();
  const client = createKimaiClientForStdio();
  const server = createKimaiMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
