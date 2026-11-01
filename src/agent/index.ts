#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { resolveAllowedDirectories } from "@modelcontextprotocol/server-filesystem/dist/index.js";
import {
  AGENT_MODEL,
  OPENROUTER_BASE_URL,
  WORKSPACE_ROOT,
  requireOpenRouterKey,
} from "./config.js";
import { runAgentTurn } from "./run-turn.js";
import { green, red } from "./colors.js";
import { shortChecksum } from "./checksum.js";
import type { ExternalEditDecision } from "./tools.js";

async function main(): Promise<void> {
  const apiKey = requireOpenRouterKey();
  const allowedDirectories = await resolveAllowedDirectories([WORKSPACE_ROOT]);
  if (allowedDirectories.length === 0) {
    throw new Error(`Workspace is not accessible: ${WORKSPACE_ROOT}`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://localhost/files-manipulation",
      "X-Title": "FilesManipulation Agent",
    },
  });

  const rl = readline.createInterface({ input, output });
  let history: ChatCompletionMessageParam[] = [];

  console.error(`FilesManipulation agent`);
  console.error(`Model: ${AGENT_MODEL}`);
  console.error(`Workspace: ${WORKSPACE_ROOT}`);
  console.error(`Commands: type a request, or "exit" / "quit" to leave.\n`);

  while (true) {
    const userMessage = (await rl.question("you> ")).trim();
    if (!userMessage) continue;
    if (/^(exit|quit)$/i.test(userMessage)) break;

    try {
      const result = await runAgentTurn({
        client,
        history,
        userMessage,
        allowedDirectories,
        workspaceRoot: WORKSPACE_ROOT,
        confirmDelete: async ({ path: target }) => {
          const answer = (
            await rl.question(
              green(
                `Please confirm: delete "${target}" (one file or empty folder)? Type y to confirm, or N to cancel: `,
              ),
            )
          )
            .trim()
            .toLowerCase();
          return answer === "y" || answer === "yes";
        },
        confirmEdit: async ({ path: target }) => {
          const answer = (
            await rl.question(
              green(
                `Please confirm: keep the edits to "${target}"? Type y to save, or N to restore the previous version: `,
              ),
            )
          )
            .trim()
            .toLowerCase();
          return answer === "y" || answer === "yes";
        },
        resolveExternalEdit: async ({
          path: target,
          intendedAction,
          expectedChecksum,
          currentChecksum,
        }) => {
          console.error(
            green(
              `The file "${target}" was changed by something else while waiting for confirmation ` +
                `(agent edit ${shortChecksum(expectedChecksum)}… vs disk ${shortChecksum(currentChecksum)}…).`,
            ),
          );
          console.error(
            green(
              `You were about to ${intendedAction === "keep" ? "keep the agent edit" : "restore the pre-edit version"}.`,
            ),
          );
          console.error(
            green(
              `Choose: a = keep agent's edited version, o = restore original (before agent edit), d = keep current on-disk version`,
            ),
          );

          while (true) {
            const answer = (
              await rl.question(green(`conflict> [a/o/d]: `))
            )
              .trim()
              .toLowerCase();
            const map: Record<string, ExternalEditDecision> = {
              a: "keep-agent",
              agent: "keep-agent",
              o: "restore-original",
              original: "restore-original",
              d: "keep-disk",
              disk: "keep-disk",
            };
            if (map[answer]) return map[answer];
            console.error(green(`Please type a, o, or d.`));
          }
        },
      });
      history = result.history;
      console.log(`\nagent> ${result.assistantText}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(red(`\nerror> ${message}\n`));
    }
  }

  rl.close();
}

main().catch((error: unknown) => {
  console.error(
    red(error instanceof Error ? error.message : String(error)),
  );
  process.exit(1);
});
