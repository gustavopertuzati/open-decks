require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cron = require('node-cron');
const crypto = require('crypto');

const { db, initDb } = require('./db');
const { drawLineup, currentSlot, energyOf, defaultStartTime } = require('./lottery');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'open-decks-admin';

// --- Middlewares ---
// allowedHosts: true -> on accepte tous les hosts (ngrok, localhost, LAN)
app.use((req, res, next) => { next(); });
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Uploads (Raffle fond d'écran) ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `wp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  }
});
app.use('/uploads', express.static(uploadDir));

// --- Helpers ---
const uid = () => crypto.randomBytes(8).toString('hex');
const isEmailOrPhone = (s) => {
  const v = String(s || '').trim();
  return /.+@.+\..+/.test(v) || /^[+\d][\d\s./-]{5,}$/.test(v);
};

// Villes indicatives dans un rayon ~50km autour de Genève
const CITIES_50KM = [
  'Genève', 'Carouge', 'Lancy', 'Meyrin', 'Vernier', 'Onex', 'Thônex', 'Chêne-Bourg',
  'Annemasse', 'Gaillard', 'Ambilly', 'Ville-la-Grand', 'Saint-Julien-en-Genevois',
  'Ferney-Voltaire', 'Gex', 'Divonne-les-Bains', 'Nyon', 'Gland', 'Rolle', 'Morges',
  'Lausanne', 'Thonon-les-Bains', 'Évian-les-Bains', 'Douvaine', 'Bonneville',
  'Cluses', 'Bellegarde-sur-Valserine', 'Aubonne', 'Coppet', 'Versoix', 'Annemasse agglo'
];

function checkAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.body?.adminKey || req.query.adminKey;
  if (key !== ADMIN_KEY) return res.status(403).json({ error: 'Clé admin invalide' });
  next();
}

// ================= API =================

// Santé (alias /health pour les plateformes type Orkestr/Render)
function healthPayload() {
  return { ok: true, service: 'open-decks-geneva', time: new Date().toISOString() };
}
app.get('/api/health', (req, res) => {
  res.json(healthPayload());
});
app.get('/health', (req, res) => {
  res.json(healthPayload());
});

// --- DJs ---
app.get('/api/djs', async (req, res) => {
  await db.read();
  const djs = [...db.data.djs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ djs, total: djs.length });
});

app.post('/api/djs', async (req, res) => {
  const { pseudo, style, contact, city } = req.body || {};
  if (!pseudo || String(pseudo).trim().length < 2)
    return res.status(400).json({ error: 'Pseudo requis (min 2 caractères)' });
  if (!style || !String(style).trim())
    return res.status(400).json({ error: 'Style musical requis' });
  if (!contact || !isEmailOrPhone(contact))
    return res.status(400).json({ error: 'Contact invalide : email ou téléphone requis' });
  if (!city || !String(city).trim())
    return res.status(400).json({ error: 'Ville requise (rayon 50km autour de Genève)' });

  await db.read();
  const exists = db.data.djs.find(d => d.pseudo.toLowerCase() === String(pseudo).trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'Ce pseudo est déjà inscrit', dj: exists });

  const dj = {
    id: uid(),
    pseudo: String(pseudo).trim().slice(0, 40),
    style: String(style).trim().slice(0, 60),
    energy: energyOf(style),
    contact: String(contact).trim().slice(0, 80),
    city: String(city).trim().slice(0, 60),
    playedCount: 0,
    lastPlayed: null,
    createdAt: new Date().toISOString()
  };
  db.data.djs.push(dj);
  await db.write();
  res.status(201).json({ dj, priority: dj.playedCount === 0 ? 'Prioritaire (nouveau — jamais joué)' : 'Standard' });
});

// --- Inscription session (sets 30 min) ---
app.get('/api/signups', async (req, res) => {
  await db.read();
  const signups = db.data.signups.map(s => ({
    ...s,
    dj: db.data.djs.find(d => d.id === s.djId) || null
  }));
  res.json({ signups });
});

app.post('/api/signups', async (req, res) => {
  const { djId } = req.body || {};
  if (!djId) return res.status(400).json({ error: 'djId requis' });
  await db.read();
  const dj = db.data.djs.find(d => d.id === djId);
  if (!dj) return res.status(404).json({ error: 'DJ introuvable — inscris-toi d’abord' });
  if (db.data.signups.some(s => s.djId === djId))
    return res.status(409).json({ error: `${dj.pseudo} est déjà inscrit·e à cette session` });
  const signup = { id: uid(), djId, createdAt: new Date().toISOString() };
  db.data.signups.push(signup);
  await db.write();
  res.status(201).json({ signup, dj, queuePosition: db.data.signups.length });
});

app.delete('/api/signups/:djId', async (req, res) => {
  await db.read();
  const before = db.data.signups.length;
  db.data.signups = db.data.signups.filter(s => s.djId !== req.params.djId);
  await db.write();
  res.json({ removed: before - db.data.signups.length });
});

// --- Line-up / Timetable ---
app.get('/api/lineup', async (req, res) => {
  await db.read();
  const now = new Date();
  const current = currentSlot(db.data.lineup, now);
  res.json({
    lineup: db.data.lineup,
    meta: db.data.lineupMeta,
    current,
    now: now.toISOString(),
    slotMinutes: 30
  });
});

