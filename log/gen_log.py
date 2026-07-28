"""Generate public/log/index.html from log/manifest.json.

Nothing in the output is hand-written. Add a revision to the manifest and run
`npm run log`; check_manifest.py fails the build if the two drift apart.

The page is a single self-contained file — no CDN, no web fonts, no external
images, no chart library. Every figure below is hand-emitted inline SVG.
"""

from __future__ import annotations

import html
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "public" / "log" / "index.html"
M = json.loads((ROOT / "manifest.json").read_text())

ASSETS = M["assets"]
ASKS = M["asks"]
LESSONS = M["lessons"]
RULES = M["rules"]
OPEN = M["open"]
LEVERS = M["perf_levers"]

ASK_BY_ID = {a["id"]: a for a in ASKS}
LESSON_BY_ID = {l["id"]: l for l in LESSONS}
ASSET_BY_ID = {a["id"]: a for a in ASSETS}

# How each revision kind is labelled and coloured. Failures are not hidden or
# softened — they get the same weight as everything else, which is the whole
# point of keeping the log this way.
KIND = {
    "born": ("born", "mut"),
    "feature": ("added", "ok"),
    "fix": ("fixed", "ok"),
    "failure": ("failed", "bad"),
    "perf": ("perf", "mut"),
    "rename": ("renamed", "mut"),
}
KIND_COLOR = {
    "born": "var(--mut)",
    "feature": "var(--ok)",
    "fix": "var(--ok)",
    "failure": "var(--warn)",
    "perf": "var(--accent)",
    "rename": "var(--mut)",
}


def e(s) -> str:
    return html.escape(str(s), quote=False)


def tag(text: str, cls: str = "") -> str:
    return f'<span class="tag {cls}">{e(text)}</span>'


# --------------------------------------------------------------------------
# figures — hand-emitted inline SVG, no chart library, themed via CSS vars
# --------------------------------------------------------------------------

def fig_ledger() -> str:
    """One row per asset, one dot per revision, coloured by what kind it was.

    Reads at a glance: which assets cost the most rework, and how much of that
    rework was failure rather than addition.
    """
    row_h, pad_l, top = 46, 150, 34
    w, h = 900, top + row_h * len(ASSETS) + 46

    p = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Revision ledger by asset">']
    p.append(f'<text x="0" y="16" font-size="12" font-weight="600" fill="var(--fg)">'
             f'Revision ledger &mdash; every change to every asset</text>')
    p.append(f'<text x="0" y="30" font-size="11" fill="var(--mut)">'
             f'one dot per revision, in the order it happened</text>')

    for i, a in enumerate(ASSETS):
        y = top + row_h * i + 26
        p.append(f'<line x1="{pad_l}" y1="{y}" x2="{w - 20}" y2="{y}" '
                 f'stroke="var(--line)" stroke-width="1"/>')
        p.append(f'<text x="0" y="{y - 6}" font-size="12.5" font-weight="600" '
                 f'fill="var(--fg)">{e(a["name"])}</text>')
        p.append(f'<text x="0" y="{y + 12}" font-size="10.5" fill="var(--mut)">'
                 f'{e(a["id"])}</text>')

        revs = a["revisions"]
        step = (w - 20 - pad_l - 30) / max(len(revs) - 1, 1)
        for j, r in enumerate(revs):
            cx = pad_l + 22 + step * j
            colour = KIND_COLOR.get(r["kind"], "var(--mut)")
            is_fail = r["kind"] == "failure"
            p.append(f'<circle cx="{cx:.1f}" cy="{y}" r="{7 if is_fail else 5.5}" '
                     f'fill="{colour}" opacity="{0.95 if is_fail else 0.8}"/>')
            p.append(f'<text x="{cx:.1f}" y="{y + 22}" font-size="9.5" '
                     f'text-anchor="middle" fill="var(--mut)">'
                     f'{e(KIND[r["kind"]][0])}</text>')

    # legend
    ly = h - 12
    lx = pad_l
    for kind, (label, _) in KIND.items():
        p.append(f'<circle cx="{lx}" cy="{ly - 4}" r="5" '
                 f'fill="{KIND_COLOR[kind]}" opacity="0.85"/>')
        p.append(f'<text x="{lx + 10}" y="{ly}" font-size="10.5" '
                 f'fill="var(--mut)">{e(label)}</text>')
        lx += 26 + len(label) * 6.2
    p.append("</svg>")
    return f'<div class="fig">{"".join(p)}</div>'


