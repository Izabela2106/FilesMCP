# FilesManipulation

Natural-language filesystem assistant for a sandboxed folder.

The project wraps [`@modelcontextprotocol/server-filesystem`](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem) into a few model-friendly tools (`fs_read`, `fs_write`, `fs_manage`), exposes them over MCP stdio, and drives them from an OpenRouter CLI agent.

## Requirements

- Node.js 24+
- An [OpenRouter](https://openrouter.ai) API key

## Setup

```powershell
npm install
copy .env.example .env
mkdir workspace
```

Set these in `.env` (never commit this file):

- `OPEN_ROUTER_KEY` — your OpenRouter API key
- `SANDBOX_PATH` — sandbox folder (default `workspace`; relative to the project root, or absolute)

The `workspace/` sandbox is **not** included in the repo. Create it locally (or point `SANDBOX_PATH` at another folder).

## Run the agent

```powershell
npm run agent
```

Type requests in plain language, for example:

- `list files in data`
- `read books/book1.txt`
- `create a notes/ideas.txt with hello`
- `rename books/book2.txt to books/renamed.txt`

Exit with `exit` or `quit`.

### Colored logs

| Color | Meaning |
|-------|---------|
| Blue | Tool actions |
| Green | Confirmations / conflict prompts |
| Red | Errors |

### Safety behavior

- **Edit:** applies the change, shows a diff, then asks to keep or restore the previous version. SHA-256 checksums detect external edits while you decide; you can keep the agent version, restore the original, or keep the on-disk file.
- **Delete:** one path per call — a single file or an **empty** folder only. Always asks for confirmation.

## MCP server (Cursor)

Project config: [`.cursor/mcp.json`](.cursor/mcp.json)

```powershell
npm start
```

Or build and run compiled output:

```powershell
npm run build
npm run start:dist
```

Allowed root comes from `SANDBOX_PATH` in `.env` (default `workspace/`).

## Change the sandbox folder

Edit **only** `.env`:

```env
SANDBOX_PATH=workspace
```

Examples:

```env
SANDBOX_PATH=my-sandbox
SANDBOX_PATH=D:\Data\sandbox
```

That value is used by:

- the CLI agent (`npm run agent`)
- the MCP server (`npm start` / Cursor via `.cursor/mcp.json` + `envFile`)

Create the folder if it does not exist yet. Reload MCP in Cursor after changing `.env`. Optional CLI override: `npx tsx src/index.ts path\to\other-dir` still works for one-off runs.

## Native tools

| Tool | Combines |
|------|----------|
| `fs_read` | read text/media/multiple files, list directory (+ sizes) |
| `fs_write` | write file, edit file, create directory |
| `fs_manage` | move/rename, search, file info, delete (custom) |

Details: [`context/project-overview.md`](context/project-overview.md)

## Project layout

```
src/
  index.ts           # MCP stdio entry (serveStdio, legacy: serve)
  create-server.ts   # registers native tools
  tools/             # fs_read, fs_write, fs_manage
  agent/             # OpenRouter CLI agent
workspace/           # sandboxed files for testing
context/             # specs and progress notes
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run agent` | Interactive OpenRouter agent |
| `npm start` | MCP server via tsx (sandbox from `.env`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run Vitest suite |
| `npm run test:watch` | Vitest watch mode |

## Model

Default agent model: `openai/gpt-4o-mini` via OpenRouter (`https://openrouter.ai/api/v1`).
