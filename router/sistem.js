// Sistem bilgisi ve uzaktan güncelleme (yönetici)
//   GET  /sistem/surum      çalışan sürüm
//   GET  /sistem/denetle    GitHub'da yeni değişiklik var mı
//   POST /sistem/guncelle   güncelle ve yeniden başlat
const express = require('express');
const guncelleme = require('../modul/guncelleme');
const { adminGerekli } = require('../modul/yetki');

const router = express.Router();
router.use(adminGerekli);

const hata = (res, e) => res.status(500).json({ status: 0, message: e.message });

router.get('/surum', async (req, res) => {
    try { res.json({ status: 1, surum: await guncelleme.surum() }); } catch (e) { hata(res, e); }
});

router.get('/denetle', async (req, res) => {
    try { res.json({ status: 1, ...(await guncelleme.denetle()) }); } catch (e) { hata(res, e); }
});

router.post('/guncelle', async (req, res) => {
    try {
        const sonuc = await guncelleme.guncelle();
        console.log('Güncelleme:', sonuc.kayit.join(' | '));
        res.json({ status: 1, ...sonuc });
    } catch (e) {
        console.error('Güncelleme hatası:', e.message);
        hata(res, e);
    }
});

module.exports = router;