def fig_levers() -> str:
    """What each performance change actually removed, as a share of its own work."""
    bar_h, gap, pad_l, top = 30, 16, 200, 40
    w = 900
    h = top + (bar_h + gap) * len(LEVERS) + 20
    scale = (w - pad_l - 90) / 100

    p = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Work removed per performance lever">']
    p.append('<text x="0" y="16" font-size="12" font-weight="600" fill="var(--fg)">'
             'Work removed per lever</text>')
    p.append('<text x="0" y="30" font-size="11" fill="var(--mut)">'
             'arithmetic reduction in work, not measured framerate &mdash; see L-13</text>')

    for i, lv in enumerate(LEVERS):
        y = top + (bar_h + gap) * i
        bw = lv["saving"] * scale
        p.append(f'<text x="0" y="{y + 14}" font-size="12" fill="var(--fg)">'
                 f'{e(lv["lever"])}</text>')
        p.append(f'<text x="0" y="{y + 27}" font-size="10.5" fill="var(--mut)">'
                 f'{e(lv["was"])} &rarr; {e(lv["now"])}</text>')
        p.append(f'<rect x="{pad_l}" y="{y}" width="{w - pad_l - 90}" height="{bar_h}" '
                 f'rx="4" fill="var(--line)" opacity="0.45"/>')
        p.append(f'<rect x="{pad_l}" y="{y}" width="{bw:.1f}" height="{bar_h}" '
                 f'rx="4" fill="var(--accent)" opacity="0.85"/>')
        p.append(f'<text x="{pad_l + bw + 10:.1f}" y="{y + 20}" font-size="12.5" '
                 f'font-weight="600" fill="var(--fg)">{lv["saving"]}%</text>')
    p.append("</svg>")
    return f'<div class="fig">{"".join(p)}</div>'


