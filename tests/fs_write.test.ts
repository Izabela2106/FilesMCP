import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleFsWrite } from "../src/tools/fs_write.js";
import { handleFsRead } from "../src/tools/fs_read.js";
import {
  createTempSandbox,
  exists,
  readFile,
  writeFile,
  type TempSandbox,
} from "./helpers/temp-sandbox.js";

describe("handleFsWrite", () => {
  let sandbox: TempSandbox;

  beforeEach(async () => {
    sandbox = await createTempSandbox();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  it("creates directories and writes files", async () => {
    const dir = sandbox.join("docs", "nested");
    await handleFsWrite({ path: dir, mode: "mkdir" }, sandbox.allowed);
    expect(await exists(dir)).toBe(true);

    const file = sandbox.join("docs", "nested", "hi.txt");
    await handleFsWrite(
      { path: file, mode: "write", content: "hello" },
      sandbox.allowed,
    );
    expect(await readFile(file)).toBe("hello");
  });

  it("edits with exact replacement and dryRun leaves file unchanged", async () => {
    const file = sandbox.join("edit.txt");
    await writeFile(file, "alpha beta gamma");

    const dry = await handleFsWrite(
      {
        path: file,
        mode: "edit",
        dryRun: true,
        edits: [{ oldText: "beta", newText: "BETA" }],
      },
      sandbox.allowed,
    );
    expect((dry.content[0] as { text: string }).text).toContain("BETA");
    expect(await readFile(file)).toBe("alpha beta gamma");

    await handleFsWrite(
      {
        path: file,
        mode: "edit",
        dryRun: false,
        edits: [{ oldText: "beta", newText: "BETA" }],
      },
      sandbox.allowed,
    );
    expect(await readFile(file)).toBe("alpha BETA gamma");
  });

  it("rejects mixed mode payloads", async () => {
    const file = sandbox.join("x.txt");
    await writeFile(file, "x");

    await expect(
      handleFsWrite(
        { path: file, mode: "write", content: "y", edits: [{ oldText: "x", newText: "z" }] },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/does not accept "edits"/);

    await expect(
      handleFsWrite(
        { path: file, mode: "edit", content: "nope", edits: [{ oldText: "x", newText: "z" }] },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/does not accept "content"/);

    await expect(
      handleFsWrite(
        { path: file, mode: "mkdir", content: "nope" },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/mkdir does not accept/);
  });

  it("auto mode routes content to write and edits to edit", async () => {
    const file = sandbox.join("auto.txt");
    await handleFsWrite(
      { path: file, mode: "auto", content: "one" },
      sandbox.allowed,
    );
    expect(await readFile(file)).toBe("one");

    await handleFsWrite(
      {
        path: file,
        mode: "auto",
        edits: [{ oldText: "one", newText: "two" }],
      },
      sandbox.allowed,
    );
    expect(await readFile(file)).toBe("two");
  });

  it("refuses writes outside the sandbox", async () => {
    await expect(
      handleFsWrite(
        {
          path: sandbox.join("..", "pwned.txt"),
          mode: "write",
          content: "no",
        },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/Access denied|outside allowed/i);
  });

  it("overwrite is visible to subsequent reads", async () => {
    const file = sandbox.join("roundtrip.txt");
    await handleFsWrite(
      { path: file, mode: "write", content: "v1" },
      sandbox.allowed,
    );
    await handleFsWrite(
      { path: file, mode: "write", content: "v2" },
      sandbox.allowed,
    );
    const read = await handleFsRead(
      { path: file, mode: "text" },
      sandbox.allowed,
    );
    expect((read.content[0] as { text: string }).text).toBe("v2");
  });
});
