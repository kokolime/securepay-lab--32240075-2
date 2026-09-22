# SecurePay Lab — Praktikum DevSecOps

**Mata kuliah:** TIG13 Secure Application Development — Universitas Bunda Mulia
**Materi:** 5 — DevSecOps (Security Culture, CI/CD, DevSecOps Pipeline)
**Sub-CPMK:** Mahasiswa mampu mensimulasikan konsep DevSecOps serta peran budaya keamanan dalam pengembangan perangkat lunak (C3, A3)

> ⚠️ **PERINGATAN**
> Aplikasi **SecurePay** ini **sengaja dibuat rentan** untuk keperluan belajar. Jangan di-deploy ke internet,
> jangan dipakai sebagai contoh cara menulis kode, dan **jangan pernah memakai secret/password asli** di repo ini.
> Semua key di dalamnya palsu.

---

## 1. Apa yang akan Anda kerjakan?

Anda menerima aplikasi mini transfer uang (Node.js/Express) yang **lolos semua unit test**, tetapi menyimpan banyak
masalah keamanan. Tugas Anda: membangun **DevSecOps pipeline** di GitHub Actions yang *menemukan* masalah tersebut
secara otomatis, lalu **memperbaikinya** sampai pipeline hijau.

```
Plan → Code → Commit → Build → Test → Security Scan → Package → Deploy → Monitor → Feedback
                 │        │       │          │                     │
              Tahap A  Tahap B  Tahap C   (Tahap C)             Tahap D = security gate
              secret   dependency  SAST                          sebelum Deploy
```

| Tahap | Aktivitas keamanan | Tool | Perkiraan waktu |
|---|---|---|---|
| A | Secret scanning (tahap Commit) | Gitleaks | 10 menit |
| B | Dependency scanning (tahap Build) | npm audit | 15 menit |
| C | SAST (tahap Test) | Semgrep | 25 menit |
| D | Security gate sebelum Deploy | GitHub Actions `needs` | 10 menit |

## 2. Prasyarat

- Akun GitHub (gratis).
- Browser. Sebagian besar tugas bisa dikerjakan langsung di GitHub (tekan tombol `.` di halaman repo untuk membuka editor web).
- **Untuk Tahap B** Anda butuh terminal dengan **Node.js 22 + npm + git**, atau gunakan **GitHub Codespaces**
  (tombol hijau *Code* → tab *Codespaces*).

## 3. Langkah 0 — Siapkan repo Anda

1. Buka link repo template dari dosen → klik **Use this template** → **Create a new repository**.
2. Nama repo: `securepay-lab-<NIM>`; pilih **Public**; klik **Create repository**.
3. Buka tab **Actions** → workflow **DevSecOps Pipeline** → tunggu sampai job **Build & Unit Test** hijau ✅.
   Jika tab Actions meminta konfirmasi, klik *I understand my workflows, go ahead and enable them*.

> **Renungkan:** semua test hijau. Apakah itu berarti aplikasinya aman? Simpan jawaban Anda untuk laporan.

## 4. Langkah 1 (opsional, 5 menit) — Kenali aplikasinya

```bash
git clone https://github.com/<username>/securepay-lab-<NIM>.git
cd securepay-lab-<NIM>
npm ci
npm start          # berjalan di http://localhost:3000
```

Di terminal lain:

```bash
# pencarian normal
curl "http://localhost:3000/api/users/search?q=Budi"

# input yang "tidak biasa" -- perhatikan hasilnya
curl -G "http://localhost:3000/api/users/search" --data-urlencode "q=zzz%' OR 1=1 --"
```

Buka juga `http://localhost:3000/welcome?name=Budi`, lalu ganti `Budi` dengan `<b>Budi</b>`.
**Pertanyaan:** mengapa hasilnya berbeda dari yang Anda harapkan? Kesalahan apa yang dilakukan developer-nya?

## 5. Siklus kerja setiap tahap

