import { Elysia, t } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";

export const usersRoute = new Elysia({ prefix: "/users" })
  .post(
    "/guest",
    async ({ body, set }) => {
      const { name, email, phone } = body;

      try {
        const [user] = await db
          .insert(users)
          .values({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim()
          })
          .onConflictDoUpdate({
            target: users.email,
            set: {
              name: name.trim(),
              phone: phone.trim(),
              updatedAt: new Date()
            }
          })
          .returning();

        return {
          success: true,
          message: "Data pemesan berhasil disimpan",
          data: user
        };
      } catch (err: any) {
        set.status = 400;
        return {
          success: false,
          message: err.message || "Gagal menyimpan data pemesan"
        };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        email: t.String(),
        phone: t.String({ minLength: 8 })
      }),
      detail: {
        summary: "Registrasi / Update Identitas Pemesan (Guest)",
        description:
          "Menyimpan atau memperbarui identitas pemesan konser (Nama, Email, No. HP) tanpa password."
      }
    }
  );
