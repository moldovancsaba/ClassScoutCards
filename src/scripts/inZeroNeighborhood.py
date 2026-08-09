"""Which live sport listings physically SIT in a zero-coverage neighbourhood but are filed elsewhere?

The Prospect Lefferts Gardens round's best find was not a new business. It was SKATEYOGI — a listing the
catalogue already had, storing a PLG address under `neighborhood: "Williamsburg"`, which is the
operator's other site. PLG showed zero sport listings while already having one. No amount of sourcing new
businesses finds that, and it is the cheapest coverage there is: the venue is already verified, already
published, already photographed.

So: take every neighbourhood still showing zero, get its bounding box, and list the live sport listings
whose own PIN falls inside it while their stored `neighborhood` says something else.

A BOUNDING BOX IS NOT A POLYGON and this is emphatically a lead generator. Manhattan's micro-neighbourhood
boxes overlap heavily — Gramercy, Gramercy Park, Rose Hill, NoMad, Koreatown and Murray Hill are largely
the same rectangle — so a hit means "worth checking against the real boundary", never "refile it". The
pins themselves are only trustworthy because 70 of them were re-derived from their own addresses in the
same session; running this before that would have chased coordinates rather than listings.
"""
import json, subprocess, sys, time, urllib.parse

UA = "ClassScoutCards-maintenance/1.0 (moldovancsaba@gmail.com)"
CACHE = "nbhd_boxes.json"

def boxes():
    try:
        return json.load(open(CACHE))
    except Exception:
        return {}

def box(name, borough, c):
    k = f"{name}|{borough}"
    if k in c:
        return c[k]
    q = urllib.parse.quote(f"{name}, {borough}, New York, USA")
    u = f"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q={q}"
    v = None
    for a in range(3):
        p = subprocess.run(["curl", "-sS", "--max-time", "40", "-A", UA, u], capture_output=True, text=True)
        try:
            rows = json.loads(p.stdout)
            if rows:
                s, n, w, e = [float(x) for x in rows[0]["boundingbox"]]
                v = [s, n, w, e]
            break
        except Exception:
            time.sleep(3 * (a + 1))
    c[k] = v
    json.dump(c, open(CACHE, "w"))
    time.sleep(1.2)
    return v


if __name__ == "__main__":
    zeros = json.load(open(sys.argv[1]))
    rows = json.load(open("all_prov.json"))
    served = set(json.load(open("served_ids.json")))
    SPORT = set(json.load(open("sportset.json")))
    live = [r for r in rows
            if r.get("id") in served and isinstance(r.get("geo"), dict) and r["geo"].get("lat")
            and any(str(t).strip().lower() in SPORT for t in (r.get("activityTypes") or []))]
    c = boxes()
    out = []
    for boro, nb in zeros:
        b = box(nb, boro, c)
        if not b:
            print(f"!! {boro}/{nb}: Nominatim could not locate it — not checked")
            continue
        s, n, w, e = b
        hits = [r for r in live
                if r.get("borough") == boro
                and s <= r["geo"]["lat"] <= n and w <= r["geo"]["lng"] <= e
                and str(r.get("neighborhood") or "").strip().lower() != nb.lower()]
        if not hits:
            continue
        print(f"\n{boro}/{nb} — {len(hits)} live sport listing(s) pinned inside its box, filed elsewhere:")
        for r in hits:
            print(f"    {str(r.get('name'))[:36]:38} filed as {str(r.get('neighborhood'))[:20]:22} {str(r.get('address'))[:40]}")
            out.append(dict(target=nb, borough=boro, id=r["id"], name=r.get("name"),
                            filed=r.get("neighborhood"), address=r.get("address"),
                            lat=r["geo"]["lat"], lng=r["geo"]["lng"]))
    json.dump(out, open("inzero.json", "w"), indent=1)
    print(f"\n{len(out)} leads written to inzero.json")