1. **Tambah** job baru ke `.github/workflows/ci.yml` (snippet ada di bawah).
2. **Commit & push** → buka tab **Actions**.
3. Job baru akan **merah ❌** — *itu memang yang diharapkan!* Berarti scanner berhasil menemukan masalah.
4. **Baca log**: temuan apa, di file dan baris mana, mengapa berbahaya.
5. **Perbaiki** kodenya → commit & push.
6. Job menjadi **hijau ✅**.
7. **Screenshot** kondisi merah dan hijau untuk laporan.

> Indentasi YAML sangat penting. Job baru harus sejajar dengan `build-test:` (2 spasi di bawah `jobs:`).

---

## 6. Tahap A — Secret Scanning (tahap *Commit*)

**Konsep:** password/API key tidak boleh ada di source code (slide 1.7 & 3.6 "Tahap Commit: Secret Scanning").

**Langkah 1 — tambahkan blok `env` ini di `ci.yml`, tepat di bawah `permissions:`**

```yaml
# Versi tool di-pin + checksum diverifikasi.
# Kenapa? Supaya tool keamanan tidak bisa diganti diam-diam (lihat insiden supply chain Trivy, Maret 2026).
env:
  GITLEAKS_VERSION: "8.30.1"
  GITLEAKS_SHA256: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
  SEMGREP_VERSION: "1.177.0"
```

> **Mengapa ada checksum (SHA-256)?** Pipeline juga bisa diserang (slide 2.6 "Pipeline dapat dimanipulasi").
> Pada Maret 2026, GitHub Action milik scanner Trivy dibajak: penyerang menimpa tag versi sehingga
> pipeline banyak proyek menjalankan kode pencuri secret. Dengan mem-pin versi dan memverifikasi checksum,
> tool yang kita unduh tidak bisa diganti diam-diam.
> Sumber: <https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23>

**Langkah 2 — tambahkan job ini**

```yaml
  # ------------------------------------------------------------
  # TAHAP A -- Commit: Secret scanning
  # ------------------------------------------------------------
  secret-scan:
    name: Secret Scan (Gitleaks)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
      - name: Install Gitleaks (versi di-pin + verifikasi checksum)
        run: |
          curl -sSfL -o "$RUNNER_TEMP/gitleaks.tar.gz" \
            "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
          echo "${GITLEAKS_SHA256}  $RUNNER_TEMP/gitleaks.tar.gz" | sha256sum -c -
          tar -xzf "$RUNNER_TEMP/gitleaks.tar.gz" -C "$RUNNER_TEMP" gitleaks
          echo "$RUNNER_TEMP" >> "$GITHUB_PATH"
      - name: Scan secret di source code
        run: gitleaks dir . --redact --verbose
```

**Yang diharapkan:** job `Secret Scan` **merah**. Log menampilkan *RuleID*, file, dan baris.

**Perbaikan (petunjuk):**
- Temukan secret di `src/config.js`. Ganti dengan pembacaan dari **environment variable** (`process.env.NAMA`).
- Secret sungguhan disimpan di **secret manager** — untuk CI di GitHub: *Settings → Secrets and variables → Actions*.
- Setelah dipindahkan, aplikasi dan test butuh nilainya. Anda bisa (a) membuat nilai acak di dalam file test
  sebelum `require('../src/app')`, atau (b) memberi `env:` dari `secrets` pada job `build-test`.
- Buat file `.env.example` berisi **nama** variabel saja (tanpa nilai). File `.env` sudah masuk `.gitignore`.

**Pertanyaan untuk laporan:** scanner ini memeriksa *file saat ini*. Kalau secret sudah pernah ter-commit,
apakah dengan menghapusnya dari file berarti secret itu sudah aman? Apa yang seharusnya dilakukan pada key tersebut?

---

## 7. Tahap B — Dependency Scanning (tahap *Build*)

**Konsep:** library pihak ketiga bisa punya CVE (slide 3.6 "Tahap Build: Dependency Scanning").

**Tambahkan job:**

