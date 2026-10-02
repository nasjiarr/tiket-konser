import { Event, Order, User } from "../types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export async function upsertGuestUserApi(
  name: string,
  email: string,
  phone: string
): Promise<User> {
  const res = await fetch(`${API_BASE}/users/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Gagal menyimpan identitas pemesan");
  }
  return data.data;
}

export async function fetchEvents(): Promise<Event[]> {
  const res = await fetch(`${API_BASE}/events`, { cache: "no-store" });
  if (!res.ok) throw new Error("Gagal mengambil daftar event");
  const data = await res.json();
  return data.data;
}

export async function fetchEventDetail(id: string): Promise<Event> {
  const res = await fetch(`${API_BASE}/events/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Gagal mengambil detail event");
  const data = await res.json();
  return data.data;
}

export async function holdSeatsApi(
  eventId: string,
  userId: string,
  seatIds: string[]
): Promise<{ success: boolean; message: string; heldSeats: string[]; expiresAt: string }> {
  const res = await fetch(`${API_BASE}/orders/hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, userId, seatIds })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Gagal menahan kursi");
  }
  return data;
}

export async function checkoutOrderApi(
  eventId: string,
  userId: string,
  seatIds: string[]
): Promise<{ success: boolean; data: { orderId: string; totalAmount: number; status: string; expiresAt: string; seats: any[] } }> {
  const res = await fetch(`${API_BASE}/orders/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, userId, seatIds })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Gagal melakukan checkout");
  }
  return data;
}

export async function fetchOrderDetail(id: string): Promise<Order> {
  const res = await fetch(`${API_BASE}/orders/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Gagal mengambil detail order");
  const data = await res.json();
  return data.data;
}

export async function getSnapTokenApi(orderId: string): Promise<{ snapToken: string; snapRedirectUrl: string; isMock?: boolean }> {
  const res = await fetch(`${API_BASE}/payments/snap-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Gagal membuat snap token");
  }
  return data.data;
}

export async function mockSettlementApi(orderId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/payments/mock-settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Gagal memproses simulasi pembayaran");
  }
  return data;
}
