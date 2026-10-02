import { Elysia, t } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { orders, orderItems, seats, ticketTiers } from "../db/schema";
import { SeatLockService, HOLD_TTL_SECONDS } from "../services/seat-lock.service";
import { RateLimiterService } from "../services/rate-limiter.service";

export const ordersRoute = new Elysia({ prefix: "/orders" })
  // 1. Hold Seats (Ticket War entry point)
  .post(
    "/hold",
    async ({ body, set }) => {
      const { userId, seatIds } = body;

      // Rate limiting: 20 requests per 10 seconds per user
      const rate = await RateLimiterService.checkLimit(userId, 20, 10);
      if (!rate.allowed) {
        set.status = 429;
        return {
          success: false,
          message: `Terlalu banyak permintaan antrean. Silakan coba lagi dalam ${rate.resetIn} detik.`
        };
      }

      try {
        const result = await SeatLockService.holdSeats(userId, seatIds);
        return {
          success: true,
          ...result
        };
      } catch (err: any) {
        set.status = 409; // Conflict
        return {
          success: false,
          message: err.message || "Gagal mengamankan kursi tiket"
        };
      }
    },
    {
      body: t.Object({
        eventId: t.String(),
        userId: t.String(),
        seatIds: t.Array(t.String(), { minItems: 1, maxItems: 4 })
      }),
      detail: {
        summary: "Hold Kursi (Antrean Ticket War)",
        description:
          "Mengamankan kursi sementara selama 10 menit menggunakan Redis Lock + Pessimistic Row Lock PostgreSQL."
      }
    }
  )

  // 2. Checkout Order
  .post(
    "/checkout",
    async ({ body, set }) => {
      const { eventId, userId, seatIds } = body;

      // Verify that all seats are held by this user
      const isHeld = await SeatLockService.verifyHeldByUser(userId, seatIds);
      if (!isHeld) {
        set.status = 400;
        return {
          success: false,
          message: "Sesi hold kursi telah berakhir atau kursi dipegang oleh pengguna lain."
        };
      }

      // Fetch seat prices through tiers
      const seatDetails = await db.query.seats.findMany({
        where: inArray(seats.id, seatIds),
        with: {
          tier: true
        }
      });

      if (seatDetails.length !== seatIds.length) {
        set.status = 400;
        return {
          success: false,
          message: "Data kursi tidak valid"
        };
      }

      let totalAmount = 0;
      for (const s of seatDetails) {
        totalAmount += Number(s.tier.price);
      }

      const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);

      // Create Order & Order Items in a transaction
      const order = await db.transaction(async (tx) => {
        const [createdOrder] = await tx
          .insert(orders)
          .values({
            userId,
            eventId,
            totalAmount: totalAmount.toFixed(2),
            status: "PENDING",
            expiresAt
          })
          .returning();

        const itemsToInsert = seatDetails.map((s) => ({
          orderId: createdOrder.id,
          seatId: s.id,
          price: s.tier.price
        }));

        await tx.insert(orderItems).values(itemsToInsert);

        return createdOrder;
      });

      return {
        success: true,
        message: "Order checkout berhasil dibuat. Silakan lakukan pembayaran.",
        data: {
          orderId: order.id,
          totalAmount,
          status: order.status,
          expiresAt: order.expiresAt.toISOString(),
          seats: seatDetails.map((s) => ({
            seatId: s.id,
            seatNumber: s.seatNumber,
            tierName: s.tier.name,
            price: Number(s.tier.price)
          }))
        }
      };
    },
    {
      body: t.Object({
        eventId: t.String(),
        userId: t.String(),
        seatIds: t.Array(t.String(), { minItems: 1, maxItems: 4 })
      }),
      detail: {
        summary: "Checkout Order Tiket",
        description:
          "Membuat order pemesanan resmi dari kursi yang telah di-hold sebelum dialihkan ke payment gateway."
      }
    }
  )

  // 3. Get Order Detail
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, id),
        with: {
          event: true,
          items: {
            with: {
              seat: {
                with: {
                  tier: true
                }
              }
            }
          },
          payments: true
        }
      });

      if (!order) {
        set.status = 404;
        return {
          success: false,
          message: "Order tidak ditemukan"
        };
      }

      return {
        success: true,
        data: order
      };
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        summary: "Detail Order",
        description: "Mengambil data pesanan tiket beserta status pembayaran."
      }
    }
  );
