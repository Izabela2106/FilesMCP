import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleFsManage } from "../src/tools/fs_manage.js";
import {
  createTempSandbox,
  exists,
  readFile,
  writeFile,
  type TempSandbox,
} from "./helpers/temp-sandbox.js";

describe("handleFsManage", () => {
  let sandbox: TempSandbox;

  beforeEach(async () => {
    sandbox = await createTempSandbox();
    await writeFile(sandbox.join("books", "a.txt"), "aaa");
    await writeFile(sandbox.join("books", "b.txt"), "bbb");
    await fs.mkdir(sandbox.join("empty"), { recursive: true });
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  it("moves/renames and returns info/search results", async () => {
    const src = sandbox.join("books", "a.txt");
    const dest = sandbox.join("books", "a-renamed.txt");
    await handleFsManage(
      { mode: "move", source: src, destination: dest },
      sandbox.allowed,
    );
    expect(await exists(src)).toBe(false);
    expect(await readFile(dest)).toBe("aaa");

    const info = await handleFsManage(
      { mode: "info", path: dest },
      sandbox.allowed,
    );
    expect((info.content[0] as { text: string }).text).toMatch(/isFile: true/);

    const search = await handleFsManage(
      { mode: "search", path: sandbox.root, pattern: "**/*.txt" },
      sandbox.allowed,
    );
    const text = (search.content[0] as { text: string }).text;
    expect(text).toContain("a-renamed.txt");
    expect(text).toContain("b.txt");
  });

  it("deletes a single file after confirm", async () => {
    const file = sandbox.join("books", "b.txt");
    await expect(
      handleFsManage({ mode: "delete", path: file, confirm: false }, sandbox.allowed),
    ).rejects.toThrow(/confirm=true/);

    await handleFsManage(
      { mode: "delete", path: file, confirm: true },
      sandbox.allowed,
    );
    expect(await exists(file)).toBe(false);
  });

  it("deletes an empty folder but refuses a non-empty one", async () => {
    await handleFsManage(
      { mode: "delete", path: sandbox.join("empty"), confirm: true },
      sandbox.allowed,
    );
    expect(await exists(sandbox.join("empty"))).toBe(false);

    await expect(
      handleFsManage(
        { mode: "delete", path: sandbox.join("books"), confirm: true },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/non-empty directory/);
  });

  it("refuses delete with pattern / move fields", async () => {
    await expect(
      handleFsManage(
        {
          mode: "delete",
          path: sandbox.join("books", "a.txt"),
          pattern: "*.txt",
          confirm: true,
        },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/does not accept "pattern"/);

    await expect(
      handleFsManage(
        {
          mode: "delete",
          path: sandbox.join("books", "a.txt"),
          source: sandbox.join("books", "a.txt"),
          confirm: true,
        },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/does not accept "source"/);
  });

  it("never auto-selects delete from path alone", async () => {
    const file = sandbox.join("books", "a.txt");
    const result = await handleFsManage({ path: file }, sandbox.allowed);
    expect((result.content[0] as { text: string }).text).toMatch(/isFile:/);
    expect(await exists(file)).toBe(true);
  });

  it("blocks move destination outside sandbox", async () => {
    await expect(
      handleFsManage(
        {
          mode: "move",
          source: sandbox.join("books", "a.txt"),
          destination: sandbox.join("..", "escaped.txt"),
        },
        sandbox.allowed,
      ),
    ).rejects.toThrow(/Access denied|outside allowed/i);
  });
});
