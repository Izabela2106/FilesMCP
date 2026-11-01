import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import {
  agentTools,
  executeAgentTool,
  SYSTEM_PROMPT,
  type AgentToolOptions,
} from "./tools.js";
import { AGENT_MODEL } from "./config.js";
import { blue, red } from "./colors.js";
import { describeToolCall, describeToolResult } from "./describe-tool.js";

const MAX_TOOL_ROUNDS = 8;

export async function runAgentTurn(options: {
  client: OpenAI;
  history: ChatCompletionMessageParam[];
  userMessage: string;
  allowedDirectories: string[];
  workspaceRoot: string;
  confirmDelete?: AgentToolOptions["confirmDelete"];
  confirmEdit?: AgentToolOptions["confirmEdit"];
  resolveExternalEdit?: AgentToolOptions["resolveExternalEdit"];
}): Promise<{ assistantText: string; history: ChatCompletionMessageParam[] }> {
  const history: ChatCompletionMessageParam[] = [
    ...options.history,
    { role: "user", content: options.userMessage },
  ];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await options.client.chat.completions.create({
      model: AGENT_MODEL,
      messages,
      tools: agentTools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) {
      throw new Error("OpenRouter returned an empty completion");
    }

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const assistantText = choice.content?.trim() || "(no response)";
      history.push({ role: "assistant", content: assistantText });
      return { assistantText, history };
    }

    history.push({
      role: "assistant",
      content: choice.content,
      tool_calls: toolCalls,
    });
    messages.push({
      role: "assistant",
      content: choice.content,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls as ChatCompletionMessageToolCall[]) {
      if (toolCall.type !== "function") {
        continue;
      }
      let parsedArgs: unknown = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        parsedArgs = {};
      }

      const toolName = toolCall.function.name;
      const argsRecord =
        parsedArgs !== null && typeof parsedArgs === "object"
          ? (parsedArgs as Record<string, unknown>)
          : {};
      const isEdit =
        toolName === "fs_write" &&
        (argsRecord.mode === "edit" ||
          (Array.isArray(argsRecord.edits) && argsRecord.edits.length > 0));

      // Edit flow logs its own dry-run / apply steps inside executeAgentTool.
      if (!isEdit) {
        console.error(blue(describeToolCall(toolName, parsedArgs)));
      }

      const toolResult = await executeAgentTool(
        toolName,
        parsedArgs,
        options.allowedDirectories,
        options.workspaceRoot,
        {
          confirmDelete: options.confirmDelete,
          confirmEdit: options.confirmEdit,
          resolveExternalEdit: options.resolveExternalEdit,
        },
      );

      const failed =
        typeof toolResult === "string" && /"error"\s*:/.test(toolResult);
      const reverted =
        typeof toolResult === "string" &&
        (toolResult.includes("cancelled by user") ||
          toolResult.includes("reverted by user"));
      if (reverted) {
        console.error(blue("Action cancelled — previous version restored"));
      } else if (failed) {
        console.error(red(describeToolResult(toolName, parsedArgs, true)));
        try {
          const parsed = JSON.parse(toolResult) as { error?: string };
          if (parsed.error) {
            console.error(red(`Error: ${parsed.error}`));
          }
        } catch {
          // tool result was not JSON; the summary line above is enough
        }
      } else {
        console.error(blue(describeToolResult(toolName, parsedArgs, false)));
      }

      const toolMessage: ChatCompletionMessageParam = {
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      };
      history.push(toolMessage);
      messages.push(toolMessage);
    }
  }

  throw new Error(
    `Stopped after ${MAX_TOOL_ROUNDS} tool rounds without a final answer`,
  );
}
