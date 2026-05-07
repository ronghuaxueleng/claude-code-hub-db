export type CodexJoinPoolParsedResult = {
  model: string;
  messageId: string;
  textContent: string;
  reasoningContent: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
};

function getEventResponseObject(
  data: Record<string, unknown>
): Record<string, unknown> | undefined {
  const nested = data.response;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }

  if (typeof data.id === "string" || Array.isArray(data.output) || data.usage) {
    return data;
  }

  return undefined;
}

export function parseCodexJoinPoolSSE(
  fullText: string,
  fallbackModel: string
): CodexJoinPoolParsedResult {
  let model = fallbackModel;
  let messageId = "";
  let textContent = "";
  let pendingTextContent = "";
  let reasoningContent = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationInputTokens = 0;
  let cacheReadInputTokens = 0;
  let finishReason = "stop";
  const toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> = [];
  const functionCallArgumentBuffers: Map<string, string> = new Map();

  const events = fullText.split("\n\n");
  for (const event of events) {
    if (!event.trim()) continue;

    let sseEventName = "";
    let eventData = "";
    for (const line of event.split("\n")) {
      if (line.startsWith("event: ")) {
        sseEventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        eventData = line.slice(6);
      }
    }

    if (!eventData || eventData === "[DONE]") continue;

    try {
      const data = JSON.parse(eventData) as Record<string, unknown>;
      const eventType = sseEventName || (data.type as string | undefined);
      if (!eventType) continue;

      switch (eventType) {
        case "response.created": {
          const response = getEventResponseObject(data);
          if (response) {
            messageId = (response.id as string) || messageId;
            model = (response.model as string) || model;
          }
          break;
        }

        case "response.output_text.delta":
          pendingTextContent += (data.delta as string) || "";
          break;

        case "response.output_item.added": {
          const item = data.item as Record<string, unknown> | undefined;
          if (item?.type === "message") {
            messageId = (item.id as string) || messageId;
          } else if (item?.type === "function_call") {
            const itemId = (item.id as string) || "";
            if (itemId) {
              functionCallArgumentBuffers.set(itemId, (item.arguments as string) || "");
            }
          }
          break;
        }

        case "response.reasoning_summary_text.delta":
          reasoningContent += (data.delta as string) || "";
          break;

        case "response.function_call_arguments.delta": {
          const itemId = (data.item_id as string) || "";
          if (itemId) {
            const existing = functionCallArgumentBuffers.get(itemId) || "";
            functionCallArgumentBuffers.set(itemId, existing + ((data.delta as string) || ""));
          }
          break;
        }

        case "response.function_call_arguments.done": {
          const itemId = (data.item_id as string) || "";
          if (itemId) {
            functionCallArgumentBuffers.set(itemId, (data.arguments as string) || "");
          }
          break;
        }

        case "response.output_item.done": {
          const item = data.item as Record<string, unknown> | undefined;
          if (item?.type === "message") {
            const content = item.content as Array<Record<string, unknown>> | undefined;
            let completedMessageText = "";
            if (content && Array.isArray(content)) {
              for (const contentItem of content) {
                if (contentItem.type === "output_text") {
                  completedMessageText += (contentItem.text as string) || "";
                }
              }
            }
            textContent += completedMessageText || pendingTextContent;
            pendingTextContent = "";
          } else if (item?.type === "function_call") {
            const itemId = (item.id as string) || "";
            const bufferedArguments =
              (itemId && functionCallArgumentBuffers.get(itemId)) ||
              (item.arguments as string) ||
              "";
            toolCalls.push({
              id: (item.call_id as string) || "",
              type: "function",
              function: {
                name: (item.name as string) || "",
                arguments: bufferedArguments,
              },
            });
            if (itemId) {
              functionCallArgumentBuffers.delete(itemId);
            }
          }
          break;
        }

        case "response.completed": {
          const response = getEventResponseObject(data);
          if (response) {
            messageId = (response.id as string) || messageId;
            model = (response.model as string) || model;
            const usage = response.usage as Record<string, unknown> | undefined;
            if (usage) {
              inputTokens = (usage.input_tokens as number) || inputTokens;
              outputTokens = (usage.output_tokens as number) || outputTokens;
              cacheCreationInputTokens =
                (usage.cache_creation_input_tokens as number) || cacheCreationInputTokens;
              cacheReadInputTokens =
                (usage.cache_read_input_tokens as number) || cacheReadInputTokens;
            }
          }
          if (toolCalls.length > 0) {
            textContent = "";
            pendingTextContent = "";
            finishReason = "tool_calls";
          } else {
            if (!textContent && pendingTextContent) {
              textContent = pendingTextContent;
            }
            finishReason = "stop";
          }
          break;
        }
      }
    } catch {
      // skip unparseable events
    }
  }

  return {
    model,
    messageId,
    textContent,
    reasoningContent,
    finishReason,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    toolCalls,
  };
}
