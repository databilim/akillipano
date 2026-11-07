// Kamera: ffmpeg ile tek kare / canlı görüntü ve Digest kimlik doğrulama (ffmpeg kurulu olmalı)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const klasor = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-kamera-'));
Object.assign(process.env, {
    I2C_SIMULASYON: '1', DB_DOSYA: path.join(klasor, 'test.db'), SESSION_SECRET: 'test', KAYIT_KLASORU: klasor,
});

let ffmpegVar = true;
try { execFileSync('ffmpeg', ['-version']); } catch (e) { ffmpegVar = false; }

const vt = require('../modul/veritabani');
const kamera = require('../modul/kamera');

const video = path.join(klasor, 'test.mp4');

test.before(async () => {
    await vt.hazir;
    if (ffmpegVar) {
        execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '3', '-pix_fmt', 'yuv420p', video]);
    }
});

test('kamera tanımlı değilken zil fotoğrafı denenmez', async () => {
    assert.strictEqual(await kamera.tanimliMi(), false);
    assert.strictEqual(await kamera.zilFotografi('Zil'), null);
});

test('zil fotoğrafı (RTSP yedeği) kaydedilir ve listelenir', { skip: !ffmpegVar && 'ffmpeg yok' }, async () => {
    await vt.ayar.yaz('kamera_rtsp_yol', `file://${video}`);
    await kamera.ayarKaydet({});
    assert.strictEqual(await kamera.tanimliMi(), true);
    const k = await kamera.zilFotografi('Kapı');
    assert.ok(k, 'kayıt oluşmadı');
    assert.strictEqual(k.kaynak, 'rtsp');
    assert.strictEqual(k.adi, 'Kapı');
    const veri = fs.readFileSync(kamera.zilResimYolu(k));
    assert.strictEqual(veri[0], 0xff);
    assert.strictEqual(veri[1], 0xd8);
    const liste = await vt.zilKayit.listele({});
    assert.strictEqual(liste.length, 1);
    // 5 saniye içindeki ikinci basış yeni fotoğraf çekmez
    assert.strictEqual(await kamera.zilFotografi('Kapı'), null);
});

test('canlı görüntü kare üretir ve izleyici kalmayınca durur', { skip: !ffmpegVar && 'ffmpeg yok' }, async () => {
    const kareler = [];
    const dinle = (k) => kareler.push(k);
    kamera.olaylar.on('kare', dinle);
    kamera.canli.ekle('a');
    for (let i = 0; i < 50 && kareler.length < 3; i += 1) await new Promise((r) => setTimeout(r, 100));
    kamera.canli.cikar('a');
    kamera.olaylar.off('kare', dinle);
    assert.ok(kareler.length >= 3, `yalnızca ${kareler.length} kare geldi`);
    assert.ok(kareler.every((k) => k[0] === 0xff && k[1] === 0xd8 && k[k.length - 2] === 0xff && k[k.length - 1] === 0xd9));
    assert.strictEqual(kamera.canli.surec, null);
});

test('Digest kimlik doğrulamalı kameradan resim indirilir', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    const sunucu = http.createServer((req, res) => {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Digest')) {
            res.writeHead(401, { 'WWW-Authenticate': 'Digest realm="kamera", qop="auth", nonce="abc123", opaque="xyz"' });
            return res.end();
        }
        const p = {};
        auth.replace(/(\w+)="?([^",]*)"?/g, (_, k, v) => { p[k] = v; });
        const beklenen = md5(`${md5('admin:kamera:gizli')}:abc123:${p.nc}:${p.cnonce}:auth:${md5(`GET:${req.url}`)}`);
        if (p.response !== beklenen) { res.writeHead(401); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(jpeg);
    });
    await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${sunucu.address().port}/onvif/snapshot?ch=1`;
    try {
        assert.deepStrictEqual(await kamera.resimIndir(url, 'admin', 'gizli'), jpeg);
        await assert.rejects(kamera.resimIndir(url, 'admin', 'yanlis'), /401/);
    } finally {
        sunucu.close();
    }
});

test('canlı görüntü HTTP ile kare kare alınır', { skip: !ffmpegVar && 'ffmpeg yok' }, async () => {
    const ilk = await (kamera.canli.httpIzle(), kamera.canli.yeniKareBekle(0, 8000));
    assert.ok(ilk, 'kare gelmedi');
    assert.strictEqual(ilk.kare[0], 0xff);
    const ikinci = await kamera.canli.yeniKareBekle(ilk.no, 8000);
    assert.ok(ikinci && ikinci.no > ilk.no);
    kamera.canli.cikar('http');
    clearTimeout(kamera.canli.httpZaman);
    assert.strictEqual(kamera.canli.surec, null);
});
