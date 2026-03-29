import crypto from "node:crypto";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

type WorkerState = "idle" | "connecting" | "live" | "draining" | "failed";

type PullResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  data: NodeJS.ReadableStream;
};

type Subscriber = {
  id: string;
  request: any;
  response: any;
  connectedAt: number;
  initialized: boolean;
};

type WorkerSpec = {
  key: string;
  streamId: string;
  extension: string;
  openPull: () => Promise<PullResponse>;
  onTerminated: (key: string) => void;
};

type RegistrySubscribeInput = {
  key: string;
  streamId: string;
  extension: string;
  openPull: () => Promise<PullResponse>;
  request: any;
  response: any;
};

class CircularBuffer {
  private readonly slots: (Buffer | null)[];
  private head = 0;
  private tail = 0;
  private count = 0;
  private totalBytes = 0;
  private readonly maxChunks: number;
  private readonly maxBytes: number;

  constructor(maxChunks: number, maxBytes: number) {
    this.maxChunks = maxChunks;
    this.maxBytes = maxBytes;
    this.slots = new Array(maxChunks + 1).fill(null);
  }

  push(chunk: Buffer) {
    while (this.count > 0 && (this.count >= this.maxChunks || this.totalBytes + chunk.length > this.maxBytes)) {
      const removed = this.slots[this.head];
      if (removed) {
        this.totalBytes -= removed.length;
      }
      this.slots[this.head] = null;
      this.head = (this.head + 1) % this.slots.length;
      this.count--;
    }

    this.slots[this.tail] = chunk;
    this.tail = (this.tail + 1) % this.slots.length;
    this.count++;
    this.totalBytes += chunk.length;
  }

  *[Symbol.iterator]() {
    let idx = this.head;
    for (let i = 0; i < this.count; i++) {
      const slot = this.slots[idx];
      if (slot) yield slot;
      idx = (idx + 1) % this.slots.length;
    }
  }

  get length() {
    return this.count;
  }

  get bytes() {
    return this.totalBytes;
  }
}

class LiveChannelWorker {
  private readonly subscribers = new Map<string, Subscriber>();
  private readonly ringBuffer: CircularBuffer;
  private upstreamStream: NodeJS.ReadableStream | null = null;
  private upstreamStatus = 200;
  private upstreamHeaders: Record<string, string | string[] | undefined> = {};
  private connectPromise: Promise<void> | null = null;
  private drainTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private state: WorkerState = "idle";
  private stopped = false;
  private readonly startedAt = Date.now();
  private lastSubscriberLeftAt: number | null = null;
  private bytesBroadcast = 0;
  private chunksBroadcast = 0;
  private reconnectCount = 0;
  private lastError: string | null = null;

  constructor(private readonly spec: WorkerSpec) {
    this.ringBuffer = new CircularBuffer(
      env.LIVE_CHANNEL_RING_BUFFER_CHUNKS,
      env.LIVE_CHANNEL_RING_BUFFER_BYTES,
    );
  }

  async addSubscriber(request: any, response: any) {
    if (this.stopped) {
      throw new Error("worker_stopped");
    }

    this.cancelDrain();

    const subscriber: Subscriber = {
      id: crypto.randomUUID(),
      request,
      response,
      connectedAt: Date.now(),
      initialized: false,
    };

    this.subscribers.set(subscriber.id, subscriber);
    this.bindSubscriberLifecycle(subscriber);

    try {
      await this.ensureConnected();
      this.initializeSubscriber(subscriber);
    } catch (error) {
      this.removeSubscriber(subscriber.id);
      throw error;
    }
  }

  getMetrics() {
    return {
      key: this.spec.key,
      streamId: this.spec.streamId,
      extension: this.spec.extension,
      state: this.state,
      subscribers: this.subscribers.size,
      startedAt: new Date(this.startedAt).toISOString(),
      lastSubscriberLeftAt: this.lastSubscriberLeftAt
        ? new Date(this.lastSubscriberLeftAt).toISOString()
        : null,
      uptimeMs: Date.now() - this.startedAt,
      bytesBroadcast: this.bytesBroadcast,
      chunksBroadcast: this.chunksBroadcast,
      reconnectCount: this.reconnectCount,
      ringBufferChunks: this.ringBuffer.length,
      ringBufferBytes: this.ringBuffer.bytes,
      lastError: this.lastError,
    };
  }

