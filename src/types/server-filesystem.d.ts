declare module "@modelcontextprotocol/server-filesystem/dist/lib.js" {
  export function validatePath(
    requestedPath: string,
    allowedDirectories: string[],
  ): Promise<string>;
  export function readFileContent(
    filePath: string,
    encoding?: BufferEncoding,
  ): Promise<string>;
  export function headFile(filePath: string, numLines: number): Promise<string>;
  export function tailFile(filePath: string, numLines: number): Promise<string>;
  export function formatSize(bytes: number): string;
  export function writeFileContent(
    filePath: string,
    content: string,
  ): Promise<void>;
  export function createDirectory(directoryPath: string): Promise<void>;
  export function applyFileEdits(
    filePath: string,
    edits: Array<{ oldText: string; newText: string }>,
    dryRun?: boolean,
  ): Promise<string>;
  export function moveFile(
    sourcePath: string,
    destinationPath: string,
  ): Promise<void>;
  export function getFileStats(filePath: string): Promise<{
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions: string;
    hardLinks: number;
  }>;
  export function searchFilesWithValidation(
    rootPath: string,
    pattern: string,
    allowedDirectories: string[],
    options?: { excludePatterns?: string[] },
  ): Promise<string[]>;
}

declare module "@modelcontextprotocol/server-filesystem/dist/index.js" {
  export function resolveAllowedDirectories(args: string[]): Promise<string[]>;
}
