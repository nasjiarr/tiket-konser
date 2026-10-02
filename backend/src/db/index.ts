import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@100.100.76.82:5432/tiket_konser";

// Disable prefetch as it is not supported for Transactions
const client = postgres(connectionString, {
  prepare: false,
  max: 10
});

export const db = drizzle(client, { schema });
