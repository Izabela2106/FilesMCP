import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveAllowedDirectories } from "@modelcontextprotocol/server-filesystem/dist/index.js";

export type TempSandbox = {
  root: string;
  allowed: string[];
  join: (...parts: string[]) => string;
  cleanup: () => Promise<void>;
};

/** Isolated temp directory used as an allowed MCP root for tests. */
export async function createTempSandbox(
  prefix = "filesmcp-test-",
): Promise<TempSandbox> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const allowed = await resolveAllowedDirectories([root]);
  if (allowed.length === 0) {
    throw new Error(`Failed to allow temp sandbox: ${root}`);
  }
  return {
    root,
    allowed,
    join: (...parts: string[]) => path.join(root, ...parts),
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
