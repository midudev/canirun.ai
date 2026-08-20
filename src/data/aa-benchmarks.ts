import data from "./aa-benchmarks.json";

export interface AaBenchmarkEntry {
  intelligence: number;
  aaName: string;
  aaUrl: string;
  preliminary?: boolean;
}

export interface AaBenchmarkCatalog {
  source: string;
  index: string;
  version: string;
  retrievedAt: string;
  sourceUrl: string;
  models: Record<string, AaBenchmarkEntry>;
}

export const AA_BENCHMARKS = data as AaBenchmarkCatalog;

export function getAaBenchmark(id: string): AaBenchmarkEntry | undefined {
  return AA_BENCHMARKS.models[id];
}