```yaml
  # ------------------------------------------------------------
  # TAHAP B -- Build: Dependency scanning
  # ------------------------------------------------------------
  dependency-scan:
    name: Dependency Scan (npm audit)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0
        with:
          node-version: 22
      # Gagal jika ada vulnerability tingkat HIGH atau CRITICAL
      - run: npm audit --audit-level=high
```

**Yang diharapkan:** job **merah** dengan sekitar 10 vulnerability (angka bisa berubah karena database advisory selalu diperbarui).

**Perbaikan (jalankan di lokal/Codespaces):**

```bash
npm audit                 # baca laporannya: paket apa? severity apa? ada fix?
npm audit fix             # perbaikan yang aman (tidak breaking)
npm audit --audit-level=high   # masih ada yang tersisa?
```

Ada paket yang **tidak bisa** diperbaiki otomatis karena butuh *major upgrade* (breaking change).
Baca pesan `npm audit`, naikkan versinya secara manual (`npm install nama-paket@versi`), lalu **jalankan `npm test`**
untuk memastikan aplikasi tetap jalan. Commit **`package.json` dan `package-lock.json`** sekaligus.

**Pertanyaan untuk laporan:** mengapa update dependency perlu dites lagi? Apa risikonya jika `npm audit fix --force` dijalankan tanpa dilihat?

---

## 8. Tahap C — SAST (tahap *Test*)

**Konsep:** memeriksa source code tanpa menjalankan aplikasi (slide 3.6 "Tahap Test: SAST").

Buka dan baca `.semgrep/lab-rules.yml` — satu *rule* = satu pola berbahaya yang dicari.
(Di dunia nyata biasanya dipakai kumpulan rule resmi, misalnya `p/javascript` atau `p/owasp-top-ten`.)

**Tambahkan job:**

```yaml
  # ------------------------------------------------------------
  # TAHAP C -- Test: SAST
  # ------------------------------------------------------------
  sast:
    name: SAST (Semgrep)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
      - name: Install Semgrep
        run: |
          python3 -m venv "$RUNNER_TEMP/semgrep-venv"
          "$RUNNER_TEMP/semgrep-venv/bin/pip" install --quiet "semgrep==${SEMGREP_VERSION}"
          echo "$RUNNER_TEMP/semgrep-venv/bin" >> "$GITHUB_PATH"
      - name: Jalankan SAST
        run: semgrep scan --config .semgrep/ --metrics=off --disable-version-check --error src
```

**Yang diharapkan:** job **merah** dengan **5 temuan** (2 SQL injection, XSS, hash lemah, kebocoran detail error).

**Perbaikan (petunjuk):**

| Temuan | Konsep perbaikan |
|---|---|
| SQL injection (2 lokasi di `src/app.js`) | *Parameterized query* — gunakan `allBound(db, 'SELECT ... WHERE x = ?', [nilai])`. Untuk `:id`, validasi juga bahwa nilainya angka. |
| XSS di `/welcome` | *Output encoding* — buat fungsi `escapeHtml()` dan pakai sebelum menaruh input ke HTML. |
| MD5 untuk password (`src/db.js`) | Pakai algoritma khusus password. Petunjuk: `crypto.scryptSync(password, salt, 64)` dengan **salt acak** per user, simpan sebagai `salt:hash`, bandingkan dengan `crypto.timingSafeEqual`. Login harus diubah: ambil user berdasarkan username, lalu *verifikasi* passwordnya. |
| Stack trace dikirim ke pengguna | Catat error di log server (`console.error`), kirim pesan generik ke klien. |

Setelah selesai, pastikan `npm test` tetap hijau.

**Pertanyaan untuk laporan:** SAST hanya membaca kode, tidak menjalankannya. Sebutkan satu jenis masalah
yang *mudah* ditemukan SAST dan satu yang *sulit* (petunjuk: slide DAST).

---

## 9. Tahap D — Security Gate (sebelum *Deploy*)

**Konsep:** pipeline dihentikan jika kode tidak memenuhi standar keamanan (slide 3.4).

