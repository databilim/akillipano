// Donanım olmadan (I2C simülasyon modu) uçtan uca testler: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');

const dbDosya = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pano-test-')), 'test.db');
Object.assign(process.env, {
    I2C_SIMULASYON: '1', DB_DOSYA: dbDosya, PORT: '0', SESSION_SECRET: 'test',
    ZIL_SURE_MS: '200', I2C_HATA_ESIGI: '1', BUTON_KILIT_MS: '0',
});

// Eski şemalı, düz metin şifreli bir veritabanı hazırla (gerçek panodaki gibi)
const eskiDbHazirla = () => new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbDosya);
    db.serialize(() => {
        db.run('CREATE TABLE user (ID INTEGER PRIMARY KEY AUTOINCREMENT, panoName TEXT, user TEXT, password TEXT, adres TEXT, durum INTEGER, il TEXT, ilce TEXT)');
        db.run('CREATE TABLE io (ID INTEGER PRIMARY KEY AUTOINCREMENT, hex TEXT, adres INTEGER, durum INTEGER, input INTEGER, adi TEXT, status INTEGER, output TEXT, tipi TEXT)');
        db.run("INSERT INTO user (panoName, user, password, durum) VALUES ('Ev', 'yonetici', 'eski123', 0)");
        db.run("INSERT INTO io (hex, adres, durum, input, adi, status, output, tipi) VALUES ('02ff', 10, 1, 2, 'Çocuk Odası', 1, '[6]', 'lamba')");
        db.run("INSERT INTO io (hex, adres, durum, input, adi, status, output, tipi) VALUES ('09ff', 10, 1, 9, 'Zil', 1, '[11]', 'zil')");
        db.run("INSERT INTO io (hex, adres, durum, input, adi, status, output, tipi) VALUES ('03ff', 10, 0, 3, NULL, 0, NULL, NULL)");
        db.close((err) => (err ? reject(err) : resolve()));
    });
});

let taban;
let uygulama;
let i2c;
let vt;
let pano;

