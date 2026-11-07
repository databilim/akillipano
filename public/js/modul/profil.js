// Ana kontrol ekranı: tiplere göre gruplar, gruba tıklayınca o tipteki lamba/prizler
let kayitlar = [];

const kayitlariGetir = async () => {
  const cevap = await axios.get('/profil/input');
  kayitlar = cevap.data;
  return kayitlar;
};

const kartHtml = (k) => {
  const durum = kompenant(k).durum;
  return `
    <div class="input" id="kart${k.ID}"><a class="komponat" data-id="${k.ID}" onclick="return inputClick(event)" href="#">
      <img id="in${k.ID}" width="100" src="/img/${kacis(k.tipi)}${durum}.svg" alt="" tabindex="-1"></a>
      <h3>${kacis(k.adi)}</h3>
    </div>`;
};

const gruplariGoster = async () => {
  await kayitlariGetir();
  $('.orta .input').remove();
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
  $('.orta .input').remove();
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
  if (await pano.hazir) gruplariGoster();
});

// --- Canlı kamera ---
let kameraUrl = null;
let kameraAcik = false;

const kameraIzle = () => {
  if (kameraAcik && !document.hidden) socket.emit('kameraIzle');
};

socket.on('kameraKare', (kare) => {
  const yeni = URL.createObjectURL(new Blob([kare], { type: 'image/jpeg' }));
  const img = document.getElementById('kameraCanli');
  img.onload = () => { if (kameraUrl && kameraUrl !== yeni) URL.revokeObjectURL(kameraUrl); kameraUrl = yeni; };
  img.src = yeni;
  $('.kameraDurum').hide();
});

socket.on('kameraDurum', (d) => {
  if (d.calisiyor) $('.kameraDurum').hide();
  else $('.kameraDurum').text(`Kamera görüntüsü alınamıyor: ${d.hata || ''}. Yeniden deneniyor…`).show();
});

// Bağlantı yeniden kurulunca izlemeye devam et
socket.on('connect', kameraIzle);

// Sekme arka plandayken görüntü gönderilmesin (Pi'yi ve ağı yormasın)
document.addEventListener('visibilitychange', () => {
  if (!kameraAcik) return;
  if (document.hidden) socket.emit('kameraBirak'); else socket.emit('kameraIzle');
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
  kameraIzle();
});
