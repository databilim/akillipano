// Uygulama ayarları. Değerler .env dosyasından ya da ortam değişkenlerinden okunur.
// Örnek için .env.example dosyasına bakın.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const sayi = (deger, varsayilan) => {
    const n = parseInt(deger, 10);
    return Number.isFinite(n) ? n : varsayilan;
};

const evet = (deger, varsayilan) => {
    if (deger === undefined || deger === '') return varsayilan;
    return ['1', 'true', 'evet', 'yes', 'on'].includes(String(deger).toLowerCase());
};

// Oturum anahtarı verilmemişse bir kez üretip dosyaya yazar, sonraki açılışlarda aynısını kullanır.
const oturumAnahtari = () => {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    const dosya = path.join(__dirname, '..', '.oturum-anahtari');
    try {
        return fs.readFileSync(dosya, 'utf8').trim();
    } catch (e) {
        const yeni = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(dosya, yeni, { mode: 0o600 });
        return yeni;
    }
};

module.exports = {
    port: sayi(process.env.PORT, 80),
    oturumAnahtari: oturumAnahtari(),
    veritabani: process.env.DB_DOSYA || path.join(__dirname, '..', 'akillipano.db'),

    i2c: {
        bus: sayi(process.env.I2C_BUS, 1),
        roleAdres: sayi(process.env.ROLE_ADRES, 100),   // röleleri süren Arduino
        butonAdres: sayi(process.env.BUTON_ADRES, 10),  // butonları okuyan Arduino
        okumaAraligiMs: sayi(process.env.BUTON_OKUMA_MS, 100),
        kontrolAraligiMs: sayi(process.env.I2C_KONTROL_MS, 5000),
        hataEsigi: sayi(process.env.I2C_HATA_ESIGI, 3),  // art arda bu kadar hata olursa "bağlantı yok" sayılır
        simulasyon: evet(process.env.I2C_SIMULASYON, false), // donanım olmadan denemek için
    },

    // Cloudflare arkasında çalışırken gerçek ziyaretçi IP'si CF-Connecting-IP başlığından alınır
    // (hatalı giriş sınırı herkes için tek IP sayılmasın diye). Doğrudan internete açıksanız 0 bırakın.
    cloudflare: evet(process.env.CLOUDFLARE, false),

    kanalSayisi: 16,
    zilSuresiMs: sayi(process.env.ZIL_SURE_MS, 3000),
    butonKilitMs: sayi(process.env.BUTON_KILIT_MS, 300),
    acilistaDurumuYukle: evet(process.env.ACILISTA_DURUMU_YUKLE, true),

    // Zil fotoğrafları bu klasörde saklanır, ZIL_KAYIT_GUN günden eskiler silinir
    kayitKlasoru: process.env.KAYIT_KLASORU || path.join(__dirname, '..', 'kayitlar'),
    zilKayitGun: sayi(process.env.ZIL_KAYIT_GUN, 60),
    kamera: {
        genislik: sayi(process.env.KAMERA_GENISLIK, 640), // canlı görüntü genişliği (Pi'yi yormamak için küçük)
        fps: sayi(process.env.KAMERA_FPS, 5),
    },
};
