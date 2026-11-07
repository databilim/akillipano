// Oturum kontrolü için ara katmanlar.
// Her istekte kullanıcı veritabanından tekrar okunur: silinen ya da pasif yapılan
// kullanıcının açık oturumu hemen geçersiz olur, yetki değişikliği hemen uygulanır.
const vt = require('./veritabani');

const oturumuDogrula = async (session) => {
    if (!session || !session.user) return null;
    const k = await vt.kullanici.getir(session.user.id);
    if (!k || k.durum == 0) return null;
    session.user.user = k.user;
    session.user.yetki = k.yetki || 'kullanici';
    return session.user;
};

const girisGerekli = async (req, res, next) => {
    if (await oturumuDogrula(req.session)) return next();
    res.status(401).json({ status: 0, message: 'Giriş yapmanız gerekiyor' });
};

const adminGerekli = async (req, res, next) => {
    const u = await oturumuDogrula(req.session);
    if (u && u.yetki === 'admin') return next();
    res.status(403).json({ status: 0, message: 'Bu işlem için yönetici yetkisi gerekiyor' });
};

module.exports = { girisGerekli, adminGerekli, oturumuDogrula };