const istek = async (yol, { method = 'GET', body, cerez } = {}) => {
    const r = await fetch(taban + yol, {
        method,
        headers: { 'content-type': 'application/json', ...(cerez ? { cookie: cerez } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let veri = null;
    try { veri = await r.json(); } catch (e) { /* boş */ }
    return { durum: r.status, veri, cerez: (r.headers.get('set-cookie') || '').split(';')[0] };
};

const girisYap = async (user, parola) => {
    const r = await istek('/login', { method: 'POST', body: { user, parola } });
    assert.strictEqual(r.veri.status, 1, `giriş başarısız: ${JSON.stringify(r.veri)}`);
    return r.cerez;
};

const socketAc = (cerez) => new Promise((resolve, reject) => {
    const { io } = require('socket.io-client');
    const s = io(taban, { extraHeaders: cerez ? { cookie: cerez } : {}, reconnection: false, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => { s.close(); reject(e); });
});

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => {
    await eskiDbHazirla();
    uygulama = require('../app');
    i2c = require('../modul/i2c');
    vt = require('../modul/veritabani');
    pano = require('../modul/pano');
    await uygulama.basla();
    await new Promise((r) => (uygulama.server.listening ? r() : uygulama.server.once('listening', r)));
    taban = `http://127.0.0.1:${uygulama.server.address().port}`;
});

test.after(() => {
    pano.durdur();
    uygulama.io.close();
    uygulama.server.close();
});

test('röle komutu eski protokolle aynı', () => {
    assert.strictEqual(i2c.roleKomutu(1, 1), 101);
    assert.strictEqual(i2c.roleKomutu(1, 0), 100);
    assert.strictEqual(i2c.roleKomutu(16, 1), 251);
    assert.deepStrictEqual(i2c.butonCoz('10ff'), { input: 16, hex: '10ff' });
    assert.strictEqual(i2c.butonCoz('00ff'), null);
});

test('açılışta durum yüklenir, zil kapalı başlar, şifreler bcrypt olur', async () => {
    assert.strictEqual(i2c.bus.roleler[6], 1);
    assert.strictEqual(i2c.bus.roleler[11], 0);
    assert.strictEqual((await vt.io.getir(2)).status, 0);
    const k = await vt.kullanici.sifreliGetir(1);
    assert.ok(vt.sifreHashliMi(k.password));
    assert.strictEqual(k.yetki, 'admin');
});

test('SQL injection ile giriş yapılamaz, doğru şifreyle yapılır', async () => {
    const r = await istek('/login', { method: 'POST', body: { user: '" OR 1=1 --', parola: 'x' } });
    assert.strictEqual(r.veri.status, 0);
    const cerez = await girisYap('yonetici', 'eski123');
    const profil = await istek('/profil', { cerez });
    assert.strictEqual(profil.veri[0].user, 'yonetici');
    assert.strictEqual(profil.veri[0].password, undefined);
});

test('giriş yapmamış socket röle tetikleyemez', async () => {
    await assert.rejects(socketAc(null), /yetkisiz/);
});

test('arayüzden aç/kapa: kanal veritabanından okunur', async () => {
    const cerez = await girisYap('yonetici', 'eski123');
    const s = await socketAc(cerez);
    // İstemcinin gönderdiği output dikkate alınmaz
    const cevap = await s.emitWithAck('start', JSON.stringify({ ID: 1, output: '[1,2,3]' }));
    assert.strictEqual(cevap.ok, true);
    assert.strictEqual(i2c.bus.roleler[6], 0);
    assert.strictEqual(i2c.bus.roleler[1], 0);
    assert.strictEqual((await vt.io.getir(1)).status, 0);
    s.close();
});

test('zil sunucu tarafından kendiliğinden kapanır', async () => {
    const r = await pano.degistir(2);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(i2c.bus.roleler[11], 1);
    await bekle(400);
    assert.strictEqual(i2c.bus.roleler[11], 0);
    assert.strictEqual((await vt.io.getir(2)).status, 0);
});

test('basılı tutulan buton bir kez tetikler, yeni buton tanımsız olarak eklenir', async () => {
    const once = (await vt.io.getir(1)).status;
    i2c.bus.bekleyenButon = '02ff';
    await pano.butonTuru();
    await pano.butonTuru();
    await pano.butonTuru();
    assert.strictEqual((await vt.io.getir(1)).status, once ? 0 : 1);
    i2c.bus.bekleyenButon = null;
    await pano.butonTuru();

    i2c.bus.bekleyenButon = '05ff';
    await pano.butonTuru();
    i2c.bus.bekleyenButon = null;
    await pano.butonTuru();
    const yeni = await vt.io.hexIleGetir('05ff');
    assert.ok(yeni);
    assert.strictEqual(yeni.durum, 0);
});

test('I2C koparsa veritabanı güncellenmez ve arayüze uyarı gider', async () => {
    const cerez = await girisYap('yonetici', 'eski123');
    const s = await socketAc(cerez);
    const durumlar = [];
    s.on('sistemDurumu', (d) => durumlar.push(d.i2c));
    await bekle(50);
    const once = (await vt.io.getir(1)).status;

    i2c.bus.bagli = false;
    const cevap = await s.emitWithAck('start', { ID: 1 });
    assert.strictEqual(cevap.ok, false);
    assert.strictEqual((await vt.io.getir(1)).status, once);
    await bekle(50);
    assert.ok(durumlar.some((d) => d.roleKarti === false), 'röle kartı uyarısı gelmedi');

    i2c.bus.bagli = true;
    i2c.roleKartiniYokla();
    await bekle(50);
    assert.strictEqual(durumlar[durumlar.length - 1].roleKarti, true);
    s.close();
});

test('kullanıcı yönetimi ve yetkiler', async () => {
    const admin = await girisYap('yonetici', 'eski123');

    // Yönetici kullanıcı ekler
    let r = await istek('/kullanici', { method: 'POST', cerez: admin, body: { user: 'ayse', password: 'kisa' } });
    assert.strictEqual(r.durum, 400);
    r = await istek('/kullanici', { method: 'POST', cerez: admin, body: { user: 'ayse', password: 'ayse1234' } });
    assert.strictEqual(r.veri.status, 1);
    assert.strictEqual(r.veri.kullanici.yetki, 'kullanici');
    const ayseID = r.veri.kullanici.ID;

    const ayse = await girisYap('ayse', 'ayse1234');

    // Kullanıcı aç/kapa yapabilir
    const s = await socketAc(ayse);
    assert.strictEqual((await s.emitWithAck('start', { ID: 1 })).ok, true);
    s.close();

    // Kullanıcı ayar değiştiremez, kullanıcı ekleyemez, kendini yönetici yapamaz
    assert.strictEqual((await istek('/profil/input', { method: 'POST', cerez: ayse, body: { ID: 3, durum: 1, output: '[3]' } })).durum, 403);
    assert.strictEqual((await istek('/kullanici', { method: 'POST', cerez: ayse, body: { user: 'x', password: 'xxxxxxx' } })).durum, 403);
    assert.strictEqual((await istek(`/kullanici/${ayseID}`, { method: 'PUT', cerez: ayse, body: { yetki: 'admin' } })).durum, 403);

    // Kendi şifresini değiştirebilir
    r = await istek('/kullanici/sifre', { method: 'POST', cerez: ayse, body: { eskiSifre: 'yanlis', yeniSifre: 'yeni12345' } });
    assert.strictEqual(r.durum, 400);
    r = await istek('/kullanici/sifre', { method: 'POST', cerez: ayse, body: { eskiSifre: 'ayse1234', yeniSifre: 'yeni12345' } });
    assert.strictEqual(r.veri.status, 1);
    await girisYap('ayse', 'yeni12345');

    // Yönetici buton tanımlar; geçersiz çıkış reddedilir
    r = await istek('/profil/input', { method: 'POST', cerez: admin, body: { ID: 3, adi: 'Salon', tipi: 'lamba', durum: 1, output: '[99]' } });
    assert.strictEqual(r.durum, 400);
    r = await istek('/profil/input', { method: 'POST', cerez: admin, body: { ID: 3, adi: 'Salon', tipi: 'lamba', durum: 1, output: '[7]' } });
    assert.strictEqual(r.veri.kayit.output, '[7]');

    // Son yöneticinin yetkisi düşürülemez
    r = await istek('/kullanici/1', { method: 'PUT', cerez: admin, body: { yetki: 'kullanici' } });
    assert.strictEqual(r.durum, 400);

    // Pasif yapılan kullanıcının oturumu hemen geçersiz olur
    r = await istek(`/kullanici/${ayseID}`, { method: 'PUT', cerez: admin, body: { durum: 0 } });
    assert.strictEqual(r.veri.kullanici.durum, 0);
    assert.strictEqual((await istek('/profil/input', { cerez: ayse })).durum, 401);

    // Silme
    r = await istek(`/kullanici/${ayseID}`, { method: 'DELETE', cerez: admin });
    assert.strictEqual(r.veri.status, 1);
    assert.strictEqual((await istek('/kullanici/1', { method: 'DELETE', cerez: admin })).durum, 400);
});

test('buton ekleme, düzenleme, sıralama ve silme (yönetici)', async () => {
    const admin = await girisYap('yonetici', 'eski123');

    // Yalnızca ekrandan kontrol edilen yeni kayıt, sıra 1
    let r = await istek('/profil/input/yeni', { method: 'POST', cerez: admin, body: { adi: 'Bahçe', tipi: 'lamba', output: '[12]', buton: 0, sira: 1 } });
    assert.strictEqual(r.veri.status, 1);
    const bahce = r.veri.kayit;
    assert.strictEqual(bahce.hex, null);
    assert.strictEqual(bahce.durum, 1);

    // Sıra numarasına göre listelenir
    const liste = (await istek('/profil/input', { cerez: admin })).veri;
    assert.strictEqual(liste[0].ID, bahce.ID);

    // Aynı duvar butonu iki kayda verilemez (02ff = Çocuk Odası)
    r = await istek('/profil/input', { method: 'POST', cerez: admin, body: { ID: bahce.ID, buton: 2 } });
    assert.strictEqual(r.durum, 409);
    r = await istek('/profil/input', { method: 'POST', cerez: admin, body: { ID: bahce.ID, buton: 4, sira: '' } });
    assert.strictEqual(r.veri.kayit.hex, '04ff');
    assert.strictEqual(r.veri.kayit.sira, null);

    // Duvar butonu 4'e basınca bu kayıt çalışır
    i2c.bus.bekleyenButon = '04ff';
    await pano.butonTuru();
    i2c.bus.bekleyenButon = null;
    await pano.butonTuru();
    assert.strictEqual((await vt.io.getir(bahce.ID)).status, 1);

    // Kullanıcı silemez, yönetici siler
    await istek('/kullanici', { method: 'POST', cerez: admin, body: { user: 'mehmet', password: 'mehmet123' } });
    const kullanici = await girisYap('mehmet', 'mehmet123');
    assert.strictEqual((await istek(`/profil/input/${bahce.ID}`, { method: 'DELETE', cerez: kullanici })).durum, 403);
    assert.strictEqual((await istek('/profil/input/yeni', { method: 'POST', cerez: kullanici, body: { adi: 'x', output: '[1]' } })).durum, 403);
    assert.strictEqual((await istek(`/profil/input/${bahce.ID}`, { method: 'DELETE', cerez: admin })).veri.status, 1);
    assert.strictEqual(await vt.io.getir(bahce.ID), undefined);
});

test('favoriler kullanıcıya özeldir', async () => {
    const admin = await girisYap('yonetici', 'eski123');
    let r = await istek('/profil/favori/1', { method: 'POST', cerez: admin, body: { favori: true } });
    assert.deepStrictEqual(r.veri.favoriler, [1]);
    const kullanici = await girisYap('mehmet', 'mehmet123');
    assert.deepStrictEqual((await istek('/profil/favori', { cerez: kullanici })).veri.favoriler, []);
    r = await istek('/profil/favori/1', { method: 'POST', cerez: admin, body: { favori: false } });
    assert.deepStrictEqual(r.veri.favoriler, []);
    assert.strictEqual((await istek('/profil/favori/999', { method: 'POST', cerez: admin, body: {} })).durum, 404);
});
