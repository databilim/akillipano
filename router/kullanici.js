// Kullanıcı yönetimi
//   GET    /kullanici            yönetici: tüm kullanıcılar, diğerleri: yalnızca kendisi
//   POST   /kullanici            yeni kullanıcı (yönetici)
//   PUT    /kullanici/:id        bilgileri güncelle (yönetici)
//   POST   /kullanici/sifre      kendi şifresini değiştir (herkes, eski şifre gerekir)
//
// Yetkiler: "admin" (yönetici) her şeyi yapar. "kullanici" yalnızca lambaları/prizleri
// aç-kapa yapabilir ve kendi şifresini değiştirebilir.
//   POST   /kullanici/:id/sifre  başka kullanıcının şifresini sıfırla (yönetici)
//   DELETE /kullanici/:id        kullanıcı sil (yönetici, kendini silemez)
const express = require('express');
const bcrypt = require('bcryptjs');
const vt = require('../modul/veritabani');
const { girisGerekli, adminGerekli } = require('../modul/yetki');

const router = express.Router();
router.use(girisGerekli);

const MIN_SIFRE = 6;
const sifreKontrol = (sifre) => {
    if (typeof sifre !== 'string' || sifre.length < MIN_SIFRE) return `Şifre en az ${MIN_SIFRE} karakter olmalı`;
    if (sifre.length > 72) return 'Şifre en fazla 72 karakter olabilir';
    return null;
};
const adKontrol = (ad) => (typeof ad === 'string' && /^[A-Za-z0-9_.\-çğıöşüÇĞİÖŞÜ]{3,32}$/.test(ad)
    ? null : 'Kullanıcı adı 3-32 karakter olmalı, boşluk içermemeli');

const yonetici = (req) => req.session.user.yetki === 'admin';

// Formdan gelen profil alanları
const profilAlanlari = (body) => {
    const alanlar = {};
    for (const a of ['panoName', 'adres', 'il', 'ilce']) {
        if (body[a] !== undefined) alanlar[a] = String(body[a]).trim().slice(0, 100);
    }
    return alanlar;
};

const yoneticiSayisi = async () => (await vt.kullanici.listele())
    .filter((k) => k.yetki === 'admin' && k.durum != 0).length;

router.get('/', async (req, res) => {
    if (yonetici(req)) return res.json({ status: 1, kullanicilar: await vt.kullanici.listele() });
    res.json({ status: 1, kullanicilar: [await vt.kullanici.getir(req.session.user.id)] });
});

router.get('/ben', async (req, res) => {
    res.json({ status: 1, kullanici: await vt.kullanici.getir(req.session.user.id) });
});

router.post('/', adminGerekli, async (req, res) => {
    const body = req.body || {};
    const user = String(body.user || '').trim();
    const hata = adKontrol(user) || sifreKontrol(body.password);
    if (hata) return res.status(400).json({ status: 0, message: hata });
    if (await vt.kullanici.adIleGetir(user)) {
        return res.status(409).json({ status: 0, message: 'Bu kullanıcı adı zaten var' });
    }
    const sonuc = await vt.kullanici.ekle({
        ...profilAlanlari(body),
        user,
        password: await bcrypt.hash(body.password, 10),
        yetki: body.yetki === 'admin' ? 'admin' : 'kullanici',
        durum: body.durum == 0 ? 0 : 1,
    });
    res.json({ status: 1, kullanici: await vt.kullanici.getir(sonuc.id) });
});

router.put('/:id', adminGerekli, async (req, res) => {
    const ID = parseInt(req.params.id, 10);
    const kendisi = ID === req.session.user.id;

    const mevcut = await vt.kullanici.getir(ID);
    if (!mevcut) return res.status(404).json({ status: 0, message: 'Kullanıcı bulunamadı' });

    const body = req.body || {};
    const guncel = profilAlanlari(body);

    if (body.user !== undefined && body.user !== mevcut.user) {
        const user = String(body.user).trim();
        const hata = adKontrol(user);
        if (hata) return res.status(400).json({ status: 0, message: hata });
        if (await vt.kullanici.adIleGetir(user)) {
            return res.status(409).json({ status: 0, message: 'Bu kullanıcı adı zaten var' });
        }
        guncel.user = user;
    }

    {
        if (body.yetki !== undefined) guncel.yetki = body.yetki === 'admin' ? 'admin' : 'kullanici';
        if (body.durum !== undefined) guncel.durum = body.durum == 0 ? 0 : 1;
        const yetkiDusuyor = mevcut.yetki === 'admin' && (guncel.yetki === 'kullanici' || guncel.durum === 0);
        if (yetkiDusuyor && await yoneticiSayisi() <= 1) {
            return res.status(400).json({ status: 0, message: 'Son yöneticinin yetkisi kaldırılamaz' });
        }
    }

    await vt.kullanici.guncelle(ID, guncel);
    if (kendisi) {
        if (guncel.user) req.session.user.user = guncel.user;
        if (guncel.yetki) req.session.user.yetki = guncel.yetki;
    }
    res.json({ status: 1, kullanici: await vt.kullanici.getir(ID) });
});

router.post('/sifre', async (req, res) => {
    const { eskiSifre, yeniSifre } = req.body || {};
    const hata = sifreKontrol(yeniSifre);
    if (hata) return res.status(400).json({ status: 0, message: hata });
    const k = await vt.kullanici.sifreliGetir(req.session.user.id);
    if (!k || !(await bcrypt.compare(String(eskiSifre || ''), k.password || ''))) {
        return res.status(400).json({ status: 0, message: 'Mevcut şifre hatalı' });
    }
    await vt.kullanici.guncelle(k.ID, { password: await bcrypt.hash(yeniSifre, 10) });
    res.json({ status: 1, message: 'Şifreniz değiştirildi' });
});

router.post('/:id/sifre', adminGerekli, async (req, res) => {
    const ID = parseInt(req.params.id, 10);
    const hata = sifreKontrol((req.body || {}).yeniSifre);
    if (hata) return res.status(400).json({ status: 0, message: hata });
    const degisen = await vt.kullanici.guncelle(ID, { password: await bcrypt.hash(req.body.yeniSifre, 10) });
    if (!degisen) return res.status(404).json({ status: 0, message: 'Kullanıcı bulunamadı' });
    res.json({ status: 1, message: 'Şifre sıfırlandı' });
});

router.delete('/:id', adminGerekli, async (req, res) => {
    const ID = parseInt(req.params.id, 10);
    if (ID === req.session.user.id) return res.status(400).json({ status: 0, message: 'Kendi hesabınızı silemezsiniz' });
    const k = await vt.kullanici.getir(ID);
    if (!k) return res.status(404).json({ status: 0, message: 'Kullanıcı bulunamadı' });
    await vt.kullanici.sil(ID);
    res.json({ status: 1 });
});

module.exports = router;
