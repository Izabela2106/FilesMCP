import path from "node:path";

/** Resolve a user/model path against the workspace root. Absolute paths pass through. */
export function resolveWorkspacePath(
  requested: string,
  workspaceRoot: string,
): string {
  const expanded = requested.trim();
  if (!expanded) {
    throw new Error("Path must not be empty");
  }
  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded);
  }
  return path.normalize(path.join(workspaceRoot, expanded));
}

export function resolveWorkspacePaths(
  paths: string[],
  workspaceRoot: string,
): string[] {
  return paths.map((p) => resolveWorkspacePath(p, workspaceRoot));
}
