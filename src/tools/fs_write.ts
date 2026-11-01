import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  validatePath,
  writeFileContent,
  applyFileEdits,
  createDirectory,
} from "@modelcontextprotocol/server-filesystem/dist/lib.js";
import {
  NO_ALLOWED_DIRECTORIES_ERROR,
  NO_ALLOWED_DIRECTORIES_MODERN_ERROR,
  type CreateServerOptions,
} from "../server-options.js";

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

const EditOperationSchema = z.object({
  oldText: z.string().describe("Text to search for — must match exactly"),
  newText: z.string().describe("Text to replace with"),
});

export const FsWriteArgsSchema = z
  .object({
    path: z
      .string()
      .describe("File or directory path inside the sandbox."),
    mode: z
      .enum(["auto", "write", "edit", "mkdir"])
      .optional()
      .default("auto")
      .describe(
        "auto: edits→edit, content→write, else mkdir. " +
          "write: overwrite/create file. edit: selective edits. mkdir: create directory.",
      ),
    content: z
      .string()
      .optional()
      .describe("Full file contents for mode write."),
    edits: z
      .array(EditOperationSchema)
      .min(1)
      .optional()
      .describe("Line-based replacements for mode edit."),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe("For edit: preview a git-style diff without writing."),
  })
  .meta({ $schema: JSON_SCHEMA_DIALECT });

export type FsWriteArgs = z.infer<typeof FsWriteArgsSchema>;

type TextToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: { content: string };
};

function resolveMode(args: FsWriteArgs): "write" | "edit" | "mkdir" {
  if (args.mode && args.mode !== "auto") {
    return args.mode;
  }
  if (args.edits !== undefined && args.edits.length > 0) {
    return "edit";
  }
  if (args.content !== undefined) {
    return "write";
  }
  return "mkdir";
}

/** Combined write tool: write file, edit file, or create directory. */
export async function handleFsWrite(
  args: FsWriteArgs,
  allowedDirectories: string[],
): Promise<TextToolResult> {
  const mode = resolveMode(args);
  const validPath = await validatePath(args.path, allowedDirectories);

  if (mode === "write") {
    if (args.content === undefined) {
      throw new Error('mode write requires "content"');
    }
    if (args.edits !== undefined) {
      throw new Error('mode write does not accept "edits"');
    }
    await writeFileContent(validPath, args.content);
    const text = `Successfully wrote to ${args.path}`;
    return {
      content: [{ type: "text", text }],
      structuredContent: { content: text },
    };
  }

  if (mode === "edit") {
    if (!args.edits || args.edits.length === 0) {
      throw new Error('mode edit requires a non-empty "edits" array');
    }
    if (args.content !== undefined) {
      throw new Error('mode edit does not accept "content"');
    }
    const text = await applyFileEdits(
      validPath,
      args.edits,
      args.dryRun ?? false,
    );
    return {
      content: [{ type: "text", text }],
      structuredContent: { content: text },
    };
  }

  // mkdir
  if (args.content !== undefined || args.edits !== undefined) {
    throw new Error('mode mkdir does not accept "content" or "edits"');
  }
  await createDirectory(validPath);
  const text = `Successfully created directory ${args.path}`;
  return {
    content: [{ type: "text", text }],
    structuredContent: { content: text },
  };
}

export function registerFsWrite(
  server: McpServer,
  getAllowedDirectories: () => string[],
  options: CreateServerOptions = {},
): void {
  server.registerTool(
    "fs_write",
    {
      title: "Write / Edit / Create Directory",
      description:
        "Create or overwrite a file (write), apply selective text edits (edit), " +
        "or create a directory including parents (mkdir). Combines write_file, " +
        "edit_file, and create_directory. Use mode auto (default) or set write / " +
        "edit / mkdir explicitly.",
      inputSchema: FsWriteArgsSchema,
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
      return handleFsWrite(args, allowedDirectories);
    },
  );
}