def fig_portrait() -> str:
    """The one genuine failure in the scroll study, drawn.

    Three frames: what works on desktop, what the textbook fix does to portrait,
    and what the mitigation recovers. The fourth state — a rotated variant — is
    drawn as an outline because it does not exist.
    """
    w, h = 900, 300
    p = [f'<svg viewBox="0 0 {w} {h}" role="img" '
         f'aria-label="Why fitting a fixed world width fails on portrait">']
    p.append('<text x="0" y="16" font-size="12" font-weight="600" fill="var(--fg)">'
             'The portrait failure (L-11)</text>')
    p.append('<text x="0" y="30" font-size="11" fill="var(--mut)">'
             'the same scene, framed three ways &mdash; and the one that is not built</text>')

    def helix(x, y, fw, fh, amp, turns, stroke, dash=""):
        """A schematic helix drawn as two phase-shifted sine sweeps."""
        out = []
        for phase in (0, 3.14159):
            pts = []
            for k in range(61):
                t = k / 60
                px = x + t * fw
                py = y + fh / 2 + amp * math.sin(t * turns * 6.28318 + phase)
                pts.append(f"{px:.1f},{py:.1f}")
            out.append(f'<polyline points="{" ".join(pts)}" fill="none" '
                       f'stroke="{stroke}" stroke-width="2" {dash}/>')
        return "".join(out)

    frames = [
        (0, 240, 170, "Desktop", "fills the frame, reads as intended", 46, 3.2, "var(--ok)"),
        (275, 120, 170, "Portrait, fixed world-width", "camera retreats — a thread in a void", 9, 3.2, "var(--warn)"),
        (430, 120, 170, "Portrait, span scaled by aspect", "acceptable, not good", 24, 1.4, "var(--accent)"),
    ]
    ty = 56
    for x, fw, fh, label, note, amp, turns, colour in frames:
        p.append(f'<rect x="{x}" y="{ty}" width="{fw}" height="{fh}" rx="6" '
                 f'fill="var(--panel)" stroke="var(--line)" stroke-width="1.5"/>')
        p.append(helix(x + 8, ty, fw - 16, fh, amp, turns, colour))
        p.append(f'<text x="{x}" y="{ty + fh + 18}" font-size="11.5" font-weight="600" '
                 f'fill="var(--fg)">{e(label)}</text>')
        p.append(f'<text x="{x}" y="{ty + fh + 33}" font-size="10.5" '
                 f'fill="var(--mut)">{e(note)}</text>')

    # the unbuilt state
    x, fw, fh = 585, 120, 170
    p.append(f'<rect x="{x}" y="{ty}" width="{fw}" height="{fh}" rx="6" '
             f'fill="none" stroke="var(--mut)" stroke-width="1.5" stroke-dasharray="5 4"/>')
    out = []
    for phase in (0, 3.14159):
        pts = []
        for k in range(61):
            t = k / 60
            py = ty + 8 + t * (fh - 16)
            px = x + fw / 2 + 30 * math.sin(t * 3.2 * 6.28318 + phase)
            pts.append(f"{px:.1f},{py:.1f}")
        out.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="var(--mut)" '
                   f'stroke-width="2" stroke-dasharray="4 4" opacity="0.7"/>')
    p.append("".join(out))
    p.append(f'<text x="{x}" y="{ty + fh + 18}" font-size="11.5" font-weight="600" '
             f'fill="var(--mut)">Rotated vertical variant</text>')
    p.append(f'<text x="{x}" y="{ty + fh + 33}" font-size="10.5" fill="var(--warn)">'
             f'the honest fix &mdash; NOT BUILT (Q-01)</text>')

    p.append(f'<text x="740" y="{ty + 70}" font-size="11" fill="var(--mut)">Scroll length is</text>')
    p.append(f'<text x="740" y="{ty + 86}" font-size="11" fill="var(--fg)" font-weight="600">'
             f'7.00 viewport-widths</text>')
    p.append(f'<text x="740" y="{ty + 102}" font-size="11" fill="var(--mut)">on every one of these.</text>')
    p.append(f'<text x="740" y="{ty + 122}" font-size="11" fill="var(--mut)">Decoupling worked;</text>')
    p.append(f'<text x="740" y="{ty + 138}" font-size="11" fill="var(--mut)">framing did not.</text>')
    p.append("</svg>")
    return f'<div class="fig">{"".join(p)}</div>'


