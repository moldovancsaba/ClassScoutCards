"""Yelp Fusion API (owner-provided key, 2026-08-09) — structured discovery AND the automated closure sweep.

WHAT THIS CLOSES. The source registry's owner ask #2. Fusion returns structured
name/address/phone/categories/coordinates and — the field nothing else on the registry has — `is_closed`,
maintained by Yelp itself. Free tier: 5,000 calls/day, which for this catalogue is effectively
unmetered: the entire live pool (~1,100 listings) can be closure-checked in ONE day's budget with room
to spare, weekly.

THE TWO MODES:

  search(lat, lng, radius_m, categories)  DISCOVERY. One call = up to 50 structured places in a real
                                          radius. Category aliases that matter here: martialarts,
                                          swimminglessons, gymnastics, dance, sportsclubs, kids_activities,
                                          summer_camps, climbing, fencing, boxing, basketballcourts,
                                          tennis, skatingrinks, archery, yoga.
  by_phone(phone)                         MAINTENANCE. The catalogue already normalises phones to digits
                                          (it is the cheapest duplicate key we have); the same digits are
                                          Yelp's join key. For every live listing with a phone, one call
                                          returns Yelp's record INCLUDING is_closed. A True here is a
                                          LEAD for the closure check, never an automatic quarantine —
                                          Yelp mis-marks businesses too, so the operator's own site
                                          remains the verdict. But it turns "which of 1,100 listings
                                          should a human look at this week" from guesswork into a list.

EVERY RESULT IS A LEAD. Yelp carries stale listings, home-based instructors with no venue (the
no-fixed-venue prohibition still applies — 'Instructor Andrew Fowler, New York, NY' with no address is
exactly that shape), and businesses outside the search area (a Bronx swim instructor and a Long Beach
gym appeared inside a 1.2 km PLG radius because Yelp pads thin results). Address-less results are
dropped by row(); the entity check against the operator's own site stays mandatory before any create.
"""
import json, os, subprocess, sys, time, urllib.parse

def _key():
    for line in open("/home/user/ClassScoutCards/.env.local"):
        line = line.strip()
        if line.startswith("YELP_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("YELP_API_KEY not in .env.local")

def _get(path, params):
    url = f"https://api.yelp.com/v3{path}?" + urllib.parse.urlencode(params)
    for a in range(4):
        p = subprocess.run(["curl", "-sS", "--max-time", "45",
                            "-H", f"Authorization: Bearer {_key()}", url],
                           capture_output=True, text=True)
        try:
            d = json.loads(p.stdout)
        except Exception:
            time.sleep(2 * (a + 1)); continue
        if d.get("error", {}).get("code") == "TOO_MANY_REQUESTS_PER_SECOND":
            time.sleep(1.5); continue
        return d
    return {"error": {"code": "unreachable"}}

DEFAULT_CATS = ("martialarts,swimminglessons,gymnastics,sportsclubs,kids_activities,summer_camps,"
                "climbing,fencing,boxing,tennis,skatingrinks,archery")

def search(lat, lng, radius_m=1200, categories=DEFAULT_CATS, limit=50):
    d = _get("/businesses/search", dict(latitude=lat, longitude=lng, radius=min(radius_m, 40000),
                                        categories=categories, limit=min(limit, 50)))
    return d.get("businesses", [])

def by_phone(phone):
    """phone as digits or +1XXXXXXXXXX; returns Yelp's businesses for that number (usually 0 or 1)."""
    digits = "".join(c for c in str(phone) if c.isdigit())
    if len(digits) == 10:
        digits = "1" + digits
    d = _get("/businesses/search/phone", dict(phone="+" + digits))
    return d.get("businesses", [])

def row(b):
    loc = b.get("location") or {}
    addr = " ".join(loc.get("display_address") or [])
    return dict(name=b.get("name"), address=addr or None, zip=loc.get("zip_code"),
                phone=b.get("display_phone") or b.get("phone"),
                lat=(b.get("coordinates") or {}).get("latitude"),
                lng=(b.get("coordinates") or {}).get("longitude"),
                categories=[c["alias"] for c in b.get("categories", [])],
                rating=b.get("rating"), reviews=b.get("review_count"),
                is_closed=b.get("is_closed"), yelp_id=b.get("id"), url=(b.get("url") or "").split("?")[0],
                has_street_address=bool(loc.get("address1")))

if __name__ == "__main__":
    if sys.argv[1] == "phone":
        for b in by_phone(sys.argv[2]):
            x = row(b)
            print(f"{x['name'][:40]:42} {str(x['address'])[:44]:46} CLOSED={x['is_closed']}")
    else:
        lat, lng = float(sys.argv[1]), float(sys.argv[2])
        rad = int(sys.argv[3]) if len(sys.argv) > 3 else 1200
        for b in search(lat, lng, rad):
            x = row(b)
            flag = "" if x["has_street_address"] else "  [NO STREET ADDRESS]"
            print(f"{x['name'][:38]:40} {str(x['address'])[:44]:46} {str(x['phone'] or '')[:15]:16} "
                  f"closed={x['is_closed']} {','.join(x['categories'])[:28]}{flag}")
