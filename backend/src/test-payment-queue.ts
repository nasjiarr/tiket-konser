import { db } from "./db";
import { events, seats, users, orders } from "./db/schema";
import { eq } from "drizzle-orm";
import { app, workers } from "./index";
import { MidtransService } from "./services/midtrans.service";
import { orderExpirationQueue } from "./services/queue.service";
import crypto from "crypto";

async function testPaymentAndQueue() {
  console.log("💳 Testing Midtrans Payment Gateway & BullMQ Workers...\n");

  const user = await db.query.users.findFirst();
  const event = await db.query.events.findFirst();

  if (!user || !event) throw new Error("Seed data missing");

  // --- TEST CASE 1: Midtrans Signature Validation ---
  console.log("👉 1. Testing Midtrans Signature Verification...");
  const sampleOrderId = `test-order-${Date.now()}`;
  const statusCode = "200";
  const grossAmount = "2500000.00";
  const serverKey = process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-xxxx";
  const validSig = crypto
    .createHash("sha512")
    .update(`${sampleOrderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");

  const checkValid = MidtransService.verifySignature(
    sampleOrderId,
    statusCode,
    grossAmount,
    validSig
  );
  const checkInvalid = MidtransService.verifySignature(
    sampleOrderId,
    statusCode,
    grossAmount,
    "wrong_signature"
  );

  console.log(`   Signature match: ${checkValid} (Expected: true)`);
  console.log(`   Invalid signature rejected: ${!checkInvalid} (Expected: true)`);
  if (!checkValid || checkInvalid) throw new Error("Signature verification failed!");

  // --- TEST CASE 2: Hold -> Checkout -> Snap Token -> Webhook Settlement ---
  console.log("\n👉 2. Testing Full Booking Flow with Settlement...");
  const seat1 = await db.query.seats.findFirst({
    where: eq(seats.status, "AVAILABLE")
  });
  if (!seat1) throw new Error("No available seat");

  // A. Hold
  const holdRes = await app.handle(
    new Request("http://localhost:3001/api/orders/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        userId: user.id,
        seatIds: [seat1.id]
      })
    })
  );
  if (holdRes.status !== 200) {
    const err = await holdRes.text();
    throw new Error(`Hold failed: ${err}`);
  }

  // B. Checkout
  const checkoutRes = await app.handle(
    new Request("http://localhost:3001/api/orders/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        userId: user.id,
        seatIds: [seat1.id]
      })
    })
  );
  const checkoutData = await checkoutRes.json();
  const orderId = checkoutData.data.orderId;
  console.log(`   Order created: ${orderId}`);

  // C. Snap Token
  const snapRes = await app.handle(
    new Request("http://localhost:3001/api/payments/snap-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId })
    })
  );
  const snapData = await snapRes.json();
  console.log(`   Snap Token generated: ${snapData.data.snapToken}`);

  // D. Midtrans Webhook Notification (Settlement)
  const webhookSig = crypto
    .createHash("sha512")
    .update(`${orderId}200${checkoutData.data.totalAmount}.00${serverKey}`)
    .digest("hex");

  const webhookRes = await app.handle(
    new Request("http://localhost:3001/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        status_code: "200",
        gross_amount: `${checkoutData.data.totalAmount}.00`,
        signature_key: webhookSig,
        transaction_status: "settlement",
        fraud_status: "accept",
        payment_type: "bank_transfer",
        transaction_id: `midtrans_txn_${Date.now()}`
      })
    })
  );
  const webhookResult = await webhookRes.json();
  console.log(`   Webhook Result: ${webhookResult.message}`);

  // Verify DB state
  const updatedOrder = await db.query.orders.findFirst({
    where: eq(orders.id, orderId)
  });
  const updatedSeat = await db.query.seats.findFirst({
    where: eq(seats.id, seat1.id)
  });

  console.log(`   Order status: ${updatedOrder?.status} (Expected: PAID)`);
  console.log(`   Seat status: ${updatedSeat?.status} (Expected: BOOKED)`);

  if (updatedOrder?.status !== "PAID" || updatedSeat?.status !== "BOOKED") {
    throw new Error("Order/Seat status not updated correctly after settlement!");
  }

  // --- TEST CASE 3: BullMQ Worker Auto-Expiration ---
  console.log("\n👉 3. Testing BullMQ Auto-Expiration Worker...");
  const seat2 = await db.query.seats.findFirst({
    where: eq(seats.status, "AVAILABLE")
  });
  if (!seat2) throw new Error("No available seat for expiration test");

  // Hold
  const holdRes2 = await app.handle(
    new Request("http://localhost:3001/api/orders/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        userId: user.id,
        seatIds: [seat2.id]
      })
    })
  );
  if (holdRes2.status !== 200) {
    const err = await holdRes2.text();
    throw new Error(`Hold 2 failed: ${err}`);
  }

  // Checkout
  const expCheckoutRes = await app.handle(
    new Request("http://localhost:3001/api/orders/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        userId: user.id,
        seatIds: [seat2.id]
      })
    })
  );
  const expCheckoutJson = await expCheckoutRes.json();
  const expOrder = expCheckoutJson.data;
  console.log(`   Unpaid Order created: ${expOrder.orderId}`);

  // Dispatch expiration job immediately to BullMQ worker
  console.log("   Adding immediate expiration job to BullMQ queue...");
  await orderExpirationQueue.add(
    "expire-order",
    { orderId: expOrder.orderId },
    { removeOnComplete: true }
  );

  // Wait 3 seconds for worker to process
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const expiredOrder = await db.query.orders.findFirst({
    where: eq(orders.id, expOrder.orderId)
  });
  const releasedSeat = await db.query.seats.findFirst({
    where: eq(seats.id, seat2.id)
  });

  console.log(`   Order status after worker: ${expiredOrder?.status} (Expected: EXPIRED)`);
  console.log(`   Seat status after worker: ${releasedSeat?.status} (Expected: AVAILABLE)`);

  if (expiredOrder?.status !== "EXPIRED" || releasedSeat?.status !== "AVAILABLE") {
    throw new Error("BullMQ worker failed to expire order or release seat!");
  }

  console.log("\n🎉 ALL PAYMENT GATEWAY & BULLMQ TESTS PASSED PERFECTLY!");
  process.exit(0);
}

testPaymentAndQueue().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
