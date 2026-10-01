# SPDX-License-Identifier: CPAL-1.0
#
# The contents of this file are subject to the Common Public Attribution License
# Version 1.0 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# https://opensource.org/license/CPAL-1.0 and in the accompanying LICENSE.md.
# The License is based on the Mozilla Public License Version 1.1 but Sections 14
# and 15 have been added to cover use of software over a computer network and
# provide for limited attribution for the Original Developer. In addition,
# Exhibit A has been modified to be consistent with Exhibit B.
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for
# the specific language governing rights and limitations under the License.
#
# The Original Code is Svitylo 3D Anatomy Atlas.
# The Original Developer is the Initial Developer.
# The Initial Developer of the Original Code is authorOd.
# All portions of the code written by authorOd are Copyright (c) 2026 authorOd.
# All Rights Reserved.
# Contributor(s): see the source history and accompanying copyright notices.
"""Overlap and junction review of the trunk organs in an export (a maintainer tool).

Usage (pnpm data:overlaps runs it after pnpm data:export):
  blender -b --factory-startup --python check_overlaps.py -- --export <export dir> --out <report.json>

Intersections: for every pair of structures whose boxes overlap, up to 2000 points of the surface
of each (vertices and area-weighted points of the triangles, so that large triangles cutting
through are noticed too) are tested against the other: inside means ray parity in three
directions (two votes, so mirrored meshes work) and enclosed (of rays in 14 directions at most one
escapes, so that an open end, which can fool parity, does not); the fibrous capsule of the kidney,
a thin closed shell around the kidney, by enclosure alone. The depth of the points inside is
measured to the other's surface. Junctions: for every open boundary loop of a
structure (six edges or more), the nearest other structure and the largest gap to it. Parts of
one structure, ducts, mucosa, thin sheets (omenta, mesocolon, pleura, taeniae) and the head and
pelvic organs are left out; anatomical passages and parts joined by design are reported apart.
"""

import json
import os
import re
import sys

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


EXPORT = os.path.abspath(arg("--export", "export"))
OUT = os.path.abspath(arg("--out", "overlaps.json"))
rng = np.random.default_rng(5)
with open(os.path.join(EXPORT, "export.json"), encoding="utf-8") as fh:
    exp = json.load(fh)

EXCLUDE = re.compile(r"omentum|mesocolon|meso-appendix|taenia|pleura|peritone|segment of liver|mucosa|duct|bronch|\.j$|"
                     r"hypophysis|parathyroid|parotid|gingiva|uvula|soft palate|tongue|nasal|pharynx|epiglottis|thyroid|"
                     r"pineal|sublingual|submandibular|penis|testis|epididymis|seminal|prostate|urethra|"
                     r"hilum of kidney|renal columns|renal pyramids|renal papillae", re.I)
NEIGHBOURS = ["Spleen", "Psoas major.l", "Psoas major.r", "Quadratus lumborum muscle.l", "Quadratus lumborum muscle.r",
              "Diaphragm", "Transversus abdominis muscle.l", "Transversus abdominis muscle.r", "Iliacus muscle.l",
              "Iliacus muscle.r", "Eleventh rib.l", "Eleventh rib.r", "Twelfth rib.l", "Twelfth rib.r", "Vertebra T11",
              "Vertebra T12", "Vertebra L1", "Vertebra L2", "Vertebra L3", "Vertebra L4", "Abdominal aorta",
              "Inferior vena cava (abdominal part)"]
# Parts of one structure or joined by design (both orders are checked).
EXPECTED = [
    (r"Renal cortex\.(l|r)", r"Renal pelvis|calices|Ureter"), (r"capsule of kidney", r"Renal cortex|Renal pelvis|calices|Ureter"),
    (r"Renal pelvis", r"calices|Ureter"), (r"calices", r"calices"),
    (r"Liver", r"Gallbladder"), (r"Trachea", r"main bronchus"), (r"Oesophagus", r"Stomach"), (r"Stomach", r"Duodenum"),
    (r"Duodenum", r"Jejunum|Pancreas"), (r"Jejunum", r"Ascending colon"), (r"Ascending colon", r"Transverse colon|Vermiform appendix"),
    (r"Transverse colon", r"Descending colon"), (r"Descending colon", r"Sigmoid colon"), (r"Ureter", r"Urinary bladder"),
    (r"lobe of (left|right) lung", r"lobe of (left|right) lung"),
]
# Anatomical passages and attachments: reported, not counted as overlaps.
PASSAGES = [("Diaphragm", r"Abdominal aorta|Inferior vena cava|Oesophagus|Psoas major|Vertebra|Transversus abdominis|rib"),
            ("Quadratus lumborum", "Transversus abdominis")]


def related(a, b, rules):
    return any((re.search(x, a) and re.search(y, b)) or (re.search(x, b) and re.search(y, a)) for x, y in rules)


def mesh(record):
    n, t = record["vertices"], record["triangles"]
    with open(os.path.join(EXPORT, record["file"]), "rb") as fh:
        fh.seek(record["offset"])
        pos = np.frombuffer(fh.read(n * 12), dtype="<f4").reshape(-1, 3).astype(np.float64)
        fh.read(n * 12)
        tri = np.frombuffer(fh.read(t * 12), dtype="<u4").reshape(-1, 3).astype(np.int64)
    return pos, tri


records = {o["name"]: o for o in exp["objects"]}
names = [o["name"] for o in exp["objects"] if o["system"].startswith("8:") and not EXCLUDE.search(o["name"])]
names += [n for n in NEIGHBOURS if n in records]
meshes = {}
for n in names:
    pos, tri = mesh(records[n])
    meshes[n] = (pos, tri, BVHTree.FromPolygons(pos.tolist(), tri.astype(int).tolist()), pos.min(0), pos.max(0))
