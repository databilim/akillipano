// Ortak yardımcılar: oturum kontrolü, durum simgesi, hava durumu, saat
let pano = {};

// Metni HTML içine güvenli yazmak için
const kacis = (deger) => String(deger === null || deger === undefined ? '' : deger)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const yoneticiMi = () => !!(pano.user && pano.user[0] && pano.user[0].yetki === 'admin');

// Yönetici olmayanlardan yönetim bağlantılarını gizler
const yetkiyeGoreGoster = () => {
  if (yoneticiMi()) $('.sadeceYonetici').show(); else $('.sadeceYonetici').hide();
};

pano.hazir = (async () => {
  let user;
  try {
    user = await axios.get('/profil');
  } catch (e) {
    return null;
  }
  if (user.data.status == 0) {
    window.location.href = '/';
    return null;
  }
  pano.user = user.data;
  $(yetkiyeGoreGoster);
  return pano.user;
})();

$(document).ready(async () => {
  await pano.hazir;
  havaDurumu('.havaDurumu');
  setInterval(() => havaDurumu('.havaDurumu'), 5 * 60 * 1000);
});

const cikisYap = async (event) => {
  if (event) event.preventDefault();
  try { await axios.post('/login/cikis'); } catch (e) { /* yine de çık */ }
  window.location.href = '/';
};

// Kaydın durumuna göre gösterilecek simge (0/1).
// Prizler ters bağlı olduğu için simgeleri ters gösterilir (eski davranış korunmuştur).
const kompenant = (obj) => {
  const status = obj.status == 1 ? 1 : 0;
  if (obj.tipi == 'priz') return { durum: status ? 0 : 1, obj };
  return { durum: status, obj };
};

const havaDurumu = async (element) => {
  try {
    const cek = await axios.post('/profil/hd');
    if (Array.isArray(cek.data) && cek.data[0]) $(element).text(cek.data[0].sicaklik);
    else $(element).text('-');
  } catch (e) {
    $(element).text('-');
  }
};

setInterval(() => {
  $('.time').html(moment().format('DD.MM.YYYY HH:mm:ss'));
}, 1000);

// --- Zil bildirimleri (alt menüdeki zil simgesi) ---
const tarihSaat = (iso) => moment(iso).format('DD.MM.YYYY HH:mm:ss');

const zilSonlariGoster = async () => {
  try {
    const cevap = await axios.get('/kamera/zil', { params: { limit: 5 } });
    const kayitlar = cevap.data.kayitlar || [];
    if (!kayitlar.length) return;
    $('.zilSonlar').html(kayitlar.map((k) => `
      <a class="zilSatir" href="zil.html?tarih=${moment(k.zaman).format('YYYY-MM-DD')}">
        <img src="/kamera/zil/${k.ID}/resim" alt="" loading="lazy">
        <span>${kacis(k.adi || 'Zil')}<br><small>${tarihSaat(k.zaman)}</small></span>
      </a>`).join(''));
  } catch (e) { /* kamera yoksa sessiz geç */ }
};

let okunmamisZil = 0;
const rozetGuncelle = () => {
  if (okunmamisZil > 0) $('.bildirimMenu .rozet').text(okunmamisZil).show();
  else $('.bildirimMenu .rozet').hide();
};

if (typeof socket !== 'undefined') {
  socket.on('zilFotografi', (k) => {
    okunmamisZil += 1;
    rozetGuncelle();
    zilSonlariGoster();
    if (typeof bildirim === 'function') bildirim(`Zile basıldı (${tarihSaat(k.zaman)}). Fotoğraf Bildirimler'de.`);
    $(document).trigger('zilFotografi', k);
  });
}

$(document).ready(async () => {
  if (!(await pano.hazir)) return;
  zilSonlariGoster();
  $('#bildirimler').on('show.bs.modal', () => { okunmamisZil = 0; rozetGuncelle(); });
});

// --- Telefonun ana ekranına ekleme (uygulama gibi açılır) ---
let kurulumIstegi = null;
window.addEventListener('beforeinstallprompt', (olay) => {
  olay.preventDefault();
  kurulumIstegi = olay;
});

const uygulamaOlarakAcik = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const anaEkranaEkle = async (event) => {
  if (event) event.preventDefault();
  if (uygulamaOlarakAcik()) {
    alert('Uygulama zaten ana ekrandan açılmış.');
    return false;
  }
  if (kurulumIstegi) {
    kurulumIstegi.prompt();
    await kurulumIstegi.userChoice;
    kurulumIstegi = null;
    return false;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  alert(ios
    ? 'Safari\'de alttaki Paylaş (kare ve yukarı ok) simgesine dokunun, ardından "Ana Ekrana Ekle"yi seçin.'
    : 'Chrome\'da sağ üstteki üç nokta menüsünü açın, ardından "Ana ekrana ekle" ya da "Uygulamayı yükle"yi seçin.');
  return false;
};

$(() => { if (uygulamaOlarakAcik()) $('.anaEkranaEkle').hide(); });

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
