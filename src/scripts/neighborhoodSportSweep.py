"""Feed the queue: for every under-covered neighbourhood, list the sport venues that physically sit in it.

This is the retrospective from the Prospect Lefferts Gardens round turned into a measurement. That round
was worked by web search, and a web search for a small residential neighbourhood is close to useless —
it returns borough-wide Yelp and ClassPass pages, because the ranking has nothing local to show. What
actually resolved PLG was asking OpenStreetMap "what named sport venues have a mapped address inside this
polygon", which returned the entire real inventory in one request: three children's venues, three adult
gyms, and the parks.

Two things it also settled that a search could not. It showed PLG's inventory is genuinely about three
venues, so the round's ceiling was a fact about the neighbourhood rather than a failure of effort. And it
surfaced SKATEYOGI — a listing the catalogue ALREADY HAD, filed under the wrong neighbourhood — which no
amount of sourcing new businesses would ever have found.

STILL A LEAD GENERATOR. OSM is crowd-sourced: it carries closed businesses, adult-only gyms tagged the
same as children's schools, and franchise entries with no local detail. Every candidate here still needs
the entity check against the operator's own site, the children's-programme check (47 BJJ Coop passed
every other test and teaches no children at all), and the address duplicate check against the pool.
"""
import json, math, re, subprocess, sys, time, urllib.parse

UA = "ClassScoutCards-maintenance/1.0 (moldovancsaba@gmail.com)"

# WORD-BOUNDARY, not substring. The first version of this filter matched `sport` inside
# "public_tranSPORT" and returned three MTA bus depots, and matched "Sports & Imports Auto" -- the
# identical trap already recorded in CLAUDE.md as "Art" living inside "mARTial". Every alternative below
# is anchored, and the few that must match inside a longer word (swim in Swimming, box in Boxing) carry
# an explicit suffix rather than being left open.
KEEP = re.compile(r"\b(?:sports?|fitness|gyms?|swim\w*|martial|dojos?|karate|taekwondo|judo|jiu|"
                  r"capoeira|box(?:ing)?|wrestl\w*|climb\w*|skate\w*|soccer|futbol|basketball|"
                  r"tennis|volleyball|baseball|softball|hockey|lacrosse|cheer\w*|parkour|ninja|"
                  r"fencing|athletics?|rowing|squash|recreation|ymca|ywca|jcc)\b", re.I)
DROP = re.compile(r"\b(bar|pub|restaurant|deli|pharmacy|liquor|salon|barber|nail|laundr|bank|"
                  r"grocery|bodega|smoke|vape|cannabis|dispensar|hotel|hostel|clinic|dental|"
                  r"auto|cars?|garage|depot|warehouse|storage|parking)\b", re.I)
# Tag VALUES that are never a children's venue however the name reads. `public_transport=*` is what
# dragged three MTA bus depots into the first run.
DROP_KIND = re.compile(r"^(public_transport|bus_station|car_repair|car|fuel|parking)$", re.I)

OVERPASS = """[out:json][timeout:100];
(
  nwr[name][~"^(leisure|sport|amenity|shop|club|office)$"~"."](%s);
);
out center tags;"""


def bbox(name, borough):
    q = urllib.parse.quote(f"{name}, {borough}, New York, USA")
    u = f"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q={q}"
    for a in range(3):
        p = subprocess.run(["curl", "-sS", "--max-time", "40", "-A", UA, u], capture_output=True, text=True)
        try:
            rows = json.loads(p.stdout)
        except Exception:
            time.sleep(3 * (a + 1)); continue
        if not rows:
            return None
        s, n, w, e = [float(x) for x in rows[0]["boundingbox"]]
        # A point result comes back as a zero-area box; give it ~600 m of breathing room so the query
        # still describes a neighbourhood rather than a pin.
        if n - s < 0.004:
            s, n = s - 0.003, n + 0.003
        if e - w < 0.005:
            w, e = w - 0.004, e + 0.004
        return f"{s},{w},{n},{e}"
    return None


