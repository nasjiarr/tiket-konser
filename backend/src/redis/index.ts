import Redis from "ioredis";

const redisUrl =
  process.env.REDIS_URL || "redis://:redispassword@100.100.76.82:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export const redisConnection = {
  host: process.env.REDIS_HOST || "100.100.76.82",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || "redispassword",
  maxRetriesPerRequest: null
};

redis.on("connect", () => {
  console.log("⚡ Connected to Redis successfully");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});
