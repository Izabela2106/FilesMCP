import { createHash } from "node:crypto";

/** SHA-256 hex digest of UTF-8 text (used to detect external edits). */
export function checksumText(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function shortChecksum(hex: string): string {
  return hex.slice(0, 12);
}
