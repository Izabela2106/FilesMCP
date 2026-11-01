function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function quote(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "(unknown path)";
  }
  return `"${value}"`;
}

function describeFsRead(args: Record<string, unknown>): string {
  const mode = typeof args.mode === "string" ? args.mode : "auto";
  const path = args.path;
  const paths = Array.isArray(args.paths) ? args.paths : undefined;

  if (paths && paths.length > 0) {
    const list = paths.map((p) => quote(p)).join(", ");
    return `Reading ${paths.length} file${paths.length === 1 ? "" : "s"}: ${list}`;
  }

  switch (mode) {
    case "list":
      return `Listing contents of ${quote(path)}`;
    case "list_sizes":
      return `Listing contents of ${quote(path)} with file sizes`;
    case "media":
      return `Reading media file ${quote(path)}`;
    case "text":
      if (typeof args.head === "number") {
        return `Reading the first ${args.head} lines of ${quote(path)}`;
      }
      if (typeof args.tail === "number") {
        return `Reading the last ${args.tail} lines of ${quote(path)}`;
      }
      return `Reading text from ${quote(path)}`;
    case "auto":
    default:
      if (typeof args.head === "number") {
        return `Reading the first ${args.head} lines of ${quote(path)}`;
      }
      if (typeof args.tail === "number") {
        return `Reading the last ${args.tail} lines of ${quote(path)}`;
      }
      return `Reading ${quote(path)}`;
  }
}

function describeFsWrite(args: Record<string, unknown>): string {
  const mode = typeof args.mode === "string" ? args.mode : "auto";
  const path = quote(args.path);

  if (mode === "edit" || (mode === "auto" && Array.isArray(args.edits))) {
    const dry = args.dryRun === true ? " (dry run)" : "";
    const count = Array.isArray(args.edits) ? args.edits.length : 0;
    return `Editing ${path} with ${count} change${count === 1 ? "" : "s"}${dry}`;
  }
  if (mode === "write" || (mode === "auto" && typeof args.content === "string")) {
    return `Writing file ${path}`;
  }
  if (mode === "mkdir" || mode === "auto") {
    return `Creating directory ${path}`;
  }
  return `Updating ${path}`;
}

function describeFsManage(args: Record<string, unknown>): string {
  const mode = typeof args.mode === "string" ? args.mode : "auto";

  if (mode === "move" || args.source || args.destination) {
    return `Moving ${quote(args.source)} to ${quote(args.destination)}`;
  }
  if (mode === "search" || typeof args.pattern === "string") {
    const pattern = typeof args.pattern === "string" ? args.pattern : "*";
    return `Searching under ${quote(args.path)} for files matching "${pattern}"`;
  }
  if (mode === "delete") {
    return `Deleting ${quote(args.path)} (single file or empty folder)`;
  }
  if (mode === "info" || mode === "auto") {
    return `Getting info about ${quote(args.path)}`;
  }
  return `Managing ${quote(args.path)}`;
}

/** Turn a tool call into a short natural-language action description. */
export function describeToolCall(name: string, rawArgs: unknown): string {
  const args = asRecord(rawArgs);
  switch (name) {
    case "fs_read":
      return describeFsRead(args);
    case "fs_write":
      return describeFsWrite(args);
    case "fs_manage":
      return describeFsManage(args);
    default:
      return `Running ${name}`;
  }
}

export function describeToolResult(
  name: string,
  rawArgs: unknown,
  failed: boolean,
): string {
  const action = describeToolCall(name, rawArgs);
  if (failed) {
    return `Failed while ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
  }
  // Present continuous → simple past for a few common openers
  const past = action
    .replace(/^Reading /, "Read ")
    .replace(/^Listing /, "Listed ")
    .replace(/^Writing /, "Wrote ")
    .replace(/^Editing /, "Edited ")
    .replace(/^Creating /, "Created ")
    .replace(/^Moving /, "Moved ")
    .replace(/^Searching /, "Searched ")
    .replace(/^Deleting /, "Deleted ")
    .replace(/^Getting /, "Got ")
    .replace(/^Updating /, "Updated ")
    .replace(/^Managing /, "Managed ")
    .replace(/^Running /, "Ran ");
  return past;
}
