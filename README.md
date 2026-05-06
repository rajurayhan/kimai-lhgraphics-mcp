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

## Cursor

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
