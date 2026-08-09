"""Yelp phone-join closure sweep, address-checked.

FOUND AND FIXED (2026-08-09) across TWO rounds of this tool's own first run:

  ROUND 1 -- shared phone, different address. Some operators reuse ONE phone across several Yelp
  listings at different addresses (The Tiny Scientist: 1624 8th Ave is open; 318 Greenwood Ave and 69
  Underhill Ave, two OTHER locations sharing the phone, are closed on Yelp). Fixed by requiring the
  closed result's address to match the stored record's address.

  ROUND 2 -- same address, different NAME, two real shapes. (a) A business that MOVED: Staten Island
  Museum's phone matches both its old downtown listing (75 Stuyvesant Pl, closed) and its current Snug
  Harbor listing (1000 Richmond Ter, open) -- same phone, same ZIP, but a DIFFERENT STREET, and
  address-matching on ZIP alone let the old address through. (b) A business that RENAMED: Clayhouse
  Brooklyn's phone and address exactly match a closed "The Painted Pot" listing at the same door --
  Yelp kept the old brand's listing as closed when the shop rebranded. Neither is evidence the STORED
  record's business is closed. Fixed by requiring the closed result's NAME to also be a plausible match
  to the stored record's name, not just the address -- a closed listing under a different name at the
  same address is a rename or a relocation-in-reverse, not this business closing.
"""
import json, re, sys, time
sys.path.insert(0, ".")
from yelp import by_phone, row

def digits(p):
    d = re.sub(r"\D", "", str(p or ""))
    return d[-10:] if len(d) >= 10 else None

def norm_addr(a):
    a = re.sub(r"[^a-z0-9 ]", " ", str(a or "").lower())
    return re.sub(r"\s+", " ", a).strip()

def norm_name(n):
    return re.sub(r"[^a-z0-9]", "", str(n or "").lower())

def same_place(stored_addr, yelp_addr):
    """Street-level match only -- NOT ZIP alone, which let a moved museum's old address through."""
    sa, ya = norm_addr(stored_addr), norm_addr(yelp_addr)
    return bool(sa) and bool(ya) and (sa[:14] == ya[:14] or sa in ya or ya in sa)

def same_business(stored_name, yelp_name):
    """A closed listing under a DIFFERENT name at the same address is a rename or a seasonal
    sub-event, not a closure. FOUND (2026-08-09): New York Botanical Garden's phone matched a closed
    'Haunted Pumpkin Garden - New York Botanical Garden' listing -- a past Halloween event, not the
    venue -- because the venue's own name was a SUBSTRING of the event's name. Plain substring
    containment is too loose whenever a shorter name sits inside a much longer one; require the
    shorter name to cover most of the longer one's length, not merely appear inside it."""
    sn, yn = norm_name(stored_name), norm_name(yelp_name)
    if not sn or not yn:
        return False
    if sn == yn:
        return True
    shorter, longer = (sn, yn) if len(sn) <= len(yn) else (yn, sn)
    if shorter not in longer:
        return sn[:8] == yn[:8]
    return len(shorter) / len(longer) >= 0.7

if __name__ == "__main__":
    rows = json.load(open("all_prov.json"))
    live = [r for r in rows if r.get("visibility") != "hidden" and r.get("qualityStatus") != "quarantined"
            and digits(r.get("phone"))]
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    offset = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    sample = live[offset:offset + n]
    print(f"{len(live)} live providers with a phone; sampling {len(sample)} from offset {offset}\n")
    leads, shared_phone_skips, checked, errors = [], 0, 0, 0
    for r in sample:
        ph = digits(r["phone"])
        try:
            results = by_phone(ph)
        except Exception:
            errors += 1
            continue
        checked += 1
        for b in results:
            x = row(b)
            if not x["is_closed"]:
                continue
            if same_place(r.get("address"), x["address"]) and same_business(r.get("name"), x["name"]):
                leads.append(dict(id=r["id"], name=r.get("name"), phone=r.get("phone"),
                                  address=r.get("address"), yelp_addr=x["address"]))
                print(f"LEAD  {r['id'][:44]:46} {str(r.get('name'))[:34]:36} {str(r.get('address'))[:36]}")
            else:
                shared_phone_skips += 1
        time.sleep(0.15)
    json.dump(leads, open("closure_leads.json", "w"), indent=1)
    print(f"\nchecked {checked} (errors {errors}), {len(leads)} address-matched closure leads, "
          f"{shared_phone_skips} shared-phone-different-address skips (not leads)")
