// Admin panel logic

let isAuthed = false;
let players = [];

function checkAuth() {
  const pwd = document.getElementById('pwd-input').value;
  if (pwd === CONFIG.ADMIN_PASSWORD) {
    isAuthed = true;
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    loadAdminData();
  } else {
    const input = document.getElementById('pwd-input');
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 500);
    input.value = '';
    document.getElementById('auth-error').textContent = 'Wrong password';
  }
}

async function loadAdminData() {
  try {
    players = await DB.getPlayers();
    renderPlayerInputs();
    renderSpecialPrizes();
  } catch (e) {
    showMsg('Failed to load: ' + e.message, 'error');
  }
}

function renderPlayerInputs() {
  const container = document.getElementById('player-inputs');
  // Pre-fill existing names, pad to 16
  const names = [...players.map(p => p.name), ...Array(16).fill('')].slice(0, 16);

  container.innerHTML = names.map((name, i) => `
    <div class="player-input-row">
      <label>${i + 1}.</label>
      <input type="text" id="player-${i}" value="${escHtml(name)}" placeholder="Player ${i + 1} name" maxlength="30">
    </div>`).join('');
}

async function savePlayers() {
  const names = [];
  for (let i = 0; i < 16; i++) {
    const val = document.getElementById(`player-${i}`)?.value?.trim();
    if (val) names.push(val);
  }

  if (names.length < 2) {
    showMsg('Enter at least 2 player names.', 'error');
    return;
  }

  const btn = document.getElementById('save-players-btn');
  btn.disabled = true;

  try {
    await DB.savePlayers(names);
    players = await DB.getPlayers();
    renderPlayerInputs();
    showMsg(`${names.length} players saved!`, 'success');
  } catch (e) {
    showMsg('Save failed: ' + e.message, 'error');
  }

  btn.disabled = false;
}

async function renderSpecialPrizes() {
  try {
    const specials = await DB.getSpecialPrizes();
    const spMap = {};
    specials.forEach(s => { spMap[s.type] = s; });

    const prizeTypes = [
      { type: 'underdog_hero',  label: 'Underdog Hero',  icon: '🦁', desc: 'Last Tier 3 team still alive' },
      { type: 'beautiful_loser',label: 'Beautiful Loser', icon: '💐', desc: 'Most goals by a group stage exit' },
      { type: 'wooden_spoon',   label: 'Wooden Spoon',   icon: '🥄', desc: 'Most goals conceded across all 3 teams in group stage' },
    ];

    const container = document.getElementById('special-prizes-container');
    container.innerHTML = prizeTypes.map(({ type, label, icon, desc }) => {
      const awarded = spMap[type];
      const selectHtml = `<select id="sp-select-${type}">
        <option value="">— Select player —</option>
        ${players.map(p => `<option value="${p.id}" ${awarded?.player_id === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}
      </select>`;

      return `<div class="special-prize-row">
        <div class="sp-meta">
          <span class="sp-icon">${icon}</span>
          <div>
            <strong>${label}</strong>
            <div class="sp-desc">${desc}</div>
            ${awarded ? `<div class="sp-winner">Currently: ${escHtml(awarded.players?.name || '')}</div>` : ''}
          </div>
        </div>
        <div class="sp-actions">
          ${selectHtml}
          <button class="btn btn--sm" onclick="awardSpecialPrize('${type}')">Award</button>
          ${awarded ? `<button class="btn btn--sm btn--danger" onclick="revokeSpecialPrize('${type}')">Revoke</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    showMsg('Error loading special prizes: ' + e.message, 'error');
  }
}

async function awardSpecialPrize(type) {
  const select = document.getElementById(`sp-select-${type}`);
  const playerId = parseInt(select.value);
  if (!playerId) { showMsg('Select a player first.', 'error'); return; }

  try {
    await DB.awardSpecialPrize(type, playerId);
    showMsg('Prize awarded!', 'success');
    renderSpecialPrizes();
  } catch (e) {
    showMsg('Failed: ' + e.message, 'error');
  }
}

async function revokeSpecialPrize(type) {
  if (!confirm(`Revoke ${type.replace(/_/g, ' ')} prize?`)) return;
  try {
    await DB.removeSpecialPrize(type);
    showMsg('Prize revoked.', 'success');
    renderSpecialPrizes();
  } catch (e) {
    showMsg('Failed: ' + e.message, 'error');
  }
}

async function resetAll() {
  if (!confirm('RESET EVERYTHING? This deletes all players, assignments, and prizes. Cannot be undone!')) return;
  try {
    await DB.resetAll();
    players = [];
    renderPlayerInputs();
    renderSpecialPrizes();
    showMsg('All data reset.', 'success');
  } catch (e) {
    showMsg('Reset failed: ' + e.message, 'error');
  }
}

// --- helpers ---
function showMsg(msg, type = 'info') {
  const el = document.getElementById('admin-msg');
  el.textContent = msg;
  el.className = `admin-msg admin-msg--${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-btn').addEventListener('click', checkAuth);
  document.getElementById('pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkAuth(); });
  document.getElementById('save-players-btn').addEventListener('click', savePlayers);
  document.getElementById('reset-btn').addEventListener('click', resetAll);
});
