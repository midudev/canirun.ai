import type { APIRoute } from "astro";
import { findModel, serializeModel } from "../../../lib/compatibility-api";
import { json, preflight } from "../../../lib/api-response";

export const prerender = false;

export const OPTIONS: APIRoute = () => preflight();

export const GET: APIRoute = ({ params }) => {
  const id = params.id?.trim();
  if (!id) return json({ error: "missing_model_id" }, 400);

  const model = findModel(id);
  if (!model) return json({ error: "model_not_found", modelId: id }, 404);

  return json(serializeModel(model), 200, "public, max-age=3600");
};
