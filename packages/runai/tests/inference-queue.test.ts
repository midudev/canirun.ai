import { describe, expect, test } from "vitest";
import { FifoInferenceQueue } from "../src/inference-queue";

describe("FifoInferenceQueue", () => {
  test("runs one inference at a time in arrival order", async () => {
    const queue = new FifoInferenceQueue(4);
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
    });
    const second = queue.run(async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    expect(queue.activeRequests).toBe(1);
    expect(queue.queuedRequests).toBe(1);
    expect(queue.canAccept).toBe(true);

    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  test("rejects requests beyond the pending limit", async () => {
    const queue = new FifoInferenceQueue(1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const active = queue.run(() => gate);
    const pending = queue.run(async () => undefined);

    expect(queue.canAccept).toBe(false);
    await expect(queue.run(async () => undefined)).rejects.toThrow("overloaded");
    release();
    await Promise.all([active, pending]);
  });

  test("continues processing after a failed inference", async () => {
    const queue = new FifoInferenceQueue(2);
    const failed = queue.run(async () => {
      throw new Error("inference failed");
    });
    const next = queue.run(async () => "recovered");

    await expect(failed).rejects.toThrow("inference failed");
    await expect(next).resolves.toBe("recovered");
    expect(queue.activeRequests).toBe(0);
    expect(queue.queuedRequests).toBe(0);
  });
});
