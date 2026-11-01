import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  validatePath,
  readFileContent,
  headFile,
  tailFile,
  formatSize,
} from "@modelcontextprotocol/server-filesystem/dist/lib.js";
import {
  NO_ALLOWED_DIRECTORIES_ERROR,
  NO_ALLOWED_DIRECTORIES_MODERN_ERROR,
  type CreateServerOptions,
} from "../server-options.js";

const MEDIA_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

export const FsReadArgsSchema = z
  .object({
    path: z
      .string()
      .optional()
      .describe(
        "Single file or directory path. Use this or paths, not both. " +
          "Directories are listed when mode is list, list_sizes, or auto.",
      ),
    paths: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        "Multiple file paths to read as text. Use this or path, not both.",
      ),
    mode: z
      .enum(["auto", "text", "media", "list", "list_sizes"])
      .optional()
      .default("auto")
      .describe(
        "auto: directory→list, media ext→media, else text. " +
          "text/media: read file. list / list_sizes: directory listing.",
      ),
    head: z
      .number()
      .optional()
      .describe("For a single text read: return only the first N lines."),
    tail: z
      .number()
      .optional()
      .describe("For a single text read: return only the last N lines."),
    sortBy: z
      .enum(["name", "size"])
      .optional()
      .default("name")
      .describe("For list_sizes: sort entries by name or size (default name)."),
  })
  .meta({ $schema: JSON_SCHEMA_DIALECT });

export type FsReadArgs = z.infer<typeof FsReadArgsSchema>;

type TextToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: { content: string };
};

type MediaToolResult = {
  content: [MediaContentItem];
  structuredContent: { content: [MediaContentItem] };
};

type MediaContentItem =
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | {
      type: "resource";
      resource: { uri: string; mimeType: string; blob: string };
    };

export type FsReadResult = TextToolResult | MediaToolResult;

function isMediaPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return Object.prototype.hasOwnProperty.call(MEDIA_MIME_BY_EXT, ext);
}

function textResult(text: string): TextToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { content: text },
  };
}

async function readFileAsBase64Stream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: string | Buffer) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    stream.on("error", reject);
  });
}

async function readAsText(
  validPath: string,
  options: { head?: number; tail?: number },
): Promise<string> {
  const { head, tail } = options;
  if (head !== undefined && tail !== undefined) {
    throw new Error("Cannot specify both head and tail parameters");
  }
  if (head !== undefined) return headFile(validPath, head);
  if (tail !== undefined) return tailFile(validPath, tail);
  return readFileContent(validPath);
}

async function readAsMedia(validPath: string): Promise<MediaContentItem> {
  const extension = path.extname(validPath).toLowerCase();
  const mimeType = MEDIA_MIME_BY_EXT[extension] ?? "application/octet-stream";
  const data = await readFileAsBase64Stream(validPath);

  if (mimeType.startsWith("image/")) {
    return { type: "image", data, mimeType };
  }
  if (mimeType.startsWith("audio/")) {
    return { type: "audio", data, mimeType };
  }
  return {
    type: "resource",
    resource: {
      uri: pathToFileURL(validPath).href,
      mimeType,
      blob: data,
    },
  };
}

/** Same output shape as upstream `list_directory`. */
async function listDirectory(validPath: string): Promise<string> {
  const entries = await fs.readdir(validPath, { withFileTypes: true });
  return entries
    .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
    .join("\n");
}

/** Same output shape as upstream `list_directory_with_sizes`. */
async function listDirectoryWithSizes(
  validPath: string,
  allowedDirectories: string[],
  sortBy: "name" | "size" = "name",
): Promise<string> {
  const entries = await fs.readdir(validPath, { withFileTypes: true });
  const detailedEntries = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(validPath, entry.name);
      try {
        const validEntryPath = await validatePath(
          entryPath,
          allowedDirectories,
        );
        const stats = await fs.stat(validEntryPath);
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stats.size,
        };
      } catch {
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: 0,
        };
      }
    }),
  );

  const sortedEntries = [...detailedEntries].sort((a, b) => {
    if (sortBy === "size") return b.size - a.size;
    return a.name.localeCompare(b.name);
  });

  const formattedEntries = sortedEntries.map(
    (entry) =>
      `${entry.isDirectory ? "[DIR]" : "[FILE]"} ${entry.name.padEnd(30)} ${
        entry.isDirectory ? "" : formatSize(entry.size).padStart(10)
      }`,
  );

  const totalFiles = detailedEntries.filter((e) => !e.isDirectory).length;
  const totalDirs = detailedEntries.filter((e) => e.isDirectory).length;
  const totalSize = detailedEntries.reduce(
    (sum, entry) => sum + (entry.isDirectory ? 0 : entry.size),
    0,
  );

  return [
    ...formattedEntries,
    "",
    `Total: ${totalFiles} files, ${totalDirs} directories`,
    `Combined size: ${formatSize(totalSize)}`,
  ].join("\n");
}

