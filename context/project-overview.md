# MCP filesystem

## Overview

The project uses the public `serveStdio` entry with legacy mode set to `serve` in order to provide a better experience when working with files and folders.

Native tools combine low-level `@modelcontextprotocol/server-filesystem` operations into fewer, model-friendly tools. The custom server is TypeScript (`src/`), reuses that package’s path validation and read helpers, and does not modify third-party internals. Run via `tsx` (Cursor MCP) or `npm run build` → `dist/`.

Allowed root: `SANDBOX_PATH` from `.env` (default `workspace/`). Used by the CLI agent and MCP server.

An OpenRouter-backed CLI agent (`npm run agent`) takes natural-language commands and calls the same `fs_read` / `fs_write` / `fs_manage` handlers against `workspace/`.

---

## Goals

1. Let users read, write, edit and delete folders and files in a particular sandbox using commands in natural language.

---

## Agent

- Provider: OpenRouter (`https://openrouter.ai/api/v1`)
- Env: `OPEN_ROUTER_KEY` in `.env` (never commit)
- Model: `openai/gpt-4o-mini`
- Tools: `fs_read`, `fs_write`, `fs_manage` (same handlers as the MCP server)
- Scope: only `workspace/`

---

## Native tools

### `fs_read`

Combines: `read_file` / `read_text_file`, `read_media_file`, `read_multiple_files`, `list_directory`, `list_directory_with_sizes`.

| Input | Meaning |
|-------|---------|
| `path` | Single file or directory |
| `paths` | Multiple files (text). Provide `path` **or** `paths`, not both |
| `mode` | `auto` (default), `text`, `media`, `list`, or `list_sizes` |
| `head` / `tail` | Optional line window for a single **text** read (mutually exclusive) |
| `sortBy` | For `list_sizes`: `name` (default) or `size` |

**Routing**

- `paths` → multi-file text read (`read_multiple_files`)
- `path` + `mode: "list"` → directory names only (`list_directory`)
- `path` + `mode: "list_sizes"` → directory listing with sizes (`list_directory_with_sizes`)
- `path` + `mode: "media"` → base64 media/resource (`read_media_file`)
- `path` + `mode: "text"` → UTF-8 text (`read_text_file`)
- `path` + `mode: "auto"` → directory → `list`; media extension → media; otherwise text

### `fs_write`

Combines: `write_file`, `edit_file`, `create_directory`.

| Input | Meaning |
|-------|---------|
| `path` | File or directory path (required) |
| `mode` | `auto` (default), `write`, `edit`, or `mkdir` |
| `content` | Full file body for `write` |
| `edits` | `{ oldText, newText }[]` for `edit` |
| `dryRun` | For `edit` via MCP: preview only |

**Routing**

- `mode: "write"` or `auto` + `content` → create/overwrite file (`write_file`)
- `mode: "edit"` or `auto` + `edits` → selective edits (`edit_file`); agent: apply → show diff → keep or revert
- `mode: "mkdir"` or `auto` with neither → create directory (`create_directory`)

**Edit safety (CLI agent)**

- SHA-256 checksum of file content after the agent edit
- On confirm/revert, re-hash on-disk content; mismatch means an external edit
- User then chooses: keep agent version, restore pre-edit original, or keep on-disk version

### `fs_manage`

Combines: `move_file`, `search_files`, `get_file_info`, plus custom **delete** (not in upstream MCP).

| Input | Meaning |
|-------|---------|
| `mode` | `auto` (default), `move`, `search`, `info`, or `delete` |
| `path` | Target for `info`/`delete`, or search root for `search` |
| `source` / `destination` | Paths for `move` |
| `pattern` | Glob for `search` (e.g. `**/*.json`) |
| `excludePatterns` | Optional globs to skip while searching |
| `confirm` | Must be `true` to delete (agent asks the user first) |

**Routing**

- `mode: "move"` or `auto` + `source`/`destination` → move/rename (`move_file`)
- `mode: "search"` or `auto` + `pattern` → glob search (`search_files`)
- `mode: "info"` or `auto` + `path` only → metadata (`get_file_info`)
- `mode: "delete"` → delete **one file** or an **empty folder** after confirmation (`confirm=true`); non-empty directories are refused; never chosen by `auto`
