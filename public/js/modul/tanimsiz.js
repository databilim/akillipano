// Tanımsız butonlar: yeni bulunan butonlara ad, tip ve röle çıkışı atanır (yalnızca yönetici)
const formHtml = (k) => {
  const id = k.ID;
  const secenek = (deger, ad) => `<option value="${deger}" ${k.tipi === deger ? 'selected' : ''}>${ad}</option>`;
  return `
    <div class="input"><a class="komponat" data-toggle="modal" data-target="#tanimsiz${id}" href="#">
      <img width="100" src="/img/tanimsiz.svg" alt="" tabindex="-1"></a>
      <h3>${kacis(k.adi || ('Buton ' + (k.input || '')))}</h3>
    </div>

    <div class="modal fade" id="tanimsiz${id}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${kacis(k.adi || ('Buton ' + (k.input || '')))}</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Kapat"><span aria-hidden="true">&times;</span></button>
          </div>
          <div class="modal-body">
            <form id="inputForm${id}" onsubmit="return inputTanimla(event)" action="#" method="post">
              <div class="form-group">
                <label>Adı</label>
                <input type="text" class="form-control" name="adi" placeholder="ör. Salon" value="${kacis(k.adi)}" required>
              </div>
              <div class="form-group">
                <label>Tipi</label>
                <select class="form-control" name="tipi">
                  ${secenek('lamba', 'Lamba')}${secenek('zil', 'Zil')}${secenek('priz', 'Priz')}${secenek('alarm', 'Alarm')}${secenek('yangin', 'Yangın')}
                </select>
              </div>
              <div class="form-group">
                <label>Röle çıkışları (1-16)</label>
                <input type="text" class="form-control" name="output" placeholder="ör. [6] ya da [8,9]" value="${kacis(k.output || '')}" required>
              </div>
              <div class="form-group form-check">
                <input type="checkbox" class="form-check-input" name="durum" value="1" id="durum${id}" checked>
                <label class="form-check-label" for="durum${id}">Etkin</label>
              </div>
              <input type="hidden" name="ID" value="${id}">
              <div class="text-danger formHata"></div>
              <input class="btn btn-primary" type="submit" value="Kaydet">
            </form>
          </div>
        </div>
      </div>
    </div>`;
};

const inputcek = async () => {
  const inputs = await axios.get('/profil/input');
  inputs.data.forEach((k) => {
    if (k.durum == 0) $('.orta').append(formHtml(k));
  });
};

const inputTanimla = async (event) => {
  event.preventDefault();
  const form = $(event.target);
  const veri = {};
  form.serializeArray().forEach((o) => { veri[o.name] = o.value; });
  if (!veri.durum) veri.durum = 0;
  try {
    await axios.post('/profil/input', veri);
    window.location.reload();
  } catch (e) {
    const mesaj = e.response && e.response.data && e.response.data.message;
    form.find('.formHata').text(mesaj || 'Kaydedilemedi');
  }
  return false;
};

$(document).ready(async () => {
  await pano.hazir;
  if (!yoneticiMi()) {
    $('.orta').html('<div class="kullaniciPanel">Bu sayfa yalnızca yöneticiler içindir.</div>');
    return;
  }
  inputcek();
});
