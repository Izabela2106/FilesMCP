import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveWorkspacePath,
  resolveWorkspacePaths,
} from "../src/agent/paths.js";

describe("resolveWorkspacePath", () => {
  const root = path.resolve("C:\\sandbox");

  it("joins relative paths to the workspace root", () => {
    expect(resolveWorkspacePath("notes/a.txt", root)).toBe(
      path.normalize(path.join(root, "notes/a.txt")),
    );
  });

  it("passes absolute paths through", () => {
    const absolute = path.join(root, "outside-looking.txt");
    expect(resolveWorkspacePath(absolute, root)).toBe(path.normalize(absolute));
  });

  it("trims whitespace", () => {
    expect(resolveWorkspacePath("  data/users.json  ", root)).toBe(
      path.normalize(path.join(root, "data/users.json")),
    );
  });

  it("rejects empty paths", () => {
    expect(() => resolveWorkspacePath("", root)).toThrow("Path must not be empty");
    expect(() => resolveWorkspacePath("   ", root)).toThrow(
      "Path must not be empty",
    );
  });

  it("normalizes .. segments in the joined path (still subject to allow-list later)", () => {
    const resolved = resolveWorkspacePath("../escape.txt", root);
    expect(resolved).toBe(path.normalize(path.join(root, "..", "escape.txt")));
  });
});

describe("resolveWorkspacePaths", () => {
  it("maps each path", () => {
    const root = path.resolve("C:\\sandbox");
    expect(resolveWorkspacePaths(["a.txt", "b/c.txt"], root)).toEqual([
      path.normalize(path.join(root, "a.txt")),
      path.normalize(path.join(root, "b/c.txt")),
    ]);
  });
});