RAYS = [Vector((1, 0.0137, 0.0071)), Vector((0.0093, 1, 0.0117)), Vector((0.0109, 0.0061, 1))]
ENCLOSURE = [Vector(v).normalized() for v in (
    (1, 0.013, 0.007), (-1, 0.011, -0.009), (0.009, 1, 0.012), (-0.008, -1, 0.01), (0.011, 0.006, 1), (-0.007, 0.012, -1),
    (1, 1.013, 0.991), (1, -0.987, 1.009), (-1, 1.006, -0.994), (-1, -0.992, 1.011),
    (0.989, 1.008, -1), (1.012, -1.01, -0.988), (-0.993, 0.989, 1.007), (-1.006, -1.012, -0.991))]
# Thin closed shells that stand for a solid (parity would count only the thin layer as inside).
SHELLS = re.compile(r"Fibrous capsule of kidney")


def parity(t, p):
    votes = 0
    for d in RAYS:
        origin, count = Vector(p), 0
        for _ in range(64):
            hit = t.ray_cast(origin, d, 10.0)
            if hit[0] is None:
                break
            count += 1
            origin = hit[0] + d * 1e-6
        votes += count % 2
    return votes >= 2


def enclosed(t, p):
    escaped = 0
    origin = Vector(p)
    for d in ENCLOSURE:
        if t.ray_cast(origin, d, 1.0)[0] is None:
            escaped += 1
            if escaped > 1:
                return False
    return True


def surface_points(pos, tri, lo, hi, spacing=0.001):
    """Vertices and area-weighted random points (about one per spacing²) of the triangles that
    reach into a box."""
    keep = np.any(np.all((pos[tri] >= lo) & (pos[tri] <= hi), axis=2), axis=1)
    t = tri[keep]
    a, b, c = pos[t[:, 0]], pos[t[:, 1]], pos[t[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    idx = np.repeat(np.arange(len(t)), np.ceil(area / spacing ** 2).astype(int))
    r1, r2 = rng.random(len(idx)), rng.random(len(idx))
    flip = r1 + r2 > 1
    r1[flip], r2[flip] = 1 - r1[flip], 1 - r2[flip]
    pts = np.concatenate([pos, a[idx] + r1[:, None] * (b - a)[idx] + r2[:, None] * (c - a)[idx]])
    return pts[np.all((pts >= lo) & (pts <= hi), axis=1)]


def penetration(a, b):
    _p, _t, tree_b, mn, mx = meshes[b]
    inside = enclosed if SHELLS.search(b) else (lambda t, p: parity(t, p) and enclosed(t, p))
    cand = surface_points(meshes[a][0], meshes[a][1], mn, mx)
    if len(cand) > 2000:
        cand = cand[rng.choice(len(cand), 2000, replace=False)]
    depths = [tree_b.find_nearest(Vector(p.tolist()))[3] for p in cand if inside(tree_b, p.tolist())]
    return round(float(max(depths)) * 1000, 1) if depths else 0.0


pairs = []
keys = list(meshes)
for i, a in enumerate(keys):
    for b in keys[i + 1:]:
        if np.any(meshes[a][4] < meshes[b][3]) or np.any(meshes[b][4] < meshes[a][3]):
            continue
        depth = max(penetration(a, b), penetration(b, a))
        if depth > 0:
            kind = "expected" if related(a, b, EXPECTED) else "passage" if related(a, b, PASSAGES) else "overlap"
            pairs.append({"a": a, "b": b, "kind": kind, "maxMm": depth})
pairs.sort(key=lambda r: -r["maxMm"])

loops = []
for n in keys:
    pos, tri = meshes[n][0], meshes[n][1]
    e = np.sort(np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), axis=1)
    uniq, counts = np.unique(e, axis=0, return_counts=True)
    adj = {}
    for a, b in uniq[counts == 1]:
        adj.setdefault(int(a), []).append(int(b))
        adj.setdefault(int(b), []).append(int(a))
    seen = set()
    for s0 in sorted(adj):
        if s0 in seen:
            continue
        stack, loop = [s0], []
        seen.add(s0)
        while stack:
            k = stack.pop()
            loop.append(k)
            for j in adj[k]:
                if j not in seen:
                    seen.add(j)
                    stack.append(j)
        if len(loop) < 6:
            continue
        pts = pos[loop]
        best = None
        for m in keys:
            if m == n or np.any(pts.mean(0) < meshes[m][3] - 0.03) or np.any(pts.mean(0) > meshes[m][4] + 0.03):
                continue
            d = np.array([meshes[m][2].find_nearest(Vector(p.tolist()))[3] for p in pts])
            if best is None or d.max() < best[1]:
                best = (m, float(d.max()))
        loops.append({"structure": n, "radiusMm": round(float(np.linalg.norm(pts - pts.mean(0), axis=1).mean()) * 1000, 1),
                      "nearest": best[0] if best else None, "gapMm": round(best[1] * 1000, 1) if best else None})
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump({"pairs": pairs, "loops": loops}, fh, indent=1)
print(f"{len(keys)} structures; report: {OUT}")
print("Overlaps deeper than 2 mm:")
for r in pairs:
    if r["kind"] == "overlap" and r["maxMm"] > 2:
        print(f"  {r['maxMm']:5.1f} mm  {r['a']} <-> {r['b']}")
print("Open ends 0.5-5 mm from the nearest structure (possible junction gaps):")
for r in loops:
    if r["gapMm"] is not None and 0.5 < r["gapMm"] <= 5:
        print(f"  {r['gapMm']:4.1f} mm  {r['structure']} -> {r['nearest']} (radius {r['radiusMm']} mm)")
