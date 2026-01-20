/**
 * 生成 curl 命令
 */
export function generateCurlCommand(
  url: string,
  method: string,
  headers: Headers,
  body: string | null
): string {
  const curlParts: string[] = ["curl"];

  // 添加 method
  if (method !== "GET") {
    curlParts.push(`-X ${method}`);
  }

  // 添加 headers
  headers.forEach((value, key) => {
    // 跳过一些不需要的 headers
    const skipHeaders = ["host", "connection", "content-length", "accept-encoding", "user-agent"];
    if (!skipHeaders.includes(key.toLowerCase())) {
      curlParts.push(`-H '${key}: ${value.replace(/'/g, "'\"'\"'")}'`);
    }
  });

  // 添加 body
  if (body) {
    // 转义单引号
    const escapedBody = body.replace(/'/g, "'\"'\"'");
    curlParts.push(`-d '${escapedBody}'`);
  }

  // 添加 URL（放在最后）
  curlParts.push(`'${url}'`);

  return curlParts.join(" \\\n  ");
}
