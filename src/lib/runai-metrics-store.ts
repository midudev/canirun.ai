import { env } from "cloudflare:workers";
import type {
  SanitizedBrowseMetric,
  SanitizedInferenceMetric,
  SanitizedRecommendationMetric,
  SanitizedRunaiMetric,
} from "./runai-metrics";

// Schema lives in migrations/ (applied with `wrangler d1 migrations apply`).
function getDb(): D1Database {
  if (!env.DB) {
    throw new Error("D1 binding `DB` is not configured. Check wrangler.jsonc.");
  }
  return env.DB;
}

function recommendationProjections(metric: SanitizedRecommendationMetric): {
  platform: string | null;
  deviceClass: string | null;
} {
  return {
    platform: metric.hardware.platform,
    deviceClass: metric.hardware.deviceClass,
  };
}

function inferenceProjections(metric: SanitizedInferenceMetric): {
  model: string;
  success: number;
  stream: number;
  latencyMs: number;
  outputTokensApprox: number;
} {
  return {
    model: metric.model,
    success: metric.success ? 1 : 0,
    stream: metric.stream ? 1 : 0,
    latencyMs: metric.latencyMs,
    outputTokensApprox: metric.outputTokensApprox,
  };
}

function browseProjections(_metric: SanitizedBrowseMetric): Record<string, never> {
  return {};
}

export async function insertRunaiMetric(metric: SanitizedRunaiMetric): Promise<void> {
  const db = getDb();

  const base = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    eventName: metric.event,
    runaiVersion: metric.runaiVersion,
    metricJson: JSON.stringify(metric),
    platform: null as string | null,
    deviceClass: null as string | null,
    model: null as string | null,
    success: null as number | null,
    stream: null as number | null,
    latencyMs: null as number | null,
    outputTokensApprox: null as number | null,
  };

  if (metric.event === "recommendation_generated") {
    const projection = recommendationProjections(metric);
    base.platform = projection.platform;
    base.deviceClass = projection.deviceClass;
  } else if (metric.event === "inference_completed") {
    const projection = inferenceProjections(metric);
    base.model = projection.model;
    base.success = projection.success;
    base.stream = projection.stream;
    base.latencyMs = projection.latencyMs;
    base.outputTokensApprox = projection.outputTokensApprox;
  } else {
    browseProjections(metric);
  }

  await db
    .prepare(
      `
      INSERT INTO runai_metrics (
        id, received_at, event_name, runai_version, metric_json,
        platform, device_class, model, success, stream, latency_ms, output_tokens_approx
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      base.id,
      base.receivedAt,
      base.eventName,
      base.runaiVersion,
      base.metricJson,
      base.platform,
      base.deviceClass,
      base.model,
      base.success,
      base.stream,
      base.latencyMs,
      base.outputTokensApprox,
    )
    .run();
}
