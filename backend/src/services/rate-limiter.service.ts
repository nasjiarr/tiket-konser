import { redis } from "../redis";

export class RateLimiterService {
  /**
   * Check rate limit using Redis atomic INCR and EXPIRE.
   * @param key Identifier (e.g., IP address or User ID)
   * @param limit Maximum requests allowed in window
   * @param windowSec Window duration in seconds
   */
  static async checkLimit(
    key: string,
    limit: number = 30,
    windowSec: number = 10
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const redisKey = `ratelimit:${key}`;

    const current = await redis.incr(redisKey);
    if (current === 1) {
      await redis.expire(redisKey, windowSec);
    }

    const ttl = await redis.ttl(redisKey);

    if (current > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: ttl > 0 ? ttl : windowSec
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - current),
      resetIn: ttl > 0 ? ttl : windowSec
    };
  }
}
