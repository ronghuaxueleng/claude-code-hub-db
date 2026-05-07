import { describe, expect, test } from "vitest";
import { parseCodexJoinPoolSSE } from "../codex-joinpool-parser";

describe("parseCodexJoinPoolSSE", () => {
  test("prefers tool calls over execution-confirmation text in non-stream joinOpenAIPool responses", () => {
    const fullText = [
      "event: response.created",
      'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-5.4"}}',
      "",
      "event: response.output_item.added",
      'data: {"type":"response.output_item.added","item":{"type":"message","id":"msg_1"}}',
      "",
      "event: response.output_text.delta",
      'data: {"type":"response.output_text.delta","delta":"执行确认"}',
      "",
      "event: response.output_item.added",
      'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"search","arguments":"{\\"q\\":\\"x\\"}"}}',
      "",
      "event: response.function_call_arguments.done",
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"q\\":\\"x\\"}"}',
      "",
      "event: response.output_item.done",
      'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_1","content":[{"type":"output_text","text":"执行确认"}]}}',
      "",
      "event: response.output_item.done",
      'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"search","arguments":"{\\"q\\":\\"x\\"}"}}',
      "",
      "event: response.completed",
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.4","usage":{"input_tokens":10,"output_tokens":2}}}',
      "",
    ].join("\n");

    const parsed = parseCodexJoinPoolSSE(fullText, "gpt-5.4");

    expect(parsed.finishReason).toBe("tool_calls");
    expect(parsed.textContent).toBe("");
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]).toEqual({
      id: "call_1",
      type: "function",
      function: {
        name: "search",
        arguments: '{"q":"x"}',
      },
    });
  });
});
