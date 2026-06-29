import json, os, sys, urllib.request, urllib.error
from collections import defaultdict
from datetime import datetime, timezone


def sb_get(path):
    SB_URL = 'https://minbjoislntwtsabgozu.supabase.co'
    SB_KEY = 'sb_publishable_7QK2Nzu08b7u_c73NcNEkw_fbIi_vHg'
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{path}",
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def main():
    with open('data/matches.json') as f:
        data = json.load(f)
    matches = data['matches']

    # Group by date
    by_date = defaultdict(list)
    for m in matches:
        by_date[m['utcDate'][:10]].append(m)

    # Find most recently completed game day
    completed = [
        d for d, ms in sorted(by_date.items())
        if ms and all(m['status'] == 'FINISHED' for m in ms)
    ]
    if not completed:
        print("No completed game days yet")
        return

    latest = completed[-1]

    # Load existing summaries array
    path = 'data/daily-summary.json'
    existing = []
    if os.path.exists(path):
        with open(path) as f:
            try:
                data = json.load(f)
                existing = data if isinstance(data, list) else []
            except Exception:
                pass

    if any(s.get('date') == latest for s in existing):
        print(f"Summary already exists for {latest}")
        return

    game_day = sorted(by_date.keys()).index(latest) + 1
    todays = by_date[latest]

    # Team name lookup
    team_names = {}
    for m in matches:
        team_names[m['homeTeam']['id']] = m['homeTeam']['name']
        team_names[m['awayTeam']['id']] = m['awayTeam']['name']

    # Fetch players + assignments from Supabase
    try:
        players = sb_get('players?select=id,name&order=id')
        assignments = sb_get('assignments?select=player_id,team_id,tier')
    except Exception as e:
        print(f"Supabase error: {e}")
        players, assignments = [], []

    # Build player map
    player_map = {p['id']: {'name': p['name'], 'teams': {}} for p in players}
    for asgn in assignments:
        pid = asgn['player_id']
        if pid in player_map:
            player_map[pid]['teams'][asgn['tier']] = {
                'id': asgn['team_id'],
                'name': team_names.get(asgn['team_id'], '?')
            }

    # Today's team IDs
    today_ids = {m['homeTeam']['id'] for m in todays} | {m['awayTeam']['id'] for m in todays}

    def get_result(team_id):
        for m in todays:
            is_home = m['homeTeam']['id'] == team_id
            is_away = m['awayTeam']['id'] == team_id
            if not (is_home or is_away):
                continue
            sc = m['score']['fullTime']
            my_g = sc['home'] if is_home else sc['away']
            op_g = sc['away'] if is_home else sc['home']
            opp = m['awayTeam']['name'] if is_home else m['homeTeam']['name']
            w = m['score']['winner']
            if (w == 'HOME_TEAM' and is_home) or (w == 'AWAY_TEAM' and is_away):
                outcome = 'WON'
            elif w == 'DRAW':
                outcome = 'DREW'
            else:
                outcome = 'LOST'
            return f"{outcome} {my_g}-{op_g} vs {opp}"
        return None

    # Player impact lines
    player_lines = []
    for pid, p in player_map.items():
        results = []
        for tier, t in p['teams'].items():
            if t['id'] in today_ids:
                res = get_result(t['id'])
                if res:
                    results.append(f"{t['name']} {res} (T{tier})")
        if results:
            player_lines.append(f"{p['name']}: {'; '.join(results)}")

    # Build scores array for the frontend to render with flags
    scores = []
    for m in todays:
        sc = m['score']['fullTime']
        scores.append({
            'homeId':    m['homeTeam']['id'],
            'homeName':  m['homeTeam']['name'],
            'homeTla':   m['homeTeam']['tla'],
            'homeScore': sc['home'],
            'awayId':    m['awayTeam']['id'],
            'awayName':  m['awayTeam']['name'],
            'awayTla':   m['awayTeam']['tla'],
            'awayScore': sc['away'],
            'group':     (m.get('group') or '').replace('GROUP_', 'Group '),
            'stage':     m['stage'],
        })

    # Results text for prompt (no flags — those are in the scores section)
    result_lines = []
    for m in todays:
        sc = m['score']['fullTime']
        result_lines.append(f"{m['homeTeam']['name']} {sc['home']}-{sc['away']} {m['awayTeam']['name']}")
    results_text = '\n'.join(result_lines)
    players_text = '\n'.join(player_lines) if player_lines else "No player assignments yet"

    prompt = f"""You are the voice of "The Avalanche" — a World Cup 2026 sweepstakes between friends and family called the Murphy/Donnelly Sweepstakes.

Write the Game Day {game_day} daily update. 2-3 short paragraphs, max 120 words. Scores are shown separately so don't list them.

CRITICAL: Plain text only. No markdown. No #headers, no **bold**, no *italics*, no bullet points. Just sentences.

Tone: cheeky WhatsApp banter, like the funniest person in the group chat. Use first names only. Spread the banter evenly — call out whoever had a good day, whoever had a bad day, and anyone with something riding on upcoming games. Don't fixate on one person. Find the funny angle in each result — a lucky win, a shocking loss, a Tier 3 team somehow surviving. Roast bad days, wind up good ones. End with a sharp one-liner that lands.

Use Zach as a punchline only when genuinely warranted, not by default. The banter should move around the group.

3-5 emojis placed naturally mid-sentence, not at the start of every line.

TODAY'S RESULTS:
{results_text}

HOW IT HIT OUR PLAYERS:
{players_text}

PRIZES: Winner €120 | Runner-up €50 | Semi-finalists €15 | Underdog Hero (last T3 standing) €20 | Beautiful Loser (best group exit) €15 | Wooden Spoon (most goals conceded) €5"""

    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        print("No ANTHROPIC_API_KEY set")
        sys.exit(1)

    body = json.dumps({
        'model': 'claude-haiku-4-5-20251001',
        'max_tokens': 500,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages',
        data=body,
        headers={
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }
    )

    try:
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
        text = resp['content'][0]['text']
    except urllib.error.HTTPError as e:
        print(f"Claude API error {e.code}: {e.read().decode()} — skipping summary, scores will still update")
        return

    existing.append({
        'gameDay': game_day,
        'date': latest,
        'generated': datetime.now(timezone.utc).isoformat(),
        'scores': scores,
        'summary': text
    })

    with open(path, 'w') as f:
        json.dump(existing, f, indent=2)

    print(f"Game Day {game_day} summary saved ({latest})")


main()
