import { Elysia, t } from "elysia";
import { eq, asc } from "drizzle-orm";
import { db } from "../db";
import { events, ticketTiers, seats } from "../db/schema";

export const eventsRoute = new Elysia({ prefix: "/events" })
  .get(
    "/",
    async () => {
      const allEvents = await db.query.events.findMany({
        with: {
          ticketTiers: true
        },
        orderBy: [asc(events.eventDate)]
      });

      return {
        success: true,
        data: allEvents
      };
    },
    {
      detail: {
        summary: "Daftar Event Konser",
        description: "Mengambil semua daftar konser musik yang tersedia beserta kategori tiketnya."
      }
    }
  )
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const event = await db.query.events.findFirst({
        where: eq(events.id, id),
        with: {
          ticketTiers: {
            with: {
              seats: {
                orderBy: [asc(seats.seatNumber)]
              }
            }
          }
        }
      });

      if (!event) {
        set.status = 404;
        return {
          success: false,
          message: "Event konser tidak ditemukan"
        };
      }

      return {
        success: true,
        data: event
      };
    },
    {
      params: t.Object({
        id: t.String()
      }),
      detail: {
        summary: "Detail Event & Kursi",
        description: "Mengambil detail konser beserta tier tiket dan status denah kursi (seat map)."
      }
    }
  );
