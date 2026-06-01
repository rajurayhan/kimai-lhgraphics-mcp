# Kimai MCP

A [Model Context Protocol](https://modelcontextprotocol.io/) (stdio) server that wraps the [Kimai](https://www.kimai.org/) JSON REST API so agents and assistants can query and manage time tracking on your instance.

Kimai expects **`X-AUTH-USER`** (username) and **`X-AUTH-TOKEN`** (API token). This project implements that and exposes focused tools for day-to-day time tracking and reporting.

## Requirements

- **Node.js 20+**
- A Kimai instance with API access enabled for your user
- `doc.json` in this repo is the Swagger 2 export from your server; use it as the full endpoint reference

## Setup

### 1. Install and build

```bash
cd /path/to/Kimai-MCP
npm install
npm run build
```

Compiled output is written to `dist/`.

### 2. Configure environment

Copy the example file and edit values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `KIMAI_BASE_URL` | Origin only, no trailing slash (e.g. `https://time.example.com`) |
| `KIMAI_USERNAME` | Kimai login username (same as for API auth; alias `KIMAI_USER`) |
| `KIMAI_API_TOKEN` | API token from the user profile in Kimai (alias `KIMAI_TOKEN`) |

On startup, the server loads **`Kimai-MCP/.env`** from the project directory next to the built `dist/` folder (via `dotenv`), so credentials do not need to live in your global Cursor config unless you prefer that.

Keep `.env` out of git; it is listed in `.gitignore`.

### 3. Run locally (stdio)

```bash
npm start
```

This mode is intended for MCP hosts (Cursor, Claude Desktop, etc.) that spawn the process and talk over stdin/stdout. Running it alone in a terminal will appear idle; that is expected.

## Team-wide shared server (HTTP)

For a **single deployed instance** the whole team connects to from Cursor, run the HTTP transport:

```bash
npm run build
npm run start:http
```

Or with Docker:

```bash
cp .env.example .env   # set KIMAI_BASE_URL and MCP_SHARED_SECRET
docker compose up -d --build
```

### Server environment

| Variable | Description |
|----------|-------------|
| `KIMAI_BASE_URL` | Your Kimai instance URL (required) |
| `MCP_SHARED_SECRET` | Team gate — clients send `Authorization: Bearer <secret>` |
| `MCP_HOST` | Bind address (default `0.0.0.0`) |
| `MCP_PORT` | Port (default `3000`) |
| `MCP_PATH` | MCP endpoint path (default `/mcp`) |
| `MCP_ALLOWED_HOSTS` | Comma-separated allowed `Host` header values |

Put the service behind **HTTPS** (nginx, Caddy, Cloudflare Tunnel). Example health check: `GET /health`.

### Per-user Kimai identity

Each team member still uses **their own Kimai API token**. The shared server forwards credentials from request headers on session init:

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <MCP_SHARED_SECRET>` |
| `X-KIMAI-USER` | Kimai username |
| `X-KIMAI-TOKEN` | Kimai API token from user profile |

If headers are omitted, the server falls back to `KIMAI_USERNAME` / `KIMAI_API_TOKEN` in its `.env` (single-user mode only).

### Cursor config (each team member)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kimai": {
      "url": "https://mcp.yourcompany.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TEAM_SECRET",
        "X-KIMAI-USER": "your-kimai-username",
        "X-KIMAI-TOKEN": "your-kimai-api-token"
      }
    }
  }
}
```

Restart MCP in Cursor after saving. Everyone hits the same URL; Kimai permissions follow each person's token.

### systemd example

```ini
[Unit]
Description=Kimai MCP HTTP Server
After=network.target

[Service]
Type=simple
User=kimai-mcp
WorkingDirectory=/opt/kimai-mcp
EnvironmentFile=/opt/kimai-mcp/.env
ExecStart=/usr/bin/node /opt/kimai-mcp/dist/http-server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Cursor (local stdio)

Add a server entry pointing at the **built** entrypoint, for example in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kimai": {
      "command": "node",
      "args": ["/absolute/path/to/Kimai-MCP/dist/index.js"]
    }
  }
}
```

Adjust the path to match your machine. After editing, restart MCP servers or reload Cursor.

## Quick API smoke test

From the project directory (uses `.env`):

```bash
node --import dotenv/config --input-type=module -e "
import { loadKimaiConfigFromEnv, KimaiClient } from './dist/kimai-client.js';
const c = new KimaiClient(loadKimaiConfigFromEnv());
const r = await c.request('GET', '/api/ping');
console.log(r.status, r.json ?? r.text);
"
```

You should see **200** and a pong-style response if credentials and base URL are correct.

## Tools (summary)

All tools return JSON text with **`{ status, body }`** where `status` is the HTTP status from Kimai.

| Tool | Purpose |
|------|---------|
| `kimai_ping` | Connectivity check |
| `kimai_version` | Server version info |
| `kimai_me` | Current user (`/api/users/me`) |
| `kimai_list_customers` | List customers |
| `kimai_list_projects` | List projects |
| `kimai_list_activities` | List activities |
| `kimai_list_tags` | List tags |
| `kimai_timesheet_config` | Instance timesheet limits and rules |
| `kimai_list_timesheets` | List/filter timesheets (pagination, date range, etc.) |
| `kimai_active_timers` | Currently running entries |
| `kimai_recent_timesheets` | Recent combinations (Kimai “recent” endpoint) |
| `kimai_get_timesheet` | One entry by id |
| `kimai_create_timesheet` | Create entry (core API; ISO `begin` required) |
| `kimai_update_timesheet` | PATCH entry |
| `kimai_stop_timesheet` | Stop running entry |
| `kimai_restart_timesheet` | Restart from a stopped entry |
| `kimai_delete_timesheet` | Delete entry |
| `kimai_hive_create_timesheet` | Hive plugin: simplified create (`POST /api/hive/timesheets`) |
| `kimai_hive_get_project_budget` | Hive plugin: read project budget |
| `kimai_hive_update_project_budget` | Hive plugin: update project budget |

Hive tools only work if the **Hive & GPTs** (or equivalent) plugin routes exist on your instance.

### LHG Payroll tools

Requires **LhgPayrollBundle** on your Kimai instance. See payroll routes in `doc.json` under **LHG Payroll API**.

| Tool | Purpose |
|------|---------|
| `kimai_payroll_ping` | Plugin health check |
| `kimai_payroll_statuses` | Approval status codes (1–6) |
| `kimai_payroll_period` | Biweekly period start/end for a date |
| `kimai_payroll_biweekly` | Full payroll data (timesheets, totals, approval) |
| `kimai_payroll_queues` | Submitted / approved / not-submitted queues |
| `kimai_payroll_users` | Users with hourly rates |
| `kimai_payroll_users_accessible` | Users the caller can view payroll for |
| `kimai_payroll_approvals_list` | List approvals (`status`, `start_date` filters) |
| `kimai_payroll_approval_get` | Approval detail with timesheets and history |
| `kimai_payroll_submit` | Submit biweekly period for approval |
| `kimai_payroll_update_status` | Team lead or finance approve/reject |
| `kimai_payroll_resubmit` | Re-submit after rejection |

## Date filters for `kimai_list_timesheets`

Some Kimai versions return **400 Bad Request** if `begin` / `end` are sent as bare dates (`YYYY-MM-DD`). A reliable form is **ISO-like datetimes without relying on date-only**, for example:

- `2026-04-01T00:00:00` through `2026-04-30T23:59:59`

See `doc.json` for all query parameters and response shapes.

## Development

```bash
npm run dev
```

Runs `src/index.ts` with `tsx` (same stdio behavior as production).

## Security

- Treat the API token like a password.
- Do not commit `.env` or paste tokens into chat logs.
- Prefer per-user tokens with the minimum Kimai roles needed for your workflows.

## License

Private project; no license file included unless you add one.
