export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Seat {
  id: string;
  tierId: string;
  seatNumber: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  createdAt?: string;
}

export interface TicketTier {
  id: string;
  eventId: string;
  name: string;
  price: string | number;
  totalSeats: number;
  availableSeats: number;
  seats?: Seat[];
}

export interface Event {
  id: string;
  title: string;
  description: string;
  venue: string;
  bannerUrl: string | null;
  eventDate: string;
  status: string;
  ticketTiers: TicketTier[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  seatId: string;
  price: string | number;
  seat?: Seat & { tier?: TicketTier };
}

export interface Order {
  id: string;
  userId: string;
  eventId: string;
  totalAmount: string | number;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
  snapToken: string | null;
  snapRedirectUrl: string | null;
  expiresAt: string;
  createdAt?: string;
  user?: User;
  event?: Event;
  items?: OrderItem[];
}
