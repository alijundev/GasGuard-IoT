# 🛡️ GasGuard IoT

> A real-time, read-only monitoring dashboard for an academic **LPG Gas Leakage Detection** system using ESP32 + MQ-2 sensor (simulated via [Wokwi](https://wokwi.com)).

---

live website: [GasGuard](https://gasguard.web.id)

## 📌 Project Overview

GasGuard IoT is a web-based dashboard that **monitors gas leakage levels in real-time**. An ESP32 microcontroller reads analog values from an MQ-2 gas sensor and publishes JSON payloads over MQTT. The SvelteKit server subscribes to this MQTT topic, logs each reading into a local SQLite database, and pushes live updates to the browser via Server-Sent Events (SSE). When a dangerous gas level is detected, a **Telegram notification** is automatically sent.

> **This is a strictly read-only dashboard** — it displays data but never controls the hardware.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         HARDWARE LAYER                          │
│                                                                  │
│   ┌──────────┐      analog      ┌──────────┐     MQTT publish   │
│   │  MQ-2    │ ──────────────── │  ESP32   │ ──────────────────┐│
│   │  Sensor  │                  │ (Wokwi)  │                   ││
│   └──────────┘                  └──────────┘                   ││
└────────────────────────────────────────────────────────────────┘│
                                                                  │
              Topic: iot/gas_kelompok2/data                       │
              Payload: {"adc": 512, "status": "NORMAL"}           │
                                                                  │
┌────────────────────────────────────────────────────────────────┐│
│                    MQTT BROKER (HiveMQ Public)                 ││
│                  wss://broker.hivemq.com:8884/mqtt             ◄┘
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │  MQTT subscribe
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                       SERVER LAYER (SvelteKit + Bun)            │
│                                                                  │
│   ┌────────────────────┐    ┌────────────────────┐               │
│   │  hooks.server.ts   │    │  MQTT Subscriber   │               │
│   │  (startup hook)    │───►│  src/lib/server/    │               │
│   └────────────────────┘    │  mqtt.ts            │               │
│                             └─────┬──────┬───────┘               │
│                                   │      │                       │
│                          insert   │      │  alert                │
│                                   ▼      ▼                       │
│   ┌────────────────────┐    ┌────────────────────┐               │
│   │  SQLite Database   │    │  Telegram Bot API  │               │
│   │  (Drizzle ORM)     │    │  (HTTP POST)       │               │
│   │  history.sqlite    │    └────────────────────┘               │
│   └────────┬───────────┘                                         │
│            │                                                     │
│            ▼                                                     │
│   ┌────────────────────┐    ┌────────────────────┐               │
│   │  API Routes        │    │  SSE Endpoint      │               │
│   │  /api/readings     │    │  /api/sse          │               │
│   │  /api/alerts       │    │  (real-time push)  │               │
│   │  /api/stats        │    └─────────┬──────────┘               │
│   └────────┬───────────┘              │                          │
└────────────┼──────────────────────────┼──────────────────────────┘
             │  fetch                   │  EventSource
             ▼                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                       FRONTEND LAYER (Browser)                   │
│                                                                  │
│   ┌────────────────────┐    ┌────────────────────┐               │
│   │  Dashboard Page    │    │  History Page       │               │
│   │  • Live gas level  │    │  • Chart.js graph   │               │
│   │  • Status badge    │    │  • Date filter      │               │
│   │  • Alerts list     │    │  • Data table       │               │
│   └────────────────────┘    └────────────────────┘               │
│                                                                  │
│   UI: Tailwind CSS  •  Icons: Lucide  •  Charts: Chart.js       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Tech Stack

| Layer     | Technology                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------- |
| Runtime   | [Bun](https://bun.sh) v1.4+                                                                              |
| Framework | [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5 runes)                                                |
| Adapter   | [@sveltejs/adapter-bun](https://svelte.dev/docs/kit/adapter-bun)                                         |
| Styling   | [Tailwind CSS](https://tailwindcss.com) v4                                                               |
| Charts    | [Chart.js](https://www.chartjs.org) + [svelte-chartjs](https://github.com/nicolo-ribaudo/svelte-chartjs) |
| Icons     | [Lucide Svelte](https://lucide.dev)                                                                      |
| Database  | [SQLite](https://www.sqlite.org) via `bun:sqlite`                                                        |
| ORM       | [Drizzle ORM](https://orm.drizzle.team)                                                                  |
| MQTT      | [MQTT.js](https://github.com/mqttjs/MQTT.js)                                                             |
| Alerts    | [Telegram Bot API](https://core.telegram.org/bots/api)                                                   |
| Hardware  | ESP32 + MQ-2 gas sensor (simulated via [Wokwi](https://wokwi.com))                                       |
| Broker    | [HiveMQ Public Broker](https://www.hivemq.com/public-mqtt-broker/)                                       |

---

## 📁 Project Structure

```
GasGuard-IoT/
├── drizzle/                    # Generated SQL migrations
├── src/
│   ├── lib/
│   │   ├── assets/             # Static assets (favicon, etc.)
│   │   ├── server/
│   │   │   ├── db/
│   │   │   │   ├── index.ts    # Drizzle client (bun:sqlite)
│   │   │   │   └── schema.ts   # Database schema definitions
│   │   │   └── mqtt.ts         # MQTT subscriber + Telegram notifier
│   │   └── index.ts            # Shared library exports
│   ├── routes/
│   │   ├── api/                # REST API + SSE endpoints
│   │   ├── +layout.svelte      # Root layout
│   │   ├── +page.svelte        # Dashboard (live monitoring)
│   │   └── history/            # Historical chart view
│   ├── hooks.server.ts         # Server startup hook (boots MQTT)
│   ├── app.d.ts                # SvelteKit type declarations
│   ├── app.html                # HTML shell
│   └── env.ts                  # Environment variable definitions
├── static/                     # Public static files
├── .env                        # Environment variables (git-ignored)
├── .env.example                # Template for environment variables
├── drizzle.config.ts           # Drizzle Kit configuration
├── package.json
├── tsconfig.json
└── vite.config.ts              # Vite + SvelteKit + Tailwind config
```

---

## 🔌 Hardware — ESP32 MQTT Payload

The ESP32 (simulated via Wokwi) reads the MQ-2 gas sensor's analog output and publishes a JSON payload to the public HiveMQ broker:

- **Broker:** `wss://broker.hivemq.com:8884/mqtt`
- **Topic:** `iot/gas_kelompok2/data`
- **QoS:** 0

### Payload Format

```json
{
	"adc": 512,
	"status": "NORMAL"
}
```

| Field    | Type     | Description                                                            |
| -------- | -------- | ---------------------------------------------------------------------- |
| `adc`    | `number` | Raw ADC reading from MQ-2 sensor (0–4095 for ESP32 12-bit ADC)         |
| `status` | `string` | `"NORMAL"` when gas level is safe, `"PERINGATAN"` when gas is detected |

---

## 🗄️ Database Schema

SQLite database managed by Drizzle ORM. All data is **append-only** (read-only dashboard, no mutations from the UI).

### `gas_readings` table

| Column       | Type      | Description                                    |
| ------------ | --------- | ---------------------------------------------- |
| `id`         | `TEXT PK` | UUID v4, auto-generated                        |
| `adc`        | `INTEGER` | Raw ADC value from the MQ-2 sensor             |
| `status`     | `TEXT`    | `"NORMAL"` or `"PERINGATAN"`                   |
| `created_at` | `TEXT`    | ISO 8601 timestamp of when the reading arrived |

---

## 🔔 Telegram Notifications

When the ESP32 reports `"status": "PERINGATAN"`, the server sends a Telegram message via the Bot API:

```
🚨 GAS LEAKAGE DETECTED!
ADC Level: 2150 / 4041
Status: PERINGATAN (BAHAYA)
Waktu: Kamis, 22 Okt 2026, 03.20.49 WITA
Sistem: GasGuard IoT 
```

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token.
2. Get your chat ID via [@userinfobot](https://t.me/userinfobot).
3. Set the values in `.env` example:
   ```env
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
   TELEGRAM_CHAT_ID=-1001234567890
   ADMIN_PASSWORD=gantidenganpasswordanda
   ```

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.4 or later

### Installation

```bash
# Clone the repository
git clone https://github.com/alijundev/GasGuard-IoT.git
cd GasGuard-IoT

# Install dependencies
bun install

# Copy environment variables
cp .env.example .env
# Edit .env with your Telegram bot credentials

# Run database migrations
bun run db:push

# Start development server
bun run dev
```

The dashboard will be available at **http://localhost:5173**.

### Production Build & Run

```bash
# Build for production
bun run build

# Run the production server directly
bun start
# atau
bun ./build/index.js
```

---

## 📜 Available Scripts

| Script                | Description                                        |
| --------------------- | -------------------------------------------------- |
| `bun run dev`         | Start dev server with HMR                          |
| `bun run build`       | Build for production using `@sveltejs/adapter-bun` |
| `bun start`           | Start production server (`build/index.js`)         |
| `bun run preview`     | Preview production build                           |
| `bun run check`       | Run `svelte-check` type checking                   |
| `bun run lint`        | Run Prettier + ESLint checks                       |
| `bun run format`      | Auto-format code with Prettier                     |
| `bun run db:push`     | Push schema changes to SQLite                      |
| `bun run db:generate` | Generate SQL migration files                       |
| `bun run db:migrate`  | Run pending migrations                             |
| `bun run db:studio`   | Open Drizzle Studio (DB browser)                   |

---

## 👥 Team

Academic project — **Kelompok 2**, IoT Course.

---

## 📄 License

This project is for academic purposes only.
