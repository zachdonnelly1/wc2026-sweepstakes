// Fixtures & Results page

const STAGE_ORDER = ['GROUP_STAGE','LAST_32','LAST_16','QUARTER_FINALS','SEMI_FINALS','THIRD_PLACE','FINAL'];
const STAGE_LABEL = {
  GROUP_STAGE:    'GROUP STAGE',
  LAST_32:        'ROUND OF 32',
  LAST_16:        'ROUND OF 16',
  QUARTER_FINALS: 'QUARTER-FINALS',
  SEMI_FINALS:    'SEMI-FINALS',
  THIRD_PLACE:    'THIRD PLACE',
  FINAL:          'FINAL',
};

let allMatches = [];
let activeFilter = 'ALL';
let refreshTimer;

async function initFixtures() {
  await loadFixtures();
  scheduleRefresh();
}

async function loadFixtures(force = false) {
  document.getElementById('refresh-btn').disabled = true;
  try {
    allMatches = await API.fetchMatches(force);
    renderFixtures();
    updateMeta();
  } catch (e) {
    document.getElementById('error-banner').textContent = 'ERROR: ' + e.message;
    document.getElementById('error-banner').style.display = 'block';
  }
  document.getElementById('refresh-btn').disabled = false;
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  // Refresh every 2 min if any match is live, else every 10 min
  const hasLive = allMatches.some(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
  refreshTimer = setTimeout(async () => {
    await loadFixtures(true);
    scheduleRefresh();
  }, hasLive ? 2 * 60 * 1000 : 10 * 60 * 1000);
}

function renderFixtures() {
  const matches = activeFilter === 'ALL'
    ? allMatches
    : allMatches.filter(m => m.stage === activeFilter);

  if (!matches.length) {
    document.getElementById('fixtures-container').innerHTML =
      `<p style="font-family:var(--font-pixel);font-size:7px;color:var(--text-dim);padding:40px 0;text-align:center">NO FIXTURES</p>`;
    return;
  }

  // Group by stage then by date
  const byStage = {};
  matches.forEach(m => {
    if (!byStage[m.stage]) byStage[m.stage] = {};
    const day = m.utcDate.slice(0, 10);
    if (!byStage[m.stage][day]) byStage[m.stage][day] = [];
    byStage[m.stage][day].push(m);
  });

  const html = STAGE_ORDER
    .filter(s => byStage[s])
    .map(stage => {
      const dateGroups = Object.entries(byStage[stage])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, dayMatches]) => {
          const dateStr = formatDate(day);
          const rows = dayMatches
            .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
            .map(m => renderFixtureRow(m))
            .join('');
          return `<div class="date-group">
            <span class="date-label">${dateStr}</span>
            ${rows}
          </div>`;
        }).join('');

      return `<div class="stage-block">
        <div class="stage-heading">${STAGE_LABEL[stage] || stage}</div>
        ${dateGroups}
      </div>`;
    }).join('');

  document.getElementById('fixtures-container').innerHTML = html;
}

function renderFixtureRow(m) {
  const isLive     = m.status === 'IN_PLAY' || m.status === 'PAUSED';
  const isFinished = m.status === 'FINISHED';
  const isUpcoming = !isLive && !isFinished;

  const cls = isLive ? 'live' : isFinished ? 'finished' : '';

  const home = m.homeTeam.name || m.homeTeam.shortName || '—';
  const away = m.awayTeam.name || m.awayTeam.shortName || '—';

  const homeFlag = getTeam(m.homeTeam.id)?.flag || '';
  const awayFlag = getTeam(m.awayTeam.id)?.flag || '';

  let scoreHtml;
  if (isFinished) {
    const h = m.score?.fullTime?.home ?? '?';
    const a = m.score?.fullTime?.away ?? '?';
    scoreHtml = `<div class="score-box">${h} - ${a}</div>`;
  } else if (isLive) {
    const h = m.score?.fullTime?.home ?? 0;
    const a = m.score?.fullTime?.away ?? 0;
    scoreHtml = `<div class="score-box live">${h} - ${a} <span class="live-badge">LIVE</span></div>`;
  } else {
    const time = formatTime(m.utcDate);
    scoreHtml = `<div class="score-box upcoming">${time}</div>`;
  }

  const group = m.group ? `<span>${m.group.replace('GROUP_', 'GRP ')}</span>` : '';
  const metaHtml = isFinished
    ? `<span class="fixture-meta">FT ${group}</span>`
    : isLive
      ? `<span class="fixture-meta" style="color:var(--teal)">LIVE ${group}</span>`
      : `<span class="fixture-meta">${group}</span>`;

  return `<div class="fixture ${cls}">
    <span class="team-name home">${homeFlag} ${home}</span>
    ${scoreHtml}
    <span class="team-name away">${away} ${awayFlag}</span>
    ${metaHtml}
  </div>`;
}

function updateMeta() {
  const played  = allMatches.filter(m => m.status === 'FINISHED').length;
  const live    = allMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED').length;
  const age     = API.cacheAge();
  const ageStr  = age === null ? 'NEVER' : age < 60 ? `${age}S AGO` : `${Math.round(age/60)}M AGO`;

  const liveStr = live > 0 ? ` · ${live} LIVE` : '';
  document.getElementById('header-meta').textContent = `${played}/${allMatches.length} PLAYED${liveStr}`;
  document.getElementById('last-updated').textContent = `UPDATED: ${ageStr}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}

function formatTime(utcStr) {
  const d = new Date(utcStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).toUpperCase();
}

// Filter buttons
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filter-bar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.stage;
    renderFixtures();
  });

  document.getElementById('refresh-btn').addEventListener('click', () => loadFixtures(true));
  initFixtures();
});
