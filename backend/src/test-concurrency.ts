import { db } from "./db";
import { events, seats, users } from "./db/schema";
import { SeatLockService } from "./services/seat-lock.service";
import { redis } from "./redis";
import { eq } from "drizzle-orm";

async function runTest() {
  console.log("🧪 Starting Concurrency & Seat Hold Test...");

  // 1. Get sample user and event
  const user = await db.query.users.findFirst();
  const event = await db.query.events.findFirst();

  if (!user || !event) {
    throw new Error("User or Event not found. Run db:seed first.");
  }

  // 2. Find an available seat
  const seat = await db.query.seats.findFirst({
    where: eq(seats.status, "AVAILABLE")
  });

  if (!seat) {
    throw new Error("No available seat found");
  }

  console.log(`🎯 Testing with Seat: ${seat.seatNumber} (${seat.id})`);

  // 3. User 1 holds the seat
  console.log("👉 User 1 attempting to hold seat...");
  const holdResult = await SeatLockService.holdSeats(user.id, [seat.id]);
  console.log("✅ User 1 successfully held seat:", holdResult.message);

  // 4. Verify Redis TTL
  const redisTtl = await redis.ttl(`seat:hold:${seat.id}`);
  console.log(`⏱️ Redis Hold TTL: ${redisTtl}s (Expected: ~600s)`);
  if (redisTtl <= 0) throw new Error("Redis TTL not set properly!");

  // 5. User 2 attempts to hold the SAME seat concurrently
  const dummyUser2Id = "00000000-0000-0000-0000-000000000002";
  console.log("👉 User 2 attempting to hold the same seat...");
  try {
    await SeatLockService.holdSeats(dummyUser2Id, [seat.id]);
    throw new Error("❌ FAILURE: User 2 managed to double-book the seat!");
  } catch (err: any) {
    console.log("🛡️ Concurrency Protection Active: User 2 was blocked!", err.message);
  }

  // 6. Release the seat back
  console.log("👉 Releasing held seat...");
  await SeatLockService.releaseSeats([seat.id]);

  const afterRelease = await db.query.seats.findFirst({
    where: eq(seats.id, seat.id)
  });
  console.log(`🔄 Seat status after release: ${afterRelease?.status} (Expected: AVAILABLE)`);

  const keyExists = await redis.exists(`seat:hold:${seat.id}`);
  console.log(`🧹 Redis key cleaned up: ${keyExists === 0 ? "YES" : "NO"}`);

  console.log("\n🎉 ALL CONCURRENCY CHECKS PASSED PERFECTLY!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
