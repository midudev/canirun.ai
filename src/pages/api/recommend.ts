import type { APIRoute } from "astro";
import {
  resolveHardware,
  recommendModels,
  type HardwareInput,
} from "../../lib/compatibility-api";
import { json, preflight, readJsonBody } from "../../lib/api-response";

export const prerender = false;

export const OPTIONS: APIRoute = () => preflight();

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const payload = body.value as {
    hardware?: HardwareInput;
    useCase?: string;
    limit?: number;
  } | null;

  if (!payload || typeof payload !== "object") {
    return json({ error: "invalid_payload" }, 400);
  }

  const resolved = resolveHardware(payload.hardware);
  if (!resolved.ok) {
    return json({ error: resolved.error }, 400);
  }

  const recommendations = recommendModels(resolved.value.hw, {
    useCase: payload.useCase,
    limit: payload.limit,
  });

  return json({
    hardware: resolved.value.detected,
    count: recommendations.length,
    recommendations,
  });
};
