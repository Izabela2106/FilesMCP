import fs from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  validatePath,
  moveFile,
  searchFilesWithValidation,
  getFileStats,
} from "@modelcontextprotocol/server-filesystem/dist/lib.js";
import {
  NO_ALLOWED_DIRECTORIES_ERROR,
  NO_ALLOWED_DIRECTORIES_MODERN_ERROR,
  type CreateServerOptions,
} from "../server-options.js";

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

export const FsManageArgsSchema = z
  .object({
    mode: z
      .enum(["auto", "move", "search", "info", "delete"])
      .optional()
      .default("auto")
      .describe(
        "auto: source+destination→move, pattern→search, else info. " +
          "move / search / info / delete select explicitly. " +
          "delete is never chosen by auto.",
      ),
    path: z
      .string()
      .optional()
      .describe(
        "Single path for info/delete (one file or empty folder), or search root directory.",
      ),
    source: z
      .string()
      .optional()
      .describe("Source path for move/rename."),
    destination: z
      .string()
      .optional()
      .describe("Destination path for move/rename."),
    pattern: z
      .string()
      .optional()
      .describe(
        "Glob pattern for search (e.g. '*.json' or '**/*.txt'). Relative to the search root.",
      ),
    excludePatterns: z
      .array(z.string())
      .optional()
      .default([])
      .describe("Glob patterns to skip during search."),
    confirm: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Required true for mode delete. The agent asks the user first, then sets this.",
      ),
  })
  .meta({ $schema: JSON_SCHEMA_DIALECT });

export type FsManageArgs = z.infer<typeof FsManageArgsSchema>;

type TextToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: { content: string };
};

function resolveMode(
  args: FsManageArgs,
): "move" | "search" | "info" | "delete" {
  if (args.mode && args.mode !== "auto") {
    return args.mode;
  }
  if (args.source !== undefined || args.destination !== undefined) {
    return "move";
  }
  if (args.pattern !== undefined) {
    return "search";
  }
  return "info";
}

function textResult(text: string): TextToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { content: text },
  };
}

/** Combined manage tool: move/rename, search, file info, or delete. */
export async function handleFsManage(
  args: FsManageArgs,
  allowedDirectories: string[],
): Promise<TextToolResult> {
  const mode = resolveMode(args);

  if (mode === "move") {
    if (!args.source || !args.destination) {
      throw new Error('mode move requires "source" and "destination"');
    }
    if (args.pattern !== undefined) {
      throw new Error('mode move does not accept "pattern"');
    }
    const validSource = await validatePath(args.source, allowedDirectories);
    const validDest = await validatePath(args.destination, allowedDirectories);
    await moveFile(validSource, validDest);
    return textResult(
      `Successfully moved ${args.source} to ${args.destination}`,
    );
  }

  if (mode === "search") {
    if (!args.pattern) {
      throw new Error('mode search requires "pattern"');
    }
    if (args.source !== undefined || args.destination !== undefined) {
      throw new Error('mode search does not accept "source" or "destination"');
    }
    if (!args.path) {
      throw new Error('mode search requires "path" (search root directory)');
    }
    const validRoot = await validatePath(args.path, allowedDirectories);
    const results = await searchFilesWithValidation(
      validRoot,
      args.pattern,
      allowedDirectories,
      { excludePatterns: args.excludePatterns ?? [] },
    );
    const text = results.length > 0 ? results.join("\n") : "No matches found";
    return textResult(text);
  }

  if (mode === "delete") {
    if (!args.path) {
      throw new Error('mode delete requires a single "path"');
    }
    if (args.source !== undefined || args.destination !== undefined) {
      throw new Error('mode delete does not accept "source" or "destination"');
    }
    if (args.pattern !== undefined) {
      throw new Error(
        'mode delete does not accept "pattern" — delete one file or empty folder at a time',
      );
    }
    if (args.confirm !== true) {
      throw new Error(
        'Delete refused: set confirm=true after the user explicitly approves.',
      );
    }

    const validPath = await validatePath(args.path, allowedDirectories);
    const stats = await fs.lstat(validPath);

    if (stats.isDirectory()) {
      const entries = await fs.readdir(validPath);
      if (entries.length > 0) {
        throw new Error(
          `Cannot delete non-empty directory "${args.path}". ` +
            "Delete one file at a time, then remove the empty folder.",
        );
      }
      await fs.rmdir(validPath);
      return textResult(`Successfully deleted empty directory: ${args.path}`);
    }

    if (!stats.isFile() && !stats.isSymbolicLink()) {
      throw new Error(
        `Cannot delete "${args.path}": only a single file or empty folder is allowed`,
      );
    }

    await fs.unlink(validPath);
    return textResult(`Successfully deleted file: ${args.path}`);
  }

  // info
  if (!args.path) {
    throw new Error('mode info requires "path"');
  }
  if (
    args.source !== undefined ||
    args.destination !== undefined ||
    args.pattern !== undefined
  ) {
    throw new Error(
      'mode info does not accept "source", "destination", or "pattern"',
    );
  }
  const validPath = await validatePath(args.path, allowedDirectories);
  const info = await getFileStats(validPath);
  const text = Object.entries(info)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return textResult(text);
}

export function registerFsManage(
  server: McpServer,
  getAllowedDirectories: () => string[],
  options: CreateServerOptions = {},
): void {
  server.registerTool(
    "fs_manage",
    {
      title: "Move / Search / File Info / Delete",
      description:
        "Move or rename files (move), glob-search (search), get metadata (info), " +
        "or delete a single file or empty folder (delete). Delete requires confirm=true " +
        "after user approval. Non-empty directories are refused. Delete is never selected by mode auto.",
      inputSchema: FsManageArgsSchema,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: true,
      },
    },
    async (args) => {
      const allowedDirectories = getAllowedDirectories();
      if (allowedDirectories.length === 0) {
        const message =
          options.era === "modern"
            ? NO_ALLOWED_DIRECTORIES_MODERN_ERROR
            : NO_ALLOWED_DIRECTORIES_ERROR;
        options.onCannotOperate?.();
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
      return handleFsManage(args, allowedDirectories);
    },
  );
}
