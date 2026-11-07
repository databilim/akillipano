// IP kamera: canlı görüntü (RTSP -> ffmpeg -> JPEG kareler) ve zil fotoğrafı (ONVIF, olmazsa RTSP'den tek kare).
// Kamera ayarları veritabanındaki "ayar" tablosunda tutulur ve yönetici panelinden değiştirilir.
// Raspberry Pi'de ffmpeg kurulu olmalı: sudo apt install ffmpeg
const { spawn } = require('child_process');
const EventEmitter = require('events');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar');
const vt = require('./veritabani');

const olaylar = new EventEmitter();
olaylar.setMaxListeners(100); // her bekleyen kare isteği geçici bir dinleyici ekler
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const AYAR_ALANLARI = ['kamera_ip', 'kamera_kullanici', 'kamera_sifre', 'kamera_rtsp_port', 'kamera_rtsp_yol', 'kamera_onvif_port'];

let onbellek = { ayar: null, rtspAdres: null, snapshotUri: null };
const onbellegiSifirla = () => { onbellek = { ayar: null, rtspAdres: null, snapshotUri: null }; };

const ayarGetir = async () => {
    if (onbellek.ayar) return onbellek.ayar;
    const a = await vt.ayar.hepsi();
    onbellek.ayar = {
        kamera_ip: a.kamera_ip || '',
        kamera_kullanici: a.kamera_kullanici || '',
        kamera_sifre: a.kamera_sifre || '',
        kamera_rtsp_port: a.kamera_rtsp_port || '554',
        kamera_rtsp_yol: a.kamera_rtsp_yol || '',
        kamera_onvif_port: a.kamera_onvif_port || '80',
    };
    return onbellek.ayar;
};

const tanimliMi = async () => {
    const a = await ayarGetir();
    return !!(a.kamera_ip || a.kamera_rtsp_yol.includes('://'));
};

const ayarKaydet = async (yeni) => {
    for (const alan of AYAR_ALANLARI) {
        if (yeni[alan] !== undefined) await vt.ayar.yaz(alan, String(yeni[alan]).trim());
    }
    onbellegiSifirla();
    canli.yenidenBaslat();
};

// Kullanıcı adı/şifreyi URL'ye ekler (yoksa)
const kimlikEkle = (url, a) => {
    if (!a.kamera_kullanici) return url;
    try {
        const u = new URL(url);
        if (!u.username && /^(rtsp|http|https):$/.test(u.protocol)) {
            u.username = a.kamera_kullanici;
            u.password = a.kamera_sifre;
        }
        return u.toString();
    } catch (e) {
        return url;
    }
};

// --- ONVIF ---------------------------------------------------------------
const onvifBaglan = (a) => new Promise((resolve, reject) => {
    const { Cam } = require('onvif');
    const zaman = setTimeout(() => reject(new Error('ONVIF zaman aşımı')), 10000);
    // eslint-disable-next-line no-new
    new Cam({
        hostname: a.kamera_ip,
        port: parseInt(a.kamera_onvif_port, 10) || 80,
        username: a.kamera_kullanici,
        password: a.kamera_sifre,
        timeout: 8000,
        preserveAddress: true,
    }, function (err) {
        clearTimeout(zaman);
        if (err) return reject(err);
        resolve(this);
    });
});

const onvifUri = (cam, metod) => new Promise((resolve, reject) => {
    const args = metod === 'getStreamUri' ? [{ protocol: 'RTSP' }] : [];
    cam[metod](...args, (err, sonuc) => (err ? reject(err) : resolve(sonuc && sonuc.uri)));
});

