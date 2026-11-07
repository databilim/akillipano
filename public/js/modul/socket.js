// Socket bağlantısı ve ekrandaki bağlantı uyarıları.
// Sunucuyla bağlantı koparsa ya da I2C kartlarına ulaşılamazsa sayfanın üstünde uyarı çıkar.
var socket = io();

var uyari = (function () {
  var kutu = null;
  var mesajlar = {};

  function ciz() {
    if (!kutu) {
      kutu = document.createElement('div');
      kutu.className = 'baglantiUyari';
      kutu.setAttribute('role', 'alert');
      document.body.appendChild(kutu);
    }
    var liste = Object.keys(mesajlar).map(function (k) { return mesajlar[k]; });
    kutu.textContent = '';
    liste.forEach(function (m) {
      var satir = document.createElement('div');
      satir.textContent = '⚠ ' + m;
      kutu.appendChild(satir);
    });
    kutu.style.display = liste.length ? 'block' : 'none';
  }

  return {
    goster: function (anahtar, mesaj) { mesajlar[anahtar] = mesaj; hazir(ciz); },
    gizle: function (anahtar) { delete mesajlar[anahtar]; hazir(ciz); },
  };
})();

function hazir(fn) {
  if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
}

// Kısa süreli bildirim (ör. "röle açılamadı")
function bildirim(mesaj) {
  hazir(function () {
    var el = document.createElement('div');
    el.className = 'bildirimKutu';
    el.textContent = mesaj;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 5000);
  });
}

socket.on('connect', function () {
  uyari.gizle('socket');
});

socket.on('disconnect', function () {
  uyari.goster('socket', 'Sunucu bağlantısı kesildi. Yeniden bağlanılıyor…');
});

socket.on('connect_error', function (err) {
  if (err && err.message === 'yetkisiz') {
    window.location.href = '/';
    return;
  }
  uyari.goster('socket', 'Sunucuya bağlanılamıyor. Pi kapalı ya da ağ bağlantısı yok.');
});

socket.on('sistemDurumu', function (d) {
  var i2c = d && d.i2c;
  if (!i2c) return;
  if (!i2c.roleKarti) {
    uyari.goster('role', 'Röle kartına (I2C) ulaşılamıyor. Lambalar ve prizler kontrol edilemiyor.');
  } else {
    uyari.gizle('role');
  }
  if (!i2c.butonKarti) {
    uyari.goster('buton', 'Buton kartına (I2C) ulaşılamıyor. Duvar butonları çalışmıyor.');
  } else {
    uyari.gizle('buton');
  }
});

socket.on('hata', function (h) {
  if (h && h.mesaj) bildirim(h.mesaj);
});
