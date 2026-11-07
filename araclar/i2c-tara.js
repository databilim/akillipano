// I2C hattındaki cihazları listeler, isteğe bağlı olarak bir röleyi dener.
//   node araclar/i2c-tara.js            -> adresleri listeler
//   node araclar/i2c-tara.js 6 1        -> 6. kanalı açar
//   node araclar/i2c-tara.js 6 0        -> 6. kanalı kapatır
const i2c = require('../modul/i2c');
const ayarlar = require('../modul/ayarlar');

const adresler = i2c.tara();
console.log('Bulunan adresler:', adresler.join(', ') || 'yok');
console.log(`Röle kartı (${ayarlar.i2c.roleAdres}):`, adresler.includes(ayarlar.i2c.roleAdres) ? 'var' : 'YOK');
console.log(`Buton kartı (${ayarlar.i2c.butonAdres}):`, adresler.includes(ayarlar.i2c.butonAdres) ? 'var' : 'YOK');

const [kanal, durum] = process.argv.slice(2).map(Number);
if (kanal) {
    const sonuc = i2c.roleYaz(kanal, durum ? 1 : 0);
    console.log(`Kanal ${kanal} ${durum ? 'aç' : 'kapat'}:`, sonuc.ok ? 'gönderildi' : `HATA ${sonuc.hata}`);
}
