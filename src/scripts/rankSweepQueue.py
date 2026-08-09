"""Rank a sweep's raw venues into a workable queue: drop the noise, score the rest, dedupe on address."""
import json, re, sys

ADULT_CHAIN = re.compile(r"\b(planet fitness|blink|crunch|equinox|new york sports club|nysc|orangetheory|"
                         r"f45|barry'?s|solidcore|club pilates|corepower|cyclebar|soulcycle|flywheel|"
                         r"life ?time|24 hour|retro fitness|gold'?s gym|anytime fitness|crossfit|bodyrok|"
                         r"epic hybrid|barre3|pure barre|harbor fitness|synergy fitness|ludlow fitness|"
                         r"mid city gym|conbody|hithouse|refine method|the gym|blink fitness|"
                         r"tmpl|chelsea piers fitness|lucille roberts|whole body|dogpound)\b", re.I)
RETAIL = re.compile(r"\b(adidas|nike|paragon|saddlery|calzedonia|everything but water|supreme|"
                    r"athletic propulsion|moe sports|eye box|modell|dick'?s|foot locker|decathlon)\b", re.I)
STRONG_KIND = {"dojo", "sports_centre", "swimming_pool", "sports_hall", "skate", "bowling_alley"}
STRONG_SPORT = re.compile(r"martial|karate|taekwondo|judo|jiu|aikido|swim|gymnast|skate|climb|soccer|"
                          r"basketball|tennis|volleyball|archery|fencing|parkour|cheer|hockey|lacrosse", re.I)
KIDNAME = re.compile(r"\b(kids?|children|youth|junior|little|tiger|ninja|academy|ymca|ywca|jcc)\b", re.I)

def rank(sw, pool):
    def n(s): return re.sub(r"[^a-z0-9]", "", str(s or "").lower())
    have_addr = {n(r.get("address"))[:22] for r in pool if r.get("address")}
    have_name = {n(r.get("name")) for r in pool}
    by = {}
    for k, v in sw.items():
        if not v:
            continue
        boro, nb = k.split("|", 1)
        for r in v:
            if not r["addr"]:
                continue
            blob = f"{r['name']} {r['web']}"
            if ADULT_CHAIN.search(blob) or RETAIL.search(blob):
                continue
            if n(r["name"]) in have_name or n(r["addr"])[:22] in have_addr:
                continue
            s = 0
            if r["kind"] in STRONG_KIND: s += 3
            if STRONG_SPORT.search(f"{r['sport']} {r['name']}"): s += 3
            if KIDNAME.search(r["name"]): s += 2
            if r["web"]: s += 1
            if r["phone"]: s += 1
            if s < 5:
                continue
            key = n(r["addr"])[:22] + "|" + n(r["name"])
            cur = by.setdefault(key, dict(r, boro=boro, nbs=set(), score=s))
            cur["nbs"].add(nb); cur["score"] = max(cur["score"], s)
    out = sorted(by.values(), key=lambda r: (-r["score"], r["boro"], r["name"]))
    for r in out:
        r["nbs"] = sorted(r["nbs"])
    return out

if __name__ == "__main__":
    pool = json.load(open("all_prov.json"))
    merged = {}
    for f in sys.argv[1:]:
        merged.update(json.load(open(f)))
    out = rank(merged, pool)
    json.dump(out, open("queue2.json", "w"), indent=1)
    print(f"{len(out)} candidates not already in the pool\n")
    for r in out:
        print(f" {r['score']} {r['boro'][:9]:10} {r['name'][:34]:36} {r['addr'][:24]:26} {r['zip']:6} "
              f"{','.join(r['nbs'])[:22]:24} {r['web'][:32]}")
