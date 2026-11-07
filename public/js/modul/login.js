$(document).ready(async () => {
  try {
    const user = await axios.get('/profil');
    if (user.data.status != 0) window.location.href = '/profil.html';
  } catch (e) { /* giriş sayfasında kal */ }

  $('#loginForm').submit(async function (event) {
    event.preventDefault();
    const veri = {};
    $(this).serializeArray().forEach((o) => { veri[o.name] = o.value; });
    try {
      const cevap = await axios.post('/login', veri);
      if (cevap.data.status == 1) window.location.href = '/profil.html';
      else alert(cevap.data.message);
    } catch (e) {
      alert((e.response && e.response.data && e.response.data.message) || 'Sunucuya ulaşılamadı, lütfen tekrar deneyin');
    }
  });
});
