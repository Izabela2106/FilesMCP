import { describe, expect, it } from "vitest";
import {
  describeToolCall,
  describeToolResult,
} from "../src/agent/describe-tool.js";

describe("describeToolCall", () => {
  it("describes list and multi-read", () => {
    expect(
      describeToolCall("fs_read", { path: "data", mode: "list" }),
    ).toContain("Listing contents");
    expect(
      describeToolCall("fs_read", { paths: ["a.txt", "b.txt"] }),
    ).toContain("2 files");
  });

  it("describes write/edit/mkdir and manage modes", () => {
    expect(
      describeToolCall("fs_write", { path: "a.txt", mode: "write", content: "x" }),
    ).toContain("Writing file");
    expect(
      describeToolCall("fs_write", {
        path: "a.txt",
        mode: "edit",
        edits: [{ oldText: "a", newText: "b" }],
      }),
    ).toContain("Editing");
    expect(
      describeToolCall("fs_manage", {
        mode: "delete",
        path: "a.txt",
      }),
    ).toContain("empty folder");
  });
});

describe("describeToolResult", () => {
  it("uses past tense on success and failure phrasing on error", () => {
    expect(
      describeToolResult("fs_read", { path: "a.txt", mode: "text" }, false),
    ).toMatch(/^Read /);
    expect(
      describeToolResult("fs_read", { path: "a.txt", mode: "text" }, true),
    ).toMatch(/^Failed while /);
  });
});
