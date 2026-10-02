import { db } from "./index";
import { users, events, ticketTiers, seats } from "./schema";

async function seed() {
  console.log("🌱 Seeding database...");

  // 1. Create or get dummy user
  const [user] = await db
    .insert(users)
    .values({
      name: "Nasywan Jibran",
      email: "nasywan@example.com",
      phone: "089653404050"
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  console.log(`👤 User ready: ${user ? user.email : "Already exists"}`);

  // 2. Create Concert Event
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 30); // 30 days from now

  const [event] = await db
    .insert(events)
    .values({
      title: "Coldplay: Music of the Spheres World Tour - Jakarta",
      description:
        "Konser tur dunia Coldplay dengan panggung ramah lingkungan, visual spektakuler, dan gelang Xylobands.",
      venue: "Gelora Bung Karno Main Stadium, Jakarta",
      bannerUrl:
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&q=80&w=1200",
      eventDate,
      status: "ON_SALE"
    })
    .returning();

  console.log(`🎤 Event created: ${event.title} (${event.id})`);

  // 3. Create Ticket Tiers
  const tiersData = [
    {
      name: "VIP - Ultimate Experience",
      price: "5000000.00",
      totalSeats: 10,
      prefix: "VIP"
    },
    {
      name: "CAT 1 - Festival Standing",
      price: "2500000.00",
      totalSeats: 20,
      prefix: "CAT1"
    },
    {
      name: "CAT 2 - Tribune Seated",
      price: "1250000.00",
      totalSeats: 30,
      prefix: "CAT2"
    }
  ];

  for (const tierData of tiersData) {
    const [tier] = await db
      .insert(ticketTiers)
      .values({
        eventId: event.id,
        name: tierData.name,
        price: tierData.price,
        totalSeats: tierData.totalSeats,
        availableSeats: tierData.totalSeats
      })
      .returning();

    console.log(`  🏷️  Tier created: ${tier.name} - Rp ${Number(tier.price).toLocaleString("id-ID")}`);

    // 4. Create Seats for each tier
    const seatInserts = [];
    for (let i = 1; i <= tierData.totalSeats; i++) {
      const seatNumber = `${tierData.prefix}-${String(i).padStart(2, "0")}`;
      seatInserts.push({
        tierId: tier.id,
        seatNumber,
        status: "AVAILABLE"
      });
    }

    await db.insert(seats).values(seatInserts);
    console.log(`    🪑 Created ${seatInserts.length} seats for ${tier.name}`);
  }

  console.log("✅ Database seeding completed successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
