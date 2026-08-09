"""SerpAPI (owner-provided key, 2026-08-09): structured Google Maps results for venue discovery.

WHAT ONE CALL BUYS. engine=google_maps returns up to 20 places with name, FULL street address, phone,
business type, gps, place_id, rating, review count and operating hours — the entire field set the
Overpass tier could only partially supply, current as of Google's index rather than a volunteer's last
edit. Its first PLG call surfaced New Generation School of Martial Arts (395 Maple St, 11225), a venue
NO other tier had found.

THE BUDGET IS THE DESIGN CONSTRAINT. Free plan: 250 searches/month, hard. So:
  - Every call is logged to serp_ledger.json (when, query, results count). The ledger is the truth about
    what has been spent; the account endpoint is the truth about what remains — check it when they
    disagree.
  - A 25-search RESERVE is enforced: below that, calls fail unless force=True. The reserve exists for
    mid-month maintenance emergencies (verifying a suspected closure before quarantining).
  - Never spend a search on what a free tier answers: Socrata, operator sites, franchise locators and
    Overpass stay in front of it. This is the SECOND opinion and the neighbourhood opener, not the
    default lookup.
  - ~2 calls per neighbourhood round (one broad kids-sports query, one follow-up on the weakest
    category) covers all 92 neighbourhoods in ~185 calls with maintenance room left over.

EVERY RESULT IS STILL A LEAD. Google Maps carries stale listings and category noise; the entity check
against the operator's own site remains mandatory before a listing is created. What this tier uniquely
adds for MAINTENANCE: results carry "Permanently closed" markers — a closure signal grep-able from a
single neighbourhood re-scan.
"""
import json, os, subprocess, sys, time, urllib.parse

_DIR = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(_DIR, "serp_ledger.json")
RESERVE = 25

def _key():
    for line in open("/home/user/ClassScoutCards/.env.local"):
        line = line.strip()
        if line.startswith("SERPAPI_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("SERPAPI_API_KEY not in .env.local")

def _ledger():
    try:
        return json.load(open(LEDGER))
    except Exception:
        return {"calls": []}

def remaining():
    """Ask the account endpoint — the authoritative number. Costs no search credit."""
    p = subprocess.run(["curl", "-sS", "--max-time", "30",
                        f"https://serpapi.com/account.json?api_key={_key()}"],
                       capture_output=True, text=True)
    try:
        return json.loads(p.stdout).get("total_searches_left")
    except Exception:
        return None

def maps_search(q, lat, lng, zoom=15, force=False):
    """One google_maps search centred on (lat,lng). Returns the list of local_results."""
    led = _ledger()
    left = remaining()
    if left is not None and left <= RESERVE and not force:
        raise RuntimeError(f"SerpAPI reserve reached ({left} left <= {RESERVE}); pass force=True only "
                           f"for a maintenance emergency")
    url = ("https://serpapi.com/search.json?engine=google_maps&type=search"
           f"&q={urllib.parse.quote(q)}&ll=%40{lat}%2C{lng}%2C{zoom}z&api_key={_key()}")
    p = subprocess.run(["curl", "-sS", "--max-time", "60", url], capture_output=True, text=True)
    d = json.loads(p.stdout)
    res = d.get("local_results", []) or ([d["place_results"]] if d.get("place_results") else [])
    led["calls"].append(dict(at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                             q=q, ll=f"{lat},{lng}", n=len(res), left_after=left if left is None else left - 1))
    json.dump(led, open(LEDGER, "w"), indent=1)
    return res

def row(r):
    g = r.get("gps_coordinates") or {}
    return dict(name=r.get("title"), address=r.get("address"), phone=r.get("phone"),
                website=r.get("website"), type=r.get("type"), rating=r.get("rating"),
                reviews=r.get("reviews"), lat=g.get("latitude"), lng=g.get("longitude"),
                place_id=r.get("place_id"), open_state=r.get("open_state"),
                permanently_closed="permanently closed" in str(r.get("open_state", "")).lower())

if __name__ == "__main__":
    q, lat, lng = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    for r in maps_search(q, lat, lng):
        x = row(r)
        flag = " !! PERMANENTLY CLOSED" if x["permanently_closed"] else ""
        print(f"{str(x['name'])[:38]:40} {str(x['address'])[:44]:46} {str(x['phone'] or ''):15} "
              f"{str(x['type'] or '')[:22]:24}{flag}")
    print(f"\nremaining this month: {remaining()}")
