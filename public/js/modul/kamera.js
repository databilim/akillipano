// Kamera ayarları (yönetici)
$(document).ready(async () => {
  if (!(await pano.hazir)) return;
  if (!yoneticiMi()) {
    $('.orta').html('<div class="kullaniciPanel">Bu sayfa yalnızca yöneticiler içindir.</div>');
    return;
  }
  const form = $('#kameraForm');
  const mesajYaz = (metin, basarili) => form.find('.formMesaj').text(metin || '')
    .attr('class', 'formMesaj ' + (basarili ? 'text-success' : 'text-danger'));

  const cevap = await axios.get('/kamera/ayar');
  const a = cevap.data.ayar;
  ['kamera_ip', 'kamera_kullanici', 'kamera_rtsp_port', 'kamera_onvif_port', 'kamera_rtsp_yol'].forEach((alan) => form.find(`[name=${alan}]`).val(a[alan] || ''));
  form.find('[name=kamera_sifre]').attr('placeholder', a.sifreVar ? 'Kayıtlı (değiştirmek için yazın)' : '');

  const kaydet = async () => {
    const veri = {};
    form.serializeArray().forEach((o) => { veri[o.name] = o.value; });
    await axios.post('/kamera/ayar', veri);
    form.find('[name=kamera_sifre]').val('');
    if (veri.kamera_sifre) form.find('[name=kamera_sifre]').attr('placeholder', 'Kayıtlı (değiştirmek için yazın)');
  };

  form.on('submit', async (event) => {
    event.preventDefault();
    try {
      await kaydet();
      mesajYaz('Kaydedildi', true);
    } catch (e) {
      mesajYaz((e.response && e.response.data && e.response.data.message) || 'Kaydedilemedi');
    }
  });

  $('#kameraTest').on('click', async () => {
    $('#testSonuc').text('Kaydediliyor ve fotoğraf çekiliyor…');
    try {
      await kaydet();
      const r = await axios.post('/kamera/test', null, { responseType: 'blob' });
      const kaynak = r.headers['x-kaynak'] === 'onvif' ? 'ONVIF ile alındı' : 'RTSP görüntüsünden alındı';
      const url = URL.createObjectURL(r.data);
      $('#testSonuc').html(`<div class="text-success mb-2">Çalışıyor. ${kaynak}.</div><img class="w-100" src="${url}" alt="">`);
    } catch (e) {
      let mesaj = (e.response && e.response.data && e.response.data.message) || 'Fotoğraf alınamadı';
      if (e.response && e.response.data instanceof Blob) {
        try { mesaj = JSON.parse(await e.response.data.text()).message || mesaj; } catch (x) { /* */ }
      }
      $('#testSonuc').html(`<div class="text-danger">${kacis(mesaj)}</div>`);
    }
  });
});
