import { config } from './config.js';
import type { MessagePayload } from './types.js';

const cache: MessagePayload[] = [];

export function addToCache(message: MessagePayload): boolean {
  const exists = cache.some(
    (m) =>
      m.timestamp === message.timestamp &&
      m.body === message.body &&
      m.from === message.from
  );

  if (!exists) {
    cache.unshift(message);
    if (cache.length > config.maxCacheSize) {
      cache.length = config.maxCacheSize;
    }
    return true;
  }
  return false;
}

export function getCache(): MessagePayload[] {
  return cache;
}

export function getCacheInfo() {
  return {
    cacheSize: cache.length,
    maxCacheSize: config.maxCacheSize,
    oldestMessage: cache[cache.length - 1]?.timestamp ?? null,
    newestMessage: cache[0]?.timestamp ?? null,
  };
}
