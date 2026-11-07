// Panonun iş mantığı: buton okuma döngüsü, röle aç/kapa, zil zamanlayıcısı ve açılış durumu.
// Hem fiziksel butonlar hem de arayüz aynı "degistir" fonksiyonunu kullanır.
const EventEmitter = require('events');
const ayarlar = require('./ayarlar');
const vt = require('./veritabani');
const i2c = require('./i2c');

const olaylar = new EventEmitter();

// Kaydın output alanını ("[6]" ya da "[8, 9]") güvenli şekilde kanal listesine çevirir
const kanallariCoz = (output) => {
    let liste;
    try {
        liste = typeof output === 'string' ? JSON.parse(output) : output;
    } catch (e) {
        return null;
    }
    if (!Array.isArray(liste)) liste = [liste];
    const kanallar = liste.map((k) => parseInt(k, 10));
    return kanallar.length > 0 && kanallar.every(i2c.kanalGecerliMi) ? kanallar : null;
};

// Aynı anda iki işlemin birbirine karışmaması için tüm röle işlemleri sırayla çalışır
let kuyruk = Promise.resolve();
const sirayla = (is) => {
    const sonuc = kuyruk.then(is, is);
    kuyruk = sonuc.catch(() => {});
    return sonuc;
};

const zilZamanlayicilari = new Map();

// Bir kaydın durumunu değiştirir. yeniDurum verilmezse tersine çevirir.
// Röle komutu gitmezse veritabanı güncellenmez ve {ok:false} döner.
const degistir = (ID, yeniDurum) => sirayla(async () => {
    const kayit = await vt.io.getir(ID);
    if (!kayit) return { ok: false, hata: 'Kayıt bulunamadı' };
    if (kayit.durum != 1) return { ok: false, hata: 'Bu kayıt henüz tanımlanmamış' };

    const kanallar = kanallariCoz(kayit.output);
    if (!kanallar) return { ok: false, hata: `"${kayit.adi}" için geçerli çıkış (1-${ayarlar.kanalSayisi}) tanımlı değil` };

    const hedef = yeniDurum === undefined ? (kayit.status == 1 ? 0 : 1) : (yeniDurum ? 1 : 0);

    for (const kanal of kanallar) {
        const sonuc = i2c.roleYaz(kanal, hedef);
        if (!sonuc.ok) {
            const hata = `"${kayit.adi}" ${hedef ? 'açılamadı' : 'kapatılamadı'}: ${sonuc.hata}`;
            olaylar.emit('hata', { ID: kayit.ID, mesaj: hata });
            return { ok: false, hata };
        }
    }

    await vt.io.guncelle(kayit.ID, { status: hedef });
    kayit.status = hedef;
    olaylar.emit('input', kayit);

    // Zil: belirli süre sonra sunucu kendisi kapatır (tarayıcı açık olmasa da)
    if (kayit.tipi === 'zil') {
        clearTimeout(zilZamanlayicilari.get(kayit.ID));
        zilZamanlayicilari.delete(kayit.ID);
        if (hedef === 1) {
            zilZamanlayicilari.set(kayit.ID, setTimeout(() => {
                zilZamanlayicilari.delete(kayit.ID);
                degistir(kayit.ID, 0).then((s) => {
                    if (!s.ok) console.error('Zil kapatılamadı:', s.hata);
                });
            }, ayarlar.zilSuresiMs));
        }
    }
    return { ok: true, kayit };
});

// Fiziksel butona basıldığında
const butonaBasildi = async (buton) => {
    const kayit = await vt.io.hexIleGetir(buton.hex);
    if (!kayit) {
        await vt.io.ekle({ input: buton.input, hex: buton.hex, adres: ayarlar.i2c.butonAdres, status: 0, durum: 0 });
        console.log(`Yeni buton bulundu (${buton.input}), "Tanımsızlar" sayfasından tanımlayın.`);
        olaylar.emit('yeniButon', buton);
        return;
    }
    if (kayit.durum != 1) {
        console.log(`Tanımsız buton: ${buton.input}`);
        return;
    }
    const sonuc = await degistir(kayit.ID);
    if (!sonuc.ok) console.error(sonuc.hata);
};

// Buton okuma döngüsü. Önceki tur bitmeden yenisi başlamaz.
// Basma "kenarı" algılanır: buton basılı tutulursa röle tekrar tekrar açılıp kapanmaz.
let oncekiKod = null;
let sonBasma = 0;
let calisiyor = false;
const butonTuru = async () => {
    const kod = i2c.butonOku();
    const buton = i2c.butonCoz(kod);
    const simdi = Date.now();
    if (buton && kod !== oncekiKod && simdi - sonBasma >= ayarlar.butonKilitMs) {
        sonBasma = simdi;
        try {
            await butonaBasildi(buton);
        } catch (e) {
            console.error('Buton işlenemedi:', e.message);
        }
    }
    if (kod !== null) oncekiKod = kod;
};

const butonDongusu = async () => {
    if (!calisiyor) return;
    await butonTuru();
    setTimeout(butonDongusu, ayarlar.i2c.okumaAraligiMs);
};

// Açılışta: veritabanındaki durumu rölelere yazar. Zil her zaman kapalı başlar.
// Böylece Pi yeniden başladığında rölelerin durumu ekrandakiyle aynı olur.
const acilisDurumunuYukle = async () => {
    const kayitlar = await vt.io.aktifler();
    for (const kayit of kayitlar) {
        const kanallar = kanallariCoz(kayit.output);
        if (!kanallar) continue;
        let hedef = ayarlar.acilistaDurumuYukle && kayit.status == 1 ? 1 : 0;
        if (kayit.tipi === 'zil') hedef = 0;
        let basarili = true;
        for (const kanal of kanallar) {
            if (!i2c.roleYaz(kanal, hedef).ok) basarili = false;
        }
        if (basarili && kayit.status != hedef) await vt.io.guncelle(kayit.ID, { status: hedef });
    }
};

let yoklamaZamanlayici = null;
const baslat = async () => {
    await vt.hazir;
    i2c.roleKartiniYokla();
    await acilisDurumunuYukle();
    calisiyor = true;
    butonDongusu();
    yoklamaZamanlayici = setInterval(() => i2c.roleKartiniYokla(), ayarlar.i2c.kontrolAraligiMs);
};

const durdur = () => {
    calisiyor = false;
    clearInterval(yoklamaZamanlayici);
    zilZamanlayicilari.forEach(clearTimeout);
    zilZamanlayicilari.clear();
};

module.exports = { olaylar, degistir, baslat, durdur, kanallariCoz, butonTuru, butonaBasildi };
