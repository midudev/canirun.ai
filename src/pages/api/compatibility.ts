import type { APIRoute } from "astro";
import {
  resolveHardware,
  findModel,
  evaluateCompatibility,
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
    modelId?: string;
    quantization?: string;
  } | null;

  if (!payload || typeof payload !== "object") {
    return json({ error: "invalid_payload" }, 400);
  }

  if (typeof payload.modelId !== "string" || !payload.modelId.trim()) {
    return json({ error: "missing_model_id" }, 400);
  }

  const resolved = resolveHardware(payload.hardware);
  if (!resolved.ok) {
    return json({ error: resolved.error }, 400);
  }

  const model = findModel(payload.modelId);
  if (!model) {
    return json({ error: "model_not_found", modelId: payload.modelId }, 404);
  }

  const result = evaluateCompatibility(resolved.value.hw, model, payload.quantization);
  if (!result.ok) {
    return json({ error: result.error, availableQuantizations: result.available }, 400);
  }

  return json({ ...result.value, hardware: resolved.value.detected });
};
