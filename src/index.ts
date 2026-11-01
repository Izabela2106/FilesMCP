#!/usr/bin/env node
import { realpathSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  serveStdio,
  StdioServerTransport,
} from "@modelcontextprotocol/server/stdio";
import { resolveAllowedDirectories } from "@modelcontextprotocol/server-filesystem/dist/index.js";
import { createServer } from "./create-server.js";
import { resolveSandboxPath } from "./project-env.js";

/**
 * serveStdio with legacy: "serve" — supports 2025-era and 2026-07-28 clients.
 * Allowed directories: CLI args if provided, otherwise SANDBOX_PATH from `.env`.
 */
export async function main(
  args: string[] = process.argv.slice(2),
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
) {
  const directoryArgs = args.length > 0 ? args : [resolveSandboxPath()];

  const allowedDirectories = await resolveAllowedDirectories(directoryArgs);

  const handle = serveStdio(
    ({ era }) =>
      createServer(allowedDirectories, {
        era,
        onCannotOperate: () => process.exit(1),
      }),
    {
      transport: new StdioServerTransport(stdin, stdout),
      legacy: "serve",
      onerror: (error) => {
        console.error("Transport error:", error);
        process.exitCode = 1;
      },
    },
  );

  console.error(
    "FilesManipulation MCP server running on stdio (legacy mode: serve)",
  );
  console.error(`Sandbox: ${directoryArgs.join(", ")}`);
  if (allowedDirectories.length === 0) {
    console.error(
      "Started without allowed directories — check SANDBOX_PATH in .env, or pass directory args",
    );
  }
  return handle;
}

function isEntryPoint(
  entryPath: string | undefined,
  moduleUrl: string,
): boolean {
  if (!entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  main().catch((error: unknown) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
  });
}
