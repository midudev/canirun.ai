export type RunStatus = "can-run" | "tight" | "can-run-slow" | "cannot-run" | "unknown";

export interface CliHardwareInfo {
  gpuRenderer: string | null;
  gpuVendor: string | null;
  gpuCores: number | null;
  ramGB: number | null;
  estimatedVRAM: number | null;
  memoryBandwidth: number | null;
  systemRAM: number | null;
  deviceMemoryRaw: number | null;
  webgpu: boolean;
  webgpuDevice: string | null;
  webgpuArch: string | null;
  isAppleSilicon: boolean;
  totalUsableRAM: number | null;
  platform: string | null;
  cpuBenchmark: number | null;
  isMobile: boolean;
  deviceName: string | null;
  /** True when Linux is running under Windows Subsystem for Linux. */
  isWsl?: boolean;
  /** CPU model reported by the host, independent from the selected accelerator. */
  cpuName?: string | null;
  /** Logical CPU count available to the current process. */
  cpuCores?: number | null;
  /** Accelerator API expected to be usable by the inference runtime. */
  computeBackend?: "metal" | "cuda" | "rocm" | "vulkan" | "cpu" | "unknown";
}

export interface RecommendedModel {
  id: string;
  name: string;
  provider: string;
  ollamaId?: string;
  sourceUrl: string;
  ggufRepo?: string;
  quant: string;
  score: number;
  grade: string;
  status: RunStatus;
  expectedTokensPerSec: number | null;
  memoryNeededGB: number;
  diskNeededGB: number;
  paramsBillions: number;
  activeParamsBillions?: number;
  downloaded: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InferenceParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  stop?: string[];
  repeatPenalty?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface InferenceResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelMetadata {
  architecture: string | null;
  contextLength: number | null;
  paramCount: number | null;
  quantization: string | null;
  fileSizeBytes: number;
  fileFormat: string;
}
