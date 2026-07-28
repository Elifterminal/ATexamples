"""Fail loudly when the asset log and its manifest drift apart.

Run with `npm run log:check`. Exit code 1 means something in the log is now a
lie — a revision pointing at an ask that does not exist, a page that was
hand-edited instead of regenerated, or a private name that leaked into a public
document.

The rule this enforces: anything a person could forget to update is either
generated or checked. Nothing relies on remembering.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
M = json.loads((ROOT / "manifest.json").read_text())

ASSETS = M["assets"]
ASKS = M["asks"]
LESSONS = M["lessons"]

ASSET_IDS = {a["id"] for a in ASSETS}
ASK_IDS = {a["id"] for a in ASKS}
LESSON_IDS = {l["id"] for l in LESSONS}
RULE_IDS = {r["id"] for r in M["rules"]}

KINDS = {"born", "feature", "fix", "failure", "perf", "rename"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# This page is published from a public repo. The project it belongs to is not
# public, and neither is the teardown of the site that started it. Keeping those
# names out of here is a boundary, not a style preference — so it is checked
# rather than remembered.
FORBIDDEN = ["atmimic", "activetheory", "active theory", "at mimic"]

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


# ---- referential integrity ------------------------------------------------

for group, ids in (("asset", [a["id"] for a in ASSETS]),
                   ("ask", [a["id"] for a in ASKS]),
                   ("lesson", [l["id"] for l in LESSONS])):
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        err(f"duplicate {group} ids: {sorted(dupes)}")

for a in ASSETS:
    if a.get("derived_from") and a["derived_from"] not in ASSET_IDS:
        err(f"{a['id']}: derived_from '{a['derived_from']}' is not an asset")

    example_dir = REPO / "examples" / a["example"]
    if not example_dir.is_dir():
        err(f"{a['id']}: example folder examples/{a['example']} does not exist")

    if not a["revisions"]:
        err(f"{a['id']}: no revisions — every asset has at least a 'born' entry")
    elif a["revisions"][0]["kind"] != "born":
        err(f"{a['id']}: first revision is '{a['revisions'][0]['kind']}', expected 'born'")

    for r in a["revisions"]:
        where = f"{a['id']} / {r.get('date', '??')}"
        if r["kind"] not in KINDS:
            err(f"{where}: unknown revision kind '{r['kind']}'")
        if not DATE.match(r.get("date", "")):
            err(f"{where}: date is not YYYY-MM-DD")
        if r.get("ask") and r["ask"] not in ASK_IDS:
            err(f"{where}: cites ask '{r['ask']}' which does not exist")
        if "lesson" in r:
            err(f"{where}: uses the old 'lesson' key — it is 'lessons', a list")
        for lid in r.get("lessons", []):
            if lid not in LESSON_IDS:
                err(f"{where}: cites lesson '{lid}' which does not exist")
        if not r.get("why"):
            err(f"{where}: has no 'why' — a change without a reason is not a log entry")

    dates = [r["date"] for r in a["revisions"]]
    if dates != sorted(dates):
        err(f"{a['id']}: revisions are not in chronological order")

for l in LESSONS:
    if l["sign"] not in {"pos", "neg"}:
        err(f"{l['id']}: sign must be 'pos' or 'neg'")
    if l.get("from") and l["from"] not in ASSET_IDS:
        err(f"{l['id']}: from '{l['from']}' is not an asset")

for r in M["rules"]:
    src = r.get("from")
    if src and src not in ASSET_IDS | LESSON_IDS:
        err(f"{r['id']}: from '{src}' is neither an asset nor a lesson")

for q in M["open"]:
    if q.get("blocks") and q["blocks"] not in LESSON_IDS:
        err(f"{q['id']}: blocks '{q['blocks']}' is not a lesson")

for a in ASKS:
    if not DATE.match(a.get("date", "")):
        err(f"{a['id']}: date is not YYYY-MM-DD")
    if not a.get("effect"):
        err(f"{a['id']}: has no 'effect' — record what the ask actually changed")

for i in M["premise"]["evidence"]:
    if i not in ASSET_IDS:
        err(f"premise: evidence '{i}' is not an asset")

# ---- the boundary ---------------------------------------------------------

blob = json.dumps(M).lower()
for term in FORBIDDEN:
    if term in blob:
        err(f"manifest contains '{term}' — this page is public, that name is not")

page_path = REPO / "public" / "log" / "index.html"
if page_path.exists():
    page = page_path.read_text().lower()
    for term in FORBIDDEN:
        if term in page:
            err(f"generated page contains '{term}' — this page is public, that name is not")

# ---- the page matches the manifest ----------------------------------------

if not page_path.exists():
    err("public/log/index.html does not exist — run `npm run log`")
else:
    sys.path.insert(0, str(ROOT))
    import gen_log  # noqa: E402

    if gen_log.build() != page_path.read_text():
        err("public/log/index.html is out of date or was hand-edited — run `npm run log`")

# ---- soft checks ----------------------------------------------------------

cited = {lid for a in ASSETS for r in a["revisions"] for lid in r.get("lessons", [])} | \
        {r.get("from") for r in M["rules"]} | \
        {q.get("blocks") for q in M["open"]}
for l in LESSONS:
    if l["id"] not in cited:
        warn(f"{l['id']} is not cited by any revision, rule or open question")

# The failure mode this whole file exists to catch: an example gets worked on and
# nobody writes the revision down. Compare each example's last commit against the
# date the log claims to be current as of. Uses git rather than file mtimes,
# which a fresh clone would reset.
try:
    import subprocess

    for folder in sorted({a["example"] for a in ASSETS}):
        touched = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", f"examples/{folder}"],
            cwd=REPO, capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        if touched and touched > M["page"]["updated"]:
            warn(f"examples/{folder} was last committed {touched}, but the log claims to be "
                 f"current as of {M['page']['updated']} — is a revision missing?")
except Exception as exc:  # git absent, shallow clone, whatever — never block on it
    warn(f"could not check example freshness against git ({exc})")

# ---- report ---------------------------------------------------------------

for w in warnings:
    print(f"  warn  {w}")
for x in errors:
    print(f"  FAIL  {x}")

n_rev = sum(len(a["revisions"]) for a in ASSETS)
if errors:
    print(f"\n{len(errors)} problem(s). The log does not match itself.")
    sys.exit(1)

print(f"\nok — {len(ASSETS)} assets, {n_rev} revisions, {len(ASKS)} asks, "
      f"{len(LESSONS)} lessons, page in sync"
      + (f", {len(warnings)} warning(s)" if warnings else ""))
