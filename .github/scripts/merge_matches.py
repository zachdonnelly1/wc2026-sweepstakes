import json, os, urllib.request
from datetime import datetime, timezone, timedelta

TOKEN = os.environ['FOOTBALL_API_TOKEN']
BASE  = 'https://api.football-data.org/v4/competitions/2000/matches'

def fetch_fd(url):
    req = urllib.request.Request(url, headers={'X-Auth-Token': TOKEN})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())['matches']

with open('data/matches.json') as f:
    bulk = json.load(f)

# ── Pass 1: football-data.org status updates (TIMED → FINISHED etc.) ──
# Scores are null on free tier but statuses are correct
fd_updates = {}
for status in ('FINISHED', 'IN_PLAY', 'PAUSED'):
    for m in fetch_fd(f"{BASE}?status={status}"):
        fd_updates[m['id']] = {'status': m['status'], 'score': m['score']}

fd_changed = 0
for m in bulk['matches']:
    if m['id'] in fd_updates:
        m['status'] = fd_updates[m['id']]['status']
        m['score']  = fd_updates[m['id']]['score']
        fd_changed += 1

print(f"football-data.org: {fd_changed} status updates")

# ── Pass 2: ESPN score overlay (fills in null scores) ──
ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'

NORMALIZE = {
    'Czech Republic':         'Czechia',
    'Bosnia and Herzegovina': 'Bosnia-Herz.',
    'DR Congo':               'Congo DR',
    'Cape Verde Islands':     'Cape Verde',
}

ESPN_STATUS = {
    'STATUS_FULL_TIME':   'FINISHED',
    'STATUS_FINAL':       'FINISHED',
    'STATUS_IN_PROGRESS': 'IN_PLAY',
    'STATUS_HALFTIME':    'PAUSED',
}

def norm(name):
    return NORMALIZE.get(name, name)

def fetch_espn(date_str):
    req = urllib.request.Request(
        f"{ESPN_BASE}?dates={date_str}",
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read()).get('events', [])

lookup = {(m['homeTeam']['name'], m['awayTeam']['name']): i
          for i, m in enumerate(bulk['matches'])}

now = datetime.now(timezone.utc)
espn_events = []
for d in range(4):
    date_str = (now - timedelta(days=d)).strftime('%Y%m%d')
    try:
        espn_events.extend(fetch_espn(date_str))
    except Exception as e:
        print(f"ESPN {date_str}: {e}")

espn_changed = 0
for event in espn_events:
    try:
        comps = event['competitions'][0]['competitors']
        home_c = next((c for c in comps if c.get('homeAway') == 'home'), comps[0])
        away_c = next((c for c in comps if c.get('homeAway') == 'away'), comps[1])

        home_name = norm(home_c['team']['displayName'])
        away_name = norm(away_c['team']['displayName'])
        espn_status = event['status']['type']['name']

        idx = lookup.get((home_name, away_name))
        if idx is None:
            continue

        m = bulk['matches'][idx]
        fd_status = ESPN_STATUS.get(espn_status)

        # Only overlay if ESPN has a meaningful status + score
        if fd_status and fd_status in ('FINISHED', 'IN_PLAY', 'PAUSED'):
            h = int(home_c.get('score') or 0)
            a = int(away_c.get('score') or 0)
            m['status'] = fd_status
            m['score']['fullTime']['home'] = h
            m['score']['fullTime']['away'] = a
            if fd_status == 'FINISHED':
                m['score']['winner'] = 'HOME_TEAM' if h > a else 'AWAY_TEAM' if a > h else 'DRAW'
            espn_changed += 1
    except Exception as e:
        print(f"ESPN event error: {e}")

print(f"ESPN: {espn_changed} score updates")

with open('data/matches.json', 'w') as f:
    json.dump(bulk, f)
