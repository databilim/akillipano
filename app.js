const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const { Server } = require('socket.io');

const ayarlar = require('./modul/ayarlar');
const vt = require('./modul/veritabani');
const i2c = require('./modul/i2c');
const pano = require('./modul/pano');
const kamera = require('./modul/kamera');
const { oturumuDogrula } = require('./modul/yetki');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const oturum = session({
    name: 'pano.sid',
    secret: ayarlar.oturumAnahtari,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
});

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(oturum);

app.use('/login', require('./router/login'));
app.use('/profil', require('./router/profil'));
app.use('/kullanici', require('./router/kullanici'));
app.use('/kamera', require('./router/kamera'));
app.use('/sistem', require('./router/sistem'));

// Beklenmeyen hatalar sunucuyu durdurmaz, istemciye düzgün yanıt döner
app.use((err, req, res, next) => {
    console.error('İstek hatası:', err);
    res.status(500).json({ status: 0, message: 'Sunucu hatası' });
});

// Socket.IO aynı oturumu kullanır: giriş yapmamış biri röle tetikleyemez
io.engine.use(oturum);
io.use(async (socket, next) => {
    try {
        if (await oturumuDogrula(socket.request.session)) return next();
    } catch (e) {
        console.error('Socket oturum hatası:', e.message);
    }
    next(new Error('yetkisiz'));
});

io.on('connection', (socket) => {
    socket.emit('sistemDurumu', { i2c: i2c.durumGetir() });

    // Canlı kamera: yalnızca izleyen varken ffmpeg çalışır
    socket.on('kameraIzle', () => {
        socket.join('kamera');
        kamera.canli.ekle(socket.id);
        if (kamera.canli.sonHata) socket.emit('kameraDurum', { calisiyor: false, hata: kamera.canli.sonHata });
    });
    socket.on('kameraBirak', () => {
        socket.leave('kamera');
        kamera.canli.cikar(socket.id);
    });
    socket.on('disconnect', () => kamera.canli.cikar(socket.id));

    // İstemci yalnızca kaydın ID'sini gönderir; hangi rölenin tetikleneceği veritabanından okunur.
    // Eski arayüzle uyum için JSON metin ya da nesne kabul edilir.
    socket.on('start', async (veri, cevap) => {
        const yanit = typeof cevap === 'function' ? cevap : () => {};
        try {
            if (!(await oturumuDogrula(socket.request.session))) {
                yanit({ ok: false, hata: 'Oturum süresi doldu' });
                return socket.disconnect(true);
            }
            const obj = typeof veri === 'string' ? JSON.parse(veri) : veri;
            const ID = parseInt(obj && obj.ID, 10);
            if (!Number.isInteger(ID)) return yanit({ ok: false, hata: 'Geçersiz istek' });
            const sonuc = await pano.degistir(ID);
            if (!sonuc.ok) socket.emit('hata', { ID, mesaj: sonuc.hata });
            yanit({ ok: sonuc.ok, hata: sonuc.hata });
        } catch (e) {
            yanit({ ok: false, hata: 'Geçersiz istek' });
        }
    });
});

pano.olaylar.on('input', (kayit) => io.emit('input', kayit));
pano.olaylar.on('hata', (h) => io.emit('hata', h));
i2c.on('durum', (durum) => io.emit('sistemDurumu', { i2c: durum }));

// Zile basılınca (duvar butonu ya da ekran) kameradan fotoğraf alınır
pano.olaylar.on('zilCaldi', (kayit) => kamera.zilFotografi(kayit.adi));
kamera.olaylar.on('zilFotografi', (k) => io.emit('zilFotografi', k));
kamera.olaylar.on('hata', (h) => io.emit('hata', h));
// Kareler yavaş bağlantılı istemcilerde birikmesin diye "volatile" gönderilir
kamera.olaylar.on('kare', (kare) => io.to('kamera').volatile.emit('kameraKare', kare));
kamera.olaylar.on('canliDurum', (d) => io.to('kamera').emit('kameraDurum', d));

process.on('unhandledRejection', (e) => console.error('Yakalanmamış hata:', e));

const basla = async () => {
    await vt.hazir;
    await pano.baslat();
    server.listen(ayarlar.port, () => {
        console.log(`Sunucu ${ayarlar.port} numaralı portta başlatıldı${ayarlar.i2c.simulasyon ? ' (I2C simülasyon modu)' : ''}`);
    });
};

if (require.main === module) {
    basla().catch((e) => {
        console.error('Başlatılamadı:', e);
        process.exit(1);
    });
}

module.exports = { app, server, io, basla };
