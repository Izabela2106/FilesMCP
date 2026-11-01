import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

dotenv.config({ path: path.join(projectRoot, ".env") });

export const PROJECT_ROOT = projectRoot;

/**
 * Resolve the sandbox directory from SANDBOX_PATH in `.env`.
 * Relative paths are resolved against the project root.
 * Defaults to `<project>/workspace` when unset.
 */
export function resolveSandboxPath(): string {
  const raw = process.env.SANDBOX_PATH?.trim();
  if (!raw) {
    return path.join(PROJECT_ROOT, "workspace");
  }
  if (path.isAbsolute(raw)) {
    return path.normalize(raw);
  }
  return path.normalize(path.join(PROJECT_ROOT, raw));
}
