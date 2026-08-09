"""Find listings whose MAP PIN is nowhere near the NEIGHBOURHOOD they claim.

Found by hand in the Prospect Lefferts Gardens round: `prov-skate-yogi-kids-brooklyn` stored the address
140 Empire Blvd — Prospect Lefferts Gardens — with `neighborhood: "Williamsburg"`, which is SKATEYOGI's
other site, six and a half kilometres away. Nothing in the record contradicted itself in a way any
existing scan could see: the address was real, the neighbourhood was a real neighbourhood, and the geo
pin agreed with the address. Only the pin against the NAME disagreed.

WHY A DISTANCE TEST AND NOT A ZIP MAP. This repo deliberately has no ZIP-to-neighbourhood table, because
NYC ZIP and neighbourhood boundaries genuinely disagree and a hand-built map that is 80% right writes
with confidence — that lesson is already in CLAUDE.md and it still holds. A distance test needs no such
map: it asks Nominatim once per DISTINCT NEIGHBOURHOOD NAME for that neighbourhood's own centroid, then
measures each record's own pin against it. Nothing is inferred about where a boundary runs.

IT IS A LEAD GENERATOR AND IT MUST STAY ONE. A big distance is not proof the neighbourhood is wrong —
it can equally mean the ADDRESS is wrong (the parent-HQ-address defect, already confirmed five times
here) or that the geocoder put the centroid somewhere unhelpful. The threshold is deliberately loose so
that a borderline record is not flagged: at 3 km, a listing has to be in effectively a different part of
the borough before it appears.
"""
import json, math, subprocess, sys, time, urllib.parse

UA = "ClassScoutCards-maintenance/1.0 (moldovancsaba@gmail.com)"
THRESHOLD_KM = 3.0
CACHE = "nbhd_centroids.json"


def haversine(a, b, c, d):
    r = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def load_cache():
    try:
        return json.load(open(CACHE))
    except Exception:
        return {}


def centroid(name, borough, cache):
    key = f"{name}|{borough}"
    if key in cache:
        return cache[key]
    q = urllib.parse.quote(f"{name}, {borough}, New York, USA")
    u = f"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q={q}"
    val = None
    for a in range(3):
        p = subprocess.run(["curl", "-sS", "--max-time", "40", "-A", UA, u], capture_output=True, text=True)
        try:
            rows = json.loads(p.stdout)
            val = [float(rows[0]["lat"]), float(rows[0]["lon"])] if rows else None
            break
        except Exception:
            time.sleep(3 * (a + 1))
    cache[key] = val
    json.dump(cache, open(CACHE, "w"))
    time.sleep(1.2)
    return val


if __name__ == "__main__":
    rows = json.load(open("all_prov.json"))
    live = [r for r in rows
            if r.get("visibility") != "hidden" and r.get("qualityStatus") != "quarantined"
            and isinstance(r.get("geo"), dict) and r["geo"].get("lat") and str(r.get("neighborhood") or "").strip()
            and r.get("borough") in ("Brooklyn", "Manhattan", "Queens", "Bronx", "Staten Island")]
    print(f"{len(live)} live listings carry both a pin and a neighbourhood")
    cache = load_cache()
    names = sorted({(str(r["neighborhood"]).strip(), r["borough"]) for r in live})
    print(f"{len(names)} distinct neighbourhood names to locate ({sum(1 for n in names if f'{n[0]}|{n[1]}' not in cache)} not cached)")
    hits, unlocated = [], set()
    for r in live:
        c = centroid(str(r["neighborhood"]).strip(), r["borough"], cache)
        if not c:
            unlocated.add(f'{r["neighborhood"]} ({r["borough"]})'); continue
        d = haversine(r["geo"]["lat"], r["geo"]["lng"], c[0], c[1])
        if d >= THRESHOLD_KM:
            hits.append((round(d, 1), r))
    hits.sort(key=lambda x: -x[0])
    json.dump([dict(km=d, id=r["id"], name=r.get("name"), neighborhood=r.get("neighborhood"),
                    borough=r.get("borough"), address=r.get("address"), website=r.get("website"))
               for d, r in hits], open("pindrift.json", "w"), indent=1)
    print(f"\n{len(hits)} listings whose pin is >= {THRESHOLD_KM} km from the neighbourhood they claim:")
    for d, r in hits[:60]:
        print(f"  {d:5.1f} km  {str(r.get('name'))[:36]:38} claims {str(r.get('neighborhood'))[:20]:22} "
              f"{str(r.get('address'))[:40]}")
    if unlocated:
        print(f"\n{len(unlocated)} neighbourhood names Nominatim could not locate (NOT checked): "
              + ", ".join(sorted(unlocated)[:12]))
