# 🛡️ GasGuard IoT

> A real-time, read-only monitoring dashboard for an academic **LPG Gas Leakage Detection** system using ESP32 + MQ-2 sensor (simulated via [Wokwi](https://wokwi.com)).

---

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

### `alerts` table

| Column       | Type      | Description                           |
| ------------ | --------- | ------------------------------------- |
| `id`         | `TEXT PK` | UUID v4, auto-generated               |
| `adc`        | `INTEGER` | ADC value that triggered the alert    |
| `message`    | `TEXT`    | Human-readable alert message          |
| `notified`   | `INTEGER` | `1` if Telegram notification was sent |
| `created_at` | `TEXT`    | ISO 8601 timestamp                    |

---

## 🔔 Telegram Notifications

When the ESP32 reports `"status": "PERINGATAN"`, the server sends a Telegram message via the Bot API:

```
🚨 GAS LEAKAGE DETECTED!
ADC Level: 2150
Status: PERINGATAN
Time: 2026-10-21T22:40:00+08:00
```

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token.
2. Get your chat ID via [@userinfobot](https://t.me/userinfobot).
3. Set the values in `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
   TELEGRAM_CHAT_ID=-1001234567890
   ```

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.4 or later
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/GasGuard-IoT.git
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

## 🚀 Deployment (GCP e2-micro + systemd + Cloudflare Tunnel)

Panduan deployment lightweight tanpa Docker untuk VPS GCP Free Tier (`e2-micro`, 1 GB RAM, 0.25 vCPU).

### 1. Persiapan VPS GCP (e2-micro)

Karena RAM `e2-micro` hanya 1 GB, **sangat disarankan membuat Swap File 1GB–2GB** agar proses `bun install` & `bun run build` tidak mengalami OOM (Out Of Memory):

```bash
# Buat swap file 2GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Simpan agar otomatis aktif saat reboot
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Install Bun & Clone Repository

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone repo & install dependencies
git clone <URL_REPOSITORY_ANDA> GasGuard-IoT
cd GasGuard-IoT
bun install

# Konfigurasi file environment
cp .env.example .env
nano .env  # Masukkan konfigurasi MQTT & Telegram Bot Anda

# Push schema database & build aplikasi
bun run db:push
bun run build
```

### 3. Setup systemd Service

Template service sudah disediakan di [`deploy/gasguard.service`](deploy/gasguard.service).

```bash
# Salin file service ke folder systemd
sudo cp deploy/gasguard.service /etc/systemd/system/gasguard.service

# Buka dan sesuaikan nama user & path binary bun Anda
sudo nano /etc/systemd/system/gasguard.service
# (Ganti YOUR_VPS_USERNAME dengan output dari command `whoami`)

# Reload systemd daemon & jalankan service
sudo systemctl daemon-reload
sudo systemctl enable --now gasguard

# Cek status service & logs
sudo systemctl status gasguard
sudo journalctl -u gasguard -f
```

### 4. Setup Cloudflare Tunnel (Expose Localhost ke Publik)

Dengan Cloudflare Tunnel, Anda mendapatkan domain HTTPS gratis tanpa perlu membuka firewall port 80/443 di GCP dan tanpa perlu repot konfigurasi Nginx/Certbot SSL.

```bash
# 1. Unduh dan install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# 2. Login ke akun Cloudflare Anda
cloudflared tunnel login

# 3. Buat Tunnel baru (misal dinamakan: gasguard)
cloudflared tunnel create gasguard

# 4. Buat file konfigurasi ~/.cloudflared/config.yml
cat << 'EOF' > ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID_DARI_LANGKAH_3>
credentials-file: /home/YOUR_VPS_USERNAME/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: gasguard.domainanda.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# 5. Routing DNS domain ke tunnel
cloudflared tunnel route dns gasguard gasguard.domainanda.com

# 6. Pasang cloudflared sebagai systemd service (auto-start)
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

> 💡 **Quick Tunnel (Alternatif Tanpa Custom Domain)**:  
> Jika belum memiliki domain sendiri, Anda bisa menjalankan tunnel instan dengan subdomain `.trycloudflare.com`:
>
> ```bash
> cloudflared tunnel --url http://localhost:3000
> ```

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
