/* Open-Decks Geneva — frontend */
const $ = (s) => document.querySelector(s);
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
};
const fmt = (iso) => new Date(iso).toLocaleString('fr-CH', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Horloge
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('fr-CH'); }, 1000);
$('#year').textContent = new Date().getFullYear();
// marquee duplicata pour boucle infinie
$('#marquee-text').textContent += $('#marquee-text').textContent;

// ---------- Villes ----------
async function loadCities() {
  try {
    const { cities } = await api('/api/cities');
    $('#cities').innerHTML = cities.map((c) => `<option value="${esc(c)}">`).join('');
  } catch {}
}

// ---------- DJs ----------
let DJS = [];
async function loadDjs() {
  const { djs } = await api('/api/djs');
  DJS = djs;
  $('#s-dj').innerHTML = '<option value="">— Choisir ton profil —</option>' +
    djs.map((d) => `<option value="${d.id}">${esc(d.pseudo)} · ${esc(d.style)} · ${Number(d.playedCount) === 0 ? '⚡ nouveau' : `×${d.playedCount}`} </option>`).join('');
}

$('#f-pseudo').addEventListener('input', () => {
  const known = DJS.some((d) => d.pseudo.toLowerCase() === $('#f-pseudo').value.trim().toLowerCase());
  $('#priority-hint').classList.toggle('hidden', known || $('#f-pseudo').value.trim().length < 2);
});

$('#dj-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#dj-msg');
  msg.textContent = '…';
  try {
    const { dj, priority } = await api('/api/djs', {
      method: 'POST',
      body: JSON.stringify({
        pseudo: $('#f-pseudo').value, style: $('#f-style').value,
        contact: $('#f-contact').value, city: $('#f-city').value
      })
    });
    msg.innerHTML = `<span class="text-[#c8ff00]">✔ ${esc(dj.pseudo)} inscrit·e — ${esc(priority)}</span>`;
    e.target.reset();
    await refreshAll();
    $('#s-dj').value = dj.id;
  } catch (err) { msg.innerHTML = `<span class="text-red-400">✖ ${esc(err.message)}</span>`; }
});

// ---------- Session signups ----------
$('#btn-signup').addEventListener('click', async () => {
  const msg = $('#signup-msg');
  const djId = $('#s-dj').value;
  if (!djId) { msg.innerHTML = '<span class="text-red-400">Choisis ton profil DJ d’abord.</span>'; return; }
  try {
    const { dj, queuePosition } = await api('/api/signups', { method: 'POST', body: JSON.stringify({ djId }) });
    msg.innerHTML = `<span class="text-[#c8ff00]">✔ ${esc(dj.pseudo)} en file — position #${queuePosition}</span>`;
    await refreshAll();
  } catch (err) { msg.innerHTML = `<span class="text-red-400">✖ ${esc(err.message)}</span>`; }
});

async function loadQueue() {
  const { signups } = await api('/api/signups');
  $('#queue-count').textContent = signups.length;
  $('#queue').innerHTML = signups.length === 0
    ? '<li class="text-zinc-500 text-xs">File vide — sois le premier à te chauffer.</li>'
    : signups.map((s, i) => `
      <li class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <span><b class="text-zinc-100">#${i + 1} ${esc(s.dj?.pseudo || '?')}</b>
        <span class="text-zinc-400 text-xs">· ${esc(s.dj?.style || '')} · ${esc(s.dj?.city || '')} ${Number(s.dj?.playedCount) === 0 ? '· ⚡' : ''}</span></span>
        <button data-unq="${s.djId}" class="text-zinc-500 hover:text-red-400 text-xs">retirer</button>
      </li>`).join('');
  document.querySelectorAll('[data-unq]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/signups/${b.dataset.unq}`, { method: 'DELETE' });
    await refreshAll();
  }));
}

// ---------- Line-up ----------
async function loadLineup() {
  const { lineup, meta, current } = await api('/api/lineup');
  $('#lineup-meta').textContent = lineup.length === 0
    ? 'En attente du tirage… (inscris-toi puis l’admin tire l’ordre)'
    : `${lineup.length} sets · début ${fmt(lineup[0].start)} · fin ${fmt(lineup[lineup.length - 1].end)} · ${meta?.newcomersFirst ?? 0} nouveau(x) en premier`;
  const live = $('#live-badge');
  const np = $('#now-playing');
  if (current) {
    live.classList.remove('hidden');
    np.classList.remove('hidden');
    np.innerHTML = `🎧 <b>EN CE MOMENT :</b> <b class="text-[#c8ff00]">${esc(current.pseudo)}</b> · ${esc(current.style)} <span class="text-zinc-400">(${fmt(current.start)} → ${fmt(current.end)})</span>`;
  } else {
    live.classList.add('hidden'); np.classList.add('hidden');
  }
  const now = Date.now();
  $('#timetable').innerHTML = lineup.length === 0
    ? '<p class="text-zinc-500 text-sm md:col-span-2">Aucun line-up tiré pour l’instant. Le tirage place les nouveaux en premier et enchaîne les styles (warmup → hard).</p>'
    : lineup.map((s) => {
        const isLive = current && current.order === s.order;
        const past = new Date(s.end).getTime() < now;
        return `<div class="rounded-xl border p-4 bg-black/40 ${isLive ? 'slot-live' : 'border-white/10'} ${past ? 'opacity-50' : ''}">
          <div class="flex items-center justify-between">
            <span class="font-display text-[#c8ff00]">#${s.order} · ${fmt(s.start)}</span>
            ${s.isNewcomer ? '<span class="text-[10px] font-bold bg-[#c8ff00] text-black px-2 py-0.5 rounded-full">⚡ NOUVEAU</span>' : ''}
            ${isLive ? '<span class="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">● LIVE</span>' : ''}
          </div>
          <p class="font-bold mt-1">${esc(s.pseudo)}</p>
          <p class="text-xs text-zinc-400">${esc(s.style)} · 30 min · → ${fmt(s.end)}</p>
        </div>`;
      }).join('');
}
$('#btn-refresh').addEventListener('click', loadLineup);

