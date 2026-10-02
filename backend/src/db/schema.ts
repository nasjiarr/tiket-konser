import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  uniqueIndex,
  index
} from "drizzle-orm/pg-core";

// 1. Users Table
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// 2. Events Table
export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    venue: varchar("venue", { length: 255 }).notNull(),
    bannerUrl: text("banner_url"),
    eventDate: timestamp("event_date").notNull(),
    status: varchar("status", { length: 50 }).default("UPCOMING").notNull(), // UPCOMING, ON_SALE, SOLD_OUT, COMPLETED, CANCELLED
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [
    index("idx_events_status").on(table.status),
    index("idx_events_event_date").on(table.eventDate)
  ]
);

// 3. Ticket Tiers Table
export const ticketTiers = pgTable(
  "ticket_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(), // e.g. VIP, CAT 1, CAT 2
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    totalSeats: integer("total_seats").notNull(),
    availableSeats: integer("available_seats").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [index("idx_ticket_tiers_event_id").on(table.eventId)]
);

// 4. Seats Table
export const seats = pgTable(
  "seats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => ticketTiers.id, { onDelete: "cascade" }),
    seatNumber: varchar("seat_number", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).default("AVAILABLE").notNull(), // AVAILABLE, HELD, BOOKED
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("uniq_tier_seat").on(table.tierId, table.seatNumber),
    index("idx_seats_tier_id").on(table.tierId),
    index("idx_seats_status").on(table.status)
  ]
);

// 5. Orders Table
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    status: varchar("status", { length: 50 }).default("PENDING").notNull(), // PENDING, PAID, EXPIRED, CANCELLED
    snapToken: text("snap_token"),
    snapRedirectUrl: text("snap_redirect_url"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [
    index("idx_orders_user_id").on(table.userId),
    index("idx_orders_status").on(table.status),
    index("idx_orders_expires_at").on(table.expiresAt)
  ]
);

// 6. Order Items Table
export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  seatId: uuid("seat_id")
    .notNull()
    .references(() => seats.id),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// 7. Payments Table
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    transactionId: varchar("transaction_id", { length: 255 }),
    paymentType: varchar("payment_type", { length: 50 }),
    status: varchar("status", { length: 50 }).notNull(), // pending, settlement, expire, cancel, deny
    grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [
    index("idx_payments_order_id").on(table.orderId),
    index("idx_payments_transaction_id").on(table.transactionId)
  ]
);

// --- Relations ---
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders)
}));

export const eventsRelations = relations(events, ({ many }) => ({
  ticketTiers: many(ticketTiers),
  orders: many(orders)
}));

export const ticketTiersRelations = relations(ticketTiers, ({ one, many }) => ({
  event: one(events, {
    fields: [ticketTiers.eventId],
    references: [events.id]
  }),
  seats: many(seats)
}));

export const seatsRelations = relations(seats, ({ one, many }) => ({
  tier: one(ticketTiers, {
    fields: [seats.tierId],
    references: [ticketTiers.id]
  }),
  orderItems: many(orderItems)
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id]
  }),
  event: one(events, {
    fields: [orders.eventId],
    references: [events.id]
  }),
  items: many(orderItems),
  payments: many(payments)
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id]
  }),
  seat: one(seats, {
    fields: [orderItems.seatId],
    references: [seats.id]
  })
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id]
  })
}));
