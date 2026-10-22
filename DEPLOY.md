## 🚀 Deployment (GCP e2-micro + systemd + Cloudflare Tunnel)

Panduan deployment produksi tanpa Docker, dioptimalkan khusus untuk VPS GCP Free Tier (**e2-micro**, 1 GB RAM, 0.25 vCPU) dan domain resmi **`gasguard.web.id`** menggunakan:

- **Bun** sebagai runtime JavaScript super cepat & efisien memori.
- **systemd** untuk mengelola background service, auto-restart jika crash, dan _memory ceiling_.
- **Cloudflare Tunnel (`cloudflared`)** untuk menghubungkan domain `gasguard.web.id` ke `localhost:3000` secara aman dengan otomatis HTTPS/SSL gratis, proteksi DDoS, tanpa perlu membuka port firewall GCP apa pun.

---

### 1. Hubungkan Domain `gasguard.web.id` ke Cloudflare

1. Login ke [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Klik **Add a domain** / **Add Site**, ketik `gasguard.web.id`, pilih paket **Free ($0)**.
3. Cloudflare akan memberikan 2 alamat Nameserver (contoh: `ns1.cloudflare.com` dan `ns2.cloudflare.com`).
4. Buka dashboard tempat Anda membeli domain, masuk ke menu **Kelola Domain / Nameservers**, lalu ganti dengan 2 Nameserver dari Cloudflare tersebut.
5. Tunggu hingga status domain di Cloudflare berubah menjadi **Active** (biasanya 5–15 menit).

---

### 3. Buat Swap Memory 2GB di VPS (Wajib untuk RAM 1GB)

Karena RAM instans `e2-micro` hanya 1 GB, swap file diperlukan agar proses `bun install` & `bun run build` tidak mengalami OOM (_Out Of Memory_):

```bash
# Buat swap file 2GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Pasang permanen saat VM reboot
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

### 4. Install Bun & Setup Aplikasi GasGuard

```bash
# Install Bun runtime
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone repo & install dependensi
git clone <URL_REPOSITORY_ANDA> GasGuard-IoT
cd GasGuard-IoT
bun install

# Konfigurasi file environment
cp .env.example .env
nano .env  # Masukkan konfigurasi MQTT, Telegram Bot, dan ADMIN_PASSWORD Anda

# Push schema database & build aplikasi produksi
bun run db:push
bun run build
```

---

### 5. Setup systemd Service (Background Daemon)

Template service sudah disediakan di [`deploy/gasguard.service`](deploy/gasguard.service).

```bash
# Salin file template service ke systemd
sudo cp deploy/gasguard.service /etc/systemd/system/gasguard.service

# Sesuaikan username VPS Anda (ganti YOUR_VPS_USERNAME dengan hasil `whoami`)
sudo nano /etc/systemd/system/gasguard.service

# Reload daemon dan aktifkan service saat boot
sudo systemctl daemon-reload
sudo systemctl enable --now gasguard

# Cek status & logs aplikasi
sudo systemctl status gasguard
sudo journalctl -u gasguard -f
```

---

### 6. Setup Cloudflare Tunnel (`cloudflared`) untuk `gasguard.web.id`

Dengan Cloudflare Tunnel, port 80 dan 443 di firewall GCP **tidak perlu dibuka** karena tunnel bekerja dengan koneksi _outbound_ yang aman langsung ke jaringan Cloudflare.

```bash
# 1. Download & Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# 2. Login ke akun Cloudflare via terminal
cloudflared tunnel login
# (Terminal akan memunculkan tautan login. Buka tautan tersebut di browser dan pilih domain gasguard.web.id untuk otorisasi)

# 3. Buat Tunnel baru dengan nama 'gasguard'
cloudflared tunnel create gasguard
# (Perintah ini akan menampilkan TUNNEL_ID berupa UUID, contoh: 12345678-abcd-1234-ef01-123456789abc)

# 4. Buat file konfigurasi ~/.cloudflared/config.yml
mkdir -p ~/.cloudflared
cat << 'EOF' > ~/.cloudflared/config.yml
tunnel: <GANTI_DENGAN_TUNNEL_ID_ANDA>
credentials-file: /home/YOUR_VPS_USERNAME/.cloudflared/<GANTI_DENGAN_TUNNEL_ID_ANDA>.json

ingress:
  - hostname: gasguard.web.id
    service: http://localhost:3000
  - hostname: www.gasguard.web.id
    service: http://localhost:3000
  - service: http_status:404
EOF

# 5. Routing DNS domain ke tunnel secara otomatis
cloudflared tunnel route dns gasguard gasguard.web.id
cloudflared tunnel route dns gasguard www.gasguard.web.id

# 6. Pasang dan aktifkan cloudflared sebagai service otomatis (systemd)
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Cek status tunnel
sudo systemctl status cloudflared
```

---

### 🎉 Selesai!

Buka browser dan akses:

```
https://gasguard.web.id
```

Dashboard kini sudah aktif online dengan domain resmi, otomatis HTTPS ber-sertifikat SSL dari Cloudflare, dan terlindungi dari serangan DDoS.
