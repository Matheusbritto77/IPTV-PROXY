import { LRUCache } from "lru-cache";

export class CacheService {
  private readonly cache = new LRUCache<string, object | string | number | boolean | unknown[]>({
    max: 1000,
    ttl: 1000 * 60 * 3,
  });

  get<T>(key: string) {
    return this.cache.get(key) as T | undefined;
  }

  set(key: string, value: unknown, ttl?: number) {
    this.cache.set(key, value as object | string | number | boolean | unknown[], { ttl });
  }
}

export const cacheService = new CacheService();