// Tirage au sort (Lottery Engine)
app.post('/api/admin/draw', checkAdmin, async (req, res) => {
  await db.read();
  if (db.data.signups.length === 0)
    return res.status(400).json({ error: 'Aucun inscrit à la session — file vide' });

  const startTime = req.body?.startTime || defaultStartTime().toISOString();
  const slotMinutes = Number(req.body?.slotMinutes) || 30;

  const djList = db.data.signups
    .map(s => db.data.djs.find(d => d.id === s.djId))
    .filter(Boolean);

  try {
    const lineup = drawLineup(djList, startTime, slotMinutes);
    db.data.lineup = lineup;
    db.data.lineupMeta = {
      createdAt: new Date().toISOString(),
      startTime: lineup[0]?.start || startTime,
      count: lineup.length,
      newcomersFirst: lineup.filter(l => l.isNewcomer).length
    };
    await db.write();
    res.json({ lineup, meta: db.data.lineupMeta, message: `Tirage effectué : ${lineup.length} sets de ${slotMinutes} min` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Purge hebdomadaire ---
async function weeklyPurge(reason = 'purge hebdomadaire') {
  await db.read();
  // Archive la session : incrémente playedCount des DJs passés au line-up
  if (db.data.lineup.length > 0) {
    const playedIds = new Set(db.data.lineup.map(l => l.djId));
    const nowIso = new Date().toISOString();
    for (const dj of db.data.djs) {
      if (playedIds.has(dj.id)) {
        dj.playedCount = Number(dj.playedCount || 0) + 1;
        dj.lastPlayed = nowIso;
      }
    }
    db.data.history.unshift({
      date: nowIso,
      reason,
      lineup: db.data.lineup,
      meta: db.data.lineupMeta
    });
    db.data.history = db.data.history.slice(0, 52); // garde 1 an
  }
  db.data.signups = [];
  db.data.lineup = [];
  db.data.lineupMeta = null;
  await db.write();
  console.log(`[purge] ${reason} — file + line-up réinitialisés, stats DJs conservées (${new Date().toISOString()})`);
  return true;
}

app.post('/api/admin/reset', checkAdmin, async (req, res) => {
  const full = req.body?.full === true || req.query.full === 'true';
  if (full) {
    await db.read();
    db.data.signups = [];
    db.data.lineup = [];
    db.data.lineupMeta = null;
    db.data.djs = [];
    db.data.wallpapers = [];
    db.data.activeWallpaper = null;
    await db.write();
    return res.json({ ok: true, message: 'Base totalement réinitialisée (DJs + sessions + wallpapers)' });
  }
  await weeklyPurge('reset manuel admin');
  res.json({ ok: true, message: 'Session réinitialisée pour la semaine suivante (file + line-up vidés, historique archivé)' });
});

app.get('/api/history', async (req, res) => {
  await db.read();
  res.json({ history: db.data.history });
});

// --- Raffle fond d'écran ---
app.get('/api/wallpapers', async (req, res) => {
  await db.read();
  res.json({ wallpapers: [...db.data.wallpapers].reverse(), active: db.data.activeWallpaper });
});

app.post('/api/wallpapers', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise (champ "image")' });
    await db.read();
    const wp = {
      id: uid(),
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      uploader: String(req.body?.uploader || 'Anonyme').slice(0, 40),
      title: String(req.body?.title || req.file.originalname || 'Sans titre').slice(0, 80),
      createdAt: new Date().toISOString(),
      wins: 0
    };
    db.data.wallpapers.push(wp);
    await db.write();
    res.status(201).json({ wallpaper: wp, message: 'Participation au raffle enregistrée !' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/wallpaper-draw', checkAdmin, async (req, res) => {
  await db.read();
  if (db.data.wallpapers.length === 0)
    return res.status(400).json({ error: 'Aucun fond d’écran uploadé' });
  const pick = db.data.wallpapers[Math.floor(Math.random() * db.data.wallpapers.length)];
  pick.wins = Number(pick.wins || 0) + 1;
  db.data.activeWallpaper = { wallpaperId: pick.id, url: pick.url, drawnAt: new Date().toISOString(), uploader: pick.uploader, title: pick.title };
  await db.write();
  res.json({ active: db.data.activeWallpaper, message: `Fond gagnant : "${pick.title}" par ${pick.uploader}` });
});

app.get('/api/cities', (req, res) => res.json({ cities: CITIES_50KM, center: 'Genève', radiusKm: 50 }));

// --- Frontend statique ---
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Cron : purge auto chaque lundi 06:00 ---
cron.schedule('0 6 * * 1', () => {
  weeklyPurge('cron hebdomadaire (lun 06:00)').catch(e => console.error('[purge] erreur:', e.message));
}, { timezone: 'Europe/Zurich' });

// --- Boot ---
(async () => {
  await initDb();
  // 0.0.0.0 => accessible via ngrok + réseau local
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ===  OPEN-DECKS GENEVA  ===');
    console.log(`  -> Local      : http://localhost:${PORT}`);
    console.log(`  -> Admin key  : ${ADMIN_KEY} (header x-admin-key)`);
    console.log('  -> Purge auto : lundi 06:00 Europe/Zurich');
    console.log('  -> Pour exposer en public : npm run tunnel  (ngrok, port ' + PORT + ')');
    console.log('');
  });

  // Tunnel ngrok auto si token présent
  if (process.env.NGROK_AUTHTOKEN) {
    try {
      const ngrok = require('@ngrok/ngrok');
      const listener = await ngrok.forward({ addr: PORT, authtoken: process.env.NGROK_AUTHTOKEN });
      console.log(`  [ngrok] Lien public : ${listener.url()}`);
    } catch (e) {
      console.error('  [ngrok] échec tunnel auto :', e.message);
    }
  }
})();

module.exports = { app, weeklyPurge };