def overpass(bb):
    for a in range(3):
        p = subprocess.run(["curl", "-sS", "--max-time", "150", "-d", "data=" + (OVERPASS % bb),
                            "https://overpass-api.de/api/interpreter"], capture_output=True, text=True)
        try:
            return json.loads(p.stdout)["elements"]
        except Exception:
            time.sleep(5 * (a + 1))
    return []


def norm_addr(a):
    a = re.sub(r"[^a-z0-9 ]+", " ", str(a or "").lower())
    return re.sub(r"\s+", " ", a).strip()


if __name__ == "__main__":
    targets = json.load(open(sys.argv[1]))
    # Output path is an ARGUMENT, not a constant. The second run of this script overwrote the first
    # run's results because both wrote to sweep.json -- a silent data loss that only did not cost
    # anything because the ranked queue had already been extracted.
    outpath = sys.argv[2] if len(sys.argv) > 2 else "sweep.json"
    pool = json.load(open("all_prov.json"))
    have_addr = {norm_addr(r.get("address"))[:34] for r in pool if r.get("address")}
    have_name = {re.sub(r"[^a-z0-9]", "", str(r.get("name") or "").lower()) for r in pool}
    out = {}
    for borough, name in targets:
        bb = bbox(name, borough)
        time.sleep(1.2)
        if not bb:
            print(f"!! {borough}/{name}: Nominatim could not locate it — SKIPPED, not 'zero venues'")
            out[f"{borough}|{name}"] = None
            continue
        rows, seen = [], set()
        for e in overpass(bb):
            t = e.get("tags", {})
            n = t.get("name")
            if not n or n.lower() in seen:
                continue
            # `_` is a word character, so \b never fires between "sports" and "_centre" and the
            # word-boundary fix silently dropped every leisure=sports_centre. Normalise the
            # separators BEFORE matching -- OSM tag values are snake_case and semicolon-joined.
            blob = re.sub(r"[_;=]", " ", " ".join(f"{k}={v}" for k, v in t.items()))
            kind_v = t.get("leisure") or t.get("amenity") or t.get("shop") or t.get("office") or ""
            if "public_transport" in t or DROP_KIND.match(kind_v):
                continue
            if not KEEP.search(blob) or DROP.search(blob):
                continue
            seen.add(n.lower())
            addr = " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x)
            key = re.sub(r"[^a-z0-9]", "", n.lower())
            rows.append(dict(name=n, addr=addr, zip=t.get("addr:postcode", ""),
                             sport=t.get("sport", ""),
                             kind=t.get("leisure") or t.get("amenity") or t.get("shop") or t.get("office") or "",
                             phone=t.get("phone") or t.get("contact:phone") or "",
                             web=t.get("website") or t.get("contact:website") or "",
                             lat=e.get("lat") or (e.get("center") or {}).get("lat"),
                             lon=e.get("lon") or (e.get("center") or {}).get("lon"),
                             known=(key in have_name) or (bool(addr) and norm_addr(addr)[:34] in have_addr)))
        rows.sort(key=lambda r: (r["known"], not r["addr"], r["name"]))
        out[f"{borough}|{name}"] = rows
        fresh = [r for r in rows if not r["known"]]
        print(f"{borough}/{name}: {len(rows)} venues, {len(fresh)} not already in the pool")
        for r in fresh[:14]:
            print(f"     {r['name'][:36]:38} {r['addr'][:24]:26} {r['kind'][:12]:13} "
                  f"{r['sport'][:16]:17} {r['phone'][:14]:15} {r['web'][:34]}")
        json.dump(out, open(outpath, "w"), indent=1)
        time.sleep(2)
    print(f"\nwrote {outpath} — {sum(len(v or []) for v in out.values())} venues across {len(out)} neighbourhoods")
