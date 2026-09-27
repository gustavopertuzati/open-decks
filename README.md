# Open-Decks Geneva — Faire tourner !

Web App événementielle pour les soirées open-decks à Genève et alentours (rayon 50km).
Connecter la communauté locale, partager de la musique, boire une bière.

## Matériel sur place
- CDJ · Platines Technics · Mixer (table de mixage) · Micro

## Stack
- Backend : Node.js + Express + Lowdb (JSON, purge hebdo) + Multer + node-cron
- Frontend : HTML/JS + Tailwind (CDN), design underground / clubbing
- Tunnel public : Ngrok (`@ngrok/ngrok`)

## Démarrage
```powershell
npm install
npm start
# => http://localhost:3000
```

## Exposition publique (Ngrok)
```powershell
$env:NGROK_AUTHTOKEN="ton_token_ngrok"   # https://dashboard.ngrok.com/get-started/your-authtoken
$env:PORT="3000"
npm run tunnel   # affiche le lien public Ngrok dans la console
```
Sans token, `server.js` démarre quand même en local et loggue la marche à suivre.
Si `NGROK_AUTHTOKEN` est défini, le tunnel démarre automatiquement au boot et le lien public s'affiche dans les logs.

Le serveur écoute sur `0.0.0.0:3000` (équivalent `allowedHosts: true` — tous les hosts acceptés, CORS ouvert).

## Déploiement sur Orkestr (comme le dice game)
Un seul conteneur (API + frontend statique sur un `PORT`), aucune dépendance externe.
La donnée est éphémère (`data/db.json`, `uploads/`) — OK par design, la purge hebdo réinitialise chaque lundi.

```powershell
docker build -t open-decks .
docker run -p 3000:3000 -e ADMIN_KEY=open-decks-admin open-decks
# ou : docker compose up --build
```

1. Pushe ce dossier sur GitHub.
2. Dans la console orkestr : nouveau service depuis le repo, Dockerfile à la racine.
3. Variables d'environnement : `ADMIN_KEY=<longue valeur aléatoire>` (`PORT` est injecté par orkestr).
4. Healthcheck path : `/health`.

## API
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Santé |
| GET/POST | `/api/djs` | Registre DJs (pseudo, style, contact, ville) |
| GET/POST | `/api/signups` | File d'attente session (sets 30 min) |
| DELETE | `/api/signups/:djId` | Retirer de la file |
| GET | `/api/lineup` | Line-up + DJ actuel (temps réel) |
| POST | `/api/admin/draw` | 🎲 Tirage : nouveaux d'abord + énergie des styles (header `x-admin-key`) |
| POST | `/api/admin/reset` | 🧹 Purge hebdo (archive, +1 passage, vide file/line-up). `{"full":true}` = wipe total |
| GET | `/api/history` | Historique des sessions |
| GET/POST | `/api/wallpapers` | Raffle fond d'écran (multipart `image`) |
| POST | `/api/admin/wallpaper-draw` | Tirage du fond d'écran actif |
| GET | `/api/cities` | Villes indicatives 50km autour de Genève |

Clé admin par défaut : `open-decks-admin` (env `ADMIN_KEY`).

## Lottery Engine
1. Split **nouveaux** (`playedCount === 0`) / vétérans → nouveaux d'abord.
2. Tri par **énergie du style** : Warmup/Ambient (0) → House/Disco (2) → Techno/Bass (4) → Hard (6).
3. **Shuffle** avant tri → aléatoire à énergie égale.
4. Vétérans triés par `playedCount` croissant puis énergie.
5. Créneaux de 30 min depuis `startTime` (défaut : prochain jeudi 21h).

## Purge hebdomadaire
- Cron `0 6 * * 1` Europe/Zurich (lundi 06:00) + endpoint `POST /api/admin/reset`.
