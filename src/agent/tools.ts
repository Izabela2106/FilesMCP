import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";
import {
  FsReadArgsSchema,
  handleFsRead,
  type FsReadArgs,
} from "../tools/fs_read.js";
import {
  FsWriteArgsSchema,
  handleFsWrite,
  type FsWriteArgs,
} from "../tools/fs_write.js";
import {
  FsManageArgsSchema,
  handleFsManage,
  type FsManageArgs,
} from "../tools/fs_manage.js";
import {
  readFileContent,
  validatePath,
  writeFileContent,
} from "@modelcontextprotocol/server-filesystem/dist/lib.js";
import { resolveWorkspacePath, resolveWorkspacePaths } from "./paths.js";
import { blue } from "./colors.js";
import { checksumText, shortChecksum } from "./checksum.js";

function toolParameters(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  // OpenAI function tools expect a plain object schema without $schema / defs noise.
  const { $schema: _schema, ...rest } = jsonSchema;
  return rest;
}

export const agentTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fs_read",
      description:
        "Read files or list directories inside the workspace. " +
        "Use relative paths like data/users.json or docs/. " +
        "Modes: auto, text, media, list, list_sizes.",
      parameters: toolParameters(FsReadArgsSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "fs_write",
      description:
        "Write/overwrite a file, apply text edits, or create a directory in the workspace. " +
        "Modes: auto, write, edit, mkdir. Prefer relative paths. " +
        "For edit: the host applies the edit, shows the diff, asks keep/revert, and uses checksums to detect external changes.",
      parameters: toolParameters(FsWriteArgsSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "fs_manage",
      description:
        "Move/rename, search by glob, get metadata, or delete one file or an empty folder. " +
        "Modes: auto, move, search, info, delete. For delete use mode delete and a single path; " +
        "non-empty folders are refused. The host asks the user to confirm before deleting. " +
        "Prefer relative paths.",
      parameters: toolParameters(FsManageArgsSchema),
    },
  },
];

function stringifyToolResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function textFromResult(result: {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: { content: string };
}): string {
  if (typeof result.structuredContent?.content === "string") {
    return result.structuredContent.content;
  }
  return result.content
    .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
    .join("\n");
}

function isEditRequest(args: FsWriteArgs): boolean {
  if (args.mode === "edit") return true;
  if (args.mode === "auto" || args.mode === undefined) {
    return Array.isArray(args.edits) && args.edits.length > 0;
  }
  return false;
}

export type ConfirmDelete = (details: {
  path: string;
}) => Promise<boolean>;

export type ConfirmEdit = (details: {
  path: string;
  preview: string;
}) => Promise<boolean>;

/** What to do when the on-disk file no longer matches the agent edit checksum. */
export type ExternalEditDecision =
  | "keep-agent"
  | "restore-original"
  | "keep-disk";

export type ResolveExternalEdit = (details: {
  path: string;
  intendedAction: "keep" | "revert";
  originalChecksum: string;
  expectedChecksum: string;
  currentChecksum: string;
}) => Promise<ExternalEditDecision>;

export type AgentToolOptions = {
  confirmDelete?: ConfirmDelete;
  confirmEdit?: ConfirmEdit;
  resolveExternalEdit?: ResolveExternalEdit;
};

function toolMessage(text: string): string {
  return stringifyToolResult({
    content: [{ type: "text", text }],
    structuredContent: { content: text },
  });
}

