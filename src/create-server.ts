import { McpServer } from "@modelcontextprotocol/server";
import { registerFsRead } from "./tools/fs_read.js";
import { registerFsWrite } from "./tools/fs_write.js";
import { registerFsManage } from "./tools/fs_manage.js";
import type { CreateServerOptions } from "./server-options.js";

export type { CreateServerOptions } from "./server-options.js";
export {
  NO_ALLOWED_DIRECTORIES_ERROR,
  NO_ALLOWED_DIRECTORIES_MODERN_ERROR,
} from "./server-options.js";

/** Build the native-tools MCP server for the sandbox. */
export function createServer(
  initialAllowedDirectories: string[],
  options: CreateServerOptions = {},
): McpServer {
  const allowedDirectories = [...initialAllowedDirectories];

  const server = new McpServer({
    name: "files-manipulation",
    version: "1.0.0",
  });

  registerFsRead(server, () => allowedDirectories, options);
  registerFsWrite(server, () => allowedDirectories, options);
  registerFsManage(server, () => allowedDirectories, options);

  return server;
}