def fig_lessons() -> str:
    """Where the lessons came from, and how many were learned by something breaking."""
    w, h = 900, 210
    neg = [l for l in LESSONS if l["sign"] == "neg"]
    pos = [l for l in LESSONS if l["sign"] == "pos"]

    p = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Lessons by source and sign">']
    p.append('<text x="0" y="16" font-size="12" font-weight="600" fill="var(--fg)">'
             'Where the craft lessons came from</text>')
    p.append('<text x="0" y="30" font-size="11" fill="var(--mut)">'
             f'{len(neg)} of {len(LESSONS)} were learned by something breaking</text>')

    # per-asset stacked bars
    x0, top, bw, gap = 0, 52, 130, 28
    counts = []
    for a in ASSETS:
        ls = [l for l in LESSONS if l.get("from") == a["id"]]
        counts.append((a["name"], [l for l in ls if l["sign"] == "neg"],
                       [l for l in ls if l["sign"] == "pos"]))
    tallest = max((len(n) + len(pz) for _, n, pz in counts), default=1) or 1
    unit = 92 / tallest

    for i, (name, n, pz) in enumerate(counts):
        x = x0 + (bw + gap) * i
        y = top + 92
        for j, l in enumerate(n):
            p.append(f'<rect x="{x}" y="{y - unit * (j + 1) + 2}" width="{bw}" '
                     f'height="{unit - 3:.1f}" rx="3" fill="var(--warn)" opacity="0.8"/>')
            p.append(f'<text x="{x + 7}" y="{y - unit * (j + 1) + unit / 2 + 4:.1f}" '
                     f'font-size="10.5" fill="#fff" font-weight="600">{e(l["id"])}</text>')
        for j, l in enumerate(pz):
            k = len(n) + j
            p.append(f'<rect x="{x}" y="{y - unit * (k + 1) + 2}" width="{bw}" '
                     f'height="{unit - 3:.1f}" rx="3" fill="var(--ok)" opacity="0.8"/>')
            p.append(f'<text x="{x + 7}" y="{y - unit * (k + 1) + unit / 2 + 4:.1f}" '
                     f'font-size="10.5" fill="#fff" font-weight="600">{e(l["id"])}</text>')
        p.append(f'<line x1="{x}" y1="{y + 2}" x2="{x + bw}" y2="{y + 2}" '
                 f'stroke="var(--line)" stroke-width="1"/>')
        p.append(f'<text x="{x}" y="{y + 18}" font-size="11.5" font-weight="600" '
                 f'fill="var(--fg)">{e(name)}</text>')
        p.append(f'<text x="{x}" y="{y + 32}" font-size="10.5" fill="var(--mut)">'
                 f'{len(n) + len(pz)} lesson{"" if len(n) + len(pz) == 1 else "s"}</text>')

    p.append(f'<rect x="640" y="{top + 6}" width="12" height="12" rx="3" '
             f'fill="var(--warn)" opacity="0.8"/>')
    p.append(f'<text x="658" y="{top + 16}" font-size="11" fill="var(--mut)">'
             f'learned from a failure</text>')
    p.append(f'<rect x="640" y="{top + 28}" width="12" height="12" rx="3" '
             f'fill="var(--ok)" opacity="0.8"/>')
    p.append(f'<text x="658" y="{top + 38}" font-size="11" fill="var(--mut)">'
             f'worked first time</text>')
    p.append(f'<text x="640" y="{top + 68}" font-size="11" fill="var(--mut)">'
             f'A log that only recorded</text>')
    p.append(f'<text x="640" y="{top + 84}" font-size="11" fill="var(--mut)">'
             f'the wins would be missing</text>')
    p.append(f'<text x="640" y="{top + 100}" font-size="11" fill="var(--fg)" font-weight="600">'
             f'most of the information.</text>')
    p.append("</svg>")
    return f'<div class="fig">{"".join(p)}</div>'


# --------------------------------------------------------------------------
# panels
# --------------------------------------------------------------------------

def rev_block(a: dict, r: dict) -> str:
    label, cls = KIND[r["kind"]]
    bits = [tag(label, cls)]
    if r.get("ask"):
        ask = ASK_BY_ID[r["ask"]]
        bits.append(f'<span class="ref">asked: <code>{e(ask["id"])}</code></span>')
    for lid in r.get("lessons", []):
        bits.append(f'<span class="ref">lesson: <code>{e(lid)}</code></span>')
    warn = " warn" if r["kind"] == "failure" else ""
    return (f'<div class="rev{warn}">'
            f'<div class="rev-h">{"".join(bits)}'
            f'<span class="rev-d">{e(r["date"])}</span></div>'
            f'<p class="rev-c">{e(r["change"])}</p>'
            f'<p class="rev-w">{e(r["why"])}</p></div>')