/** Combined read/list tool: text, media, multi-file, or directory listing. */
export async function handleFsRead(
  args: FsReadArgs,
  allowedDirectories: string[],
): Promise<FsReadResult> {
  const hasPath = typeof args.path === "string" && args.path.length > 0;
  const hasPaths = Array.isArray(args.paths) && args.paths.length > 0;

  if (hasPath === hasPaths) {
    throw new Error("Provide exactly one of path or paths");
  }

  if (hasPaths) {
    if (args.mode === "media" || args.mode === "list" || args.mode === "list_sizes") {
      throw new Error(
        "mode media, list, and list_sizes are only supported with a single path",
      );
    }
    if (args.head !== undefined || args.tail !== undefined) {
      throw new Error("head and tail are only supported with a single path");
    }

    const results = await Promise.all(
      args.paths!.map(async (filePath) => {
        try {
          const validPath = await validatePath(filePath, allowedDirectories);
          const content = await readFileContent(validPath);
          return `${filePath}:\n${content}\n`;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return `${filePath}: Error - ${message}`;
        }
      }),
    );
    return textResult(results.join("\n---\n"));
  }

  const mode = args.mode ?? "auto";
  const singlePath = args.path!;
  const validPath = await validatePath(singlePath, allowedDirectories);
  const stats = await fs.stat(validPath);
  const isDirectory = stats.isDirectory();

  if (mode === "list" || mode === "list_sizes") {
    if (!isDirectory) {
      throw new Error(`Path is not a directory: ${singlePath}`);
    }
    if (args.head !== undefined || args.tail !== undefined) {
      throw new Error("head and tail are only supported for text reads");
    }
    if (mode === "list") {
      return textResult(await listDirectory(validPath));
    }
    return textResult(
      await listDirectoryWithSizes(
        validPath,
        allowedDirectories,
        args.sortBy ?? "name",
      ),
    );
  }

  if (mode === "auto" && isDirectory) {
    if (args.head !== undefined || args.tail !== undefined) {
      throw new Error("head and tail are only supported for text reads");
    }
    return textResult(await listDirectory(validPath));
  }

  if (isDirectory) {
    throw new Error(
      `Path is a directory; use mode list or list_sizes (or auto) to list it: ${singlePath}`,
    );
  }

  const useMedia =
    mode === "media" || (mode === "auto" && isMediaPath(singlePath));

  if (useMedia) {
    if (args.head !== undefined || args.tail !== undefined) {
      throw new Error("head and tail are only supported for text reads");
    }
    const contentItem = await readAsMedia(validPath);
    return {
      content: [contentItem],
      structuredContent: { content: [contentItem] },
    };
  }

  const text = await readAsText(validPath, {
    head: args.head,
    tail: args.tail,
  });
  return textResult(text);
}

export function registerFsRead(
  server: McpServer,
  getAllowedDirectories: () => string[],
  options: CreateServerOptions = {},
): void {
  server.registerTool(
    "fs_read",
    {
      title: "Read / List Files",
      description:
        "Read files or list a directory in the sandbox. " +
        "Use path for one file/dir (mode auto/text/media/list/list_sizes; " +
        "optional head/tail for text; sortBy for list_sizes) or paths for " +
        "multiple text files. Combines read_text_file, read_media_file, " +
        "read_multiple_files, list_directory, and list_directory_with_sizes.",
      inputSchema: FsReadArgsSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
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
      return handleFsRead(args, allowedDirectories);
    },
  );
}
