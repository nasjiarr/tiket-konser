import { Queue, Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { orders } from "../db/schema";
import { redisConnection } from "../redis";
import { SeatLockService } from "./seat-lock.service";

// 1. BullMQ Queues
export const orderExpirationQueue = new Queue("order-expiration", {
  connection: redisConnection
});

export const notificationQueue = new Queue("ticket-notification", {
  connection: redisConnection
});

// 2. Schedule order expiration check
export async function scheduleOrderExpiration(orderId: string, delayMs: number = 600000) {
  await orderExpirationQueue.add(
    "expire-order",
    { orderId },
    {
      delay: delayMs,
      jobId: `order-exp-${orderId}`,
      removeOnComplete: true,
      removeOnFail: 50
    }
  );
  console.log(`⏱️ Scheduled expiration for order ${orderId} in ${delayMs / 1000}s`);
}

// 3. Queue e-ticket notification
export async function queueTicketNotification(data: {
  orderId: string;
  email: string;
  name: string;
  totalAmount: number;
}) {
  await notificationQueue.add("send-eticket", data, {
    removeOnComplete: true
  });
  console.log(`📬 Queued e-ticket notification for ${data.email} (Order ${data.orderId})`);
}

// 4. Background Workers
export function startWorkers() {
  console.log("👷 Initializing BullMQ background workers...");

  // Expiration Worker
  const expirationWorker = new Worker(
    "order-expiration",
    async (job: Job<{ orderId: string }>) => {
      const { orderId } = job.data;
      console.log(`🔍 [BullMQ ExpirationWorker] Checking order ${orderId}...`);

      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: {
          items: true
        }
      });

      if (!order) return;

      if (order.status === "PENDING") {
        console.log(`⏳ Order ${orderId} has expired. Updating status and releasing seats...`);
        await db
          .update(orders)
          .set({ status: "EXPIRED" })
          .where(eq(orders.id, orderId));

        const seatIds = order.items.map((i) => i.seatId);
        await SeatLockService.releaseSeats(seatIds);
        console.log(`♻️ Released ${seatIds.length} seats back to AVAILABLE`);
      }
    },
    { connection: redisConnection }
  );

  expirationWorker.on("failed", (job, err) => {
    console.error(`❌ [ExpirationWorker Job ${job?.id}] Failed:`, err.message);
  });

  // Notification Worker
  const notificationWorker = new Worker(
    "ticket-notification",
    async (job: Job<{ orderId: string; email: string; name: string; totalAmount: number }>) => {
      const { orderId, email, name, totalAmount } = job.data;
      console.log(`📧 [BullMQ NotificationWorker] Preparing E-Ticket for ${name} (${email})...`);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        `TIKET-KONSER-ORDER-${orderId}`
      )}`;
      console.log(`🎟️ E-Ticket issued! QR Code URL: ${qrCodeUrl}`);
      console.log(`💰 Paid: Rp ${totalAmount.toLocaleString("id-ID")}`);
    },
    { connection: redisConnection }
  );

  notificationWorker.on("failed", (job, err) => {
    console.error(`❌ [NotificationWorker Job ${job?.id}] Failed:`, err.message);
  });

  return { expirationWorker, notificationWorker };
}