def panel_assets() -> str:
    out = ['<h2 style="margin-top:26px">The catalogue</h2>',
           '<p class="sub">Every form here is a built-in primitive, an instanced set, or a '
           'curve swept along a formula. Refer to an asset by its <code>id</code> &mdash; ids are '
           'stable, names and tuning are not.</p>']

    prem = M["premise"]
    out.append(f'<div class="card"><h3 style="margin-top:0">The premise being tested</h3>'
               f'<div class="read ok"><b>{e(prem["claim"])}</b><br><br>'
               f'{tag("held", "ok")} settled {e(prem["settled"])} on '
               f'{", ".join(f"<code>{e(i)}</code>" for i in prem["evidence"])}.</div>'
               f'<div class="read warn"><b>Scope.</b> {e(prem["scope"])}</div></div>')

    out.append(fig_ledger())

    for a in ASSETS:
        fails = sum(1 for r in a["revisions"] if r["kind"] == "failure")
        derived = ""
        if a.get("derived_from"):
            d = ASSET_BY_ID[a["derived_from"]]
            derived = (f'<span class="ref">derived from <code>{e(d["id"])}</code></span>')
        out.append(f'<div class="card" id="{e(a["id"])}">')
        out.append(f'<h3 style="margin-top:0">{e(a["name"])} '
                   f'<code class="idc">{e(a["id"])}</code></h3>')
        out.append(f'<p class="sub">{e(a["line"])}</p>')
        out.append(f'<p class="meta">{tag(a["example"], "mut")}'
                   f'{tag("0 authored geometry", "ok")}'
                   f'{tag(f"{len(a['revisions'])} revisions", "mut")}'
                   f'{tag(f"{fails} failures", "bad") if fails else ""}{derived}</p>')
        out.append(f'<div class="read"><b>What it is actually made of.</b> {e(a["made_of"])}</div>')

        out.append('<h4>The recipe</h4><table><thead><tr><th>knob</th><th>value</th></tr></thead><tbody>')
        for k, v in a["recipe"].items():
            out.append(f'<tr><td><code>{e(k)}</code></td><td>{e(v)}</td></tr>')
        out.append('</tbody></table>')

        out.append(f'<h4>How it changed</h4>')
        out.extend(rev_block(a, r) for r in a["revisions"])
        out.append('</div>')
    return "".join(out)


def panel_evolution() -> str:
    """Everything that happened, newest first, with the ask that caused it."""
    events = []
    for a in ASSETS:
        for r in a["revisions"]:
            events.append({"date": r["date"], "asset": a, "rev": r})

    out = ['<h2 style="margin-top:26px">What changed, and who asked</h2>',
           '<p class="sub">The running log. Direction from the director on the left, what it '
           'turned into on the right. Corrections and dead ends stay in, in their original '
           'wording &mdash; a log that only kept the wins would be missing most of the '
           'information.</p>']

    out.append('<div class="card jump-card"><h3 style="margin-top:0">Jump to an ask</h3>')
    for a in reversed(ASKS):
        out.append(f'<a class="jump" href="#{e(a["id"])}"><b>{e(a["id"])}</b> '
                   f'{e(a["summary"][:96])}{"&hellip;" if len(a["summary"]) > 96 else ""}</a>')
    out.append('</div>')

    for a in reversed(ASKS):
        out.append(f'<div class="card" id="{e(a["id"])}">')
        out.append(f'<h3 style="margin-top:0">{e(a["id"])} '
                   f'<span class="tag mut">{e(a["kind"])}</span>'
                   f'<span class="rev-d">{e(a["date"])}</span></h3>')
        if a.get("verbatim"):
            out.append(f'<blockquote class="verb">&ldquo;{e(a["verbatim"])}&rdquo;</blockquote>')
        out.append(f'<p>{e(a["summary"])}</p>')
        cls = "warn" if a["kind"] == "correction" else "ok" if a["kind"] == "verdict" else ""
        out.append(f'<div class="read {cls}"><b>What it changed.</b> {e(a["effect"])}</div>')

        caused = [ev for ev in events if ev["rev"].get("ask") == a["id"]]
        if caused:
            out.append('<h4>Revisions this produced</h4>')
            for ev in caused:
                out.append(f'<p class="caused"><a href="#{e(ev["asset"]["id"])}">'
                           f'{e(ev["asset"]["name"])}</a> &mdash; '
                           f'{tag(*KIND[ev["rev"]["kind"]])} {e(ev["rev"]["change"])}</p>')
        out.append('</div>')
    return "".join(out)


