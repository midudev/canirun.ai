import type { APIRoute } from "astro";
import { models } from "../../data/models";
import { serializeModelSummary } from "../../lib/compatibility-api";
import { json, preflight } from "../../lib/api-response";

export const prerender = false;

export const OPTIONS: APIRoute = () => preflight();

export const GET: APIRoute = ({ url }) => {
  const provider = url.searchParams.get("provider")?.toLowerCase().trim() || null;
  const useCase = url.searchParams.get("useCase")?.toLowerCase().trim() || null;

  let list = models;
  if (provider) list = list.filter((m) => m.provider.toLowerCase() === provider);
  if (useCase) list = list.filter((m) => m.useCase.some((u) => u.toLowerCase() === useCase));

  return json(
    {
      count: list.length,
      models: list.map(serializeModelSummary),
    },
    200,
    "public, max-age=3600",
  );
};
