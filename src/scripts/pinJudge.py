"""Split a pin-drift hit into its two very different causes, by re-geocoding the record's OWN address.

`pinDrift.py` measures the stored pin against the claimed neighbourhood's centroid, and its first run
returned 152 hits — but reading them showed the design was aimed at the wrong field. "Gotham Tennis
Academy Manhattan, 160 Columbus Ave, claims Upper West Side, 36.7 km away" is not a neighbourhood error:
160 Columbus Avenue IS the Upper West Side. The PIN is wrong. Prospect Park Zoo at 450 Flatbush Ave came
back 23.2 km out for the same reason — a stale pin left over from the WCS-headquarters address defect
already recorded here.

So a drift hit has three possible causes and they need different fixes:

  STALE PIN         the address geocodes near the neighbourhood, the stored pin does not.
                    The address is right and the coordinates are stale or were never re-derived. This is
                    the WORST of the three for a family, because the map viewport is a real filter in the
                    core app: the listing is on the map, in the wrong place, looking confident.
  WRONG NEIGHBOURHOOD   the address and the stored pin agree with each other and both are far from the
                    claimed neighbourhood. Chelsea Greyhounds Track Club at 65 Seaman Avenue is in
                    INWOOD; "Chelsea" is the club's name. Same brand-name-in-a-place-field shape already
                    catalogued for Prospect Gymnastics.
  UNRESOLVED        a placeholder address ("Upper West Side, Manhattan, NYC") has no street to geocode,
                    so nothing can be concluded and the record is reported separately rather than
                    counted as either.

Reports the three separately and never merges them, because a count that mixes them is a count nobody
can act on.
"""
import json, math, re, sys, time
sys.path.insert(0, ".")
from geocode import geocode, looks_like_street
from pindrift import haversine, load_cache, centroid

NEAR_KM = 1.5

if __name__ == "__main__":
    hits = json.load(open("pindrift.json"))
    cache = load_cache()
    stale, wrong, unresolved, failed = [], [], [], []
    pool = {r["id"]: r for r in json.load(open("all_prov.json"))}
    for h in hits:
        rec = pool.get(h["id"]) or {}
        addr = str(h.get("address") or "")
        if not looks_like_street(addr):
            unresolved.append(h); continue
        g = geocode(addr)
        time.sleep(1.2)
        if not g:
            failed.append(h); continue
        c = centroid(str(h["neighborhood"]).strip(), h["borough"], cache)
        if not c:
            failed.append(h); continue
        pin = rec.get("geo") or {}
        d_addr_nbhd = haversine(g["lat"], g["lng"], c[0], c[1])
        d_addr_pin = haversine(g["lat"], g["lng"], pin.get("lat", 0), pin.get("lng", 0))
        row = dict(h, addr_to_nbhd=round(d_addr_nbhd, 1), addr_to_pin=round(d_addr_pin, 1),
                   fresh=dict(lat=g["lat"], lng=g["lng"], precision=g["precision"], source=g["source"]))
        if d_addr_pin >= NEAR_KM and d_addr_nbhd < NEAR_KM * 2:
            stale.append(row)
        elif d_addr_nbhd >= 3.0:
            wrong.append(row)
        else:
            stale.append(row) if d_addr_pin >= NEAR_KM else failed.append(row)
    for n, v in (("stale_pin", stale), ("wrong_neighborhood", wrong),
                 ("unresolved_placeholder", unresolved), ("inconclusive", failed)):
        json.dump(v, open(f"pinjudge_{n}.json", "w"), indent=1)
    print(f"\nSTALE PIN — address is right, coordinates are not ({len(stale)}):")
    for r in sorted(stale, key=lambda r: -r["addr_to_pin"])[:40]:
        print(f"  pin off by {r['addr_to_pin']:6.1f} km  {str(r['name'])[:34]:36} {str(r['address'])[:44]}")
    print(f"\nWRONG NEIGHBOURHOOD — address and pin agree, the name of the place does not ({len(wrong)}):")
    for r in sorted(wrong, key=lambda r: -r["addr_to_nbhd"])[:40]:
        print(f"  {r['addr_to_nbhd']:6.1f} km from {str(r['neighborhood'])[:20]:22} {str(r['name'])[:30]:32} {str(r['address'])[:40]}")
    print(f"\nPLACEHOLDER ADDRESS — nothing to conclude ({len(unresolved)})")
    print(f"INCONCLUSIVE ({len(failed)})")
