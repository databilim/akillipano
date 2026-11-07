// Ana kontrol ekranı: tiplere göre gruplar, gruba tıklayınca o tipteki lamba/prizler
let kayitlar = [];

const kayitlariGetir = async () => {
  const cevap = await axios.get('/profil/input');
  kayitlar = cevap.data;
  return kayitlar;
};

let favoriler = new Set();

const favorileriGetir = async () => {
  try {
    const cevap = await axios.get('/profil/favori');
    favoriler = new Set(cevap.data.favoriler);
  } catch (e) { /* favoriler olmadan devam */ }
};

const kartHtml = (k) => {
  const durum = kompenant(k).durum;
  const fav = favoriler.has(k.ID);
  return `
    <div class="input" id="kart${k.ID}">
      <button type="button" class="favoriButon ${fav ? 'secili' : ''}" data-id="${k.ID}" onclick="return favoriDegistir(event)"
        title="${fav ? 'Favorilerden çıkar' : 'Favorilere ekle'}" aria-label="Favori">${fav ? '★' : '☆'}</button>
      <a class="komponat" data-id="${k.ID}" onclick="return inputClick(event)" href="#">
      <img id="in${k.ID}" width="100" src="/img/${kacis(k.tipi)}${durum}.svg" alt="" tabindex="-1"></a>
      <h3>${kacis(k.adi)}</h3>
    </div>`;
};

const favoriDegistir = async (event) => {
  event.preventDefault();
  event.stopPropagation();
  const ID = $(event.currentTarget).data('id');
  const ekle = !favoriler.has(ID);
  try {
    const cevap = await axios.post(`/profil/favori/${ID}`, { favori: ekle });
    favoriler = new Set(cevap.data.favoriler);
  } catch (e) {
    return false;
  }
  if (!ekle && window.location.hash === '#favoriler') {
    $('#kart' + ID).remove();
    if (!$('.orta .input').length) favorilerGoster();
    return false;
  }
  $(`.favoriButon[data-id=${ID}]`).toggleClass('secili', ekle).text(ekle ? '★' : '☆')
    .attr('title', ekle ? 'Favorilerden çıkar' : 'Favorilere ekle');
  return false;
};

// Alt menüdeki yıldız: favoriler
const favorilerGoster = async () => {
  await Promise.all([kayitlariGetir(), favorileriGetir()]);
  $('.orta .input, .orta .bosMesaj').remove();
  const liste = kayitlar.filter((k) => k.durum == 1 && favoriler.has(k.ID));
  if (!liste.length) {
    $('.orta').append('<div class="bosMesaj kullaniciPanel">Henüz favori yok. Bir grubu açıp lamba ya da prizin köşesindeki ☆ simgesine dokunun.</div>');
    return;
  }
  liste.forEach((k) => $('.orta').append(kartHtml(k)));
};

const sayfaGoster = () => (window.location.hash === '#favoriler' ? favorilerGoster() : gruplariGoster());
window.addEventListener('hashchange', sayfaGoster);

const gruplariGoster = async () => {
  await Promise.all([kayitlariGetir(), favorileriGetir()]);
  $('.orta .input, .orta .bosMesaj').remove();
  const tipler = [];
  kayitlar.forEach((k) => {
    if (k.durum === 1 && k.tipi && !tipler.includes(k.tipi)) tipler.push(k.tipi);
  });
  tipler.forEach((tipi) => {
    $('.orta').append(`
      <div class="input"><a class="komponat gruplar" data-tipi="${kacis(tipi)}" onclick="return gruplarListele(event)" href="#">
        <img width="100" src="/img/${kacis(tipi)}0.svg" alt="" tabindex="-1"></a>
        <h3>${kacis(tipi)}</h3>
      </div>`);
  });
};

const gruplarListele = async (event) => {
  event.preventDefault();
  const tipi = $(event.currentTarget).data('tipi');
  await kayitlariGetir();
  $('.orta .input, .orta .bosMesaj').remove();
  kayitlar.filter((k) => k.tipi == tipi && k.durum == 1).forEach((k) => $('.orta').append(kartHtml(k)));
  return false;
};

// Yalnızca kaydın ID'si gönderilir; hangi rölenin tetikleneceğine sunucu karar verir
function inputClick(event) {
  event.preventDefault();
  const ID = $(event.currentTarget).data('id');
  socket.emit('start', { ID }, (cevap) => {
    if (cevap && !cevap.ok && cevap.hata) {
      $('#kart' + ID).addClass('hatali');
      setTimeout(() => $('#kart' + ID).removeClass('hatali'), 3000);
    }
  });
  return false;
}

// Durum değişince (ekrandan, duvar butonundan ya da başka bir telefondan) simge güncellenir.
// Dinleyici bir kez eklenir.
socket.on('input', (kayit) => {
  const i = kayitlar.findIndex((k) => k.ID === kayit.ID);
  if (i >= 0) kayitlar[i] = kayit;
  $('#in' + kayit.ID).attr('src', `/img/${kacis(kayit.tipi)}${kompenant(kayit).durum}.svg`);
});

// Bağlantı koptuktan sonra geri gelince güncel durumu çek
socket.on('connect', () => {
  if (kayitlar.length) kayitlariGetir().then(() => {
    kayitlar.forEach((k) => $('#in' + k.ID).attr('src', `/img/${kacis(k.tipi)}${kompenant(k).durum}.svg`));
  });
});

$(document).ready(async () => {
  if (await pano.hazir) sayfaGoster();
});

// --- Canlı kamera ---
// Her kare ayrı bir HTTP isteğiyle alınır: WebSocket gerekmez, Cloudflare gibi proxy'lerden geçer.
// Bir kare yüklenince bir sonraki istenir, böylece yavaş bağlantıda kendiliğinden yavaşlar.
let kameraAcik = false;
let kameraCalisiyor = false;
let kareNo = 0;
let kameraUrl = null;

const kameraDongusu = async () => {
  if (kameraCalisiyor) return;
  kameraCalisiyor = true;
  while (kameraAcik && !document.hidden) {
    try {
      const cevap = await fetch(`/kamera/kare?son=${kareNo}`, { cache: 'no-store', credentials: 'same-origin' });
      if (cevap.status === 401) { window.location.href = '/'; break; }
      if (!cevap.ok) {
        let mesaj = 'Kamera bağlanıyor';
        try { mesaj = (await cevap.json()).message || mesaj; } catch (e) { /* */ }
        $('.kameraDurum').text(`Kamera görüntüsü alınamıyor: ${mesaj}. Yeniden deneniyor…`).show();
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      kareNo = parseInt(cevap.headers.get('X-Kare'), 10) || kareNo + 1;
      const yeni = URL.createObjectURL(await cevap.blob());
      const img = document.getElementById('kameraCanli');
      await new Promise((r) => { img.onload = r; img.onerror = r; img.src = yeni; });
      if (kameraUrl) URL.revokeObjectURL(kameraUrl);
      kameraUrl = yeni;
      $('.kameraDurum').hide();
    } catch (e) {
      $('.kameraDurum').text('Kamera görüntüsü alınamıyor. Yeniden deneniyor…').show();
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  kameraCalisiyor = false;
};

// Sekme arka plandayken görüntü istenmez (Pi'yi ve mobil veriyi yormasın)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && kameraAcik) kameraDongusu();
});

$(document).ready(async () => {
  if (!(await pano.hazir)) return;
  try {
    const d = await axios.get('/kamera/durum');
    if (!d.data.tanimli) return;
  } catch (e) {
    return;
  }
  kameraAcik = true;
  $('.kameraKutu').show();
  kameraDongusu();
});
