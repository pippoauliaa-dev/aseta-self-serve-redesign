# Panduan deploy ke aseta.id

## 1. File yang disalin

Salin dari repo ini ke root domain, pertahankan struktur folder:

```
index.html
aseta-self-serve.css
aseta-self-serve.js
assets/favicon.ico
assets/favicon-16.png
assets/favicon-32.png
assets/favicon-192.png
assets/apple-touch-icon.png
assets/logos/            (23 file)
```

Tidak perlu disalin: `aseta-assessment-rules.js`, `tests/`, `google-apps-script/`, `DEPLOY.md`.

## 2. Endpoint lead

`index.html` sudah berisi endpoint Apps Script yang aktif:

```
data-lead-endpoint="https://script.google.com/macros/s/AKfycb.../exec"
```

Tidak ada yang perlu diubah di sisi website.

## 3. Satu langkah yang tidak bisa dihindari: redeploy Apps Script

Whitelist origin ada di server Apps Script, bukan di file website. Endpoint yang
sekarang live hanya menerima `pippoauliaa-dev.github.io`; `aseta.id` ditolak
sampai Apps Script di-deploy ulang dengan `google-apps-script/Code.gs` versi ini
(sudah memuat `https://aseta.id` dan `https://www.aseta.id`).

Langkahnya, oleh pemilik project Apps Script:

1. Buka <https://script.google.com> dengan akun pemilik project.
2. Buka project yang menangani endpoint lead.
3. Ganti isi `Code.gs` dengan file `google-apps-script/Code.gs` dari repo ini.
4. Pastikan file HTML bernama `Response` berisi `google-apps-script/Response.html`.
5. **Deploy → Manage deployments → Edit (ikon pensil) → Version: New version → Deploy.**
6. Tidak perlu mengubah URL `/exec`; URL tetap sama.

Kalau tidak ada akses ke project tersebut, minta pemiliknya melakukan langkah 3–5.

## 4. Perilaku sebelum Apps Script di-update

Selama whitelist belum memuat `aseta.id`, submit form akan gagal dengan pesan
"Data belum tersimpan di Google Sheets" dan muncul tautan
**Kirim ringkasan via WhatsApp** yang sudah terisi ringkasan lead. Jadi lead
tetap bisa masuk lewat WhatsApp, tetapi belum tercatat otomatis di Sheet.

Setelah Apps Script di-deploy ulang, submit akan tersimpan otomatis dan dialog
langsung menampilkan hasil simulasi.

## 5. Yang dikirim ke Sheet

Data form (nama, email, perusahaan, jabatan, WhatsApp, persetujuan), atribusi
kampanye (`utm_*`, `fbclid`), metrik simulasi (downtime, biaya downtime, biaya
perbaikan, target pengurangan, kerugian tahunan, penghematan, estimasi
investasi, net benefit, ROI, payback), `source`, `request_id`, dan `attempt_id`.

`request_id` membuat retry idempoten: submit ulang setelah gagal tidak
menghasilkan baris ganda.
