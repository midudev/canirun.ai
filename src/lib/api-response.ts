// ── Shared JSON/CORS helpers for the public API ────────────

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export function json(data: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      ...CORS_HEADERS,
    },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export const MAX_BODY_BYTES = 16 * 1024;

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: "payload_too_large" }, 413) };
  }
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: json({ error: "invalid_json" }, 400) };
  }
}