  shutdown(reason: string) {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.state = "failed";
    this.lastError = reason;
    this.clearTimers();

    if (this.upstreamStream && typeof (this.upstreamStream as any).destroy === "function") {
      (this.upstreamStream as any).destroy();
    }

    for (const subscriber of this.subscribers.values()) {
      if (!subscriber.response.writableEnded && !subscriber.response.destroyed) {
        subscriber.response.destroy();
      }
    }

    this.subscribers.clear();
    this.spec.onTerminated(this.spec.key);
  }

  private async ensureConnected() {
    if (this.stopped) {
      throw new Error("worker_stopped");
    }

    if (this.state === "live" && this.upstreamStream) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connectUpstream().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  private async connectUpstream() {
    this.cancelReconnect();
    this.state = "connecting";

    logger.info(
      {
        key: this.spec.key,
        streamId: this.spec.streamId,
        subscribers: this.subscribers.size,
      },
      "live_channel_worker_connecting",
    );

    const upstreamResponse = await this.spec.openPull();
    const stream = upstreamResponse.data;

    if (!stream) {
      throw new Error("missing_upstream_stream");
    }

    this.upstreamStream = stream;
    this.upstreamStatus = upstreamResponse.status;
    this.upstreamHeaders = upstreamResponse.headers;
    this.state = "live";
    this.lastError = null;

    for (const subscriber of this.subscribers.values()) {
      this.initializeSubscriber(subscriber);
    }

    stream.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.ringBuffer.push(buffer);
      this.broadcastChunk(buffer);
    });

    stream.once("end", () => {
      this.handleUpstreamTermination("upstream_end");
    });

    stream.once("close", () => {
      this.handleUpstreamTermination("upstream_close");
    });

    stream.once("error", (error: Error) => {
      this.handleUpstreamTermination("upstream_error", error);
    });

