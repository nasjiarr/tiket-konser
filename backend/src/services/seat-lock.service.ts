import { sql, inArray, eq } from "drizzle-orm";
import { db } from "../db";
import { seats, ticketTiers } from "../db/schema";
import { redis } from "../redis";

export const HOLD_TTL_SECONDS = 600; // 10 minutes

export class SeatLockService {
  /**
   * Acquire temporary hold on multiple seats using Redis Distributed Lock + PostgreSQL FOR UPDATE
   */
  static async holdSeats(userId: string, seatIds: string[]) {
    if (seatIds.length === 0) {
      throw new Error("Daftar kursi tidak boleh kosong");
    }

    if (seatIds.length > 4) {
      throw new Error("Maksimal pemesanan adalah 4 tiket per transaksi");
    }

    const acquiredRedisKeys: string[] = [];

    try {
      // 1. Fast Layer: Acquire Redis locks with SET NX EX
      for (const seatId of seatIds) {
        const lockKey = `seat:hold:${seatId}`;
        const acquired = await redis.set(
          lockKey,
          JSON.stringify({ userId, heldAt: new Date().toISOString() }),
          "EX",
          HOLD_TTL_SECONDS,
          "NX"
        );

        if (!acquired) {
          throw new Error(`Kursi dengan ID ${seatId} sedang di-hold oleh pengguna lain`);
        }
        acquiredRedisKeys.push(lockKey);
      }

      // 2. Strong Consistency Layer: PostgreSQL Transaction with Pessimistic Row Lock (FOR UPDATE)
      await db.transaction(async (tx) => {
        const seatRows = await tx
          .select()
          .from(seats)
          .where(inArray(seats.id, seatIds))
          .for("update");

        if (seatRows.length !== seatIds.length) {
          throw new Error("Beberapa kursi yang dipilih tidak ditemukan");
        }

        for (const row of seatRows) {
          if (row.status !== "AVAILABLE") {
            throw new Error(`Kursi ${row.seatNumber} tidak lagi tersedia (status: ${row.status})`);
          }
        }

        // Update seats status to HELD
        await tx
          .update(seats)
          .set({ status: "HELD" })
          .where(inArray(seats.id, seatIds));

        // Group by tierId to decrement availableSeats in ticket_tiers
        const tierCounts: Record<string, number> = {};
        for (const row of seatRows) {
          tierCounts[row.tierId] = (tierCounts[row.tierId] || 0) + 1;
        }

        for (const [tierId, count] of Object.entries(tierCounts)) {
          await tx
            .update(ticketTiers)
            .set({
              availableSeats: sql`${ticketTiers.availableSeats} - ${count}`
            })
            .where(eq(ticketTiers.id, tierId));
        }
      });

      const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);

      return {
        success: true,
        message: `Berhasil menahan ${seatIds.length} kursi selama 10 menit`,
        heldSeats: seatIds,
        expiresAt: expiresAt.toISOString()
      };
    } catch (error: any) {
      if (acquiredRedisKeys.length > 0) {
        await redis.del(...acquiredRedisKeys);
      }
      throw error;
    }
  }

  /**
   * Release hold on seats (when order expires or is cancelled)
   */
  static async releaseSeats(seatIds: string[]) {
    if (seatIds.length === 0) return;

    // 1. Remove Redis hold keys
    const keys = seatIds.map((id) => `seat:hold:${id}`);
    await redis.del(...keys);

    // 2. Query held seats
    const heldSeats = await db.query.seats.findMany({
      where: inArray(seats.id, seatIds)
    });

    if (heldSeats.length === 0) return;

    // 3. Update status back to AVAILABLE
    await db
      .update(seats)
      .set({ status: "AVAILABLE" })
      .where(inArray(seats.id, seatIds));

    // 4. Restore availableSeats count in ticket_tiers
    const tierCounts: Record<string, number> = {};
    for (const row of heldSeats) {
      if (row.status === "HELD") {
        tierCounts[row.tierId] = (tierCounts[row.tierId] || 0) + 1;
      }
    }

    for (const [tierId, count] of Object.entries(tierCounts)) {
      await db
        .update(ticketTiers)
        .set({
          availableSeats: sql`${ticketTiers.availableSeats} + ${count}`
        })
        .where(eq(ticketTiers.id, tierId));
    }
  }

  /**
   * Check if a set of seats is currently held by a specific user
   */
  static async verifyHeldByUser(userId: string, seatIds: string[]): Promise<boolean> {
    for (const seatId of seatIds) {
      const data = await redis.get(`seat:hold:${seatId}`);
      if (!data) return false;
      try {
        const parsed = JSON.parse(data);
        if (parsed.userId !== userId) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
}
