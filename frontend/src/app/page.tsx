"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Event, TicketTier, Seat, Order, User } from "../types";
import {
  fetchEvents,
  fetchEventDetail,
  upsertGuestUserApi,
  holdSeatsApi,
  checkoutOrderApi,
  getSnapTokenApi,
  mockSettlementApi
} from "../lib/api";
import { SeatMap } from "../components/SeatMap";
import { ETicketCard } from "../components/ETicketCard";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "../components/ui/dialog";
import {
  Calendar,
  MapPin,
  Ticket,
  Clock,
  RefreshCw,
  CreditCard,
  Zap,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Edit2
} from "lucide-react";

export default function TicketingPortal() {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Guest User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [guestForm, setGuestForm] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Selected seats state
  const [selectedSeats, setSelectedSeats] = useState<
    Array<{ seat: Seat; tier: TicketTier }>
  >([]);

  // Active Hold & Checkout state
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Completed Paid Order state
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  // 1. Load LocalStorage User & Event Data
  const loadEvent = useCallback(async () => {
    try {
      setErrorMsg(null);
      const eventsList = await fetchEvents();
      if (eventsList.length > 0) {
        const detail = await fetchEventDetail(eventsList[0].id);
        setEvent(detail);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memuat event konser");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check saved guest profile in localStorage
    const saved = localStorage.getItem("konsertix_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCurrentUser(parsed);
        setGuestForm({
          name: parsed.name || "",
          email: parsed.email || "",
          phone: parsed.phone || ""
        });
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }
    loadEvent();
  }, [loadEvent]);

  // 2. Countdown Timer for Hold
  useEffect(() => {
    if (!holdExpiresAt) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = Math.max(0, Math.floor((holdExpiresAt.getTime() - now) / 1000));
      setTimeLeft(distance);

      if (distance <= 0) {
        clearInterval(interval);
        setHoldExpiresAt(null);
        setActiveOrder(null);
        setIsCheckoutOpen(false);
        setErrorMsg("Sesi antrean hold tiket telah habis. Kursi dilepas kembali.");
        loadEvent();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt, loadEvent]);

  // 3. Save Guest User
  const handleSaveIdentity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!guestForm.name || !guestForm.email || !guestForm.phone) {
      alert("Harap lengkapi semua data diri pemesan.");
      return null;
    }

    try {
      setIsSavingUser(true);
      const user = await upsertGuestUserApi(
        guestForm.name,
        guestForm.email,
        guestForm.phone
      );
      setCurrentUser(user);
      localStorage.setItem("konsertix_user", JSON.stringify(user));
      setIsIdentityModalOpen(false);
      return user;
    } catch (err: any) {
      alert(err.message || "Gagal menyimpan identitas");
      return null;
    } finally {
      setIsSavingUser(false);
    }
  };

  // 4. Handle Seat Selection Toggle
  const handleToggleSeat = (seat: Seat, tier: TicketTier) => {
    const isSelected = selectedSeats.some((s) => s.seat.id === seat.id);

    if (isSelected) {
      setSelectedSeats(selectedSeats.filter((s) => s.seat.id !== seat.id));
    } else {
      if (selectedSeats.length >= 4) {
        alert("Maksimal pemesanan adalah 4 tiket per transaksi.");
        return;
      }
      setSelectedSeats([...selectedSeats, { seat, tier }]);
    }
  };

  // 5. Hold & Checkout
  const handleStartBooking = async () => {
    if (!event || selectedSeats.length === 0) return;

    let userToUse = currentUser;
    if (!userToUse) {
      setIsIdentityModalOpen(true);
      return;
    }

    try {
      setIsHolding(true);
      setErrorMsg(null);

      const seatIds = selectedSeats.map((s) => s.seat.id);

      // Step A: Hold Seats (anti double-booking)
      const holdRes = await holdSeatsApi(event.id, userToUse.id, seatIds);

      // Step B: Checkout Order
      const checkoutRes = await checkoutOrderApi(event.id, userToUse.id, seatIds);

      setHoldExpiresAt(new Date(holdRes.expiresAt));
      setActiveOrder({
        id: checkoutRes.data.orderId,
        userId: userToUse.id,
        eventId: event.id,
        totalAmount: checkoutRes.data.totalAmount,
        status: "PENDING",
        snapToken: null,
        snapRedirectUrl: null,
        expiresAt: checkoutRes.data.expiresAt,
        user: userToUse,
        items: selectedSeats.map((s) => ({
          id: s.seat.id,
          orderId: checkoutRes.data.orderId,
          seatId: s.seat.id,
          price: s.tier.price,
          seat: { ...s.seat, tier: s.tier }
        })),
        event
      });

      setIsCheckoutOpen(true);
      loadEvent();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengamankan tiket.");
      loadEvent();
    } finally {
      setIsHolding(false);
    }
  };

  // 6. Pay via Mock Settlement (Instant demo)
  const handleInstantPay = async () => {
    if (!activeOrder) return;
    try {
      setIsPaying(true);
      await mockSettlementApi(activeOrder.id);

      const paidOrder: Order = {
        ...activeOrder,
        status: "PAID"
      };

      setCompletedOrder(paidOrder);
      setIsCheckoutOpen(false);
      setSelectedSeats([]);
      setHoldExpiresAt(null);
      loadEvent();
    } catch (err: any) {
      alert("Gagal memproses pembayaran: " + err.message);
    } finally {
      setIsPaying(false);
    }
  };

  // 7. Pay via Midtrans Snap Token
  const handleMidtransSnapPay = async () => {
    if (!activeOrder) return;
    try {
      setIsPaying(true);
      const snap = await getSnapTokenApi(activeOrder.id);
      if (snap.snapRedirectUrl) {
        window.open(snap.snapRedirectUrl, "_blank");
      }
    } catch (err: any) {
      alert("Gagal memanggil Midtrans Snap: " + err.message);
    } finally {
      setIsPaying(false);
    }
  };

  // Reset after completed order
  const handleResetFlow = () => {
    setCompletedOrder(null);
    setSelectedSeats([]);
    loadEvent();
  };

  const totalPrice = selectedSeats.reduce((acc, curr) => acc + Number(curr.tier.price), 0);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainderSecs = secs % 60;
    return `${String(mins).padStart(2, "0")}:${String(remainderSecs).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex items-center gap-3 text-zinc-600 font-medium">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
          <span>Memuat sistem tiket konser...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/60 pb-32 text-zinc-900">
      {/* 1. Header Navbar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight leading-tight">
              KonserTix
            </h1>
            <span className="text-[11px] text-zinc-500 font-medium block">
              High Concurrency Ticketing Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Guest Identity Chip */}
          {currentUser ? (
            <button
              onClick={() => setIsIdentityModalOpen(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-700 bg-zinc-100 hover:bg-zinc-200/80 px-3 py-1.5 rounded-full font-medium transition"
              title="Klik untuk ubah data pemesan"
            >
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span className="max-w-[120px] truncate">{currentUser.name}</span>
              <Edit2 className="w-3 h-3 text-zinc-400 ml-0.5" />
            </button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsIdentityModalOpen(true)}
              className="text-xs rounded-full px-3"
            >
              Isi Data Pemesan
            </Button>
          )}

          <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-600 bg-zinc-100 px-3 py-1.5 rounded-full font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Anti Double-Booking Active</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadEvent}
            className="flex items-center gap-1.5 text-xs rounded-xl"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh Kursi</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {completedOrder ? (
          <ETicketCard order={completedOrder} onReset={handleResetFlow} />
        ) : (
          <>
            {/* Error / Alert banner */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm p-4 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">Pemberitahuan Antrean:</span>
                  <p>{errorMsg}</p>
                </div>
              </div>
            )}

            {/* Concert Hero Banner */}
            {event && (
              <div className="bg-gradient-to-br from-zinc-900 via-indigo-950 to-zinc-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                <div className="relative z-10 max-w-2xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/90 text-white text-[11px] font-semibold border-0">
                      ● TIKET DIBUKA (ON SALE)
                    </Badge>
                    <span className="text-xs text-zinc-400 font-medium">
                      World Tour 2026
                    </span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {event.title}
                  </h2>

                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                    {event.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300 pt-2">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      <span>
                        {new Date(event.eventDate).toLocaleDateString("id-ID", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric"
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-pink-400" />
                      <span>{event.venue}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Seat Map */}
            {event && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      Pilih Kursi Penonton
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Klik kursi yang diinginkan (maksimal 4 tiket per transaksi).
                    </p>
                  </div>
                </div>

                <SeatMap
                  tiers={event.ticketTiers || []}
                  selectedSeatIds={selectedSeats.map((s) => s.seat.id)}
                  onToggleSeat={handleToggleSeat}
                  maxSeats={4}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Bottom Checkout Bar */}
      {!completedOrder && selectedSeats.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-4 sm:px-8 py-4 shadow-2xl">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold shrink-0">
                {selectedSeats.length}
              </div>
              <div>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {selectedSeats.map((s) => (
                    <span
                      key={s.seat.id}
                      className="bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md text-[11px] font-semibold text-zinc-800"
                    >
                      {s.seat.seatNumber}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-zinc-500">
                  Total Tagihan:{" "}
                  <span className="font-bold text-base text-blue-600">
                    Rp {totalPrice.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            </div>

            <Button
              size="lg"
              disabled={isHolding}
              onClick={handleStartBooking}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-6 rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
            >
              {isHolding ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Mengunci Kursi...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Amankan Tiket Sekarang</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Modal 1: Guest Identity Form */}
      <Dialog open={isIdentityModalOpen} onOpenChange={setIsIdentityModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white border border-zinc-200 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold">
              Data Diri Pemesan (Guest)
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Tanpa perlu login/password. Masukkan identitas Anda untuk pencetakan e-ticket dan validasi antrean.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveIdentity} className="space-y-4 my-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 block">
                Nama Lengkap (Sesuai KTP/ID)
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Budi Santoso"
                value={guestForm.name}
                onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 block">
                Alamat Email Aktif (Untuk Pengiriman E-Ticket)
              </label>
              <input
                type="email"
                required
                placeholder="budi@example.com"
                value={guestForm.email}
                onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 block">
                No. WhatsApp / Handphone
              </label>
              <input
                type="tel"
                required
                placeholder="081234567890"
                value={guestForm.phone}
                onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={isSavingUser}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-5 rounded-xl text-xs"
              >
                {isSavingUser ? "Menyimpan Data..." : "Simpan & Lanjutkan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Checkout & Payment Confirmation */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white border border-zinc-200 shadow-2xl">
          <DialogHeader className="space-y-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold">
                Konfirmasi Pemesanan
              </DialogTitle>
              {holdExpiresAt && (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs px-2.5 py-1 rounded-full font-mono font-bold">
                  <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  <span>{formatTime(timeLeft)}</span>
                </div>
              )}
            </div>
            <DialogDescription className="text-xs text-zinc-500">
              Kursi Anda berhasil di-hold selama 10 menit. Selesaikan pembayaran sebelum waktu berakhir.
            </DialogDescription>
          </DialogHeader>

          {activeOrder && (
            <div className="space-y-4 my-2 text-xs">
              {/* Attendee Summary */}
              {currentUser && (
                <div className="bg-blue-50/60 border border-blue-200/60 rounded-2xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Pemesan:</span>
                    <p className="font-bold text-zinc-900">{currentUser.name}</p>
                    <p className="text-zinc-500 text-[11px]">{currentUser.email}</p>
                  </div>
                  <Badge variant="outline" className="bg-white text-[10px]">
                    Guest Verified
                  </Badge>
                </div>
              )}

              <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100 space-y-2">
                <div className="flex justify-between text-zinc-500">
                  <span>ID Pesanan</span>
                  <span className="font-mono text-zinc-900 font-medium">
                    {activeOrder.id.slice(0, 12)}...
                  </span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Jumlah Kursi</span>
                  <span className="text-zinc-900 font-semibold">
                    {selectedSeats.length} Tiket
                  </span>
                </div>
                <div className="border-t border-zinc-200/80 pt-2 flex justify-between items-center text-sm font-bold text-zinc-900">
                  <span>Total Pembayaran</span>
                  <span className="text-blue-600 text-base">
                    Rp {Number(activeOrder.totalAmount).toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              {/* Payment Actions */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={handleInstantPay}
                  disabled={isPaying}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-5 rounded-2xl flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Bayar Langsung (Simulasi Instan / Demo)</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={handleMidtransSnapPay}
                  disabled={isPaying}
                  className="w-full border-zinc-300 hover:bg-zinc-50 py-5 rounded-2xl flex items-center justify-center gap-2 text-zinc-700 font-medium"
                >
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span>Buka Midtrans Snap Payment</span>
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <p className="text-[11px] text-zinc-400 text-center w-full">
              Transaksi dilindungi ACID Transaction & Redis Distributed Lock.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
