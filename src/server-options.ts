export type CreateServerOptions = {
  era?: string;
  onCannotOperate?: () => void;
};

export const NO_ALLOWED_DIRECTORIES_ERROR =
  "Server cannot operate: No allowed directories available. Start the server with sandbox directory arguments.";

export const NO_ALLOWED_DIRECTORIES_MODERN_ERROR =
  "Server cannot operate: No allowed directories available on protocol 2026-07-28. Restart with directory arguments.";
