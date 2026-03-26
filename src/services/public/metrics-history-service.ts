import { redis } from "../../config/redis";

const HISTORY_KEY = "metrics:history";
const HISTORY_LIMIT = 24;

type MetricsSnapshot = {
  timestamp: string;
  redis: Record<string, unknown>;
  upstreams: Array<Record<string, unknown>>;
  status: string;
};

export class MetricsHistoryService {
  async record(snapshot: MetricsSnapshot) {
    const pipeline = redis.multi();
    pipeline.lpush(HISTORY_KEY, JSON.stringify(snapshot));
    pipeline.ltrim(HISTORY_KEY, 0, HISTORY_LIMIT - 1);
    await pipeline.exec();
  }

  async list() {
    const items = await redis.lrange(HISTORY_KEY, 0, HISTORY_LIMIT - 1);
    return items
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}

export const metricsHistoryService = new MetricsHistoryService();
