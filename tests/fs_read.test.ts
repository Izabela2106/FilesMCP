import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleFsRead } from "../src/tools/fs_read.js";
import {
  createTempSandbox,
  writeFile,
  type TempSandbox,
} from "./helpers/temp-sandbox.js";

describe("handleFsRead", () => {
  let sandbox: TempSandbox;

  beforeEach(async () => {
    sandbox = await createTempSandbox();
    await writeFile(sandbox.join("notes", "a.txt"), "line1\nline2\nline3\n");
    await writeFile(sandbox.join("notes", "b.txt"), "bbb");
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  it("reads text and supports head/tail", async () => {
    const full = await handleFsRead(
      { path: sandbox.join("notes", "a.txt"), mode: "text" },
      sandbox.allowed,
    );
    expect(full.content[0]).toMatchObject({ type: "text" });
    expect((full.content[0] as { text: string }).text).toContain("line2");

    const head = await handleFsRead(
      { path: sandbox.join("notes", "a.txt"), mode: "text", head: 1 },
      sandbox.allowed,
    );
    expect((head.content[0] as { text: string }).text.trim()).toBe("line1");
  });

  it("lists directories in list and list_sizes modes", async () => {
    const listed = await handleFsRead(
      { path: sandbox.join("notes"), mode: "list" },
      sandbox.allowed,
    );
    const text = (listed.content[0] as { text: string }).text;
    expect(text).toContain("[FILE] a.txt");
    expect(text).toContain("[FILE] b.txt");

    const sized = await handleFsRead(
      { path: sandbox.join("notes"), mode: "list_sizes" },
      sandbox.allowed,
    );
    expect((sized.content[0] as { text: string }).text).toMatch(/Total:/);
  });

  it("reads multiple files and continues after a missing path", async () => {
    const result = await handleFsRead(
      {
        paths: [
          sandbox.join("notes", "a.txt"),
          sandbox.join("notes", "missing.txt"),
        ],
      },
      sandbox.allowed,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("line1");
    expect(text).toMatch(/missing\.txt: Error -/);
  });

  it("rejects contradictory args", async () => {
    await expect(
      handleFsRead({ path: sandbox.join("notes", "a.txt"), paths: ["x"] }, sandbox.allowed),
    ).rejects.toThrow(/exactly one of path or paths/);

    await expect(
      handleFsRead(
        { path: sandbox.join("notes", "a.txt"), mode: "text", head: 1, tail: 1 },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/both head and tail/);

    await expect(
      handleFsRead(
        { path: sandbox.join("notes", "a.txt"), mode: "list" },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/not a directory/);

    await expect(
      handleFsRead(
        { path: sandbox.join("notes"), mode: "text" },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/Path is a directory/);
  });

  it("blocks path traversal outside the sandbox", async () => {
    await expect(
      handleFsRead(
        { path: sandbox.join("..", "secret.txt"), mode: "text" },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/Access denied|outside allowed/i);
  });
});