export async function executeAgentTool(
  name: string,
  rawArgs: unknown,
  allowedDirectories: string[],
  workspaceRoot: string,
  options: AgentToolOptions = {},
): Promise<string> {
  try {
    if (name === "fs_read") {
      const parsed = FsReadArgsSchema.parse(rawArgs) as FsReadArgs;
      const args: FsReadArgs = {
        ...parsed,
        path:
          parsed.path !== undefined
            ? resolveWorkspacePath(parsed.path, workspaceRoot)
            : undefined,
        paths:
          parsed.paths !== undefined
            ? resolveWorkspacePaths(parsed.paths, workspaceRoot)
            : undefined,
      };
      const result = await handleFsRead(args, allowedDirectories);
      return stringifyToolResult(result);
    }

    if (name === "fs_write") {
      const parsed = FsWriteArgsSchema.parse(rawArgs) as FsWriteArgs;
      const args: FsWriteArgs = {
        ...parsed,
        path: resolveWorkspacePath(parsed.path, workspaceRoot),
      };

      if (isEditRequest(args)) {
        if (!args.edits || args.edits.length === 0) {
          return JSON.stringify({
            error: 'mode edit requires a non-empty "edits" array',
          });
        }
        if (!options.confirmEdit) {
          return JSON.stringify({
            error:
              "Edit requires interactive confirmation, which is unavailable.",
          });
        }

        const validPath = await validatePath(args.path, allowedDirectories);
        const originalContent = await readFileContent(validPath);
        const originalChecksum = checksumText(originalContent);

        console.error(
          blue(
            `Editing "${args.path}" (checksum ${shortChecksum(originalChecksum)}…)`,
          ),
        );
        const appliedResult = await handleFsWrite(
          { ...args, mode: "edit", dryRun: false },
          allowedDirectories,
        );
        const preview = textFromResult(appliedResult);
        console.error(blue(preview));

        const editedContent = await readFileContent(validPath);
        const expectedChecksum = checksumText(editedContent);

        const approved = await options.confirmEdit({
          path: args.path,
          preview,
        });
        const intendedAction = approved ? "keep" : "revert";

        const currentContent = await readFileContent(validPath);
        const currentChecksum = checksumText(currentContent);
        const externallyChanged = currentChecksum !== expectedChecksum;

        let decision: ExternalEditDecision = approved
          ? "keep-agent"
          : "restore-original";

        if (externallyChanged) {
          console.error(
            blue(
              `Checksum mismatch on "${args.path}": file changed externally ` +
                `(expected ${shortChecksum(expectedChecksum)}…, ` +
                `on disk ${shortChecksum(currentChecksum)}…).`,
            ),
          );
          if (!options.resolveExternalEdit) {
            return JSON.stringify({
              error:
                "File changed externally during edit confirmation, and no resolver is available.",
            });
          }
          decision = await options.resolveExternalEdit({
            path: args.path,
            intendedAction,
            originalChecksum,
            expectedChecksum,
            currentChecksum,
          });
        }

        if (decision === "keep-disk") {
          console.error(
            blue(`Left on-disk version of "${args.path}" unchanged`),
          );
          return toolMessage(
            `External change kept on disk for ${args.path} ` +
              `(checksum ${shortChecksum(currentChecksum)}…). ` +
              `Agent edit was neither kept nor reverted.`,
          );
        }

        if (decision === "restore-original") {
          await writeFileContent(validPath, originalContent);
          console.error(
            blue(`Restored "${args.path}" to the pre-edit version`),
          );
          return toolMessage(
            externallyChanged
              ? `Restored ${args.path} to the pre-edit version after an external change was detected.`
              : `Edit reverted by user: ${args.path} restored to the previous version`,
          );
        }

        // keep-agent
        if (externallyChanged) {
          await writeFileContent(validPath, editedContent);
          console.error(
            blue(`Overwrote disk with the agent's edited version of "${args.path}"`),
          );
          return toolMessage(
            `Kept agent edit for ${args.path}, overwriting the external change.\n\n${preview}`,
          );
        }

        console.error(blue(`Kept edits to "${args.path}"`));
        return toolMessage(
          `Edit confirmed and saved: ${args.path}\n\n${preview}`,
        );
      }

      const result = await handleFsWrite(args, allowedDirectories);
      return stringifyToolResult(result);
    }

    if (name === "fs_manage") {
      const parsed = FsManageArgsSchema.parse(rawArgs) as FsManageArgs;
      const args: FsManageArgs = {
        ...parsed,
        path:
          parsed.path !== undefined
            ? resolveWorkspacePath(parsed.path, workspaceRoot)
            : undefined,
        source:
          parsed.source !== undefined
            ? resolveWorkspacePath(parsed.source, workspaceRoot)
            : undefined,
        destination:
          parsed.destination !== undefined
            ? resolveWorkspacePath(parsed.destination, workspaceRoot)
            : undefined,
        // Never trust the model to self-approve deletes.
        confirm: false,
      };

      if (args.mode === "delete") {
        if (!args.path) {
          return JSON.stringify({
            error: 'mode delete requires "path"',
          });
        }
        if (!options.confirmDelete) {
          return JSON.stringify({
            error:
              "Delete requires interactive user confirmation, which is unavailable.",
          });
        }
        const approved = await options.confirmDelete({
          path: args.path,
        });
        if (!approved) {
          return stringifyToolResult({
            content: [
              {
                type: "text",
                text: `Delete cancelled by user: ${args.path}`,
              },
            ],
            structuredContent: {
              content: `Delete cancelled by user: ${args.path}`,
            },
          });
        }
        args.confirm = true;
      }

      const result = await handleFsManage(args, allowedDirectories);
      return stringifyToolResult(result);
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: message });
  }
}

export const SYSTEM_PROMPT = `You are a filesystem assistant for a sandboxed workspace.
You may only use fs_read, fs_write, and fs_manage to inspect or change files.
Always use relative paths from the workspace root (examples: README.md, data/users.json, notes/todo.txt).
Never attempt to access paths outside the workspace.
Prefer fs_read with mode list before writing when you need to discover structure.
Use fs_manage for move/rename, glob search, file metadata, and delete.
For delete: call fs_manage with mode "delete" and a single path. Only one file or an empty folder may be deleted per call. Do not set confirm yourself — the host asks the user.
For edit: call fs_write with mode "edit" and edits. The host applies the change, shows the diff, asks the user to keep or revert, and detects external edits via checksums.
Be concise in your final replies; summarize what you did.`;
