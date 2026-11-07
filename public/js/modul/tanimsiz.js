// Butonlar (yalnızca yönetici): tanımlı ve tanımsız kayıtları ekleme, düzenleme, silme
let butonlar = [];

const butonNo = (k) => (k.hex && /^[0-9a-f]{2}ff$/.test(k.hex) ? parseInt(k.hex.slice(0, 2), 16) : 0);
const kanalMetni = (k) => {
  try { return JSON.parse(k.output).join(', '); } catch (e) { return ''; }
};
const TIP_ADI = { lamba: 'Lamba', priz: 'Priz', zil: 'Zil', alarm: 'Alarm', yangin: 'Yangın' };

const listele = async () => {
  const cevap = await axios.get('/profil/input');
  butonlar = cevap.data;
  const tanimsiz = butonlar.filter((k) => k.durum != 1);
  const tanimli = butonlar.filter((k) => k.durum == 1);

  $('#tanimsizListe').html(tanimsiz.length ? tanimsiz.map((k) => `
    <tr>
      <td>${kacis(k.adi || 'Adsız')}</td>
      <td>${butonNo(k) ? `Duvar butonu ${butonNo(k)}` : 'Duvar butonu yok'}</td>
      <td class="text-right">
        <button class="btn btn-sm btn-primary" onclick="duzenleAc(${k.ID})">Tanımla</button>
        <button class="btn btn-sm btn-outline-danger" onclick="butonSil(${k.ID})">Sil</button>
      </td>
    </tr>`).join('') : '<tr><td class="text-muted">Tanımsız buton yok</td></tr>');

  $('#tanimliListe').html(tanimli.length ? tanimli.map((k) => `
    <tr>
      <td>${k.sira === null || k.sira === undefined ? '-' : k.sira}</td>
      <td>${kacis(k.adi)}</td>
      <td>${TIP_ADI[k.tipi] || kacis(k.tipi)}</td>
      <td>${butonNo(k) || '-'}</td>
      <td>${kacis(kanalMetni(k))}</td>
      <td class="text-right">
        <button class="btn btn-sm btn-outline-primary" onclick="duzenleAc(${k.ID})">Düzenle</button>
        <button class="btn btn-sm btn-outline-danger" onclick="butonSil(${k.ID})">Sil</button>
      </td>
    </tr>`).join('') : '<tr><td class="text-muted" colspan="6">Tanımlı buton yok</td></tr>');
};

const duzenleAc = (ID) => {
  const k = ID ? butonlar.find((x) => x.ID === ID) : { durum: 1, tipi: 'lamba' };
  if (!k) return;
  const form = $('#butonForm');
  form[0].reset();
  form.find('.formMesaj').text('');
  const kullanilan = new Map(butonlar.filter((x) => x.ID !== ID && butonNo(x)).map((x) => [butonNo(x), x.adi || 'tanımsız']));
  let secenekler = '<option value="0">Yok</option>';
  for (let i = 1; i <= 16; i += 1) {
    secenekler += `<option value="${i}" ${kullanilan.has(i) ? 'disabled' : ''}>${i}${kullanilan.has(i) ? ` (${kacis(kullanilan.get(i))})` : ''}</option>`;
  }
  form.find('[name=buton]').html(secenekler).val(String(butonNo(k)));
  form.find('[name=ID]').val(k.ID || '');
  form.find('[name=adi]').val(k.adi || '');
  form.find('[name=sira]').val(k.sira === null || k.sira === undefined ? '' : k.sira);
  form.find('[name=tipi]').val(k.tipi || 'lamba');
  form.find('[name=output]').val(kanalMetni(k));
  // Tanımsız bir buton açıldığında "Etkin" işaretli gelir, kaydedince tanımlanmış olur
  form.find('[name=durum]').prop('checked', !ID || k.durum == 1 || !k.output);
  $('#butonModal .modal-title').text(ID ? (k.durum == 1 ? 'Butonu düzenle' : 'Butonu tanımla') : 'Yeni buton');
  $('#butonSil').toggle(!!ID);
  $('#butonModal').modal('show');
};

const butonSil = async (ID) => {
  const k = butonlar.find((x) => x.ID === ID);
  if (!k || !confirm(`"${k.adi || 'Adsız'}" silinsin mi?${butonNo(k) ? ' Duvar butonuna tekrar basılırsa tanımsız olarak geri gelir.' : ''}`)) return;
  try {
    await axios.delete(`/profil/input/${ID}`);
    $('#butonModal').modal('hide');
    listele();
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.message) || 'Silinemedi');
  }
};

$(document).ready(async () => {
  await pano.hazir;
  if (!yoneticiMi()) {
    $('.orta').html('<div class="kullaniciPanel">Bu sayfa yalnızca yöneticiler içindir.</div>');
    return;
  }
  listele();

  $('#butonSil').on('click', () => butonSil(parseInt($('#butonForm [name=ID]').val(), 10)));
  $('#butonKaydet').on('click', async () => {
    const form = $('#butonForm');
    const ID = form.find('[name=ID]').val();
    const kanallar = form.find('[name=output]').val().split(/[^0-9]+/).filter(Boolean).map(Number);
    const veri = {
      adi: form.find('[name=adi]').val(),
      sira: form.find('[name=sira]').val(),
      tipi: form.find('[name=tipi]').val(),
      buton: form.find('[name=buton]').val(),
      output: JSON.stringify(kanallar),
      durum: form.find('[name=durum]').is(':checked') ? 1 : 0,
    };
    try {
      if (ID) await axios.post('/profil/input', { ID, ...veri });
      else await axios.post('/profil/input/yeni', veri);
      $('#butonModal').modal('hide');
      listele();
    } catch (e) {
      form.find('.formMesaj').text((e.response && e.response.data && e.response.data.message) || 'Kaydedilemedi');
    }
  });
});
