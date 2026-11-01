import { describe, expect, it } from "vitest";
import { checksumText, shortChecksum } from "../src/agent/checksum.js";

describe("checksumText", () => {
  it("returns a stable sha256 hex digest", () => {
    const a = checksumText("hello");
    const b = checksumText("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when content changes (including whitespace)", () => {
    expect(checksumText("hello")).not.toBe(checksumText("hello "));
    expect(checksumText("hello\n")).not.toBe(checksumText("hello\r\n"));
  });

  it("shortChecksum keeps the first 12 hex chars", () => {
    const full = checksumText("x");
    expect(shortChecksum(full)).toBe(full.slice(0, 12));
  });
});