// RTSP adresi: yol tam adres ise o, yol verilmişse IP+port+yol, hiçbiri yoksa ONVIF'ten sorulur
const rtspAdresi = async () => {
    if (onbellek.rtspAdres) return onbellek.rtspAdres;
    const a = await ayarGetir();
    let adres;
    if (a.kamera_rtsp_yol.includes('://')) {
        adres = a.kamera_rtsp_yol;
    } else if (a.kamera_rtsp_yol) {
        const yol = a.kamera_rtsp_yol.startsWith('/') ? a.kamera_rtsp_yol : `/${a.kamera_rtsp_yol}`;
        adres = `rtsp://${a.kamera_ip}:${a.kamera_rtsp_port || 554}${yol}`;
    } else if (a.kamera_ip) {
        try {
            const cam = await onvifBaglan(a);
            adres = await onvifUri(cam, 'getStreamUri');
        } catch (e) {
            adres = `rtsp://${a.kamera_ip}:${a.kamera_rtsp_port || 554}/`;
        }
    }
    if (!adres) return null;
    onbellek.rtspAdres = kimlikEkle(adres, a);
    return onbellek.rtspAdres;
};

// --- HTTP (Basic / Digest) ile resim indirme -------------------------------
const httpGet = (url, basliklar = {}) => new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const istek = lib.get(url, { headers: basliklar, timeout: 8000, rejectUnauthorized: false }, (res) => {
        const parcalar = [];
        res.on('data', (p) => parcalar.push(p));
        res.on('end', () => resolve({ durum: res.statusCode, basliklar: res.headers, govde: Buffer.concat(parcalar) }));
    });
    istek.on('timeout', () => istek.destroy(new Error('HTTP zaman aşımı')));
    istek.on('error', reject);
});

const digestBasligi = (wwwAuth, kullanici, sifre, method, uri) => {
    const p = {};
    wwwAuth.replace(/^Digest\s+/i, '').replace(/(\w+)=("([^"]*)"|[^,]*)/g, (_, k, __, tirnakli, ham) => {
        p[k.toLowerCase()] = tirnakli !== undefined ? tirnakli : ham;
    });
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    const ha1 = md5(`${kullanici}:${p.realm}:${sifre}`);
    const ha2 = md5(`${method}:${uri}`);
    const qop = p.qop && p.qop.split(',').map((x) => x.trim()).includes('auth') ? 'auth' : null;
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const yanit = qop ? md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
    let baslik = `Digest username="${kullanici}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", response="${yanit}"`;
    if (p.opaque) baslik += `, opaque="${p.opaque}"`;
    if (qop) baslik += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    return baslik;
};

const resimIndir = async (url, kullanici, sifre) => {
    const u = new URL(url);
    if (u.username) { kullanici = decodeURIComponent(u.username); sifre = decodeURIComponent(u.password); u.username = ''; u.password = ''; }
    const temiz = u.toString();
    const basliklar = {};
    if (kullanici) basliklar.Authorization = `Basic ${Buffer.from(`${kullanici}:${sifre}`).toString('base64')}`;
    let r = await httpGet(temiz, basliklar);
    const auth = r.basliklar['www-authenticate'];
    if (r.durum === 401 && auth && /digest/i.test(auth) && kullanici) {
        r = await httpGet(temiz, { Authorization: digestBasligi(auth, kullanici, sifre, 'GET', u.pathname + u.search) });
    }
    if (r.durum !== 200) throw new Error(`Kamera HTTP ${r.durum}`);
    if (!(r.govde[0] === 0xff && r.govde[1] === 0xd8)) throw new Error('Kameradan gelen veri JPEG değil');
    return r.govde;
};

// --- ffmpeg ile tek kare -------------------------------------------------
const girisArgumanlari = (adres) => (adres.startsWith('rtsp') ? ['-rtsp_transport', 'tcp'] : []).concat(['-i', adres]);