def panel_method() -> str:
    out = ['<h2 style="margin-top:26px">How assets get built here</h2>',
           '<p class="sub">Six rules, every one of them paid for. The ones with a source '
           'attached were learned by getting it wrong first.</p>']
    for r in RULES:
        src = ""
        if r.get("from"):
            src = f'<span class="ref">from <code>{e(r["from"])}</code></span>'
        out.append(f'<div class="card"><h3 style="margin-top:0">{e(r["id"])} &mdash; '
                   f'{e(r["rule"])}{src}</h3><p>{e(r["why"])}</p></div>')

    out.append('<h2>Performance</h2>')
    out.append('<div class="read warn"><b>No framerate in this log is measured.</b> '
               'The browser these pages are built through renders on the CPU, so any number it '
               'reported would be meaningless. Every change below is an arithmetic reduction in '
               'work &mdash; fewer pixels, fewer passes. The live stats panel running on real '
               'hardware is the only real evidence, and it has not been read out yet.</div>')
    out.append(fig_levers())
    out.append('<table><thead><tr><th>lever</th><th>was</th><th>now</th>'
               '<th>why it costs</th></tr></thead><tbody>')
    for lv in LEVERS:
        out.append(f'<tr><td><b>{e(lv["lever"])}</b></td><td><code>{e(lv["was"])}</code></td>'
                   f'<td><code>{e(lv["now"])}</code></td><td class="sub">{e(lv["why"])}</td></tr>')
    out.append('</tbody></table>')

    out.append('<h2>How this page stays true</h2>')
    out.append('<div class="read"><b>Nothing here is hand-written.</b> The page is generated '
               'from <code>log/manifest.json</code> by <code>log/gen_log.py</code>, and '
               '<code>log/check_manifest.py</code> fails if the two drift apart &mdash; a '
               'revision naming an ask that does not exist, a lesson nothing points at, a '
               'header count gone stale. Anything a person could forget to update is either '
               'generated or checked. Run <code>npm run log</code> to rebuild and '
               '<code>npm run log:check</code> to verify.</div>')
    return "".join(out)


def panel_lessons() -> str:
    out = ['<h2 style="margin-top:26px">What building these taught</h2>',
           '<p class="sub">Reusable craft, most of it bought by something breaking first. '
           'Each lesson names the asset that produced it.</p>']
    out.append(fig_lessons())
    out.append('<h3>The one that mattered most</h3>')
    out.append('<p class="sub">Half the responsive strategy was confirmed and half of it '
               'failed, in the same build. The confirmed half is invisible; the failed half '
               'is the reason a variant still needs designing.</p>')
    out.append(fig_portrait())
    out.append('<table class="survives"><thead><tr><th>id</th><th>lesson</th>'
               '<th>what happened</th></tr></thead><tbody>')
    for l in LESSONS:
        cls = "bad" if l["sign"] == "neg" else "ok"
        label = "learned the hard way" if l["sign"] == "neg" else "held"
        src = ASSET_BY_ID.get(l.get("from", ""), {}).get("name", "&mdash;")
        out.append(f'<tr><td><code>{e(l["id"])}</code><br>{tag(label, cls)}<br>'
                   f'<span class="sub">{src}</span></td>'
                   f'<td><b>{e(l["lesson"])}</b></td>'
                   f'<td class="sub">{e(l["detail"])}</td></tr>')
    out.append('</tbody></table>')
    return "".join(out)


