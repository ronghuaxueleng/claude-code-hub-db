import { describe, expect, it } from "vitest";
import { transformOpenAIRequestToCodex } from "@/app/v1/_lib/converters/openai-to-codex/request";
import { transformCodexRequestToOpenAI } from "@/app/v1/_lib/converters/codex-to-openai/request";

describe("OpenAI → Codex 转换 - instructions 透传", () => {
  it("当输入包含 instructions 时应直接透传", () => {
    const originalInstructions = "透传：不要被转换器覆盖";
    const input: Record<string, unknown> = {
      instructions: originalInstructions,
      messages: [{ role: "user", content: "你好" }],
    };

    const output = transformOpenAIRequestToCodex("gpt-5-codex", input, true) as any;
    expect(output.instructions).toBe(originalInstructions);
  });

  it("当输入无 instructions 但有 system messages 时，应把 system 文本映射到 instructions", () => {
    const input: Record<string, unknown> = {
      messages: [
        { role: "system", content: "系统指令 1" },
        { role: "system", content: "系统指令 2" },
        { role: "user", content: "用户消息" },
      ],
    };

    const output = transformOpenAIRequestToCodex("gpt-5-codex", input, true) as any;

    expect(output.instructions).toBe("系统指令 1\n\n系统指令 2");
    expect(output.input?.[0]?.role).toBe("user");
    expect(output.input?.[0]?.content?.[0]?.text).toBe("用户消息");
  });

  it("当输入既无 instructions 也无 system messages 时，不应注入默认 instructions", () => {
    const input: Record<string, unknown> = {
      messages: [{ role: "user", content: "用户消息" }],
    };

    const output = transformOpenAIRequestToCodex("gpt-5-codex", input, true) as any;
    expect(output.instructions).toBeUndefined();
  });

  it("当输入显式设置 parallel_tool_calls=false 时，应透传到 Codex 请求", () => {
    const input: Record<string, unknown> = {
      messages: [{ role: "user", content: "你好" }],
      parallel_tool_calls: false,
    };

    const output = transformOpenAIRequestToCodex("gpt-5-codex", input, true) as any;
    expect(output.parallel_tool_calls).toBe(false);
  });

  it("应将 OpenAI tools 转为 Responses 扁平 tools，并将 tool_choice 转为扁平 function 选择", () => {
    const input: Record<string, unknown> = {
      messages: [{ role: "user", content: "你好" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "获取天气",
            parameters: {
              type: "object",
              properties: {
                city: { type: "string" },
              },
              required: ["city"],
            },
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: {
          name: "get_weather",
        },
      },
    };

    const output = transformOpenAIRequestToCodex("gpt-5-codex", input, true) as any;

    expect(output.tools).toEqual([
      {
        type: "function",
        name: "get_weather",
        description: "获取天气",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string" },
          },
          required: ["city"],
        },
      },
    ]);
    expect(output.tool_choice).toEqual({
      type: "function",
      name: "get_weather",
    });
  });

  it("应将 assistant tool_calls 和 tool 结果转为 function_call / function_call_output", () => {
    const input: Record<string, unknown> = {
      messages: [
        { role: "user", content: "查天气" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{\"city\":\"Shanghai\"}",
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_123",
          content: "{\"temp\":26}",
        },
      ],
    };

    const output = transformOpenAIRequestToCodex("gpt-5-codex", input, true) as any;

    expect(output.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "查天气" }],
      },
      {
        type: "function_call",
        call_id: "call_123",
        name: "get_weather",
        arguments: "{\"city\":\"Shanghai\"}",
      },
      {
        type: "function_call_output",
        call_id: "call_123",
        output: "{\"temp\":26}",
      },
    ]);
  });
});

describe("Codex → OpenAI 转换 - tool_choice 兼容", () => {
  it("应兼容 Responses 扁平 tool_choice 格式", () => {
    const input: Record<string, unknown> = {
      instructions: "你是助手",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "你好" }] }],
      tool_choice: {
        type: "function",
        name: "get_weather",
      },
    };

    const output = transformCodexRequestToOpenAI("gpt-5-codex", input, true) as any;

    expect(output.tool_choice).toEqual({
      type: "function",
      function: {
        name: "get_weather",
      },
    });
  });
});