const ffmpegTekKare = (adres) => new Promise((resolve, reject) => {
    const args = ['-loglevel', 'error', '-y', ...girisArgumanlari(adres), '-frames:v', '1', '-q:v', '3', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
    let surec;
    try { surec = spawn(FFMPEG, args); } catch (e) { return reject(e); }
    const parcalar = [];
    let hata = '';
    const zaman = setTimeout(() => surec.kill('SIGKILL'), 15000);
    surec.stdout.on('data', (p) => parcalar.push(p));
    surec.stderr.on('data', (p) => { hata += p; });
    surec.on('error', (e) => { clearTimeout(zaman); reject(e.code === 'ENOENT' ? new Error('ffmpeg kurulu değil (sudo apt install ffmpeg)') : e); });
    surec.on('close', () => {
        clearTimeout(zaman);
        const veri = Buffer.concat(parcalar);
        if (veri.length > 2 && veri[0] === 0xff && veri[1] === 0xd8) resolve(veri);
        else reject(new Error(`RTSP'den kare alınamadı ${hata.trim().split('\n').pop() || ''}`.trim()));
    });
});

// Fotoğraf çek: önce ONVIF snapshot, olmazsa RTSP'den tek kare
const fotografCek = async () => {
    const a = await ayarGetir();
    if (!(await tanimliMi())) throw new Error('Kamera tanımlı değil');
    const hatalar = [];
    if (a.kamera_ip) {
        try {
            if (!onbellek.snapshotUri) {
                const cam = await onvifBaglan(a);
                onbellek.snapshotUri = await onvifUri(cam, 'getSnapshotUri');
            }
            if (onbellek.snapshotUri) {
                return { resim: await resimIndir(onbellek.snapshotUri, a.kamera_kullanici, a.kamera_sifre), kaynak: 'onvif' };
            }
        } catch (e) {
            onbellek.snapshotUri = null;
            hatalar.push(`ONVIF: ${e.message}`);
        }
    }
    try {
        const adres = await rtspAdresi();
        return { resim: await ffmpegTekKare(adres), kaynak: 'rtsp' };
    } catch (e) {
        hatalar.push(`RTSP: ${e.message}`);
    }
    throw new Error(hatalar.join(' / '));
};

// --- Zil fotoğrafları ----------------------------------------------------
const klasor = () => {
    const k = path.join(ayarlar.kayitKlasoru, 'zil');
    fs.mkdirSync(k, { recursive: true });
    return k;
};

let sonZilFoto = 0;
const zilFotografi = async (zilAdi) => {
    if (!(await tanimliMi())) return null;
    if (Date.now() - sonZilFoto < 5000) return null; // art arda basmalarda tek fotoğraf
    sonZilFoto = Date.now();
    const zaman = new Date();
    try {
        const { resim, kaynak } = await fotografCek();
        const dosya = `${zaman.toISOString().replace(/[:.]/g, '-')}.jpg`;
        await fs.promises.writeFile(path.join(klasor(), dosya), resim);
        const kayit = await vt.zilKayit.ekle({ zaman: zaman.toISOString(), dosya, kaynak, adi: zilAdi || 'Zil' });
        const yeni = await vt.zilKayit.getir(kayit.id);
        olaylar.emit('zilFotografi', yeni);
        eskileriSil().catch(() => {});
        return yeni;
    } catch (e) {
        console.error('Zil fotoğrafı alınamadı:', e.message);
        olaylar.emit('hata', { mesaj: `Zil fotoğrafı alınamadı: ${e.message}` });
        return null;
    }
};

const zilResimYolu = (kayit) => path.join(klasor(), path.basename(kayit.dosya));

const zilKaydiSil = async (kayit) => {
    await fs.promises.unlink(zilResimYolu(kayit)).catch(() => {});
    await vt.zilKayit.sil(kayit.ID);
};

const eskileriSil = async () => {
    const sinir = new Date(Date.now() - ayarlar.zilKayitGun * 24 * 60 * 60 * 1000).toISOString();
    for (const k of await vt.zilKayit.oncekiler(sinir)) await zilKaydiSil(k);
};

// --- Canlı görüntü ---------------------------------------------------------
// İzleyen varken tek bir ffmpeg çalışır, kareler tüm izleyicilere dağıtılır.
// Bağlantı koparsa birkaç saniye sonra yeniden denenir.
const canli = {
    izleyiciler: new Set(),
    surec: null,
    yenidenZaman: null,
    sonHata: null,

    sonKare: null,
    kareNo: 0,
    httpZaman: null,

    // HTTP ile izleyen (tarayıcı her kareyi ayrı istekle alır; Cloudflare gibi proxy'lerden sorunsuz geçer).
    // 15 saniye istek gelmezse izleyici bırakılmış sayılır.
    httpIzle() {
        clearTimeout(this.httpZaman);
        this.httpZaman = setTimeout(() => this.cikar('http'), 15000);
        if (!this.izleyiciler.has('http')) this.ekle('http');
    },

    // "son" numaralı kareden daha yeni bir kare gelene kadar en fazla beklemeMs bekler
    yeniKareBekle(son, beklemeMs) {
        if (this.sonKare && this.kareNo > son) return Promise.resolve({ kare: this.sonKare, no: this.kareNo });
        return new Promise((resolve) => {
            const dinle = () => { clearTimeout(zaman); resolve({ kare: this.sonKare, no: this.kareNo }); };
            const zaman = setTimeout(() => { olaylar.off('kare', dinle); resolve(null); }, beklemeMs);
            olaylar.once('kare', dinle);
        });
    },

    ekle(id) {
        this.izleyiciler.add(id);
        if (!this.surec && !this.yenidenZaman) this.baslat();
    },
    cikar(id) {
        this.izleyiciler.delete(id);
        if (this.izleyiciler.size === 0) this.durdur();
    },
    durdur() {
        clearTimeout(this.yenidenZaman);
        this.yenidenZaman = null;
        if (this.surec) { this.surec.removeAllListeners('close'); this.surec.kill('SIGKILL'); }
        this.surec = null;
        this.sonKare = null;
    },
    yenidenBaslat() {
        this.durdur();
        if (this.izleyiciler.size) this.baslat();
    },
    async baslat() {
        if (!(await tanimliMi())) return;
        let adres;
        try { adres = await rtspAdresi(); } catch (e) { adres = null; }
        if (!adres || this.surec || this.izleyiciler.size === 0) return;
        // Dosya girişi (test) gerçek zamanlı okunur; RTSP zaten canlıdır
        const args = ['-loglevel', 'error', ...(adres.startsWith('rtsp') ? [] : ['-re']), ...girisArgumanlari(adres), '-an',
            '-vf', `scale=${ayarlar.kamera.genislik}:-2`, '-r', String(ayarlar.kamera.fps), '-q:v', '7',
            '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
        let tampon = Buffer.alloc(0);
        let hata = '';
        const surec = spawn(FFMPEG, args);
        this.surec = surec;
        surec.on('error', (e) => { hata = e.code === 'ENOENT' ? 'ffmpeg kurulu değil' : e.message; });
        surec.stderr.on('data', (p) => { hata = String(p).trim(); });
        surec.stdout.on('data', (p) => {
            tampon = Buffer.concat([tampon, p]);
            // JPEG kareleri FFD8 ile başlar, FFD9 ile biter
            for (;;) {
                const bas = tampon.indexOf(Buffer.from([0xff, 0xd8]));
                if (bas < 0) { tampon = Buffer.alloc(0); break; }
                const son = tampon.indexOf(Buffer.from([0xff, 0xd9]), bas + 2);
                if (son < 0) { tampon = tampon.subarray(bas); break; }
                const kare = tampon.subarray(bas, son + 2);
                tampon = tampon.subarray(son + 2);
                this.sonHata = null;
                this.sonKare = Buffer.from(kare);
                this.kareNo += 1;
                olaylar.emit('kare', this.sonKare);
            }
            if (tampon.length > 5 * 1024 * 1024) tampon = Buffer.alloc(0);
        });
        surec.on('close', () => {
            if (this.surec !== surec) return;
            this.surec = null;
            this.sonHata = hata || 'Kamera bağlantısı koptu';
            this.sonKare = null;
            onbellek.rtspAdres = null;
            if (this.izleyiciler.size) this.yenidenZaman = setTimeout(() => { this.yenidenZaman = null; this.baslat(); }, 5000);
        });
    },
};

module.exports = {
    olaylar, ayarGetir, ayarKaydet, tanimliMi, fotografCek, zilFotografi, zilResimYolu, zilKaydiSil, canli, digestBasligi, resimIndir,
};
