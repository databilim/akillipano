const express = require('express');
const bcrypt = require('bcryptjs');
const vt = require('../modul/veritabani');

const router = express.Router();

// Basit kaba kuvvet koruması: aynı IP'den 5 hatalı denemeden sonra 1 dakika bekletir
const denemeler = new Map();
const MAKS_DENEME = 5;
const KILIT_MS = 60 * 1000;

router.post('/', async (req, res) => {
    const user = String((req.body && req.body.user) || '').trim();
    const parola = String((req.body && req.body.parola) || '');

    if (user === '') return res.json({ status: 0, message: 'Kullanıcı adını boş bıraktınız' });
    if (parola === '') return res.json({ status: 0, message: 'Parolayı boş bıraktınız' });

    const ip = req.ip;
    const kayit = denemeler.get(ip) || { sayi: 0, zaman: 0 };
    if (kayit.sayi >= MAKS_DENEME && Date.now() - kayit.zaman < KILIT_MS) {
        return res.status(429).json({ status: 0, message: 'Çok fazla hatalı deneme. 1 dakika sonra tekrar deneyin.' });
    }

    try {
        const k = await vt.kullanici.adIleGetir(user);
        const dogru = k && k.durum != 0 && k.password && await bcrypt.compare(parola, k.password);
        if (!dogru) {
            denemeler.set(ip, { sayi: kayit.sayi + 1, zaman: Date.now() });
            return res.json({ status: 0, message: 'Kullanıcı adı ya da şifre hatalı' });
        }
        denemeler.delete(ip);

        // Oturum sabitleme saldırısına karşı oturum kimliği yenilenir
        req.session.regenerate((err) => {
            if (err) return res.status(500).json({ status: 0, message: 'Oturum açılamadı' });
            req.session.user = { id: k.ID, user: k.user, yetki: k.yetki || 'kullanici' };
            res.json({ status: 1, kullanici: vt.kullanici.temizle(k) });
        });
    } catch (e) {
        console.error('Giriş hatası:', e.message);
        res.status(500).json({ status: 0, message: 'Sunucu hatası' });
    }
});

router.post('/cikis', (req, res) => {
    req.session.destroy(() => res.json({ status: 1 }));
});

module.exports = router;
