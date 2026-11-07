// SQLite erişimi. Tüm sorgular parametreli (?) yazılır; tablo ve sütun adları
// yalnızca aşağıdaki izin listelerinden gelir, kullanıcıdan gelen veri SQL'e eklenmez.
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const ayarlar = require('./ayarlar');

const db = new sqlite3.Database(ayarlar.veritabani);

const calistir = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err); else resolve({ id: this.lastID, degisen: this.changes });
    });
});
const hepsi = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const tek = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

// Güncellenebilecek sütunlar (izin listesi)
const IO_SUTUNLAR = ['adi', 'tipi', 'adres', 'durum', 'output', 'status', 'input', 'hex'];
const KULLANICI_SUTUNLAR = ['panoName', 'user', 'password', 'adres', 'durum', 'il', 'ilce', 'yetki'];

const guncelle = async (tablo, izinliler, ID, obj) => {
    const keys = Object.keys(obj).filter((k) => izinliler.includes(k));
    if (keys.length === 0) return 0;
    const sql = `UPDATE ${tablo} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ID = ?`;
    const sonuc = await calistir(sql, [...keys.map((k) => obj[k]), ID]);
    return sonuc.degisen;
};

const sutunVarMi = async (tablo, sutun) => {
    const sutunlar = await hepsi(`PRAGMA table_info(${tablo})`);
    return sutunlar.some((s) => s.name === sutun);
};

const sifreHashliMi = (sifre) => typeof sifre === 'string' && /^\$2[aby]\$\d{2}\$/.test(sifre);

const hazirla = async () => {
    await calistir(`CREATE TABLE IF NOT EXISTS user (
        ID INTEGER PRIMARY KEY AUTOINCREMENT, panoName TEXT, user TEXT, password TEXT,
        adres TEXT, durum INTEGER, il TEXT, ilce TEXT)`);
    await calistir(`CREATE TABLE IF NOT EXISTS io (
        ID INTEGER PRIMARY KEY AUTOINCREMENT, hex TEXT, adres INTEGER, durum INTEGER,
        input INTEGER, adi TEXT, status INTEGER, output TEXT, tipi TEXT)`);
    await calistir('CREATE TABLE IF NOT EXISTS ayar (anahtar TEXT PRIMARY KEY, deger TEXT)');
    await calistir(`CREATE TABLE IF NOT EXISTS zil_kayit (
        ID INTEGER PRIMARY KEY AUTOINCREMENT, zaman TEXT, dosya TEXT, kaynak TEXT, adi TEXT)`);
    await calistir('CREATE INDEX IF NOT EXISTS zil_kayit_zaman ON zil_kayit (zaman)');
    await calistir(`CREATE TABLE IF NOT EXISTS menu (
        ID INTEGER PRIMARY KEY, menuadi TEXT, url TEXT, durum INTEGER, icon TEXT)`);

    // Eski veritabanlarında olmayan sütunlar
    for (const [sutun, tip] of [['il', 'TEXT'], ['ilce', 'TEXT'], ['yetki', "TEXT DEFAULT 'kullanici'"]]) {
        if (!(await sutunVarMi('user', sutun))) {
            await calistir(`ALTER TABLE user ADD COLUMN ${sutun} ${tip}`);
            // yetki sütunu ilk kez ekleniyorsa (eski sürümden geçiş) mevcut kullanıcılar yönetici olur.
            // Eski sürümde kullanıcıların "durum" alanı kullanılmıyordu (0 olabiliyordu), artık
            // 0 = pasif anlamına geldiği için mevcut kullanıcılar aktif yapılır.
            if (sutun === 'yetki') await calistir("UPDATE user SET yetki = 'admin', durum = 1");
        }
    }

    // Düz metin saklanan eski şifreleri bcrypt ile şifrele
    const kullanicilar = await hepsi('SELECT ID, password FROM user');
    for (const k of kullanicilar) {
        if (k.password && !sifreHashliMi(k.password)) {
            await calistir('UPDATE user SET password = ? WHERE ID = ?', [await bcrypt.hash(k.password, 10), k.ID]);
            console.log(`Kullanıcı ${k.ID}: düz metin şifre bcrypt ile şifrelendi`);
        }
    }

    // Hiç kullanıcı yoksa ilk kurulum için varsayılan yönetici oluştur
    const sayi = await tek('SELECT COUNT(*) AS n FROM user');
    if (sayi.n === 0) {
        await calistir("INSERT INTO user (user, password, panoName, durum, yetki) VALUES (?, ?, ?, 1, 'admin')",
            ['admin', await bcrypt.hash('admin', 10), 'Pano']);
        console.warn('UYARI: Varsayılan yönetici oluşturuldu (admin / admin). İlk girişte şifreyi değiştirin.');
    }
};

