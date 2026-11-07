// Uzaktan güncelleme: GitHub'daki yeni kodu çeker (git), gerekirse paketleri kurar ve uygulamayı yeniden başlatır.
// Uygulama klasörü bir git deposu olmalı (git clone ile kurulmuş). Yeniden başlatma systemd servisiyle
// çalışırken otomatiktir (Restart=always); elle çalıştırılıyorsa kullanıcıya bildirilir.
const { execFile } = require('child_process');
const path = require('path');

const KOK = path.join(__dirname, '..');

const calistir = (komut, args, zamanAsimi = 120000) => new Promise((resolve, reject) => {
    execFile(komut, args, { cwd: KOK, timeout: zamanAsimi, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
            err.message = `${komut} ${args.join(' ')}: ${(stderr || err.message).trim()}`;
            return reject(err);
        }
        resolve(stdout.trim());
    });
});
const git = (...args) => calistir('git', args);

let calisiyor = false;
const systemdIle = () => !!process.env.INVOCATION_ID;

const surum = async () => {
    const [commit, tarih, dal] = await Promise.all([
        git('rev-parse', '--short', 'HEAD'),
        git('log', '-1', '--format=%cI'),
        git('rev-parse', '--abbrev-ref', 'HEAD'),
    ]);
    return { commit, tarih, dal };
};

// Uzak depoyu kontrol eder, yeni değişiklikleri listeler
const denetle = async () => {
    const s = await surum();
    let upstream;
    try {
        upstream = await git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
    } catch (e) {
        throw new Error(`"${s.dal}" dalı uzak bir dala bağlı değil. Pi'de: git branch -u origin/main`);
    }
    await calistir('git', ['fetch', '--quiet', upstream.split('/')[0]], 60000);
    const liste = await git('log', '--format=%h|%cI|%s', `HEAD..${upstream}`);
    const yeniler = liste ? liste.split('\n').map((satir) => {
        const [commit, tarih, ...mesaj] = satir.split('|');
        return { commit, tarih, mesaj: mesaj.join('|') };
    }) : [];
    const degisiklik = await git('status', '--porcelain', '--untracked-files=no');
    return { ...s, upstream, yeniler, yerelDegisiklik: !!degisiklik, otomatikYenidenBaslar: systemdIle() };
};

const guncelle = async () => {
    if (calisiyor) throw new Error('Güncelleme zaten çalışıyor');
    calisiyor = true;
    const kayit = [];
    try {
        const d = await denetle();
        if (d.yerelDegisiklik) throw new Error('Pi üzerindeki dosyalarda elle yapılmış değişiklik var, güncelleme durduruldu (git status ile bakın)');
        if (!d.yeniler.length) return { guncellendi: false, kayit: ['Zaten güncel'], surum: d };

        const eski = await git('rev-parse', 'HEAD');
        const degisenDosyalar = (await git('diff', '--name-only', 'HEAD', d.upstream)).split('\n');
        kayit.push(`${d.yeniler.length} yeni değişiklik indiriliyor`);
        kayit.push(await git('merge', '--ff-only', d.upstream));

        if (degisenDosyalar.some((f) => f === 'package.json' || f === 'package-lock.json')) {
            kayit.push('Paketler kuruluyor (birkaç dakika sürebilir)');
            try {
                await calistir('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], 15 * 60 * 1000);
            } catch (e) {
                // Paketler kurulamazsa eski koda geri dön
                await git('reset', '--hard', eski);
                throw new Error(`Paketler kurulamadı, eski sürüme geri dönüldü. ${e.message}`);
            }
        }

        const yeni = await surum();
        kayit.push(`Güncellendi: ${yeni.commit}`);
        const yenidenBaslar = systemdIle();
        if (yenidenBaslar) {
            kayit.push('Uygulama yeniden başlatılıyor');
            setTimeout(() => process.exit(0), 1500);
        } else {
            kayit.push('Uygulama servis olarak çalışmıyor, yeni kodun devreye girmesi için elle yeniden başlatın');
        }
        return { guncellendi: true, yenidenBaslar, kayit, surum: yeni };
    } finally {
        calisiyor = false;
    }
};

module.exports = { surum, denetle, guncelle };
