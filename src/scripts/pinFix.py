"""Re-derive the map pin for every live listing whose stored coordinates are not where its address is.

THE DEFECT. `pinDrift.py` + `pinjudge.py` found 67 live listings whose stored `geo` sits kilometres from
the street address stored on the SAME RECORD. Prospect Park Zoo, 450 Flatbush Avenue, is pinned at
40.8615,-73.8905 — the Bronx, and specifically the Wildlife Conservation Society headquarters, which is
the same parent-HQ contamination already recorded here for the ADDRESS field, now found in the
coordinates as well. New York Aquarium is pinned at the same Bronx point. Gotham Tennis Academy, 160
Columbus Avenue on the Upper West Side, is pinned at 40.5483,-74.2752 — Staten Island. Row New York's
Canarsie boathouse is pinned in Manhattan.

WHY IT MATTERS MORE THAN AN ORDINARY WRONG FIELD. The map viewport is a real FILTER in the core app, not
a display hint. A listing with a wrong pin is not merely mislabelled — it is served to families browsing
a neighbourhood it is not in, and absent from the one it is.

THE GUARD THIS NEEDED, AND WHY. The first classification run trusted Nominatim's answer, and Nominatim
quietly resolved "76 Ninth Avenue, New York, NY 10011", "110 Fifth Avenue, New York, NY 10011" and "2180
First Avenue, New York, NY 10029" to a cluster around 40.91,-73.81 — Westchester. Numbered avenues exist
in every town in the region, and the ZIP in the string is not enough to stop the fallback. Worse, two of
those three records STORE that Westchester point already, so the pipeline made the same mistake and a
naive "re-geocode and write" would have confirmed it. So every candidate is checked against its own
BOROUGH's bounding box before anything is written, and a borough-qualified retry is attempted first.
Nothing outside the box is written; it is reported for a human instead.
"""
import json, sys, time
sys.path.insert(0, ".")
from geocode import geocode, looks_like_street
from pindrift import haversine

# Generous rectangles — a bounding box is a sanity check, not a boundary. The point is to catch a pin in
# another COUNTY, not to adjudicate which side of a street something is on.
BOROUGH_BOX = {
    "Manhattan":     (40.679, 40.884, -74.050, -73.903),
    "Brooklyn":      (40.548, 40.742, -74.059, -73.830),
    "Queens":        (40.486, 40.815, -73.965, -73.697),
    "Bronx":         (40.783, 40.921, -73.936, -73.745),
    "Staten Island": (40.474, 40.654, -74.262, -74.046),
}
MIN_MOVE_KM = 0.35   # below this the stored pin is fine; re-writing it buys nothing.


def in_borough(lat, lng, borough):
    b = BOROUGH_BOX.get(borough)
    return bool(b) and b[0] <= lat <= b[1] and b[2] <= lng <= b[3]


def resolve(address, borough):
    """Geocode, preferring a borough-qualified query, and REFUSE anything outside the borough."""
    tries = [address]
    if borough and borough.lower() not in address.lower():
        # "76 Ninth Avenue, New York, NY 10011" is ambiguous across the region; naming the borough is
        # what stops the Westchester fallback.
        head = address.split(",")[0].strip()
        tries.insert(0, f"{head}, {borough}, New York, NY")
    for q in tries:
        g = geocode(q)
        time.sleep(1.2)
        if g and g["precision"] in ("exact", "interpolated") and in_borough(g["lat"], g["lng"], borough):
            return g, q
    return None, tries[-1]


if __name__ == "__main__":
    cand = json.load(open("pinjudge_stale_pin.json")) + json.load(open("pinjudge_wrong_neighborhood.json"))
    pool = {r["id"]: r for r in json.load(open("all_prov.json"))}
    fix, refused = [], []
    for h in cand:
        rec = pool.get(h["id"]) or {}
        addr, boro = str(h.get("address") or ""), h.get("borough")
        if not looks_like_street(addr):
            continue
        g, used = resolve(addr, boro)
        if not g:
            refused.append(dict(h, why="no in-borough street-grade geocode")); continue
        pin = rec.get("geo") or {}
        moved = haversine(g["lat"], g["lng"], pin.get("lat", 0), pin.get("lng", 0))
        if moved < MIN_MOVE_KM:
            continue
        fix.append(dict(id=h["id"], name=h.get("name"), borough=boro, address=addr,
                        neighborhood=h.get("neighborhood"), moved=round(moved, 1),
                        old=[pin.get("lat"), pin.get("lng")], geo=g, query=used,
                        old_in_borough=in_borough(pin.get("lat", 0), pin.get("lng", 0), boro)))
    fix.sort(key=lambda r: -r["moved"])
    json.dump(fix, open("pinfix.json", "w"), indent=1)
    json.dump(refused, open("pinfix_refused.json", "w"), indent=1)
    out = sum(1 for r in fix if not r["old_in_borough"])
    print(f"\n{len(fix)} pins to re-derive; {out} of them are currently OUTSIDE the listing's own borough")
    for r in fix:
        flag = "OUT-OF-BOROUGH" if not r["old_in_borough"] else ""
        print(f"  {r['moved']:6.1f} km  {str(r['name'])[:34]:36} {str(r['address'])[:40]:42} {flag}")
    print(f"\n{len(refused)} refused — no in-borough street-grade geocode, left alone:")
    for r in refused:
        print(f"     {str(r['name'])[:34]:36} {str(r['address'])[:46]}")