// Dışarıya şifre alanı hiç gönderilmez
const kullaniciTemizle = (k) => {
    if (!k) return k;
    const { password, ...kalan } = k;
    return kalan;
};

module.exports = {
    hazir: hazirla(),
    db,
    hepsi,
    tek,
    calistir,
    sifreHashliMi,

    io: {
        listele: () => hepsi('SELECT * FROM io ORDER BY ID'),
        getir: (ID) => tek('SELECT * FROM io WHERE ID = ?', [ID]),
        // Fiziksel buton, Arduino'dan gelen koda (hex) göre bulunur. hex'i boş olan kayıtlar
        // yalnızca ekrandan kontrol edilen sanal kayıtlardır.
        hexIleGetir: (hex) => tek('SELECT * FROM io WHERE hex = ? ORDER BY durum DESC, ID LIMIT 1', [hex]),
        aktifler: () => hepsi('SELECT * FROM io WHERE durum = 1'),
        ekle: (obj) => calistir('INSERT INTO io (input, hex, adres, status, durum) VALUES (?, ?, ?, ?, ?)',
            [obj.input, obj.hex, obj.adres, obj.status || 0, obj.durum || 0]),
        guncelle: (ID, obj) => guncelle('io', IO_SUTUNLAR, ID, obj),
    },

    kullanici: {
        listele: async () => (await hepsi('SELECT * FROM user ORDER BY ID')).map(kullaniciTemizle),
        getir: async (ID) => kullaniciTemizle(await tek('SELECT * FROM user WHERE ID = ?', [ID])),
        sifreliGetir: (ID) => tek('SELECT * FROM user WHERE ID = ?', [ID]),
        adIleGetir: (user) => tek('SELECT * FROM user WHERE user = ?', [user]),
        ekle: (obj) => calistir(
            'INSERT INTO user (user, password, panoName, adres, il, ilce, durum, yetki) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [obj.user, obj.password, obj.panoName || null, obj.adres || null, obj.il || null, obj.ilce || null,
                obj.durum === undefined ? 1 : obj.durum, obj.yetki || 'kullanici']),
        guncelle: (ID, obj) => guncelle('user', KULLANICI_SUTUNLAR, ID, obj),
        sil: (ID) => calistir('DELETE FROM user WHERE ID = ?', [ID]),
        temizle: kullaniciTemizle,
    },

    menu: {
        listele: () => hepsi('SELECT * FROM menu'),
    },

    ayar: {
        hepsi: async () => Object.fromEntries((await hepsi('SELECT anahtar, deger FROM ayar')).map((r) => [r.anahtar, r.deger])),
        yaz: (anahtar, deger) => calistir(
            'INSERT INTO ayar (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger',
            [anahtar, deger]),
    },

    zilKayit: {
        ekle: (k) => calistir('INSERT INTO zil_kayit (zaman, dosya, kaynak, adi) VALUES (?, ?, ?, ?)', [k.zaman, k.dosya, k.kaynak, k.adi]),
        getir: (ID) => tek('SELECT * FROM zil_kayit WHERE ID = ?', [ID]),
        // baslangic/bitis: ISO zaman (bitis hariç)
        listele: ({ baslangic, bitis, limit = 200 } = {}) => hepsi(
            'SELECT * FROM zil_kayit WHERE zaman >= ? AND zaman < ? ORDER BY zaman DESC LIMIT ?',
            [baslangic || '0000', bitis || '9999', limit]),
        oncekiler: (zaman) => hepsi('SELECT * FROM zil_kayit WHERE zaman < ?', [zaman]),
        sil: (ID) => calistir('DELETE FROM zil_kayit WHERE ID = ?', [ID]),
    },
};
