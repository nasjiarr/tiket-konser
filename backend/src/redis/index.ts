import Redis from "ioredis";

const redisUrl =
  process.env.REDIS_URL || "redis://:redispassword@192.168.1.13:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

redis.on("connect", () => {
  console.log("⚡ Connected to Redis successfully");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});
