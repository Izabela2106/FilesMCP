import { PROJECT_ROOT, resolveSandboxPath } from "../project-env.js";

export { PROJECT_ROOT };
export const WORKSPACE_ROOT = resolveSandboxPath();

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const AGENT_MODEL = "openai/gpt-4o-mini";

export function requireOpenRouterKey(): string {
  const key = process.env.OPEN_ROUTER_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing OPEN_ROUTER_KEY. Copy .env.example to .env and set your OpenRouter key.",
    );
  }
  return key;
}
