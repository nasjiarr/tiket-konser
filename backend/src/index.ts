import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { eventsRoute } from "./routes/events.route";
import { ordersRoute } from "./routes/orders.route";

const port = process.env.PORT || 3001;

export const app = new Elysia()
  .use(cors())
  .use(
    swagger({
      path: "/swagger",
      documentation: {
        info: {
          title: "Tiket Konser API - High Concurrency Engine",
          version: "1.0.0",
          description:
            "API sistem pemesanan tiket konser dengan Redis Lock TTL & PostgreSQL Row-Level Locking."
        },
        tags: [
          { name: "Events", description: "Katalog & Denah Kursi Konser" },
          { name: "Orders", description: "Pemesanan & Hold Kursi Tiket War" }
        ]
      }
    })
  )
  .onError(({ code, error, set }) => {
    console.error(`[Error ${code}]:`, error);
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: "Data input tidak valid",
        details: error.message
      };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false,
        message: "Resource tidak ditemukan"
      };
    }
    set.status = 500;
    return {
      success: false,
      message: error.message || "Terjadi kesalahan internal server"
    };
  })
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }))
  .group("/api", (app) => app.use(eventsRoute).use(ordersRoute))
  .listen(port);

console.log(`🦊 Backend is running at http://${app.server?.hostname}:${app.server?.port}`);
console.log(`📚 Swagger documentation at http://${app.server?.hostname}:${app.server?.port}/swagger`);
