"use client";

import React from "react";
import { Order } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Ticket, Calendar, MapPin, CheckCircle2, Download, UserCheck } from "lucide-react";

interface ETicketCardProps {
  order: Order;
  onReset: () => void;
}

export function ETicketCard({ order, onReset }: ETicketCardProps) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=TIKET-KONSER-ORDER-${order.id}`;

  const eventTitle = order.event?.title || "Coldplay: Music of the Spheres World Tour";
  const eventVenue = order.event?.venue || "Gelora Bung Karno Main Stadium, Jakarta";
  const eventDate = order.event?.eventDate
    ? new Date(order.event.eventDate).toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : "Sabtu, 15 November 2026";

  const customerName = order.user?.name || "Pemesan Tiket";
  const customerEmail = order.user?.email || "email@example.com";
  const customerPhone = order.user?.phone || "-";

  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 text-emerald-800">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
        <div>
          <h4 className="font-semibold text-sm">Pembayaran Berhasil & Terkonfirmasi!</h4>
          <p className="text-xs text-emerald-700">
            E-Ticket resmi Anda telah diterbitkan. Tunjukkan barcode/QR ini saat masuk venue.
          </p>
        </div>
      </div>

      {/* Ticket Pass Container */}
      <div className="bg-zinc-900 text-white rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 relative">
        {/* Top Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
              Official Concert Pass
            </span>
            <Badge className="bg-emerald-500 text-white font-semibold text-xs border-0">
              LUNAS
            </Badge>
          </div>
          <h2 className="text-xl font-bold tracking-tight leading-tight">
            {eventTitle}
          </h2>
        </div>

        {/* Middle Body */}
        <div className="p-6 space-y-5">
          {/* Customer / Attendee Information */}
          <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <span className="text-zinc-400 text-[11px] block">Pemegang Tiket:</span>
              <p className="font-bold text-zinc-100 text-sm">{customerName}</p>
              <p className="text-zinc-400 text-[11px]">{customerEmail} • {customerPhone}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-zinc-400 block flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Tanggal & Waktu
              </span>
              <p className="font-semibold text-zinc-100">{eventDate}</p>
              <p className="text-zinc-400">Pintu Dibuka: 17:00 WIB</p>
            </div>

            <div className="space-y-1">
              <span className="text-zinc-400 block flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Tempat / Lokasi
              </span>
              <p className="font-semibold text-zinc-100">{eventVenue}</p>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4">
            <span className="text-zinc-400 text-xs block mb-2">Rincian Kursi:</span>
            <div className="flex flex-wrap gap-2">
              {order.items?.map((item) => (
                <div
                  key={item.id}
                  className="bg-zinc-800/90 border border-zinc-700 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2"
                >
                  <Ticket className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-bold text-white">
                    {item.seat?.seatNumber || "Seat"}
                  </span>
                  <span className="text-zinc-400 text-[11px]">
                    ({item.seat?.tier?.name || "Tier"})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* QR Code and Booking Code */}
          <div className="border-t border-dashed border-zinc-700/80 pt-5 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 block">
                Booking ID
              </span>
              <p className="font-mono font-bold text-sm text-blue-400">
                {order.id.slice(0, 18)}...
              </p>
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 block mt-2">
                Total Biaya
              </span>
              <p className="font-bold text-base text-zinc-100">
                Rp {Number(order.totalAmount).toLocaleString("id-ID")}
              </p>
            </div>

            <div className="bg-white p-2.5 rounded-2xl shadow-inner shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="E-Ticket QR Code"
                className="w-28 h-28 object-contain"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-zinc-950 px-6 py-3 text-[11px] text-zinc-500 text-center border-t border-zinc-800/80">
          Tiket ini dilindungi enkripsi anti-pemalsuan dan bersifat non-refundable.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="flex-1 flex items-center justify-center gap-2 text-xs py-5 rounded-xl"
        >
          <Download className="w-4 h-4" /> Cetak / Unduh PDF
        </Button>
        <Button
          onClick={onReset}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-5 rounded-xl"
        >
          Pesan Tiket Lain
        </Button>
      </div>
    </div>
  );
}
