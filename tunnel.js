require('dotenv').config();
/**
 * Tunnel public Ngrok — Open-Decks Geneva
 * Usage:
 *   $env:NGROK_AUTHTOKEN="2_xxx"   (Powershell)
 *   npm run tunnel
 * Sans token : le script affiche la marche à suivre et démarre quand même
 * le check du serveur local.
 */
const ngrok = require('@ngrok/ngrok');

const PORT = process.env.PORT || 3000;

(async () => {
  const token = process.env.NGROK_AUTHTOKEN;
  if (!token) {
    console.log('');
    console.log('[ngrok] NGROK_AUTHTOKEN manquant.');
    console.log('[ngrok] 1. Crée un compte gratuit : https://dashboard.ngrok.com/signup');
    console.log('[ngrok] 2. Récupère ton token : https://dashboard.ngrok.com/get-started/your-authtoken');
    console.log('[ngrok] 3. Relance avec le token :');
    console.log('         Powershell : $env:NGROK_AUTHTOKEN="ton_token"; npm run tunnel');
    console.log(`[ngrok] En attendant, le site reste dispo en local : http://localhost:${PORT}`);
    console.log('');
    process.exit(0);
  }
  try {
    console.log(`[ngrok] Ouverture du tunnel vers le port ${PORT} (allowedHosts: true)...`);
    const listener = await ngrok.forward({ addr: PORT, authtoken: token });
    console.log('');
    console.log(`  [ngrok] Lien public : ${listener.url()}`);
    console.log(`  -> Partage ce lien pour l'acces public au Open-Decks Geneva`);
    console.log('  (Ctrl+C pour fermer)');
    console.log('');
    // Keep-alive : le listener ngrok ne retient pas l'event loop à lui seul.
    // Sans ceci, node quitterait et le tunnel tomberait aussitôt.
    setInterval(() => {}, 60 * 1000);
    process.on('SIGINT', async () => {
      console.log('\n[ngrok] Fermeture du tunnel...');
      try { await listener.close(); } catch {}
      process.exit(0);
    });
  } catch (e) {
    if (String(e.message || '').includes('ERR_NGROK_334')) {
      console.error('[ngrok] Domaine déjà occupé par un autre tunnel.');
      console.error('[ngrok] Stoppe-le d\'abord : Stop-Process -Name ngrok');
    } else {
      console.error('[ngrok] Erreur :', e.message);
    }
    process.exit(1);
  }
})();
