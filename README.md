# GESTURE SYNTH

Synthesizer interaktif berbasis browser — dimainkan dengan gestur tangan lewat webcam. Semua pemrosesan (computer vision + audio) berjalan 100% di sisi client; server hanya menyajikan file statis.

## 1. Struktur File

```
gesture-synth/
├── index.html                  # Markup halaman & panel kontrol
├── css/
│   └── style.css               # Semua styling (design system "synth panel")
├── js/
│   ├── audioEngine.js          # Tone.js: instrumen, scale quantization, note on/off
│   ├── gestureDetector.js      # MediaPipe Hands: deteksi & overlay landmark tangan
│   ├── uiController.js         # Wiring DOM: dropdown, slider, pitch ladder, readout
│   └── main.js                 # Orkestrator: menghubungkan gesture -> audio -> UI
├── deploy/
│   ├── nginx-gestur.conf       # Server block Nginx (siap pakai)
│   └── cloudflared-config.yml  # Contoh konfigurasi Cloudflare Tunnel
└── README.md                   # Dokumen ini
```

Tidak ada backend/API — folder ini bisa disajikan oleh web server statis apa pun (Nginx, Caddy, dsb).

## 2. Cara Kerja Aplikasi

### Deteksi gestur (`gestureDetector.js`)
- MediaPipe Hands melacak hingga 2 tangan secara real-time dari feed webcam.
- Landmark digambar sebagai overlay di `<canvas>` di atas video (titik-titik bercahaya + garis sendi).
- Dua sinyal gestur diekstrak per tangan:
  1. **Ketinggian pergelangan tangan (wrist.y)** → dinormalisasi 0–1, dipakai sebagai kontrol pitch (semakin tinggi tangan, semakin tinggi nada).
  2. **Jarak ibu jari–telunjuk (pinch)** → di bawah ambang batas berarti "mencubit" = memicu nada (note on); menjauh dari ambang batas (dengan hysteresis agar tidak "getar/flicker") = melepas nada (note off).
- Tangan yang keluar dari frame otomatis memicu `note off` agar tidak ada nada yang "menggantung".

### Mesin audio & pitch quantization (`audioEngine.js`)
- Empat instrumen dibuat dengan Tone.js:
  - **Piano** — `Tone.Sampler` memakai rekaman piano akustik (Salamander Grand, dilayani dari CDN publik Tone.js) agar suara realistis.
  - **Gitar, Saxophone, Kalimba** — disintesis dengan `Tone.PolySynth` + oscillator/envelope yang di-tuning menirukan karakter masing-masing instrumen (petik cepat untuk gitar, envelope legato untuk saxophone, decay logam-pendek untuk kalimba). Ini membuat aplikasi tidak bergantung pada file sample tambahan yang perlu di-hosting.
- **Pitch quantization**: posisi vertikal tangan (0–1) dipetakan ke salah satu langkah tangga nada yang aktif (Mayor/Minor, 2 oktaf = 14 langkah). Fungsi `quantizeYToNote()` memastikan nada yang keluar **selalu** salah satu nada sah dalam scale — tidak mungkin fals — mengikuti nada dasar (root) yang dipilih pengguna.
- Setiap tangan adalah satu "suara" independen (maks. 2 nada simultan, kiri & kanan).

### Antarmuka (`uiController.js`, `style.css`)
- Panel kontrol kanan: pilih instrumen, tangga nada, nada dasar, volume, dan tombol start/stop kamera.
- Elemen signature: **pitch ladder** — rel vertikal di samping video yang menyala pada anak tangga nada yang sedang "disentuh" ketinggian tangan, plus kursor warna cyan (tangan kiri) dan amber (tangan kanan) — memberi umpan balik visual langsung antara gerakan dan nada.
- Desain gelap bernuansa panel synth modular (bukan hitam pekat generik), dengan aksen ungu/cyan/amber dan tipografi `Space Grotesk` + `Inter` + `JetBrains Mono` untuk readout angka.

## 3. Menjalankan Secara Lokal

Karena `getUserMedia` (akses webcam) mensyaratkan *secure context*, jalankan lewat local web server (bukan `file://`):

```bash
cd gesture-synth
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

`localhost` dianggap secure context oleh browser meski memakai HTTP biasa.

---

## 4. Panduan Deployment ke VPS (Ubuntu) + Nginx + Cloudflare Tunnel

Asumsi: kamu sudah punya VPS Ubuntu yang bisa diakses lewat SSH, dan domain `geodfine.my.id` sudah terdaftar di Cloudflare (nameserver domain sudah menunjuk ke Cloudflare).

### Langkah 0 — Siapkan VPS

```bash
ssh user@ip-vps-kamu

sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx unzip
```

### Langkah 1 — Upload proyek ke VPS

Dari komputer lokal (setelah men-download/mengekstrak folder `gesture-synth`):

```bash
# opsi A: scp
scp -r gesture-synth user@ip-vps-kamu:/tmp/gesture-synth