def panel_open() -> str:
    out = ['<h2 style="margin-top:26px">Open</h2>',
           '<p class="sub">What is unresolved, unbuilt or unmeasured. Nothing here is being '
           'quietly hoped away.</p>']
    for q in OPEN:
        blocks = ""
        if q.get("blocks"):
            blocks = f'<span class="ref">from <code>{e(q["blocks"])}</code></span>'
        out.append(f'<div class="q"><b>{e(q["id"])} &mdash; {e(q["q"])}</b>{blocks}'
                   f'<p style="margin:8px 0 0">{e(q["why"])}</p></div>')
    return "".join(out)


# --------------------------------------------------------------------------

def header_stats() -> str:
    n_rev = sum(len(a["revisions"]) for a in ASSETS)
    n_fail = sum(1 for a in ASSETS for r in a["revisions"] if r["kind"] == "failure")
    n_neg = sum(1 for l in LESSONS if l["sign"] == "neg")
    return (f'<div class="grid">'
            f'<div class="stat"><div class="n">{len(ASSETS)}</div>'
            f'<div class="k">assets, across {len({a["example"] for a in ASSETS})} studies</div></div>'
            f'<div class="stat"><div class="n">0</div>'
            f'<div class="k">lines of authored geometry in any of them</div></div>'
            f'<div class="stat"><div class="n">{n_rev}</div>'
            f'<div class="k">recorded revisions, {n_fail} of them failures</div></div>'
            f'<div class="stat"><div class="n">{len(LESSONS)}</div>'
            f'<div class="k">craft lessons, {n_neg} learned by breaking something</div></div>'
            f'<div class="stat"><div class="n">{len(ASKS)}</div>'
            f'<div class="k">directives from the director</div></div>'
            f'<div class="stat"><div class="n">{len(OPEN)}</div>'
            f'<div class="k">open questions, incl. 1 with a deadline</div></div>'
            f'</div>')


CSS = """
:root{--bg:#fbfbfc;--panel:#fff;--fg:#16181d;--mut:#636a76;--line:#e3e5ea;
      --accent:#2563eb;--warn:#dc2626;--ok:#15803d;--code:#f3f4f6;}
@media (prefers-color-scheme:dark){
 :root{--bg:#0d0f13;--panel:#14171d;--fg:#e9eaee;--mut:#98a0ad;--line:#262b34;
       --accent:#6ea0ff;--warn:#ff7a70;--ok:#68d391;--code:#1b1f26;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
 font:15px/1.62 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;}
.wrap{max-width:1120px;margin:0 auto;padding:48px 28px 96px}
header{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:34px}
h1{font-size:27px;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:20px;margin:44px 0 10px;letter-spacing:-.01em}
h3{font-size:15px;margin:26px 0 8px}
h4{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);
 margin:22px 0 8px}
.sub{color:var(--mut);font-size:14px;margin:0}
.tag{display:inline-block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
 padding:3px 9px;border-radius:99px;border:1px solid var(--line);color:var(--mut);margin-right:6px}
.tag.warn{color:var(--warn);border-color:var(--warn)}
.tag.ok{color:var(--ok);border-color:var(--ok)}
.tag.mut{background:var(--code);color:var(--mut)}
.tag.bad{color:var(--warn);border-color:var(--warn);background:transparent}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;
 padding:22px 24px;margin:18px 0}
.fig{overflow-x:auto;margin:14px 0 6px;padding-bottom:4px}
.fig svg{display:block;min-width:900px;max-width:100%;height:auto}
.read{border-left:3px solid var(--accent);padding:2px 0 2px 15px;margin:16px 0;color:var(--fg)}
.read.warn{border-color:var(--warn)}
.read.ok{border-color:var(--ok)}
table{border-collapse:collapse;width:100%;font-size:13.5px;margin:12px 0}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
code{background:var(--code);padding:1.5px 5px;border-radius:4px;font-size:13px;
 font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
code.idc{font-size:12px;color:var(--mut);font-weight:400}
ul{padding-left:20px}li{margin:5px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:16px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:15px 17px}
.stat .n{font-size:24px;font-weight:650;letter-spacing:-.02em}
.stat .k{color:var(--mut);font-size:12.5px;margin-top:3px}
.q{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--warn);
 border-radius:8px;padding:15px 18px;margin:12px 0}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);
 color:var(--mut);font-size:13px}
.tabs{display:flex;gap:4px;margin:26px 0 8px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--mut);
 font:600 14.5px ui-sans-serif,system-ui,sans-serif;padding:10px 16px;cursor:pointer;
 margin-bottom:-1px;border-radius:6px 6px 0 0}
.tab:hover{color:var(--fg);background:var(--panel)}
.tab.active{color:var(--fg);border-bottom-color:var(--accent)}
.panel{display:none}.panel.active{display:block}
.rev{border-left:3px solid var(--line);padding:2px 0 2px 15px;margin:14px 0}
.rev.warn{border-color:var(--warn)}
.rev-h{display:flex;align-items:center;flex-wrap:wrap;gap:2px}
.rev-d{color:var(--mut);font-size:12px;margin-left:auto}
.rev-c{margin:6px 0 4px;font-weight:600}
.rev-w{margin:0;color:var(--mut);font-size:14px}
.ref{font-size:11.5px;color:var(--mut);margin-left:8px;font-weight:400}
.meta{margin:10px 0 0}
.verb{margin:12px 0;padding:10px 0 10px 16px;border-left:3px solid var(--mut);
 font-size:16px;font-style:italic;color:var(--fg)}
.caused{margin:8px 0;font-size:13.5px;color:var(--mut)}
.caused a{color:var(--accent);text-decoration:none;font-weight:600}
.jump-card{border-left:4px solid var(--mut)}
a.jump{display:block;padding:5px 8px;border-radius:4px;text-decoration:none;
 color:var(--fg);font-size:13px;line-height:1.35}
a.jump:hover{background:var(--code)}
a.jump b{display:inline-block;min-width:36px;color:var(--mut);font-weight:600}
@media(min-width:700px){a.jump{display:inline-block;width:calc(50% - 6px);vertical-align:top}}
table.survives td:first-child{white-space:nowrap;width:1%}
table.survives td:last-child{width:44%}
"""

