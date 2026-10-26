import { Phase1Error } from "./service";

export function requireSameOrigin(request: Request, expectedOrigin: string) {
  if (
    request.headers.get("origin") !== expectedOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new Phase1Error(
      403,
      "invalid_origin",
      "This request is not allowed.",
    );
  }
}

export async function smallJson(
  request: Request,
  limit = 4096,
): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new Phase1Error(415, "invalid_content_type", "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new Phase1Error(
      400,
      "invalid_credentials",
      "Enter a valid email address and password.",
    );
  let bytes = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Phase1Error(
          413,
          "request_too_large",
          "The sign-in request is too large.",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Phase1Error(
      400,
      "invalid_credentials",
      "Enter a valid email address and password.",
    );
  }
}
