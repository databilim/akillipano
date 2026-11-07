// Sistem güncelleme (yönetici)
const surumMetni = (s) => `${s.commit} (${moment(s.tarih).format('DD.MM.YYYY HH:mm')}, ${s.dal})`;
const hataMetni = (e) => (e.response && e.response.data && e.response.data.message) || 'Sunucuya ulaşılamadı';

const surumGoster = async () => {
  const r = await axios.get('/sistem/surum');
  $('#surum').text(surumMetni(r.data.surum));
  return r.data.surum;
};

const denetle = async () => {
  $('#guncellemeBilgi').text('Denetleniyor…');
  $('#guncelle').hide();
  try {
    const r = await axios.get('/sistem/denetle');
    const d = r.data;
    if (!d.yeniler.length) {
      $('#guncellemeBilgi').html('<span class="text-success">Sistem güncel.</span>');
      return;
    }
    let html = `<b>${d.yeniler.length} yeni değişiklik var:</b><ul class="small mb-2">` +
      d.yeniler.map((y) => `<li>${moment(y.tarih).format('DD.MM.YYYY')} · ${kacis(y.mesaj)}</li>`).join('') + '</ul>';
    if (d.yerelDegisiklik) html += '<div class="text-danger">Pi üzerinde elle değiştirilmiş dosyalar var, güncelleme yapılamaz.</div>';
    if (!d.otomatikYenidenBaslar) html += '<div class="text-warning">Uygulama servis olarak çalışmıyor; güncellemeden sonra elle yeniden başlatmanız gerekecek.</div>';
    $('#guncellemeBilgi').html(html);
    if (!d.yerelDegisiklik) $('#guncelle').show();
  } catch (e) {
    $('#guncellemeBilgi').html(`<span class="text-danger">${kacis(hataMetni(e))}</span>`);
  }
};

// Yeniden başlayan sunucu cevap verene kadar bekle
const sunucuyuBekle = async (eskiCommit) => {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const s = await surumGoster();
      if (s.commit !== eskiCommit) return true;
    } catch (e) { /* henüz açılmadı */ }
  }
  return false;
};

$(document).ready(async () => {
  if (!(await pano.hazir)) return;
  if (!yoneticiMi()) {
    $('.orta').html('<div class="kullaniciPanel">Bu sayfa yalnızca yöneticiler içindir.</div>');
    return;
  }
  let mevcut;
  try { mevcut = await surumGoster(); } catch (e) { $('#surum').text(hataMetni(e)); }

  $('#denetle').on('click', denetle);
  $('#guncelle').on('click', async () => {
    if (!confirm('Sistem güncellenecek ve uygulama yeniden başlayacak. Devam edilsin mi?')) return;
    $('#guncelle, #denetle').prop('disabled', true);
    $('#guncellemeKayit').text('Güncelleniyor, lütfen bekleyin…');
    try {
      const r = await axios.post('/sistem/guncelle');
      $('#guncellemeKayit').text(r.data.kayit.join('\n'));
      if (r.data.yenidenBaslar) {
        $('#guncellemeKayit').append('\nYeniden başlaması bekleniyor…');
        const tamam = await sunucuyuBekle(mevcut && mevcut.commit);
        $('#guncellemeKayit').append(tamam ? '\nTamamlandı, sayfa yenileniyor.' : '\nSunucu henüz açılmadı, birazdan sayfayı yenileyin.');
        if (tamam) setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      $('#guncellemeKayit').text(`Hata: ${hataMetni(e)}`);
    } finally {
      $('#guncelle, #denetle').prop('disabled', false);
      $('#guncelle').hide();
    }
  });
  denetle();
});
