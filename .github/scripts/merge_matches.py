import json, os, urllib.request

TOKEN = os.environ['FOOTBALL_API_TOKEN']
BASE  = 'https://api.football-data.org/v4/competitions/2000/matches'

def fetch(url):
    req = urllib.request.Request(url, headers={'X-Auth-Token': TOKEN})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())['matches']

with open('data/matches.json') as f:
    bulk = json.load(f)

updates = {}
for status in ('FINISHED', 'IN_PLAY', 'PAUSED'):
    for m in fetch(f"{BASE}?status={status}"):
        updates[m['id']] = {'status': m['status'], 'score': m['score']}

changed = 0
for m in bulk['matches']:
    if m['id'] in updates:
        m['status'] = updates[m['id']]['status']
        m['score']  = updates[m['id']]['score']
        changed += 1

with open('data/matches.json', 'w') as f:
    json.dump(bulk, f)

print(f"Merged {changed} live/finished matches into bulk data")
