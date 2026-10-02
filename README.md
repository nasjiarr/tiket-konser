# 🎫 Tiket Konser - High Concurrency Ticketing Platform

Sistem pemesanan tiket konser dengan performa tinggi untuk menangani lonjakan trafik saat *ticket war*, menggunakan arsitektur modern berbasis Bun, ElysiaJS, Redis, PostgreSQL, Drizzle ORM, Next.js, dan Midtrans.

## 🛠️ Tech Stack
- **Runtime & Package Manager**: [Bun](https://bun.sh/)
- **Backend API**: [ElysiaJS](https://elysiajs.com/) (port 3001) + Swagger Docs (`/swagger`)
- **Database**: [PostgreSQL 16](https://www.postgresql.org/) (ACID transaction & row locking)
- **ORM & Migration**: [Drizzle ORM](https://orm.drizzle.team/)
- **Cache & Concurrency**: [Redis 7](https://redis.io/) (Seat hold TTL, waiting room, rate limiting)
- **Job Queue**: [BullMQ](https://bullmq.io/) (Order expiration cleanup, background notifications)
- **Payment Gateway**: [Midtrans Snap](https://midtrans.com/) (QRIS, VA, e-wallet)
- **Frontend**: [Next.js](https://nextjs.org/) (App Router) + [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Load Testing**: [k6](https://k6.io/)
- **Containerization**: [Docker Compose](https://www.docker.com/)

## 📂 Struktur Project
```text
tiket-konser/
├── backend/          # Backend REST API (Bun + ElysiaJS + Drizzle + BullMQ)
├── frontend/         # Frontend Web Portal (Next.js + Tailwind CSS + shadcn/ui)
├── load-tests/       # Skenario load testing k6 untuk ticket war
├── docker-compose.yml# Konfigurasi container PostgreSQL & Redis
├── .env.example      # Template variabel environment
└── package.json      # Monorepo task runner
```

## 🚀 Cara Menjalankan

### 1. Database & Cache (Docker)
PostgreSQL & Redis berjalan di container Docker (Server Ubuntu / Lokal):
```bash
docker compose up -d
```

### 2. Backend (ElysiaJS)
```bash
cd backend
bun run src/index.ts
# Server aktif di http://localhost:3001
# Dokumentasi OpenAPI/Swagger: http://localhost:3001/swagger
```

### 3. Frontend (Next.js)
```bash
cd frontend
bun run dev
# Web portal aktif di http://localhost:3000
```
