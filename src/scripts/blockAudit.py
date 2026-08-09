"""Mechanical audit: for every provider NOT served by the live public API, why?

The owner's question is specifically "which are blocked because of the image ONLY" — so the classifier
has to attribute a reason per record rather than report a total, and it has to be able to say
"image was the only thing wrong" as distinct from "image was one of several things wrong".

Every check below mirrors a real condition in the deployed read path, not an invented quality bar:

  hidden / quarantined     the two moderation flags, checked first because they dominate everything else
  no name / category /     `isRenderableExceptImage` — the fields a card cannot render without
    location / source
  scraped chrome           `containsScrapedChrome` over short + long + announcement, the same expression
  category off for browse  `isBrowseCategoryEnabled` — Drop-In Activities and Birthday Parties are
                           switched off, measured empirically rather than read from config this bridge
                           cannot see
  out-of-region borough    anything outside the five boroughs and the LA areas
  no image                 no longer a gate as of today; kept as a REPORTED attribute so the population
                           it used to block can be counted exactly

"Served" is taken from the live API, cache-busted. Anything not served and not explained by the checks
above is reported as UNEXPLAINED rather than silently bucketed — an audit that always has an answer is
an audit that is guessing.
"""
import json, re, subprocess, sys, time
from collections import Counter

CHROME = [
    r"\bskip to (?:main )?content\b", r"\bskip navigation\b", r"\btoggle mobile menu\b",
    r"\bopen menu close menu\b", r"\bmain menu\b", r"\bmobile navigation\b", r"\bback to top\b",
    r"\bshow (?:more|less)\b", r"\bplease select a topic\b", r"\baccept (?:all )?cookies\b",
    r"\bcookie (?:policy|preferences|settings)\b", r"\bwe use cookies\b", r"\bfollow us on\b",
    r"^\s*(?:home|homepage)\s*(?:[>›»]|&gt;)",
]
CHROME_RE = re.compile("|".join(CHROME), re.I)
CAROUSEL = re.compile(r"(?:[•·]\s*){4,}")
NYC = {"Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"}
LA = {"Central LA", "Westside", "San Fernando Valley", "San Gabriel Valley", "South Bay",
      "Harbor", "Northeast LA", "South LA", "Eastside"}
# Measured, not assumed: of 56 image-carrying unserved sport listings, 38 were Drop-In Activities and
# 12 Birthday Parties. Treated as browse-disabled until the core developer says otherwise.
BROWSE_OFF = {"Drop-In Activities", "Birthday Parties"}


def has_image(u):
    if not isinstance(u, str) or not u.lower().startswith("https://"):
        return False
    m = re.match(r"https://([^/?#:]+)", u, re.I)
    h = m.group(1).lower() if m else ""
    return h in ("i.ibb.co", "ibb.co", "image.ibb.co") or h.endswith(".ibb.co")


def blockers(d):
    """Every reason this record would not be served, in no particular order. Empty = should be served."""
    out = []
    if d.get("visibility") == "hidden":
        out.append("hidden")
    if d.get("qualityStatus") == "quarantined":
        out.append("quarantined")
    if not str(d.get("name") or "").strip():
        out.append("no name")
    if not str(d.get("category") or "").strip():
        out.append("no category")
    if not str(d.get("borough") or "").strip():
        out.append("no borough")
    src = str(d.get("website") or "").strip() or (
        str((d.get("sourceUrls") or [""])[0]) if isinstance(d.get("sourceUrls"), list) and d.get("sourceUrls") else "")
    if not re.match(r"^https?://\S+$", src):
        out.append("no source URL")
    copy = " ".join(str(d.get(k) or "") for k in ("shortDescription", "longDescription", "announcementDescription"))
    if CHROME_RE.search(copy) or CAROUSEL.search(copy):
        out.append("scraped chrome in copy")
    boro = str(d.get("borough") or "").strip()
    if boro and boro not in NYC and boro not in LA:
        out.append(f"borough outside served regions ({boro})")
    if str(d.get("category") or "") in BROWSE_OFF:
        out.append(f"category switched off for browse ({d.get('category')})")
    return out


def main():
    rows = json.load(open("all_prov.json"))
    url = f"https://classscout.vercel.app/api/public/providers?_cb={int(time.time())}"
    p = subprocess.run(["curl", "-sS", "--max-time", "60", url], capture_output=True, text=True)
    d = json.loads(p.stdout)
    served = {i.get("id") for i in (d if isinstance(d, list) else d.get("items", []))}
    print(f"records in the database        : {len(rows)}")
    print(f"served by the live public API  : {len(served)}\n")

    unserved = [r for r in rows if r["id"] not in served]
    imageonly, explained, unexplained = [], Counter(), []
    for r in unserved:
        b = blockers(r)
        if not b:
            # Nothing this audit can see is wrong. If it also lacks an image, that WAS the only blocker.
            (imageonly if not has_image(r.get("image")) else unexplained).append(r)
        else:
            explained[b[0]] += 1
    print(f"NOT served: {len(unserved)}\n")
    print("primary reason, mechanically:")
    for k, n in explained.most_common():
        print(f"   {n:5}  {k}")
    print(f"   {len(imageonly):5}  BLOCKED BY THE MISSING IMAGE ALONE  <-- these should now appear")
    print(f"   {len(unexplained):5}  unexplained (passes every check this audit can make, has an image)")

    json.dump([r["id"] for r in imageonly], open("imageonly.json", "w"), indent=1)
    json.dump([r["id"] for r in unexplained], open("unexplained.json", "w"), indent=1)
    if imageonly:
        print("\nimage-only blocked, by borough:", dict(Counter(r.get("borough") for r in imageonly)))
        for r in imageonly[:20]:
            print(f"   {r['id'][:52]:54} {str(r.get('borough')):14} {str(r.get('neighborhood') or '-')}")
    if unexplained:
        print("\nunexplained, first 12:")
        for r in unexplained[:12]:
            print(f"   {r['id'][:52]:54} {str(r.get('category')):20} {str(r.get('borough'))}")


if __name__ == "__main__":
    main()
