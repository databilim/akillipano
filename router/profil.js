const express = require('express');
const axios = require('axios');
const vt = require('../modul/veritabani');
const pano = require('../modul/pano');
const i2c = require('../modul/i2c');
const { girisGerekli, adminGerekli } = require('../modul/yetki');

const router = express.Router();

const TIPLER = ['lamba', 'zil', 'priz', 'alarm', 'yangin'];

// Giriş yapan kullanıcının bilgileri (şifre gönderilmez)
router.get('/', async (req, res) => {
    if (!req.session.user) return res.json({ status: 0 });
    const k = await vt.kullanici.getir(req.session.user.id);
    if (!k) return req.session.destroy(() => res.json({ status: 0 }));
    res.json([k]);
});

router.get('/input', girisGerekli, async (req, res) => {
    res.json(await vt.io.listele());
});

// Buton/çıkış tanımlama (yalnızca yönetici). Yalnızca izin verilen alanlar ve doğrulanmış değerler kaydedilir.
router.post('/input', adminGerekli, async (req, res) => {
    const form = req.body || {};
    const ID = parseInt(form.ID, 10);
    if (!Number.isInteger(ID)) return res.status(400).json({ status: 0, message: 'Geçersiz kayıt' });

    const guncel = {};
    if (form.adi !== undefined) guncel.adi = String(form.adi).trim().slice(0, 60);
    if (form.tipi !== undefined) {
        if (!TIPLER.includes(form.tipi)) return res.status(400).json({ status: 0, message: 'Geçersiz tip' });
        guncel.tipi = form.tipi;
    }
    if (form.adres !== undefined) {
        const adres = parseInt(form.adres, 10);
        if (!Number.isInteger(adres) || adres < 8 || adres > 119) {
            return res.status(400).json({ status: 0, message: 'I2C adresi 8-119 arasında olmalı' });
        }
        guncel.adres = adres;
    }
    if (form.durum !== undefined) guncel.durum = form.durum == 1 ? 1 : 0;
    if (form.output !== undefined) {
        const kanallar = pano.kanallariCoz(form.output);
        if (!kanallar) {
            return res.status(400).json({ status: 0, message: 'Çıkışlar 1-16 arası kanal numaraları olmalı, örn: [6] ya da [8,9]' });
        }
        guncel.output = JSON.stringify(kanallar);
    }

    const degisen = await vt.io.guncelle(ID, guncel);
    if (!degisen) return res.status(404).json({ status: 0, message: 'Kayıt bulunamadı' });
    res.json({ status: 1, kayit: await vt.io.getir(ID) });
});

router.get('/menu', girisGerekli, async (req, res) => {
    res.json(await vt.menu.listele());
});

// I2C ve sistem durumu (arayüzdeki uyarı için)
router.get('/durum', girisGerekli, (req, res) => {
    res.json({ status: 1, i2c: i2c.durumGetir() });
});

// Hava durumu (MGM). Sonuç 10 dakika önbellekte tutulur.
const MGM_BASLIK = {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.mgm.gov.tr',
    Referer: 'https://www.mgm.gov.tr/',
};
const hdOnbellek = new Map();
router.post('/hd', girisGerekli, async (req, res) => {
    try {
        // Kullanıcının il bilgisi yoksa panoda il tanımlı ilk kullanıcınınki kullanılır
        let k = await vt.kullanici.getir(req.session.user.id);
        if (!k || !k.il) k = (await vt.kullanici.listele()).find((x) => x.il);
        if (!k) return res.json({ status: 0, message: 'Profilde il bilgisi yok' });

        const anahtar = `${k.il}/${k.ilce || ''}`;
        const onceki = hdOnbellek.get(anahtar);
        if (onceki && Date.now() - onceki.zaman < 10 * 60 * 1000) return res.json(onceki.veri);

        const merkez = await axios.get('https://servis.mgm.gov.tr/web/merkezler', {
            params: { il: k.il, ilce: k.ilce || undefined },
            headers: MGM_BASLIK,
            timeout: 10000,
        });
        const merkezVeri = Array.isArray(merkez.data) ? merkez.data[0] : merkez.data;
        const merkezId = merkezVeri && merkezVeri.merkezId;
        if (!merkezId) return res.json({ status: 0, message: 'Merkez bulunamadı' });

        const sonDurum = await axios.get('https://servis.mgm.gov.tr/web/sondurumlar', {
            params: { merkezid: merkezId },
            headers: MGM_BASLIK,
            timeout: 10000,
        });
        hdOnbellek.set(anahtar, { zaman: Date.now(), veri: sonDurum.data });
        res.json(sonDurum.data);
    } catch (e) {
        res.json({ status: 0, message: 'Hava durumu alınamadı' });
    }
});

module.exports = router;
