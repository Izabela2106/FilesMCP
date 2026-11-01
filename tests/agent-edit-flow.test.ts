import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAgentTool } from "../src/agent/tools.js";
import {
  createTempSandbox,
  readFile,
  writeFile,
  type TempSandbox,
} from "./helpers/temp-sandbox.js";

describe("executeAgentTool edit confirmation flow", () => {
  let sandbox: TempSandbox;

  beforeEach(async () => {
    sandbox = await createTempSandbox();
    await writeFile(sandbox.join("story.txt"), "once upon a time");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await sandbox.cleanup();
  });

  it("keeps the edit when the user confirms", async () => {
    const result = await executeAgentTool(
      "fs_write",
      {
        path: "story.txt",
        mode: "edit",
        edits: [{ oldText: "time", newText: "night" }],
      },
      sandbox.allowed,
      sandbox.root,
      { confirmEdit: async () => true },
    );

    expect(result).toMatch(/Edit confirmed and saved/);
    expect(await readFile(sandbox.join("story.txt"))).toBe("once upon a night");
  });

  it("reverts to the original when the user declines", async () => {
    await executeAgentTool(
      "fs_write",
      {
        path: "story.txt",
        mode: "edit",
        edits: [{ oldText: "time", newText: "night" }],
      },
      sandbox.allowed,
      sandbox.root,
      { confirmEdit: async () => false },
    );

    expect(await readFile(sandbox.join("story.txt"))).toBe("once upon a time");
  });

  it("detects external edit and can keep disk version", async () => {
    const result = await executeAgentTool(
      "fs_write",
      {
        path: "story.txt",
        mode: "edit",
        edits: [{ oldText: "time", newText: "night" }],
      },
      sandbox.allowed,
      sandbox.root,
      {
        confirmEdit: async () => {
          // Simulate another process changing the file while waiting.
          await writeFile(sandbox.join("story.txt"), "EXTERNAL CHANGE");
          return true;
        },
        resolveExternalEdit: async () => "keep-disk",
      },
    );

    expect(result).toMatch(/External change kept on disk/);
    expect(await readFile(sandbox.join("story.txt"))).toBe("EXTERNAL CHANGE");
  });

  it("can restore original after external change", async () => {
    await executeAgentTool(
      "fs_write",
      {
        path: "story.txt",
        mode: "edit",
        edits: [{ oldText: "time", newText: "night" }],
      },
      sandbox.allowed,
      sandbox.root,
      {
        confirmEdit: async () => {
          await writeFile(sandbox.join("story.txt"), "EXTERNAL CHANGE");
          return false;
        },
        resolveExternalEdit: async () => "restore-original",
      },
    );

    expect(await readFile(sandbox.join("story.txt"))).toBe("once upon a time");
  });

  it("can overwrite external change with agent edit", async () => {
    await executeAgentTool(
      "fs_write",
      {
        path: "story.txt",
        mode: "edit",
        edits: [{ oldText: "time", newText: "night" }],
      },
      sandbox.allowed,
      sandbox.root,
      {
        confirmEdit: async () => {
          await writeFile(sandbox.join("story.txt"), "EXTERNAL CHANGE");
          return true;
        },
        resolveExternalEdit: async () => "keep-agent",
      },
    );

    expect(await readFile(sandbox.join("story.txt"))).toBe("once upon a night");
  });

  it("errors when confirmation is unavailable", async () => {
    const result = await executeAgentTool(
      "fs_write",
      {
        path: "story.txt",
        mode: "edit",
        edits: [{ oldText: "time", newText: "night" }],
      },
      sandbox.allowed,
      sandbox.root,
    );
    expect(result).toMatch(/interactive confirmation/);
    expect(await readFile(sandbox.join("story.txt"))).toBe("once upon a time");
  });
});

describe("executeAgentTool delete confirmation", () => {
  let sandbox: TempSandbox;

  beforeEach(async () => {
    sandbox = await createTempSandbox();
    await writeFile(sandbox.join("bye.txt"), "x");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await sandbox.cleanup();
  });

  it("deletes only after user approval", async () => {
    const cancelled = await executeAgentTool(
      "fs_manage",
      { mode: "delete", path: "bye.txt" },
      sandbox.allowed,
      sandbox.root,
      { confirmDelete: async () => false },
    );
    expect(cancelled).toMatch(/cancelled by user/);
    expect(await readFile(sandbox.join("bye.txt"))).toBe("x");

    await executeAgentTool(
      "fs_manage",
      { mode: "delete", path: "bye.txt" },
      sandbox.allowed,
      sandbox.root,
      { confirmDelete: async () => true },
    );
    await expect(readFile(sandbox.join("bye.txt"))).rejects.toThrow();
  });
});
