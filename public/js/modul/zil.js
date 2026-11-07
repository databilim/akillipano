// Zil fotoğrafları: güne göre listeleme ve büyütme
const parametre = new URLSearchParams(window.location.search);
let zilKayitlari = [];
let seciliID = null;

const galeriGoster = async () => {
  const tarih = $('#zilTarih').val();
  $('.zilGaleri').html('Yükleniyor…');
  try {
    const cevap = await axios.get('/kamera/zil', { params: { tarih } });
    zilKayitlari = cevap.data.kayitlar || [];
  } catch (e) {
    $('.zilGaleri').html('Kayıtlar alınamadı');
    return;
  }
  if (!zilKayitlari.length) {
    $('.zilGaleri').html(`<p class="text-muted">${moment(tarih).format('DD.MM.YYYY')} tarihinde zil kaydı yok.</p>`);
    return;
  }
  $('.zilGaleri').html(zilKayitlari.map((k) => `
    <a href="#" class="zilKart" onclick="return zilBuyut(${k.ID})">
      <img src="/kamera/zil/${k.ID}/resim" alt="" loading="lazy">
      <span>${moment(k.zaman).format('HH:mm:ss')} · ${kacis(k.adi || 'Zil')}</span>
    </a>`).join(''));
};

const zilBuyut = (ID) => {
  const k = zilKayitlari.find((x) => x.ID === ID);
  if (!k) return false;
  seciliID = ID;
  $('#zilBuyuk .modal-title').text(`${k.adi || 'Zil'} · ${tarihSaat(k.zaman)}`);
  $('#zilBuyuk img').attr('src', `/kamera/zil/${k.ID}/resim`);
  $('#zilBuyuk').modal('show');
  return false;
};

$(document).ready(async () => {
  if (!(await pano.hazir)) return;
  const tarih = /^\d{4}-\d{2}-\d{2}$/.test(parametre.get('tarih') || '') ? parametre.get('tarih') : moment().format('YYYY-MM-DD');
  $('#zilTarih').val(tarih).on('change', galeriGoster);
  galeriGoster();

  $('#zilSil').on('click', async () => {
    if (!seciliID || !confirm('Bu fotoğraf silinsin mi?')) return;
    try {
      await axios.delete(`/kamera/zil/${seciliID}`);
      $('#zilBuyuk').modal('hide');
      galeriGoster();
    } catch (e) {
      alert('Silinemedi');
    }
  });

  // Bugünü izlerken yeni zil fotoğrafı gelirse listeye ekle
  $(document).on('zilFotografi', (olay, k) => {
    if (moment(k.zaman).format('YYYY-MM-DD') === $('#zilTarih').val()) galeriGoster();
  });
});
