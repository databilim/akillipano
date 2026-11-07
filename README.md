# akillipano

Akıllı elektrik panosu. Raspberry Pi üzerinde çalışan Node.js uygulaması, I2C üzerinden iki Arduino Uno ile 16 kanal röleyi ve duvar butonlarını yönetir.

## Donanım ve I2C protokolü

| Kart | Varsayılan adres | Görev |
|---|---|---|
| Buton Arduino'su | 10 (0x0A) | Pi her 100 ms'de 2 bayt okur. `01ff` = buton 1 … `10ff` = buton 16 |
| Röle Arduino'su | 100 (0x64) | Pi tek komut baytı yazar: `(9 + kanal) * 10 + durum`. Örn. kanal 1 aç = 101, kanal 16 kapat = 250 |

Röle komutu `writeI2cBlock(adres, 0, 8 bayt)` ile gönderilir, yani Arduino `[0, komut, 0, 0, 0, 0, 0, 0, 0]` alır.

## Kurulum (Raspberry Pi)

```bash
sudo raspi-config nonint do_i2c 0      # I2C'yi aç
sudo usermod -aG i2c pi
sudo apt install -y ffmpeg git         # kamera için ffmpeg
git clone https://github.com/databilim/akillipano.git /home/pi/pano
cd /home/pi/pano
npm install
cp .env.example .env                   # gerekirse düzenleyin
node araclar/i2c-tara.js               # kartlar görünüyor mu?
sudo cp deploy/akillipano.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now akillipano
```

Mevcut `akillipano.db` dosyanızı uygulama klasörüne koyun (ya da `.env` içinde `DB_DOSYA` ile yolunu verin). İlk açılışta:
- düz metin saklanan şifreler bcrypt ile şifrelenir (aynı şifreyle giriş yapmaya devam edersiniz),
- mevcut kullanıcılar yönetici yapılır,
- hiç kullanıcı yoksa `admin / admin` oluşturulur, ilk girişte değiştirin.

## Yetkiler

- **Yönetici:** her şey (aç/kapa, buton tanımlama, kullanıcı ekleme/düzenleme/silme, şifre sıfırlama).
- **Kullanıcı:** yalnızca aç/kapa ve kendi şifresini değiştirme.

Kullanıcılar: Ayarlar (çark) → Kullanıcılar. Şifre değiştirme: Ayarlar → Şifremi değiştir.

## Kamera ve zil fotoğrafları

Ayarlar → Kamera ayarları (yönetici) sayfasından kameranın IP adresi, kullanıcı adı ve şifresi girilir.
RTSP yolu boş bırakılırsa ONVIF ile kameradan sorulur; bulunamazsa yolu elle yazın
(ör. Hikvision `/Streaming/Channels/102`, Dahua `/cam/realmonitor?channel=1&subtype=1`).
"Fotoğraf çekerek dene" butonu ayarların çalışıp çalışmadığını gösterir.

- Ana ekranda canlı görüntü: yalnızca birisi izlerken ffmpeg çalışır.
- Zile basılınca (duvar butonu ya da ekran) ONVIF ile fotoğraf alınır; ONVIF yoksa RTSP görüntüsünden kare alınır.
  Fotoğraflar `kayitlar/zil` klasöründe tarihleriyle saklanır, `ZIL_KAYIT_GUN` günden eskiler silinir.
- Zil fotoğrafları: alt menüdeki zil simgesi (son 5) ve Ayarlar → Zil kayıtları (güne göre). Tüm kullanıcılar görebilir, yalnızca yönetici silebilir.

## Uzaktan güncelleme

Ayarlar → Sistem güncelleme (yönetici): GitHub'daki yeni değişiklikleri listeler, "Güncelle" ile indirir,
gerekirse `npm install` çalıştırır ve uygulamayı yeniden başlatır (systemd servisi olarak çalışıyorsa otomatik).
Pi'deki klasör `git clone` ile kurulmuş ve `main` dalında olmalı. Pi üzerinde dosyalar elle değiştirilmişse
güncelleme yapılmaz.

## Davranış

- Elektrik gidip gelince açık olan lamba/prizler tekrar açılır, zil kapalı başlar (`ACILISTA_DURUMU_YUKLE`).
- Zil `ZIL_SURE_MS` sonra sunucu tarafından kapatılır (ekran açık olmasa da).
- Butona basılı tutmak röleyi tekrar tekrar açıp kapatmaz.
- Röle komutu gitmezse veritabanı güncellenmez, ekranda hata çıkar.
- Sunucu bağlantısı koparsa ya da röle/buton kartına I2C ile ulaşılamazsa ekranın üstünde kırmızı uyarı görünür.

## Geliştirme

Donanım olmadan denemek için:

```bash
I2C_SIMULASYON=1 PORT=8080 npm start
npm test
```
