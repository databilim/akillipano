// Kullanıcılar sayfası: herkes kendi şifresini değiştirir, yönetici kullanıcı ekler/düzenler/siler
const formVerisi = (form) => {
  const veri = {};
  $(form).serializeArray().forEach((o) => { veri[o.name] = o.value; });
  return veri;
};

const mesaj = (form, metin, basarili) => {
  $(form).find('.formMesaj').text(metin || '').attr('class', 'formMesaj ' + (basarili ? 'text-success' : 'text-danger'));
};

const hataMetni = (e) => (e.response && e.response.data && e.response.data.message) || 'İşlem yapılamadı';

let kullanicilar = [];

const listele = async () => {
  const cevap = await axios.get('/kullanici');
  kullanicilar = cevap.data.kullanicilar || [];
  const benID = pano.user[0].ID;
  $('#kullaniciListe').html(kullanicilar.map((k) => `
    <tr>
      <td>${kacis(k.user)}${k.ID === benID ? ' (siz)' : ''}</td>
      <td>${k.yetki === 'admin' ? 'Yönetici' : 'Kullanıcı'}</td>
      <td>${k.durum == 0 ? 'Pasif' : 'Aktif'}</td>
      <td class="text-right">
        <button class="btn btn-sm btn-outline-primary" onclick="duzenleAc(${k.ID})">Düzenle</button>
        ${k.ID === benID ? '' : `<button class="btn btn-sm btn-outline-danger" onclick="kullaniciSil(${k.ID})">Sil</button>`}
      </td>
    </tr>`).join(''));
};

const duzenleAc = (ID) => {
  const k = kullanicilar.find((x) => x.ID === ID);
  if (!k) return;
  const form = $('#duzenleForm');
  ['ID', 'user', 'panoName', 'il', 'ilce'].forEach((a) => form.find(`[name=${a}]`).val(k[a] || ''));
  form.find('[name=yetki]').val(k.yetki === 'admin' ? 'admin' : 'kullanici');
  form.find('[name=durum]').val(k.durum == 0 ? '0' : '1');
  form.find('[name=yeniSifre]').val('');
  mesaj(form, '');
  $('#duzenleModal').modal('show');
};

const kullaniciSil = async (ID) => {
  const k = kullanicilar.find((x) => x.ID === ID);
  if (!k || !confirm(`"${k.user}" kullanıcısı silinsin mi?`)) return;
  try {
    await axios.delete('/kullanici/' + ID);
    listele();
  } catch (e) {
    alert(hataMetni(e));
  }
};

$(document).ready(async () => {
  if (!(await pano.hazir)) return;

  $('#sifreForm').on('submit', async function (event) {
    event.preventDefault();
    const veri = formVerisi(this);
    if (veri.yeniSifre !== veri.yeniSifre2) return mesaj(this, 'Yeni şifreler aynı değil');
    try {
      const cevap = await axios.post('/kullanici/sifre', { eskiSifre: veri.eskiSifre, yeniSifre: veri.yeniSifre });
      this.reset();
      mesaj(this, cevap.data.message, true);
    } catch (e) {
      mesaj(this, hataMetni(e));
    }
  });

  if (!yoneticiMi()) return;
  listele();

  $('#ekleForm').on('submit', async function (event) {
    event.preventDefault();
    try {
      await axios.post('/kullanici', formVerisi(this));
      this.reset();
      mesaj(this, 'Kullanıcı eklendi', true);
      listele();
    } catch (e) {
      mesaj(this, hataMetni(e));
    }
  });

  $('#duzenleForm').on('submit', async function (event) {
    event.preventDefault();
    const veri = formVerisi(this);
    try {
      await axios.put('/kullanici/' + veri.ID, {
        user: veri.user, panoName: veri.panoName, il: veri.il, ilce: veri.ilce, yetki: veri.yetki, durum: veri.durum,
      });
      if (veri.yeniSifre) await axios.post(`/kullanici/${veri.ID}/sifre`, { yeniSifre: veri.yeniSifre });
      $('#duzenleModal').modal('hide');
      listele();
    } catch (e) {
      mesaj(this, hataMetni(e));
    }
  });
});
