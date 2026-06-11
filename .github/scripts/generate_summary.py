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

    # Skip if summary already exists for this date
    path = 'data/daily-summary.json'
    if os.path.exists(path):
        with open(path) as f:
            try:
                if json.load(f).get('date') == latest:
                    print(f"Summary already exists for {latest}")
                    return
            except Exception:
                pass

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

    # Match results text
    result_lines = []
    for m in todays:
        sc = m['score']['fullTime']
        w = m['score']['winner']
        group = m.get('group', '').replace('GROUP_', 'Group ')
        if w == 'HOME_TEAM':
            suffix = f"({m['homeTeam']['name']} win)"
        elif w == 'AWAY_TEAM':
            suffix = f"({m['awayTeam']['name']} win)"
        else:
            suffix = "(Draw)"
        line = f"{m['homeTeam']['name']} {sc['home']}-{sc['away']} {m['awayTeam']['name']} {suffix}"
        if group:
            line += f" — {group}"
        result_lines.append(line)

    results_text = '\n'.join(result_lines)
    players_text = '\n'.join(player_lines) if player_lines else "Draw not complete yet"

    prompt = f"""You are writing the daily match summary for "The Murphy/Donnelly Sweepstakes 2026" — a World Cup sweepstakes between friends called "The Avalanche".

Game Day {game_day} is done. Write a funny, punchy WhatsApp-style summary (4-5 short paragraphs, max 250 words). Like a mate recapping the day — specific, a bit of banter, light roasting welcome. Use first names only. End with a sharp one-liner.

RESULTS — Game Day {game_day} ({latest}):
{results_text}

SWEEPSTAKE IMPACT (how it affected our players):
{players_text}

PRIZES FOR CONTEXT: Winner €120 | Runner-up €50 | Semi-finalists €15 each | Underdog Hero (last T3 standing) €20 | Beautiful Loser (best group exit) €15 | Wooden Spoon (most goals conceded) €5"""

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
        print(f"Claude API error {e.code}: {e.read().decode()}")
        sys.exit(1)

    summary = {
        'gameDay': game_day,
        'date': latest,
        'generated': datetime.now(timezone.utc).isoformat(),
        'summary': text
    }

    with open(path, 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"Game Day {game_day} summary saved ({latest})")


main()