    logger.info(
      {
        key: this.spec.key,
        streamId: this.spec.streamId,
        subscribers: this.subscribers.size,
      },
      "live_channel_worker_live",
    );
  }

  private initializeSubscriber(subscriber: Subscriber) {
    if (subscriber.initialized || subscriber.response.destroyed || subscriber.response.writableEnded) {
      return;
    }

    if (!subscriber.response.headersSent) {
      subscriber.response.status(this.upstreamStatus);

      const passthroughHeaders = [
        "content-type",
        "cache-control",
        "last-modified",
        "etag",
        "accept-ranges",
      ] as const;

      for (const header of passthroughHeaders) {
        const value = this.upstreamHeaders[header];
        if (value) {
          subscriber.response.setHeader(header, value);
        }
      }

      subscriber.response.flushHeaders();
    }

    for (const chunk of this.ringBuffer) {
      if (!this.writeChunk(subscriber, chunk)) {
        return;
      }
    }

    subscriber.initialized = true;
  }

  private bindSubscriberLifecycle(subscriber: Subscriber) {
    const cleanup = () => {
      this.removeSubscriber(subscriber.id);
    };

    subscriber.request.once("close", cleanup);
    subscriber.request.once("aborted", cleanup);
    subscriber.response.once("close", cleanup);
    subscriber.response.once("error", cleanup);
    subscriber.response.once("finish", cleanup);
  }

  private writeChunk(subscriber: Subscriber, chunk: Buffer) {
    if (subscriber.response.destroyed || subscriber.response.writableEnded) {
      this.removeSubscriber(subscriber.id);
      return false;
    }

    subscriber.response.write(chunk);

    if (subscriber.response.writableLength > env.LIVE_CHANNEL_MAX_SUBSCRIBER_BUFFER_BYTES) {
      logger.warn(
        {
          key: this.spec.key,
          subscriberId: subscriber.id,
          writableLength: subscriber.response.writableLength,
        },
        "live_channel_slow_subscriber_disconnected",
      );
      subscriber.response.destroy();
      this.removeSubscriber(subscriber.id);
      return false;
    }

    return true;
  }

  private broadcastChunk(chunk: Buffer) {
    this.bytesBroadcast += chunk.length;
    this.chunksBroadcast += 1;

    for (const subscriber of this.subscribers.values()) {
      if (!subscriber.initialized) {
        continue;
      }

      this.writeChunk(subscriber, chunk);
    }
  }

  private removeSubscriber(subscriberId: string) {
    const removed = this.subscribers.delete(subscriberId);
    if (!removed) {
      return;
    }

    if (this.subscribers.size === 0) {
      this.cancelReconnect();
      this.lastSubscriberLeftAt = Date.now();
      this.scheduleDrain();
    }
  }

  private scheduleDrain() {
    if (this.drainTimer || this.stopped) {
      return;
    }

    this.state = "draining";
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;

      if (this.subscribers.size > 0 || this.stopped) {
        return;
      }

      logger.info(
        {
          key: this.spec.key,
          streamId: this.spec.streamId,
          drainTtlMs: env.LIVE_CHANNEL_DRAIN_TTL_MS,
        },
        "live_channel_worker_drained",
      );

      this.shutdown("drain_ttl_elapsed");
    }, env.LIVE_CHANNEL_DRAIN_TTL_MS);
  }

  private cancelDrain() {
    if (!this.drainTimer) {
      return;
    }

    clearTimeout(this.drainTimer);
    this.drainTimer = null;

    if (this.upstreamStream && !this.stopped) {
      this.state = "live";
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.stopped || this.subscribers.size === 0) {
      return;
    }

    this.state = "connecting";
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectCount += 1;

      void this.ensureConnected().catch((error) => {
        this.lastError = error instanceof Error ? error.message : "unknown_reconnect_error";
        logger.warn(
          {
            key: this.spec.key,
            streamId: this.spec.streamId,
            error,
            reconnectCount: this.reconnectCount,
          },
          "live_channel_worker_reconnect_failed",
        );
        this.scheduleReconnect();
      });
    }, env.LIVE_CHANNEL_RECONNECT_DELAY_MS);
  }

  private cancelReconnect() {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleUpstreamTermination(reason: string, error?: Error) {
    if (this.upstreamStream) {
      this.upstreamStream.removeAllListeners("data");
      this.upstreamStream.removeAllListeners("end");
      this.upstreamStream.removeAllListeners("close");
      this.upstreamStream.removeAllListeners("error");
    }

    this.upstreamStream = null;

    if (this.stopped) {
      return;
    }

    this.state = "failed";
    this.lastError = error?.message || reason;

    logger.warn(
      {
        key: this.spec.key,
        streamId: this.spec.streamId,
        reason,
        error,
        subscribers: this.subscribers.size,
      },
      "live_channel_worker_upstream_terminated",
    );

    if (this.subscribers.size === 0) {
      this.scheduleDrain();
      return;
    }

    this.scheduleReconnect();
  }

  private clearTimers() {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

class LiveChannelRegistry {
  private readonly workers = new Map<string, LiveChannelWorker>();

  async subscribe(input: RegistrySubscribeInput) {
    let worker = this.workers.get(input.key);

    if (!worker) {
      worker = new LiveChannelWorker({
        key: input.key,
        streamId: input.streamId,
        extension: input.extension,
        openPull: input.openPull,
        onTerminated: (key) => {
          const current = this.workers.get(key);
          if (current === worker) {
            this.workers.delete(key);
          }
        },
      });
      this.workers.set(input.key, worker);
    }

    await worker.addSubscriber(input.request, input.response);
    return worker.getMetrics();
  }

  getMetrics() {
    const items = [...this.workers.values()].map((worker) => worker.getMetrics());
    return {
      activeChannels: items.length,
      totalSubscribers: items.reduce((sum, item) => sum + item.subscribers, 0),
      items,
    };
  }

  shutdown() {
    for (const worker of this.workers.values()) {
      worker.shutdown("registry_shutdown");
    }
    this.workers.clear();
  }
}

export const liveChannelRegistry = new LiveChannelRegistry();