// ---------- Wallpapers ----------
async function loadWallpapers() {
  const { wallpapers, active } = await api('/api/wallpapers');
  $('#wp-count').textContent = wallpapers.length;
  if (active?.url) {
    $('#bg-layer').style.backgroundImage = `url("${active.url}")`;
    $('#wp-active').innerHTML = `🏆 Fond actuel : <b>${esc(active.title || '')}</b> par <b>${esc(active.uploader || '')}</b> <span class="text-zinc-500">(${new Date(active.drawnAt).toLocaleDateString('fr-CH')})</span>`;
  }
  $('#wp-grid').innerHTML = wallpapers.length === 0
    ? '<p class="text-zinc-500 text-xs col-span-2">Aucun visuel — upload le premier et deviens le fond du site.</p>'
    : wallpapers.map((w) => `
      <figure class="rounded-xl overflow-hidden border ${active?.wallpaperId === w.id ? 'border-[#c8ff00]' : 'border-white/10'}">
        <img src="${w.url}" alt="${esc(w.title)}" class="w-full h-28 object-cover" loading="lazy" />
        <figcaption class="p-2 text-[11px] bg-black/60">${active?.wallpaperId === w.id ? '🏆 ' : ''}<b>${esc(w.title)}</b><br><span class="text-zinc-400">par ${esc(w.uploader)} · wins: ${w.wins || 0}</span></figcaption>
      </figure>`).join('');
}

$('#wp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#wp-msg');
  msg.textContent = 'Upload…';
  try {
    const fd = new FormData();
    fd.append('uploader', $('#w-uploader').value);
    fd.append('title', $('#w-title').value || 'Sans titre');
    fd.append('image', $('#w-file').files[0]);
    const r = await fetch('/api/wallpapers', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Upload échoué');
    msg.innerHTML = `<span class="text-[#c8ff00]">✔ ${esc(data.message)}</span>`;
    e.target.reset();
    await loadWallpapers();
  } catch (err) { msg.innerHTML = `<span class="text-red-400">✖ ${esc(err.message)}</span>`; }
});

// ---------- Admin ----------
const adminKey = () => $('#a-key').value;
async function adminPost(url, body = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey() },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}
$('#btn-draw').addEventListener('click', async () => {
  const msg = $('#admin-msg'); msg.textContent = 'Tirage…';
  try {
    const body = {};
    if ($('#a-start').value) body.startTime = new Date($('#a-start').value).toISOString();
    const { message } = await adminPost('/api/admin/draw', body);
    msg.innerHTML = `<span class="text-[#c8ff00]">✔ ${esc(message)}</span>`;
    await refreshAll();
  } catch (err) { msg.innerHTML = `<span class="text-red-400">✖ ${esc(err.message)}</span>`; }
});
$('#btn-wpdraw').addEventListener('click', async () => {
  const msg = $('#admin-msg'); msg.textContent = 'Tirage fond…';
  try {
    const { message } = await adminPost('/api/admin/wallpaper-draw');
    msg.innerHTML = `<span class="text-[#c8ff00]">✔ ${esc(message)}</span>`;
    await loadWallpapers();
  } catch (err) { msg.innerHTML = `<span class="text-red-400">✖ ${esc(err.message)}</span>`; }
});
$('#btn-reset').addEventListener('click', async () => {
  if (!confirm('Purger la session ? (archive + file/line-up vidés, stats DJs gardées)')) return;
  const msg = $('#admin-msg'); msg.textContent = 'Purge…';
  try {
    const { message } = await adminPost('/api/admin/reset');
    msg.innerHTML = `<span class="text-[#c8ff00]">✔ ${esc(message)}</span>`;
    await refreshAll();
  } catch (err) { msg.innerHTML = `<span class="text-red-400">✖ ${esc(err.message)}</span>`; }
});

// ---------- Boot ----------
async function refreshAll() { await Promise.all([loadDjs(), loadQueue(), loadLineup(), loadWallpapers()]); }
loadCities();
refreshAll();
setInterval(() => { loadLineup().catch(() => {}); }, 10000); // temps réel
