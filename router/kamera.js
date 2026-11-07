// Kamera ayarları, test fotoğrafı ve zil fotoğrafları
//   GET    /kamera/durum             kamera tanımlı mı (herkes)
//   GET    /kamera/ayar              ayarlar (yönetici, şifre gönderilmez)
//   POST   /kamera/ayar              ayarları kaydet (yönetici)
//   POST   /kamera/test              anlık fotoğraf çekip döndürür (yönetici)
//   GET    /kamera/zil?tarih=GG      zil fotoğrafları listesi (herkes), tarih YYYY-AA-GG
//   GET    /kamera/zil/:id/resim     fotoğraf (herkes)
//   DELETE /kamera/zil/:id           fotoğraf sil (yönetici)
const express = require('express');
const kamera = require('../modul/kamera');
const vt = require('../modul/veritabani');
const { girisGerekli, adminGerekli } = require('../modul/yetki');

const router = express.Router();
router.use(girisGerekli);

router.get('/durum', async (req, res) => {
    res.json({ status: 1, tanimli: await kamera.tanimliMi(), canli: { hata: kamera.canli.sonHata } });
});

router.get('/ayar', adminGerekli, async (req, res) => {
    const { kamera_sifre: sifre, ...ayar } = await kamera.ayarGetir();
    res.json({ status: 1, ayar: { ...ayar, sifreVar: !!sifre } });
});

router.post('/ayar', adminGerekli, async (req, res) => {
    const b = req.body || {};
    const yeni = {};
    if (b.kamera_ip !== undefined) {
        const ip = String(b.kamera_ip).trim();
        if (ip && !/^[A-Za-z0-9.\-]+$/.test(ip)) return res.status(400).json({ status: 0, message: 'IP adresi geçersiz' });
        yeni.kamera_ip = ip;
    }
    for (const alan of ['kamera_rtsp_port', 'kamera_onvif_port']) {
        if (b[alan] !== undefined && b[alan] !== '') {
            const port = parseInt(b[alan], 10);
            if (!(port > 0 && port < 65536)) return res.status(400).json({ status: 0, message: 'Port 1-65535 arasında olmalı' });
            yeni[alan] = String(port);
        }
    }
    if (b.kamera_kullanici !== undefined) yeni.kamera_kullanici = String(b.kamera_kullanici).trim();
    // Şifre alanı boş bırakılırsa mevcut şifre korunur
    if (b.kamera_sifre) yeni.kamera_sifre = String(b.kamera_sifre);
    if (b.sifreyiSil) yeni.kamera_sifre = '';
    if (b.kamera_rtsp_yol !== undefined) {
        const yol = String(b.kamera_rtsp_yol).trim();
        if (yol.includes('://') && !/^rtsp:\/\//i.test(yol)) return res.status(400).json({ status: 0, message: 'Tam adres rtsp:// ile başlamalı' });
        yeni.kamera_rtsp_yol = yol;
    }
    await kamera.ayarKaydet(yeni);
    res.json({ status: 1 });
});

router.post('/test', adminGerekli, async (req, res) => {
    try {
        const { resim, kaynak } = await kamera.fotografCek();
        res.set('X-Kaynak', kaynak).type('image/jpeg').send(resim);
    } catch (e) {
        res.status(502).json({ status: 0, message: e.message });
    }
});

// Seçilen günün (Pi'nin saat dilimine göre) zil fotoğrafları
router.get('/zil', async (req, res) => {
    const tarih = String(req.query.tarih || '');
    let baslangic;
    let bitis;
    if (/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
        const gun = new Date(`${tarih}T00:00:00`);
        baslangic = gun.toISOString();
        bitis = new Date(gun.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    res.json({ status: 1, kayitlar: await vt.zilKayit.listele({ baslangic, bitis, limit }) });
});

router.get('/zil/:id/resim', async (req, res) => {
    const k = await vt.zilKayit.getir(parseInt(req.params.id, 10));
    if (!k) return res.status(404).end();
    res.sendFile(kamera.zilResimYolu(k), { headers: { 'Cache-Control': 'private, max-age=86400' } }, (err) => {
        if (err && !res.headersSent) res.status(404).end();
    });
});

router.delete('/zil/:id', adminGerekli, async (req, res) => {
    const k = await vt.zilKayit.getir(parseInt(req.params.id, 10));
    if (!k) return res.status(404).json({ status: 0, message: 'Kayıt bulunamadı' });
    await kamera.zilKaydiSil(k);
    res.json({ status: 1 });
});

module.exports = router;
