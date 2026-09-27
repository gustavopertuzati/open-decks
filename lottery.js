/**
 * Lottery Engine — Open-Decks Geneva
 * - Priorité aux DJs n'ayant jamais joué (playedCount === 0)
 * - Enchaînement des styles par niveau d'énergie croissant :
 *   Warmup/Ambient -> House/Disco -> Techno/Bass -> Hard
 */

const STYLE_ENERGY = {
  'ambient': 0, 'warmup': 0, 'downtempo': 0, 'lo-fi': 0, 'lofi': 0, 'chill': 0,
  'jazz': 1, 'soul': 1, 'funk': 1, 'disco': 2, 'house': 2, 'deep house': 2,
  'deep-house': 2, 'disco edits': 2, 'afro house': 2, 'afro-house': 2,
  'minimal': 3, 'microhouse': 3, 'progressive': 3, 'tech-house': 3, 'tech house': 3,
  'melodic': 3, 'melodic techno': 3, 'trance': 3,
  'techno': 4, 'peak techno': 4, 'bass': 4, 'uk garage': 4, 'ukg': 4, 'dubstep': 4,
  'breaks': 4, 'electro': 4, 'ebm': 4,
  'drum & bass': 5, 'drum and bass': 5, "d'n'b": 5, 'dnb': 5, 'jungle': 5, 'footwork': 5,
  'hard groove': 5, 'hardgroove': 5,
  'hard techno': 6, 'hard-techno': 6, 'hardcore': 6, 'gabber': 6, 'speed garage': 5,
  'hip-hop': 2, 'rap': 2, 'r&b': 1, 'latin': 2, 'baile funk': 4, 'amapiano': 2,
  'open': 2, 'freestyle': 2, 'other': 2, 'autre': 2
};

function normalizeStyle(style) {
  return String(style || 'open').trim().toLowerCase();
}

function energyOf(style) {
  const key = normalizeStyle(style);
  if (STYLE_ENERGY[key] !== undefined) return STYLE_ENERGY[key];
  // fuzzy: cherche un mot-clé contenu
  for (const [k, v] of Object.entries(STYLE_ENERGY)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 2; // défaut : milieu de soirée
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {Array} djList - DJs inscrits à la session [{id,pseudo,style,playedCount,...}]
 * @param {string|Date} startTime - début du premier set
 * @param {number} slotMinutes - durée d'un set (défaut 30)
 */
function drawLineup(djList, startTime, slotMinutes = 30) {
  const start = new Date(startTime);
  if (isNaN(start.getTime())) throw new Error('startTime invalide');

  const newcomers = [];
  const veterans = [];
  for (const dj of djList) {
    const played = Number(dj.playedCount || 0);
    (played === 0 ? newcomers : veterans).push({ ...dj, _energy: energyOf(dj.style) });
  }

  // Lottery intra-niveau : shuffle puis tri stable par énergie
  const sortByEnergy = (list) =>
    shuffle(list).sort((a, b) => a._energy - b._energy);

  const orderedNew = sortByEnergy(newcomers);
  // Vétérans : moins ils ont joué, plus ils sont prioritaires, puis énergie
  const orderedVet = shuffle(veterans).sort((a, b) =>
    (Number(a.playedCount) - Number(b.playedCount)) || (a._energy - b._energy)
  );

  const ordered = [...orderedNew, ...orderedVet];

  return ordered.map((dj, i) => {
    const s = new Date(start.getTime() + i * slotMinutes * 60000);
    const e = new Date(s.getTime() + slotMinutes * 60000);
    return {
      order: i + 1,
      djId: dj.id,
      pseudo: dj.pseudo,
      style: dj.style,
      energy: dj._energy,
      isNewcomer: Number(dj.playedCount || 0) === 0,
      start: s.toISOString(),
      end: e.toISOString()
    };
  });
}

function currentSlot(lineup, now = new Date()) {
  const t = now.getTime();
  return lineup.find(s => new Date(s.start).getTime() <= t && t < new Date(s.end).getTime()) || null;
}

/** Prochain jeudi 21:00 Europe/Zurich (heure locale du serveur) */
function defaultStartTime() {
  const d = new Date();
  d.setHours(21, 0, 0, 0);
  const day = d.getDay(); // 4 = jeudi
  let diff = (4 - day + 7) % 7;
  if (diff === 0 && d.getTime() < Date.now()) diff = 7;
  // si on est déjà passé 21h aujourd'hui jeudi -> semaine suivante
  if (diff === 0 && Date.now() > d.getTime()) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

module.exports = { drawLineup, currentSlot, energyOf, defaultStartTime, STYLE_ENERGY };
