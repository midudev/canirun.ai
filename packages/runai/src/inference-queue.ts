type QueueJob = () => Promise<void>;

export class FifoInferenceQueue {
  private readonly pending: QueueJob[] = [];
  private running = false;

  constructor(private readonly maxPending: number) {}

  get activeRequests(): number {
    return this.running ? 1 : 0;
  }

  get queuedRequests(): number {
    return this.pending.length;
  }

  get canAccept(): boolean {
    return !this.running || this.pending.length < this.maxPending;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canAccept) {
      return Promise.reject(new Error("Server is overloaded. Try again later."));
    }

    return new Promise<T>((resolve, reject) => {
      const job = async () => {
        try {
          resolve(await fn());
        } catch (error) {
          reject(error);
        } finally {
          this.running = false;
          this.startNext();
        }
      };
      this.pending.push(job);
      this.startNext();
    });
  }

  private startNext(): void {
    if (this.running) return;
    const next = this.pending.shift();
    if (!next) return;
    this.running = true;
    void next();
  }
}
