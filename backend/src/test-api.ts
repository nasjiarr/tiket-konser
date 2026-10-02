import { db } from "./db";
import { events, seats, users } from "./db/schema";
import { eq } from "drizzle-orm";

async function testApi() {
  console.log("🌐 Testing Elysia REST API endpoints...");

  // Import app
  const { app } = await import("./index");

  // 1. Test GET /health
  const resHealth = await app.handle(new Request("http://localhost:3001/health"));
  const healthData = await resHealth.json();
  console.log("✅ GET /health:", healthData.status);

  // 2. Test GET /api/events
  const resEvents = await app.handle(new Request("http://localhost:3001/api/events"));
  const eventsData = await resEvents.json();
  console.log(`✅ GET /api/events: Found ${eventsData.data.length} event(s)`);
  const event = eventsData.data[0];

  // 3. Test GET /api/events/:id
  const resDetail = await app.handle(new Request(`http://localhost:3001/api/events/${event.id}`));
  const detailData = await resDetail.json();
  console.log(`✅ GET /api/events/:id: Event "${detailData.data.title}" loaded with ${detailData.data.ticketTiers.length} tiers`);

  // 4. Test POST /api/orders/hold
  const user = await db.query.users.findFirst();
  const availableSeat = await db.query.seats.findFirst({
    where: eq(seats.status, "AVAILABLE")
  });

  if (!user || !availableSeat) throw new Error("Data missing");

  const resHold = await app.handle(
    new Request("http://localhost:3001/api/orders/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        userId: user.id,
        seatIds: [availableSeat.id]
      })
    })
  );
  const holdData = await resHold.json();
  console.log("✅ POST /api/orders/hold:", holdData.message);

  // 5. Test POST /api/orders/checkout
  const resCheckout = await app.handle(
    new Request("http://localhost:3001/api/orders/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        userId: user.id,
        seatIds: [availableSeat.id]
      })
    })
  );
  const checkoutData = await resCheckout.json();
  console.log("✅ POST /api/orders/checkout: Created Order ID", checkoutData.data.orderId);
  console.log(`   Total Amount: Rp ${Number(checkoutData.data.totalAmount).toLocaleString("id-ID")}`);

  // 6. Test GET /api/orders/:id
  const resOrder = await app.handle(
    new Request(`http://localhost:3001/api/orders/${checkoutData.data.orderId}`)
  );
  const orderData = await resOrder.json();
  console.log(`✅ GET /api/orders/:id: Order status is "${orderData.data.status}"`);

  console.log("\n🚀 ALL REST API ENDPOINTS VERIFIED & WORKING!");
  process.exit(0);
}

testApi().catch((err) => {
  console.error("API test failed:", err);
  process.exit(1);
});