**Tambahkan job:**

```yaml
  # ------------------------------------------------------------
  # TAHAP D -- Security gate: deploy hanya jika SEMUA pemeriksaan lolos
  # ------------------------------------------------------------
  deploy:
    name: Deploy ke Staging (simulasi)
    needs: [build-test, secret-scan, dependency-scan, sast]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Semua security gate lolos. Deploy ke staging (simulasi)."
```

`needs: [...]` adalah **security gate**: job `deploy` **tidak akan berjalan** jika salah satu job di daftar itu gagal.

**Buktikan bahwa gate-nya bekerja:**
1. Pastikan semua job hijau dan `deploy` ikut berjalan ✅ → screenshot.
2. Buat commit yang sengaja menaruh kembali sebuah API key palsu di kode.
3. Lihat bahwa `secret-scan` merah dan `deploy` **dilewati** (skipped) → screenshot.
4. Hapus kembali key tersebut sampai hijau.

---

## 10. Tantangan tambahan (poin bonus)

1. **Scanner hijau ≠ aplikasi aman.** Baca endpoint `POST /api/transfer` di `src/app.js`.
   Lakukan *threat modeling* singkat memakai pertanyaan slide 3.6: siapa yang boleh transfer? bagaimana mencegah transaksi palsu?
   Temukan **minimal 2 kelemahan logika** yang tidak dideteksi satupun tool, perbaiki, lalu tulis **security test** di `test/` yang gagal
   sebelum perbaikan dan lulus sesudahnya.
2. **Continuous Delivery.** Buat *Environment* `production` di *Settings → Environments* dengan **Required reviewers**, lalu pasang pada job `deploy`
   (`environment: production`). Apa bedanya dengan Continuous Deployment (slide 2.3 vs 2.4)?
3. **Shift right.** Aplikasi sudah mencatat login gagal ke log. Rancang aturan alert sederhana untuk "100 login gagal dalam 5 menit" (slide 1.5).

## 11. Yang dikumpulkan

1. **Link repo GitHub** Anda (Public). Dosen memeriksa tab *Actions* dan riwayat commit sebagai bukti proses merah → hijau.
2. **Laporan 2–3 halaman (PDF)**:
   - Untuk tiap tahap A–C: screenshot merah, ringkasan temuan, perbaikan yang dilakukan, screenshot hijau.
   - Kebijakan security gate Anda: temuan apa yang menghentikan pipeline dan mengapa?
   - Jawaban pertanyaan refleksi (Langkah 0, Tahap A, B, C).
   - **Refleksi security culture:** jika Anda di tim ini, siapa (developer / tester / DevOps / security team) yang seharusnya bertanggung jawab atas tiap temuan? Apa yang akan Anda ubah di kebiasaan tim agar temuan yang sama tidak terulang (feedback loop)?

## 12. Troubleshooting

| Masalah | Penyebab / solusi |
|---|---|
| `Invalid workflow file` / YAML error | Indentasi salah. Job harus sejajar dengan `build-test:`. Gunakan spasi, bukan tab. |
| `sha256sum: WARNING: 1 computed checksum did NOT match` | Nilai versi/checksum di blok `env` terubah. Salin ulang dari snippet. **Jangan** mengubahnya. |
| `npm ci` gagal: *package.json and package-lock.json are not in sync* | Jalankan `npm install` lalu commit **kedua** file. |
| Test gagal setelah memindahkan secret ke env | Test butuh nilai secret — lihat petunjuk Tahap A. |
| Tab Actions kosong / dinonaktifkan | *Settings → Actions → General* → izinkan Actions. |
| Muncul email/peringatan *secret scanning* dari GitHub | Wajar — key di repo ini palsu, tetapi ini bukti bahwa deteksi secret itu nyata. |
| Job Semgrep lama | Instalasi Semgrep sekitar 1–2 menit. Normal. |

---

*Materi praktikum ini hanya untuk mahasiswa Universitas Bunda Mulia dalam rangkaian perkuliahan.*
