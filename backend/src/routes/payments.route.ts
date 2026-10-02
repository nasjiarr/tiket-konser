import { Elysia, t } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { orders, seats, payments } from "../db/schema";
import { MidtransService } from "../services/midtrans.service";
import { SeatLockService } from "../services/seat-lock.service";
import { queueTicketNotification } from "../services/queue.service";
import { redis } from "../redis";

export const paymentsRoute = new Elysia({ prefix: "/payments" })
  // 1. Generate / Retrieve Midtrans Snap Token
  .post(
    "/snap-token",
    async ({ body, set }) => {
      const { orderId } = body;

      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: {
          user: true,
          items: {
            with: {
              seat: {
                with: {
                  tier: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        set.status = 404;
        return { success: false, message: "Order tidak ditemukan" };
      }

      if (order.status !== "PENDING") {
        set.status = 400;
        return {
          success: false,
          message: `Order sudah berstatus ${order.status}, tidak dapat melakukan pembayaran.`
        };
      }

      // Return existing token if already generated
      if (order.snapToken) {
        return {
          success: true,
          data: {
            snapToken: order.snapToken,
            snapRedirectUrl: order.snapRedirectUrl
          }
        };
      }

      const itemDetails = order.items.map((item) => ({
        id: item.seatId,
        price: Math.round(Number(item.price)),
        quantity: 1,
        name: `Kursi ${item.seat.seatNumber} (${item.seat.tier.name})`
      }));

      const snapResult = await MidtransService.createTransaction({
        orderId: order.id,
        grossAmount: Number(order.totalAmount),
        customerDetails: {
          name: order.user.name,
          email: order.user.email,
          phone: order.user.phone
        },
        itemDetails
      });

      // Save token to order
      await db
        .update(orders)
        .set({
          snapToken: snapResult.token,
          snapRedirectUrl: snapResult.redirect_url
        })
        .where(eq(orders.id, order.id));

      return {
        success: true,
        data: {
          snapToken: snapResult.token,
          snapRedirectUrl: snapResult.redirect_url,
          isMock: snapResult.isMock
        }
      };
    },
    {
      body: t.Object({
        orderId: t.String()
      }),
      detail: {
        summary: "Dapatkan Midtrans Snap Token",
        description: "Membuat token pembayaran Snap Midtrans untuk sebuah pesanan tiket."
      }
    }
  )

  // 2. Midtrans Webhook Notification
  .post(
    "/webhook",
    async ({ body, set }) => {
      const payload = body as any;
      const {
        order_id: orderId,
        status_code: statusCode,
        gross_amount: grossAmount,
        signature_key: signatureKey,
        transaction_status: transactionStatus,
        fraud_status: fraudStatus,
        payment_type: paymentType,
        transaction_id: transactionId
      } = payload;

      if (!orderId || !transactionStatus) {
        set.status = 400;
        return { success: false, message: "Payload tidak lengkap" };
      }

      // Verify Signature Key
      if (signatureKey) {
        const isValid = MidtransService.verifySignature(
          orderId,
          statusCode,
          grossAmount,
          signatureKey
        );
        if (!isValid) {
          set.status = 401;
          return { success: false, message: "Invalid Midtrans signature" };
        }
      }

      // Fetch order with user & items
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: {
          user: true,
          items: true
        }
      });

      if (!order) {
        set.status = 404;
        return { success: false, message: "Order tidak ditemukan" };
      }

      // Record payment attempt
      await db.insert(payments).values({
        orderId: order.id,
        transactionId: transactionId || `txn_${Date.now()}`,
        paymentType: paymentType || "unknown",
        status: transactionStatus,
        grossAmount: grossAmount || order.totalAmount,
        payload
      });

      // Idempotency: If already PAID, don't re-process
      if (order.status === "PAID") {
        return { success: true, message: "Order sudah lunas sebelumnya" };
      }

      const seatIds = order.items.map((i) => i.seatId);

      // Handle Settlement / Success
      if (
        transactionStatus === "settlement" ||
        (transactionStatus === "capture" && fraudStatus === "accept")
      ) {
        await db.transaction(async (tx) => {
          // Update order status to PAID
          await tx
            .update(orders)
            .set({ status: "PAID" })
            .where(eq(orders.id, order.id));

          // Update seats status to BOOKED
          await tx
            .update(seats)
            .set({ status: "BOOKED" })
            .where(inArray(seats.id, seatIds));
        });

        // Release temporary Redis holds (seats are permanently booked now)
        if (seatIds.length > 0) {
          const holdKeys = seatIds.map((id) => `seat:hold:${id}`);
          await redis.del(...holdKeys);
        }

        // Trigger BullMQ E-Ticket Notification
        await queueTicketNotification({
          orderId: order.id,
          email: order.user.email,
          name: order.user.name,
          totalAmount: Number(order.totalAmount)
        });

        return { success: true, message: "Pembayaran berhasil diproses, e-ticket diterbitkan" };
      }

      // Handle Expiration
      if (transactionStatus === "expire") {
        await db
          .update(orders)
          .set({ status: "EXPIRED" })
          .where(eq(orders.id, order.id));
        await SeatLockService.releaseSeats(seatIds);
        return { success: true, message: "Order expired, kursi telah dilepas" };
      }

      // Handle Cancellation / Denial
      if (transactionStatus === "cancel" || transactionStatus === "deny") {
        await db
          .update(orders)
          .set({ status: "CANCELLED" })
          .where(eq(orders.id, order.id));
        await SeatLockService.releaseSeats(seatIds);
        return { success: true, message: "Order dibatalkan, kursi telah dilepas" };
      }

      return { success: true, message: "Notifikasi diterima" };
    },
    {
      detail: {
        summary: "Webhook Notifikasi Midtrans",
        description:
          "Menerima notifikasi status transaksi dari Midtrans Snap API, validasi signature, idempotency, dan mengubah status order serta kursi."
      }
    }
  )

  // 3. Mock Settlement (Helper for local demo & fast checkout testing)
  .post(
    "/mock-settlement",
    async ({ body, set }) => {
      const { orderId } = body;

      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: {
          user: true,
          items: true
        }
      });

      if (!order) {
        set.status = 404;
        return { success: false, message: "Order tidak ditemukan" };
      }

      if (order.status === "PAID") {
        return { success: true, message: "Order sudah lunas" };
      }

      const seatIds = order.items.map((i) => i.seatId);

      await db.transaction(async (tx) => {
        await tx.update(orders).set({ status: "PAID" }).where(eq(orders.id, order.id));
        await tx.update(seats).set({ status: "BOOKED" }).where(inArray(seats.id, seatIds));
        await tx.insert(payments).values({
          orderId: order.id,
          transactionId: `mock_txn_${Date.now()}`,
          paymentType: "qris_mock",
          status: "settlement",
          grossAmount: order.totalAmount,
          payload: { mock: true, paidAt: new Date().toISOString() }
        });
      });

      if (seatIds.length > 0) {
        const holdKeys = seatIds.map((id) => `seat:hold:${id}`);
        await redis.del(...holdKeys);
      }

      await queueTicketNotification({
        orderId: order.id,
        email: order.user.email,
        name: order.user.name,
        totalAmount: Number(order.totalAmount)
      });

      return {
        success: true,
        message: "Simulasi pembayaran lunas berhasil. E-ticket terbit!",
        orderId: order.id,
        status: "PAID"
      };
    },
    {
      body: t.Object({
        orderId: t.String()
      }),
      detail: {
        summary: "Simulasi Pelunasan Pembayaran (Testing/Demo)",
        description: "Melakukan simulasi pembayaran instant untuk verifikasi alur pemesanan tiket."
      }
    }
  );