# opsi B: git clone (kalau kamu push project ini ke repo Git)
# di VPS: git clone <url-repo> /tmp/gesture-synth
```

Lalu pindahkan ke direktori web root:

```bash
sudo mkdir -p /var/www/gestur-synth
sudo cp -r /tmp/gesture-synth/* /var/www/gestur-synth/
sudo chown -R www-data:www-data /var/www/gestur-synth
sudo find /var/www/gestur-synth -type d -exec chmod 755 {} \;
sudo find /var/www/gestur-synth -type f -exec chmod 644 {} \;
```

### Langkah 2 — Pasang server block Nginx

File `deploy/nginx-gestur.conf` sudah siap pakai (mendengarkan di `127.0.0.1:8095`, bukan port publik — karena traffic publik nanti masuk lewat Cloudflare Tunnel, bukan langsung ke Nginx).

```bash
sudo cp /var/www/gestur-synth/deploy/nginx-gestur.conf /etc/nginx/sites-available/gestur.conf
sudo ln -s /etc/nginx/sites-available/gestur.conf /etc/nginx/sites-enabled/gestur.conf

# Uji syntax config
sudo nginx -t

# Reload jika OK
sudo systemctl reload nginx
```

Cek cepat dari dalam VPS:

```bash
curl -I http://127.0.0.1:8095
# harus balas 200 OK
```

> Kenapa tidak langsung `listen 80`/`listen 443`? Karena Cloudflare Tunnel bekerja dengan cara VPS **membuat koneksi keluar (outbound)** ke jaringan Cloudflare — kamu tidak perlu membuka port firewall publik sama sekali di VPS. Nginx cukup melayani secara lokal, dan `cloudflared` yang menjembataninya ke internet.

### Langkah 3 — Install & konfigurasi Cloudflare Tunnel (`cloudflared`)

```bash
# Install cloudflared (Ubuntu/Debian, arsitektur amd64)
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

Login & buat tunnel:

```bash
cloudflared tunnel login
# akan membuka URL — buka di browser, login ke akun Cloudflare, pilih domain geodfine.my.id

cloudflared tunnel create gestur-synth-tunnel
# catat TUNNEL-UUID dan lokasi file kredensial (.json) yang muncul di output
```

Salin & sesuaikan file konfigurasi:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp /var/www/gestur-synth/deploy/cloudflared-config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/<TUNNEL-UUID>.json /etc/cloudflared/
```

Edit `/etc/cloudflared/config.yml`, ganti `<TUNNEL-UUID>` sesuai hasil `tunnel create`:

```yaml
tunnel: gestur-synth-tunnel
credentials-file: /etc/cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: gestur.geodfine.my.id
    service: http://localhost:8095
  - service: http_status:404
```

Arahkan DNS subdomain ke tunnel ini (otomatis membuat record CNAME di Cloudflare):

```bash
cloudflared tunnel route dns gestur-synth-tunnel gestur.geodfine.my.id
```

### Langkah 4 — Jalankan cloudflared sebagai service (auto-start & auto-restart)

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

Pastikan statusnya `active (running)`.

### Langkah 5 — Atur mode SSL/TLS di dashboard Cloudflare

Di dashboard Cloudflare → domain `geodfine.my.id` → **SSL/TLS**:
- Set mode ke **Full** (koneksi pengunjung↔Cloudflare terenkripsi HTTPS, dan Cloudflare↔asal terenkripsi lewat terowongan `cloudflared` itu sendiri — jadi "Full" sudah cukup aman tanpa perlu sertifikat manual di Nginx).
- Aktifkan **Always Use HTTPS** di menu Edge Certificates agar semua traffic otomatis di-redirect ke HTTPS.

Kamu **tidak perlu** mengurus Let's Encrypt/Certbot secara manual — SSL publik sepenuhnya diurus Cloudflare, persis seperti disebutkan di kebutuhanmu.

### Langkah 6 — Tes akses

Buka `https://gestur.geodfine.my.id` dari browser (Chrome/Edge/Firefox versi terbaru):
1. Pastikan gembok HTTPS muncul di address bar.
2. Klik **START KAMERA**, izinkan akses webcam saat diminta.
3. Coba gerakkan tangan naik-turun sambil mencubit ibu jari & telunjuk — nada harus keluar sesuai instrumen & tangga nada yang dipilih.

### Troubleshooting singkat

| Gejala | Kemungkinan penyebab |
|---|---|
| Browser menolak izin kamera / `getUserMedia` gagal | Situs diakses lewat HTTP biasa (bukan lewat domain HTTPS Cloudflare), atau izin kamera di-block manual di setting browser |
| Halaman blank / 404 | Cek `sudo nginx -t`, cek path `root` di `nginx-gestur.conf` sudah sesuai lokasi file di VPS |
| `cloudflared` tidak connect | `sudo journalctl -u cloudflared -f` untuk lihat log; cek isi `config.yml` & path file kredensial `.json` |
| Suara tidak keluar meski nada terdeteksi (readout muncul) | Browser mem-block AudioContext sebelum interaksi user — pastikan klik tombol **START KAMERA** dulu (kode sudah memanggil `Tone.start()` di dalam handler klik) |
| Update kode tidak muncul di browser | Hapus cache browser / hard refresh (`Ctrl+Shift+R`), pastikan sudah `cp` ulang file terbaru ke `/var/www/gestur-synth` |

### Update aplikasi di kemudian hari

```bash
# di lokal: kirim ulang file yang berubah
scp -r gesture-synth/* user@ip-vps-kamu:/tmp/gesture-synth-update

# di VPS:
sudo cp -r /tmp/gesture-synth-update/* /var/www/gestur-synth/
sudo chown -R www-data:www-data /var/www/gestur-synth
```

Tidak perlu restart Nginx atau cloudflared untuk perubahan file statis — cukup hard refresh browser.
