const express = require('express');
const axios = require('axios');
const vt = require('../modul/veritabani');
const pano = require('../modul/pano');
const i2c = require('../modul/i2c');
const ayarlar = require('../modul/ayarlar');
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

// Buton/çıkış kayıtlarının formunu doğrular. Hata varsa {hata}, yoksa {veri} döner.
//   buton: duvar butonu numarası 1-16, boş ya da 0 = yalnızca ekrandan kontrol edilen kayıt
const formuDogrula = async (form, ID) => {
    const veri = {};
    if (form.adi !== undefined) {
        veri.adi = String(form.adi).trim().slice(0, 60);
        if (!veri.adi && form.durum == 1) return { hata: 'Ad boş olamaz' };
    }
    if (form.tipi !== undefined) {
        if (!TIPLER.includes(form.tipi)) return { hata: 'Geçersiz tip' };
        veri.tipi = form.tipi;
    }
    if (form.adres !== undefined && form.adres !== '') {
        const adres = parseInt(form.adres, 10);
        if (!Number.isInteger(adres) || adres < 8 || adres > 119) return { hata: 'I2C adresi 8-119 arasında olmalı' };
        veri.adres = adres;
    }
    if (form.durum !== undefined) veri.durum = form.durum == 1 ? 1 : 0;
    if (form.sira !== undefined) {
        const sira = form.sira === '' || form.sira === null ? null : parseInt(form.sira, 10);
        if (sira !== null && !(Number.isInteger(sira) && sira >= 0 && sira <= 9999)) return { hata: 'Sıra numarası 0-9999 arası olmalı' };
        veri.sira = sira;
    }
    if (form.output !== undefined) {
        const kanallar = pano.kanallariCoz(form.output);
        if (!kanallar) return { hata: 'Çıkışlar 1-16 arası kanal numaraları olmalı, örn: [6] ya da [8,9]' };
        veri.output = JSON.stringify(kanallar);
    }
    if (form.buton !== undefined) {
        const no = form.buton === '' || form.buton === null ? 0 : parseInt(form.buton, 10);
        if (!Number.isInteger(no) || no < 0 || no > 16) return { hata: 'Duvar butonu 1-16 arası olmalı' };
        if (no === 0) {
            veri.hex = null;
            veri.input = null;
        } else {
            veri.hex = `${no.toString(16).padStart(2, '0')}ff`;
            veri.input = no;
            const baska = await vt.io.hexIleGetir(veri.hex);
            if (baska && baska.ID !== ID) {
                return { hata: `${no} numaralı duvar butonu zaten "${baska.adi || 'tanımsız kayıt'}" için kullanılıyor`, kod: 409 };
            }
        }
    }
    if (veri.durum === 1 && form.output === undefined) {
        const mevcut = ID ? await vt.io.getir(ID) : null;
        if (!mevcut || !pano.kanallariCoz(mevcut.output)) return { hata: 'Etkin kayıt için çıkış (röle kanalı) girin' };
    }
    return { veri };
};

// Buton/çıkış güncelleme (yalnızca yönetici)
router.post('/input', adminGerekli, async (req, res) => {
    const form = req.body || {};
    const ID = parseInt(form.ID, 10);
    if (!Number.isInteger(ID)) return res.status(400).json({ status: 0, message: 'Geçersiz kayıt' });
    if (!(await vt.io.getir(ID))) return res.status(404).json({ status: 0, message: 'Kayıt bulunamadı' });
    const { veri, hata, kod } = await formuDogrula(form, ID);
    if (hata) return res.status(kod || 400).json({ status: 0, message: hata });
    await vt.io.guncelle(ID, veri);
    res.json({ status: 1, kayit: await vt.io.getir(ID) });
});

// Yeni kayıt (duvar butonuna bağlı ya da yalnızca ekrandan kontrol edilen)
router.post('/input/yeni', adminGerekli, async (req, res) => {
    const form = { durum: 1, ...(req.body || {}) };
    if (form.output === undefined) return res.status(400).json({ status: 0, message: 'Çıkış (röle kanalı) girin' });
    const { veri, hata, kod } = await formuDogrula(form, null);
    if (hata) return res.status(kod || 400).json({ status: 0, message: hata });
    const sonuc = await vt.io.yeni({ adres: ayarlar.i2c.butonAdres, status: 0, ...veri });
    res.json({ status: 1, kayit: await vt.io.getir(sonuc.id) });
});

router.delete('/input/:id', adminGerekli, async (req, res) => {
    const ID = parseInt(req.params.id, 10);
    const kayit = await vt.io.getir(ID);
    if (!kayit) return res.status(404).json({ status: 0, message: 'Kayıt bulunamadı' });
    await vt.io.sil(ID);
    res.json({ status: 1 });
});

// Favoriler (her kullanıcı kendi favorilerini seçer)
router.get('/favori', girisGerekli, async (req, res) => {
    res.json({ status: 1, favoriler: await vt.favori.listele(req.session.user.id) });
});

router.post('/favori/:id', girisGerekli, async (req, res) => {
    const ID = parseInt(req.params.id, 10);
    if (!(await vt.io.getir(ID))) return res.status(404).json({ status: 0, message: 'Kayıt bulunamadı' });
    const ekle = !(req.body && req.body.favori === false);
    if (ekle) await vt.favori.ekle(req.session.user.id, ID);
    else await vt.favori.cikar(req.session.user.id, ID);
    res.json({ status: 1, favoriler: await vt.favori.listele(req.session.user.id) });
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
