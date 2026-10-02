import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

const port = process.env.PORT || 3001;

const app = new Elysia()
  .use(cors())
  .use(
    swagger({
      path: "/swagger",
      documentation: {
        info: {
          title: "Tiket Konser API",
          version: "1.0.0",
          description: "High concurrency concert ticketing system API"
        }
      }
    })
  )
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }))
  .get("/", () => ({
    message: "Tiket Konser Backend API is running",
    documentation: "/swagger"
  }))
  .listen(port);

console.log(`🦊 Backend is running at http://${app.server?.hostname}:${app.server?.port}`);
console.log(`📚 Swagger documentation at http://${app.server?.hostname}:${app.server?.port}/swagger`);
