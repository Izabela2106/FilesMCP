import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT_ROOT, resolveSandboxPath } from "../src/project-env.js";

describe("resolveSandboxPath", () => {
  const previous = process.env.SANDBOX_PATH;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.SANDBOX_PATH;
    } else {
      process.env.SANDBOX_PATH = previous;
    }
  });

  it("defaults to project workspace when unset", () => {
    delete process.env.SANDBOX_PATH;
    expect(resolveSandboxPath()).toBe(path.join(PROJECT_ROOT, "workspace"));
  });

  it("resolves relative SANDBOX_PATH against the project root", () => {
    process.env.SANDBOX_PATH = "my-sandbox";
    expect(resolveSandboxPath()).toBe(path.join(PROJECT_ROOT, "my-sandbox"));
  });

  it("keeps absolute SANDBOX_PATH", () => {
    const absolute = path.join(PROJECT_ROOT, "abs-sandbox");
    process.env.SANDBOX_PATH = absolute;
    expect(resolveSandboxPath()).toBe(path.normalize(absolute));
  });

  it("trims whitespace", () => {
    process.env.SANDBOX_PATH = "  workspace  ";
    expect(resolveSandboxPath()).toBe(path.join(PROJECT_ROOT, "workspace"));
  });
});
