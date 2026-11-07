// I2C üzerinden Arduino kartlarıyla haberleşme.
//
// Protokol (Arduino tarafı değişmedi):
//   Röle kartı (varsayılan adres 100): 9 baytlık blok yazılır: [0, komut, 0, 0, 0, 0, 0, 0, 0].
//     komut = (9 + kanal) * 10 + durum   ->  kanal 1 aç = 101, kanal 1 kapat = 100, kanal 16 aç = 251
//   Buton kartı (varsayılan adres 10): 2 bayt okunur. "01ff" = buton 1 ... "10ff" = buton 16.
//
// Bu modül hataları yutmaz: her işlem {ok, hata} döner ve bağlantı durumu değiştiğinde
// "durum" olayı yayınlanır. Arayüz bu olayla "I2C bağlantısı yok" uyarısını gösterir.
const EventEmitter = require('events');
const ayarlar = require('./ayarlar');

const KANAL_SAYISI = ayarlar.kanalSayisi;

const roleKomutu = (kanal, durum) => (9 + kanal) * 10 + (durum ? 1 : 0);

// Buton kodu -> buton numarası ("01ff" -> 1, "10ff" -> 16)
const butonCoz = (hex) => {
    if (typeof hex !== 'string' || !/^[0-9a-f]{2}ff$/.test(hex)) return null;
    const no = parseInt(hex.slice(0, 2), 16);
    return no >= 1 && no <= KANAL_SAYISI ? { input: no, hex } : null;
};

const kanalGecerliMi = (kanal) => Number.isInteger(kanal) && kanal >= 1 && kanal <= KANAL_SAYISI;

// Donanım olmadan çalışmak ve test için sahte bus
class SimulasyonBus {
    constructor() {
        this.roleler = new Array(KANAL_SAYISI + 1).fill(0);
        this.bekleyenButon = null;
        this.bagli = true;
        this.yazilanlar = [];
    }
    kontrol(addr) {
        if (!this.bagli) {
            const e = new Error(`Remote I/O error (adres ${addr})`);
            e.code = 'EREMOTEIO';
            throw e;
        }
    }
    writeI2cBlockSync(addr, cmd, length, buffer) {
        this.kontrol(addr);
        const komut = buffer[0];
        this.yazilanlar.push(komut);
        const kanal = Math.floor(komut / 10) - 9;
        if (kanalGecerliMi(kanal)) this.roleler[kanal] = komut % 10;
    }
    i2cReadSync(addr, length, buffer) {
        this.kontrol(addr);
        const hex = this.bekleyenButon || '00ff';
        Buffer.from(hex, 'hex').copy(buffer);
        return length;
    }
    scanSync(baslangic) {
        return this.bagli ? [baslangic] : [];
    }
}

class I2C extends EventEmitter {
    constructor() {
        super();
        this.bus = null;
        this.durum = {
            bagli: false,
            roleKarti: false,
            butonKarti: false,
            sonHata: null,
            sonHataZamani: null,
            simulasyon: ayarlar.i2c.simulasyon,
        };
        this.hataSayaci = { role: 0, buton: 0 };
        this.ac();
    }

    ac() {
        try {
            if (ayarlar.i2c.simulasyon) {
                this.bus = new SimulasyonBus();
            } else {
                // Bus bir kez açılır ve açık kalır (eskiden her yazmada kapatılıyordu)
                this.bus = require('i2c-bus').openSync(ayarlar.i2c.bus);
            }
            return true;
        } catch (e) {
            this.bus = null;
            this.hataKaydet('role', e);
            this.hataKaydet('buton', e);
            return false;
        }
    }

    hataKaydet(kart, e) {
        this.hataSayaci[kart] += 1;
        this.durum.sonHata = `${kart === 'role' ? 'Röle' : 'Buton'} kartı: ${e.message}`;
        this.durum.sonHataZamani = new Date().toISOString();
        if (this.hataSayaci[kart] >= ayarlar.i2c.hataEsigi) this.kartDurumu(kart, false);
    }

    basariKaydet(kart) {
        this.hataSayaci[kart] = 0;
        this.kartDurumu(kart, true);
    }

    kartDurumu(kart, bagli) {
        const alan = kart === 'role' ? 'roleKarti' : 'butonKarti';
        const onceki = this.durum.bagli;
        const oncekiKart = this.durum[alan];
        this.durum[alan] = bagli;
        this.durum.bagli = this.durum.roleKarti && this.durum.butonKarti;
        if (onceki !== this.durum.bagli || oncekiKart !== bagli) {
            if (!bagli) console.error(`I2C: ${kart === 'role' ? 'röle' : 'buton'} kartına ulaşılamıyor. ${this.durum.sonHata || ''}`);
            else console.log(`I2C: ${kart === 'role' ? 'röle' : 'buton'} kartı bağlı`);
            this.emit('durum', this.durumGetir());
        }
    }

    durumGetir() {
        return { ...this.durum };
    }

    // Tek bir röle kanalını aç/kapat. Hata olursa {ok:false, hata} döner.
    roleYaz(kanal, durum) {
        if (!kanalGecerliMi(kanal)) return { ok: false, hata: `Geçersiz kanal: ${kanal}` };
        if (!this.bus && !this.ac()) return { ok: false, hata: 'I2C bus açılamadı' };
        try {
            const buffer = Buffer.alloc(8);
            buffer.writeUInt8(roleKomutu(kanal, durum));
            this.bus.writeI2cBlockSync(ayarlar.i2c.roleAdres, 0, buffer.length, buffer);
            this.basariKaydet('role');
            return { ok: true };
        } catch (e) {
            // Tek bir yazma hatası bile komutun gitmediği anlamına gelir; eşiği beklemeden bildir
            this.hataKaydet('role', e);
            this.kartDurumu('role', false);
            return { ok: false, hata: e.message };
        }
    }

    // Buton kartından okunan ham kod ("01ff" gibi). Hata olursa null.
    butonOku() {
        if (!this.bus && !this.ac()) return null;
        try {
            const buffer = Buffer.alloc(2);
            this.bus.i2cReadSync(ayarlar.i2c.butonAdres, buffer.length, buffer);
            this.basariKaydet('buton');
            return buffer.toString('hex');
        } catch (e) {
            this.hataKaydet('buton', e);
            return null;
        }
    }

    // Röle kartının hatta olup olmadığını yoklar (butona basılmasa da bağlantı kopukluğu fark edilsin diye)
    roleKartiniYokla() {
        if (!this.bus && !this.ac()) return false;
        try {
            const adres = ayarlar.i2c.roleAdres;
            const bulunan = this.bus.scanSync(adres, adres);
            if (bulunan.includes(adres)) {
                this.basariKaydet('role');
                return true;
            }
            this.hataKaydet('role', new Error(`adres ${adres} yanıt vermiyor`));
            return false;
        } catch (e) {
            this.hataKaydet('role', e);
            return false;
        }
    }

    tara() {
        if (!this.bus && !this.ac()) return [];
        return this.bus.scanSync();
    }
}

module.exports = new I2C();
module.exports.roleKomutu = roleKomutu;
module.exports.butonCoz = butonCoz;
module.exports.kanalGecerliMi = kanalGecerliMi;
