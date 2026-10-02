"use client";

import React from "react";
import { TicketTier, Seat } from "../types";
import { Badge } from "./ui/badge";

interface SeatMapProps {
  tiers: TicketTier[];
  selectedSeatIds: string[];
  onToggleSeat: (seat: Seat, tier: TicketTier) => void;
  maxSeats?: number;
}

export function SeatMap({
  tiers,
  selectedSeatIds,
  onToggleSeat,
  maxSeats = 4
}: SeatMapProps) {
  return (
    <div className="flex flex-col items-center w-full space-y-8">
      {/* 1. Stage Banner */}
      <div className="w-full max-w-2xl bg-zinc-900 border-2 border-zinc-700 text-zinc-100 rounded-2xl py-3 px-6 text-center shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 animate-pulse pointer-events-none" />
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Arah Penonton Menghadap
        </span>
        <h3 className="text-xl font-bold tracking-wider text-white mt-0.5">
          🎤 PANGGUNG UTAMA / MAIN STAGE
        </h3>
      </div>

      {/* 2. Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-zinc-600 bg-zinc-50 border border-zinc-200 py-2.5 px-4 rounded-full">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-white border-2 border-emerald-500" />
          <span>Tersedia</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-blue-600 border-2 border-blue-600 text-white flex items-center justify-center text-[9px]">✓</div>
          <span>Dipilih ({selectedSeatIds.length}/{maxSeats})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-amber-400 border border-amber-500" />
          <span>Sedang Di-Hold (Antrean)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-zinc-300 border border-zinc-400 opacity-60" />
          <span>Terjual / Booked</span>
        </div>
      </div>

      {/* 3. Tiers & Seats Grid */}
      <div className="w-full space-y-8">
        {tiers.map((tier) => {
          const seats = tier.seats || [];
          return (
            <div
              key={tier.id}
              className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm space-y-4"
            >
              {/* Tier Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-zinc-900 text-base">
                    {tier.name}
                  </h4>
                  <Badge variant="outline" className="text-xs font-normal">
                    Tersedia: {tier.availableSeats} / {tier.totalSeats}
                  </Badge>
                </div>
                <div className="text-right">
                  <span className="text-xs text-zinc-400 block font-normal">Harga Tiket</span>
                  <span className="font-bold text-blue-600 text-base">
                    Rp {Number(tier.price).toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              {/* Seats Grid */}
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2.5">
                {seats.map((seat) => {
                  const isSelected = selectedSeatIds.includes(seat.id);
                  const isAvailable = seat.status === "AVAILABLE";
                  const isHeld = seat.status === "HELD";
                  const isBooked = seat.status === "BOOKED";

                  let buttonStyle = "bg-white border-2 border-emerald-500 text-zinc-800 hover:bg-emerald-50 hover:scale-105 active:scale-95";
                  if (isSelected) {
                    buttonStyle = "bg-blue-600 border-2 border-blue-600 text-white shadow-md scale-105";
                  } else if (isHeld) {
                    buttonStyle = "bg-amber-100 border border-amber-400 text-amber-800 cursor-not-allowed opacity-80";
                  } else if (isBooked) {
                    buttonStyle = "bg-zinc-100 border border-zinc-300 text-zinc-400 cursor-not-allowed opacity-50";
                  }

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={!isAvailable && !isSelected}
                      onClick={() => onToggleSeat(seat, tier)}
                      title={`Kursi ${seat.seatNumber} (${seat.status})`}
                      className={`relative flex flex-col items-center justify-center p-2 rounded-xl text-xs font-semibold transition-all duration-150 aspect-square select-none ${buttonStyle}`}
                    >
                      <span>{seat.seatNumber}</span>
                      {isSelected && (
                        <span className="text-[10px] leading-none mt-0.5">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
