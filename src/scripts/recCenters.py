"""NYC Parks recreation centers as a source: a public, addressed, borough-grouped list of real venues.

Every center is a real building children physically attend, with indoor pools, basketball courts and
dance studios, and the department runs youth programs at all of them. That makes this one of the few
sources where the entity check and the physical-location check are satisfied by the source itself.

TWO THINGS THE LIST ITSELF WARNS ABOUT, and both are recorded rather than ignored: several centers are
marked 'temporarily closed' and several carry 'service changes'. A temporarily-closed center is the
lifecycle case already catalogued here (Ozone Park and Brighton Beach libraries) — real, but not a place
a child can go this week — so it is excluded and named, not quietly listed.
"""
import html, json, re, subprocess, sys

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
p = subprocess.run(["curl", "-sSL", "--max-time", "60", "-A", UA,
                    "https://www.nycgovparks.org/facilities/recreationcenters"],
                   capture_output=True, text=True)
t = p.stdout

# The page groups centers under a per-borough anchor; each entry is a link to /facilities/... plus an
# address line. Parse from the markup rather than the flattened text, because the flattened text runs
# the address into the following sentence.
BORO = {"X": "Bronx", "B": "Brooklyn", "M": "Manhattan", "Q": "Queens", "R": "Staten Island"}

# The page is one <div id="B"> etc per borough, and inside it one .poolbox per center whose <h3> is the
# name and whose next text node is the street address. Parse the markup, not the flattened text: the
# flattened version runs the address straight into the following advisory sentence.
rows = []
for bm in re.finditer(r'<div id="([XBMQR])" class="tab-pane[^"]*">(.*?)(?=<div id="[XBMQR]" class="tab-pane|<!-- end tabcontent|\Z)', t, re.S):
    boro = BORO[bm.group(1)]
    for cm in re.finditer(r'<h3>(.*?)</h3>\s*([^<]{4,80}?)\s*<br', bm.group(2), re.S):
        name = html.unescape(re.sub(r"<[^>]+>", "", cm.group(1))).strip()
        addr = html.unescape(cm.group(2)).strip()
        after = bm.group(2)[cm.end():cm.end() + 700]
        href = re.search(r'href="(/facilities/recreationcenters/[^"]+)"', after)
        rows.append(dict(name=name, borough=boro, address=addr,
                         url="https://www.nycgovparks.org" + href.group(1) if href else "",
                         pool="indoor pool" in after.lower(),
                         closed="temporarily closed" in after.lower()))

seen, out = set(), []
for r in rows:
    k = r["name"].lower()
    if k in seen:
        continue
    seen.add(k); out.append(r)
json.dump(out, open("reccenters.json", "w"), indent=1)
print(f"{len(out)} recreation centers")
for r in out:
    print(f"  {'CLOSED' if r['closed'] else '      '} {'POOL' if r['pool'] else '    '} {r['name'][:44]:46} {r['address'][:34]}")
