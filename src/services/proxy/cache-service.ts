import { LRUCache } from "lru-cache";

export class CacheService {
  private readonly cache = new LRUCache<string, object | string | number | boolean | unknown[]>({
    max: 5000,
    ttl: 1000 * 60 * 5,
  });
  private hits = 0;
  private misses = 0;

  get<T>(key: string) {
    const value = this.cache.get(key) as T | undefined;
    if (value === undefined) {
      this.misses += 1;
      return undefined;
    }

    this.hits += 1;
    return value;
  }

  set(key: string, value: unknown, ttl?: number) {
    this.cache.set(key, value as object | string | number | boolean | unknown[], { ttl });
  }

  getMetrics() {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Number((this.hits / total).toFixed(4)),
    };
  }
}

export const cacheService = new CacheService();
