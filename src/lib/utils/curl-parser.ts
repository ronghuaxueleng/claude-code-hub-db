/**
 * 从 curl 命令解析请求信息
 */
export interface ParsedCurlRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export function parseCurlCommand(curlCommand: string): ParsedCurlRequest | null {
  try {
    const lines = curlCommand.split("\n").map((line) => line.trim());
    let url = "";
    let method = "GET";
    const headers: Record<string, string> = {};
    let body: string | null = null;

    for (const line of lines) {
      // 提取 URL（最后一个参数，用单引号包裹）
      const urlMatch = line.match(/'(https?:\/\/[^']+)'$/);
      if (urlMatch) {
        url = urlMatch[1];
        continue;
      }

      // 提取 method
      if (line.startsWith("-X ")) {
        method = line.substring(3).trim();
        continue;
      }

      // 提取 headers
      const headerMatch = line.match(/-H\s+'([^:]+):\s*([^']+)'/);
      if (headerMatch) {
        headers[headerMatch[1]] = headerMatch[2];
        continue;
      }

      // 提取 body
      const bodyMatch = line.match(/-d\s+'(.+)'$/);
      if (bodyMatch) {
        // 反转义单引号
        body = bodyMatch[1].replace(/'"'"'/g, "'");
      }
    }

    if (!url) {
      return null;
    }

    return {
      url,
      method,
      headers,
      body,
    };
  } catch (_error) {
    return null;
  }
}
