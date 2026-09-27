const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, 'db.json');
const adapter = new JSONFile(dbFile);

const defaultData = {
  djs: [],
  signups: [],
  lineup: [],
  lineupMeta: null,
  wallpapers: [],
  activeWallpaper: null,
  history: []
};

const db = new Low(adapter, defaultData);

async function initDb() {
  await db.read();
  db.data ||= structuredClone(defaultData);
  for (const k of Object.keys(defaultData)) {
    if (!Array.isArray(db.data[k]) && !(k === 'lineupMeta' || k === 'activeWallpaper')) {
      db.data[k] = defaultData[k];
    }
  }
  if (db.data.lineupMeta === undefined) db.data.lineupMeta = null;
  if (db.data.activeWallpaper === undefined) db.data.activeWallpaper = null;
  await db.write();
}

module.exports = { db, initDb };
