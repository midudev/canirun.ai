export type PlaygroundRole = "system" | "user" | "assistant";

export type PlaygroundDevice = "webgpu" | "wasm";

export interface WorkerMessage {
  role: PlaygroundRole;
  content: string;
  images?: string[];
  audioUrl?: string;
}

export interface WorkerSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export interface LoadProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
  message?: string;
}

export interface LoadResult {
  ok: boolean;
  error?: string;
  cancelled?: boolean;
  hasProcessor?: boolean;
}

export interface TokenEvent {
  text: string;
  numTokens: number;
  tps: number;
}

export interface WorkerAudio {
  data: Float32Array;
  sampleRate: number;
}

export interface GenerateRequest {
  messages: WorkerMessage[];
  settings: WorkerSettings;
  thinkingFormat?: "qwen" | "gpt-oss";
  capabilities: {
    vision: boolean;
    audio: boolean;
  };
  audio?: WorkerAudio | null;
}

export interface GenerationResult {
  text: string;
  numTokens: number;
  tps: number;
  elapsedMs: number;
  error?: string;
}

export interface WorkerAPI {
  load(
    modelId: string,
    device: PlaygroundDevice,
    onProgress: (progress: LoadProgress) => void,
  ): Promise<LoadResult>;
  generate(
    request: GenerateRequest,
    onToken: (event: TokenEvent) => void,
  ): Promise<GenerationResult>;
  abort(): void;
  dispose(): Promise<void>;
  hasCachedModel(modelId: string): Promise<boolean>;
  getAudioSampleRate(): number | null;
}