JS = """
document.querySelectorAll('.tab').forEach(function(t){
  t.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});
    document.querySelectorAll('.panel').forEach(function(x){x.classList.remove('active')});
    t.classList.add('active');
    document.getElementById(t.dataset.panel).classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  });
});
"""

TABS = [
    ("assets", "The assets", panel_assets),
    ("evolution", "What changed &amp; who asked", panel_evolution),
    ("lessons", "What it taught", panel_lessons),
    ("method", "How they get built", panel_method),
    ("open", "Open", panel_open),
]


def build() -> str:
    p = M["page"]
    nav = "".join(
        f'<button class="tab{" active" if i == 0 else ""}" data-panel="{k}">{label}</button>'
        for i, (k, label, _) in enumerate(TABS))
    panels = "".join(
        f'<div class="panel{" active" if i == 0 else ""}" id="{k}">{fn()}</div>'
        for i, (k, _, fn) in enumerate(TABS))

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(p["title"])} &mdash; procedural WebGL study</title>
<meta name="description" content="{e(p["sub"][:180])}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%237dd3fc' stroke-width='3'/%3E%3C/svg%3E">
<style>{CSS}</style></head><body><div class="wrap">

<header>
<h1>{e(p["title"])}</h1>
<p class="sub">{e(p["sub"])}</p>
</header>

{header_stats()}

<nav class="tabs">{nav}</nav>
{panels}

<footer>
Generated from <code>log/manifest.json</code> &mdash; last updated {e(p["updated"])}.
This page is written in place and never versioned, so this URL is always current.
Source: <a href="{e(p["repo"])}" style="color:var(--accent)">{e(p["repo"])}</a>
</footer>
</div><script>{JS}</script></body></html>"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build())
    print(f"wrote {OUT.relative_to(ROOT.parent)}  ({OUT.stat().st_size / 1024:.0f} KB)")
