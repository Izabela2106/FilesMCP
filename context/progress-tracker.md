# Progress Tracker

## Current Phase

OpenRouter CLI agent

## Active Task

_(none)_

## Completed

### 00-install — MCP filesystem package + Cursor config

Status: **complete**

- [x] Installed `@modelcontextprotocol/server-filesystem`
- [x] Project `.cursor/mcp.json` pointing at custom server + `sandbox/`

### 01-fs_read — Combined read tool

Status: **complete**

- [x] Custom stdio MCP server (`src/index.ts`) with `serveStdio` + `legacy: "serve"`
- [x] Native tool `fs_read` combining text / media / multi-file reads
- [x] Reuses upstream path validation and read helpers
- [x] Smoke-tested single text (`head`) and multi-file reads against `sandbox/`

### 02-typescript — Convert native server to TypeScript

Status: **complete**

- [x] `tsconfig.json` (NodeNext, strict); `typescript`, `tsx`, `@types/node`
- [x] Sources under `src/**/*.ts`; ambient types for `server-filesystem` deep imports
- [x] Cursor MCP runs via `npx tsx src/index.ts`; `npm run build` → `dist/`
- [x] `tsc --noEmit` clean

## Open Questions

_(none)_

### 03-fs_write — Combined write / edit / mkdir tool

Status: **complete**

- [x] Native tool `fs_write` combining `write_file`, `edit_file`, `create_directory`
- [x] Modes: `auto` | `write` | `edit` | `mkdir`
- [x] Registered on custom MCP server; typecheck clean; smoke-tested

### 04-workspace-fixtures — Mock tree for testing

Status: **complete**

- [x] Added `workspace/` as MCP allowed root (mcp.json + npm start)
- [x] Seeded docs, src, data, assets, notes/archive, empty

### 05-openrouter-agent — Natural-language filesystem agent

Status: **complete**

- [x] `.env` / `.env.example` with `OPEN_ROUTER_KEY`
- [x] CLI agent (`npm run agent`) using OpenRouter + `openai/gpt-4o-mini`
- [x] Tool-calling loop over `fs_read` / `fs_write` scoped to `workspace/`
- [x] Smoke-tested list of `data/`

### 06-fs_manage — Move / search / info tool

Status: **complete**

- [x] Native tool `fs_manage` combining `move_file`, `search_files`, `get_file_info`
- [x] Registered on MCP server and agent tool loop
- [x] Smoke-tested info + search

### 07-fs_manage-delete — Delete with user confirmation

Status: **complete**

- [x] `fs_manage` mode `delete` (file or folder; `recursive` for non-empty dirs)
- [x] Requires `confirm=true`; agent CLI prompts `[y/N]` before approving
- [x] Model cannot self-approve deletes

### 08-edit-confirm-or-revert — Edit then keep or restore

Status: **complete**

- [x] Agent applies `fs_write` edits, shows diff, asks green confirm
- [x] `y` keeps the edited file; `N` restores the pre-edit contents

### 09-edit-checksums — Detect external edits

Status: **complete**

- [x] SHA-256 checksum after agent edit; re-check before keep/revert
- [x] On mismatch, prompt: keep agent / restore original / keep disk

## Next Steps

_(none)_

