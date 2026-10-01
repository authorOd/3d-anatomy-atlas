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
"""Places the models from other open sources in the Z-Anatomy body (a maintainer tool).

Usage (pnpm data:fit runs it):
  blender -t 1 -b Startup.blend --python fit_external.py -- --dir <external files> --out external-fit.json

It reads the original snapshot objects, never the export, and writes the transforms and the
labyrinth parts that the export applies (external_meshes.py). The results are reviewed and
committed; the export itself never fits anything.

- Ear (OpenEar "Delta", a right ear, millimetres): a similarity transform (rotation, uniform scale,
  translation) by iterative closest points from the four OpenEar parts (malleus, incus, stapes,
  tympanic membrane) onto the same Z-Anatomy parts of each side, started from their centroids.
  Both chiralities are tried per side; the better fit is kept (mirrored for the left ear).
- Kidney (HRA, Visible Human Male): one shift and uniform scale for both kidneys, without rotation
  (both bodies stand upright and face forward), so the kidneys keep their natural orientation and
  their relative position. Nelder-Mead minimises the Z-Anatomy intrarenal arteries and veins
  outside the convex hull of the HRA parenchyma (arteries with a 1.5 mm margin), the distance from
  the renal branches' division to the HRA hilum, weakly the distance from the Z-Anatomy ureter's
  upper end to the HRA pelvi-ureteric junction, the suprarenal gland entering the hull by more
  than 4 mm (the snapshot's own kidney slot overlaps it by as much) and a scale far from 1. The
  Z-Anatomy intrarenal trees were modelled for another kidney: for each tree a smooth Gaussian
  field (warp-curves fix) moves the branches still outside inside the new kidney, holding the
  junction with the trunk; the upper end of each ureter is joined to the HRA pelvis
  (join-tube-end fix).
- Labyrinth (OpenEar ScalaVestibuli): the lumen diameter along the inward normal separates the
  vestibule (> 2.5 mm) from the tubes; tubes within 0.9 mm of the scala tympani are the cochlear
  scala vestibuli; three RANSAC planes split the canals (named in body axes: the most horizontal
  one is lateral, the more anterior vertical one anterior); the common bony limb lies near both
  the anterior and the posterior plane. Each boundary between two parts becomes a declared cut
  plane, so the parts get straight borders instead of triangle zigzags.
"""

import json
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import external_meshes  # noqa: E402
from geometry_fixes import field_digest as external_meshes_digest  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


DIR = os.path.abspath(arg("--dir", "external"))
OUT = os.path.abspath(arg("--out", "external-fit.json"))
SUBSURF_MAX = int(arg("--subsurf-max", "1"))
rng = np.random.default_rng(20261001)


# ---------------------------------------------------------------- helpers

def world_mesh(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise external_meshes.ExternalError(f"snapshot object not found: {name}")
    for mod in obj.modifiers:
        if mod.type == "SUBSURF":
            mod.levels = min(mod.levels, SUBSURF_MAX)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=False, depsgraph=depsgraph)
    mesh.transform(obj.matrix_world)
    mesh.calc_loop_triangles()
    pos = np.array([v.co[:] for v in mesh.vertices], dtype=np.float64)
    tri = np.array([t.vertices[:] for t in mesh.loop_triangles], dtype=np.int64)
    bpy.data.meshes.remove(mesh)
    return pos, tri


def tree(pos, tri):
    return BVHTree.FromPolygons(np.asarray(pos, dtype=float).tolist(), np.asarray(tri, dtype=int).tolist())


def nearest(t, pts):
    out = np.empty_like(pts)
    dist = np.empty(len(pts))
    for i, p in enumerate(pts):
        loc, _n, _f, d = t.find_nearest(Vector(p.tolist()))
        out[i] = loc
        dist[i] = d
    return out, dist


def signed(t, pts):
    """Signed distance to a closed, outward mesh (> 0 outside)."""
    out = np.empty(len(pts))
    for i, p in enumerate(pts):
        loc, nor, _f, d = t.find_nearest(Vector(p.tolist()))
        out[i] = d if (Vector(p.tolist()) - loc).dot(nor) > 0 else -d
    return out


def sample(v, n):
    return v if len(v) <= n else v[rng.choice(len(v), n, replace=False)]


def umeyama(src, dst):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    u, d, vt = np.linalg.svd(xd.T @ xs / len(src))
    sign = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[2, 2] = -1
    r = u @ sign @ vt
    s = (d * np.diag(sign)).sum() / xs.var(0).sum()
    return s, r, mu_d - s * r @ mu_s


def matrix(s, r, t, mirror=False):
    m = np.eye(4)
    m[:3, :3] = s * r @ (np.diag([-1.0, 1.0, 1.0]) if mirror else np.eye(3))
    m[:3, 3] = t
    return m


def rotvec(w):
    a = np.linalg.norm(w)
    if a < 1e-12:
        return np.eye(3)
    k = w / a
    kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(a) * kx + (1 - np.cos(a)) * kx @ kx


def nelder_mead(f, x0, step, iters):
    n = len(x0)
    pts = [x0] + [x0 + np.eye(n)[i] * step[i] for i in range(n)]
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = np.argsort(vals, kind="stable")
        pts = [pts[i] for i in order]
        vals = [vals[i] for i in order]
        c = np.mean(pts[:-1], axis=0)
        xr = c + (c - pts[-1])
        fr = f(xr)
        if fr < vals[0]:
            xe = c + 2 * (c - pts[-1])
            fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = c + 0.5 * (pts[-1] - c)
            fc = f(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                pts = [pts[0]] + [pts[0] + 0.5 * (p - pts[0]) for p in pts[1:]]
                vals = [vals[0]] + [f(p) for p in pts[1:]]
        if np.std(vals) < 1e-12:
            break
    i = int(np.argmin(vals))
    return pts[i], vals[i]


def mm(x):
    return round(float(x) * 1000, 2)


# ---------------------------------------------------------------- ear

EAR_PARTS = [("Malleus", "Malleus"), ("Incus", "Incus"), ("Stapes", "Stapes"), ("TympanicMembrane", "Tympanic membrane")]


def fit_ear():
    src = {k: external_meshes.read_ply(os.path.join(DIR, "openear", f"{k}.ply"), 0.001) for k, _ in EAR_PARTS}
    out = {}
    for side in ("l", "r"):
        targets = {k: world_mesh(f"{name}.{side}") for k, name in EAR_PARTS}
        trees = {k: tree(*targets[k]) for k, _ in EAR_PARTS}
        best = None
        for mirror in (False, True):
            m = np.diag([-1.0, 1.0, 1.0]) if mirror else np.eye(3)
            pts = {k: sample(src[k][0], 600) @ m.T for k, _ in EAR_PARTS}
            s, r, t = umeyama(np.array([pts[k].mean(0) for k, _ in EAR_PARTS]), np.array([targets[k][0].mean(0) for k, _ in EAR_PARTS]))
            for _ in range(60):
                a, b = [], []
                for k, _ in EAR_PARTS:
                    near, _d = nearest(trees[k], s * pts[k] @ r.T + t)
                    a.append(pts[k])
                    b.append(near)
                s, r, t = umeyama(np.concatenate(a), np.concatenate(b))
            rms = {}
            for k, _ in EAR_PARTS:
                _n, d = nearest(trees[k], s * pts[k] @ r.T + t)
                rms[k] = float(np.sqrt((d ** 2).mean()))
            total = float(np.sqrt(np.mean([v ** 2 for v in rms.values()])))
            if best is None or total < best[0]:
                best = (total, mirror, s, r, t, rms)
        total, mirror, s, r, t, rms = best
        out[f"ear-{side}"] = {
            "matrix": matrix(s, r, t, mirror).round(12).tolist(),
            "fit": {"mirrored": mirror, "scale": round(float(s), 4), "rmsMm": {k: mm(v) for k, v in rms.items()}, "totalRmsMm": mm(total)},
        }
        print(f"ear {side}: mirrored {mirror}, scale {s:.4f}, rms {mm(total)} mm")
    return out


# ---------------------------------------------------------------- kidney

def kidney_side(side, word, S):
    """HRA geometry and Z-Anatomy targets of one side (Blender world space, metres)."""
    kidney = os.path.join(DIR, "hra", f"3d-vh-m-kidney-{side}.glb")
    ureter = os.path.join(DIR, "hra", f"3d-vh-m-ureter-{side}.glb")
    cortex = external_meshes.read_glb(kidney, [f"VH_M_outer_cortex_of_kidney_{S}"])
    bm = bmesh.new()
    for co in sample(cortex[0], 2500):
        bm.verts.new(co.tolist())
    hull = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    centre = cortex[0].mean(0)
    planes = []
    for f in hull["geom"]:
        if not isinstance(f, bmesh.types.BMFace) or f.normal.length == 0:
            continue
        n = np.array(f.normal[:])
        d = n @ np.array(f.verts[0].co[:])
        if n @ centre - d > 0:
            n, d = -n, -d
        planes.append((n, d))
    bm.free()
    trees = {kind: world_mesh(f"Intrarenal {kind} of {word} kidney")[0] for kind in ("arteries", "veins")}
    trunks = {
        "arteries": np.concatenate([world_mesh(f"Anterior branch of renal artery.{side}")[0], world_mesh(f"Posterior branch of renal artery.{side}")[0]]),
        "veins": world_mesh("Left renal vein" if side == "l" else "Right renal vein")[0],
    }
    junctions = {}
    for kind in trees:
        trunk = trunks[kind][::2]
        dd = np.array([np.min(np.linalg.norm(trees[kind][::5] - p, axis=1)) for p in trunk])
        junctions[kind] = trunk[dd <= np.quantile(dd, 0.05)].mean(0)
    ureter_z = world_mesh(f"Ureter.{side}")[0]
    hilum = external_meshes.read_glb(kidney, [f"VH_M_hilum_of_kidney_{S}"])[0]
    ureter_h = external_meshes.read_glb(ureter, [f"VH_M_ureter_{S}"])[0]
    return {
        "hull_n": np.array([q[0] for q in planes]), "hull_d": np.array([q[1] for q in planes]),
        "cortex": cortex, "trees": trees, "junctions": junctions,
        "art": sample(trees["arteries"], 1500), "vein": sample(trees["veins"], 500),
        "adrenal": sample(world_mesh(f"Suprarenal gland.{side}")[0], 600),
        "hilum_z": junctions["arteries"],
        "top_z": ureter_z[ureter_z[:, 2] >= np.quantile(ureter_z[:, 2], 0.98)].mean(0),
        "hilum_h": hilum.mean(0),
        "top_h": ureter_h[ureter_h[:, 2] >= np.quantile(ureter_h[:, 2], 0.98)].mean(0),
        "pelvis": external_meshes.read_glb(ureter, [f"VH_M_renal_pelvis_{S}"]),
    }


def hull_signed(d, m, pts):
    """Signed distance (metres, > 0 outside) to the convex hull of the placed parenchyma, and the
    normal of the nearest violated plane (world space)."""
    lin_inv = np.linalg.inv(m[:3, :3])
    s = abs(np.linalg.det(m[:3, :3])) ** (1 / 3)
    vals = ((pts - m[:3, 3]) @ lin_inv.T) @ d["hull_n"].T - d["hull_d"]
    k = vals.argmax(axis=1)
    n = (lin_inv.T @ d["hull_n"][k].T).T
    return vals.max(axis=1) * s, n / np.linalg.norm(n, axis=1, keepdims=True)


def fit_kidney():
    """One shared shift and scale for both HRA kidneys (no rotation: both bodies stand upright and
    face forward), so the kidneys keep their natural orientation and their relative position in
    the Visible Human body; then a smooth field per intrarenal tree pulls the branches that stay
    outside into the new kidney, holding the junction with the trunk."""
    sides = {"l": kidney_side("l", "left", "L"), "r": kidney_side("r", "right", "R")}

    def as_matrix(x):
        m = np.eye(4)
        m[:3, :3] *= float(np.exp(x[3]))
        m[:3, 3] = x[:3]
        return m

    def energy(x):
        m = as_matrix(x)
        e = 0.0
        for d in sides.values():
            sa, _ = hull_signed(d, m, d["art"])
            sv, _ = hull_signed(d, m, d["vein"])
            sd, _ = hull_signed(d, m, d["adrenal"])
            e += np.mean(np.maximum(sa, 0) ** 2) + 0.3 * np.mean(np.maximum(sv, 0) ** 2) + 0.3 * np.mean(np.maximum(sa + 0.0015, 0) ** 2)
            e += 0.5 * np.sum((m[:3, :3] @ d["hilum_h"] + m[:3, 3] - d["hilum_z"]) ** 2)
            e += 0.05 * np.sum((m[:3, :3] @ d["top_h"] + m[:3, 3] - d["top_z"]) ** 2)
            e += np.mean(np.maximum(-sd - 0.004, 0) ** 2)
        return 1e6 * e + 2000 * x[3] ** 2

    x = np.concatenate([np.mean([d["hilum_z"] - d["hilum_h"] for d in sides.values()], axis=0), [0.0]])
    for step in ([0.01, 0.01, 0.01, 0.05], [0.002, 0.002, 0.002, 0.01], [0.0005, 0.0005, 0.0005, 0.003]):
        x, _val = nelder_mead(energy, x, np.array(step), 1500)
    m = as_matrix(x)
    transforms, warps, joins = {}, {}, {}
    for side, d in sides.items():
        fit = {"scale": round(float(np.exp(x[3])), 4)}
        for kind in ("arteries", "veins"):
            warp, stats = vessel_warp(d, m, kind)
            warps[f"kidney-{kind}-{side}"] = warp
            fit[kind] = stats
        fit["hilumOffsetMm"] = mm(np.linalg.norm(m[:3, :3] @ d["hilum_h"] + m[:3, 3] - d["hilum_z"]))
        sd, _ = hull_signed(d, m, d["adrenal"])
        fit["adrenalInsideHullMaxMm"] = mm(max(-sd.min(), 0))
        transforms[f"kidney-{side}"] = {"matrix": m.round(12).tolist(), "fit": fit}
        joins[side] = ureter_join(d, m, side)
        print(f"kidney {side}: {json.dumps(fit)}; ureter join {json.dumps(joins[side])}")
    return transforms, warps, joins


def vessel_warp(d, m, kind):
    """Gaussian RBF displacement (three rounds) that moves points of the tree outside the placed
    kidney inside it (arteries 1 mm, veins 0.5 mm deep), with points inside and the junction with
    the trunk held in place."""
    tree_pts = d["trees"][kind]
    junction = d["junctions"][kind]
    margin = 0.001 if kind == "arteries" else 0.0005
    sigma = 0.006
    pts = sample(tree_pts, 600)
    held = np.linalg.norm(pts - junction, axis=1) < 0.006
    current = pts.copy()
    rounds = []
    for _ in range(3):
        sd, n = hull_signed(d, m, current)
        push = np.where((sd + margin > 0)[:, None], -(sd + margin)[:, None] * n, 0.0)
        push[held] = 0.0
        centres = np.concatenate([current, junction[None, :]])
        targets = np.concatenate([push, np.zeros((1, 3))])
        d2 = ((centres[:, None, :] - centres[None, :, :]) ** 2).sum(-1)
        weights = np.linalg.solve(np.exp(-d2 / (2 * sigma * sigma)) + 1e-3 * np.eye(len(centres)), targets)
        rounds.append({"centres": centres.round(6).tolist(), "weights": weights.round(8).tolist()})
        current = current + rbf(current, rounds[-1], sigma)
    warp = {"sigma": sigma, "rounds": rounds}
    moved = tree_pts.copy()
    for r in rounds:
        moved = moved + rbf(moved, r, sigma)
    before, _ = hull_signed(d, m, tree_pts)
    after, _ = hull_signed(d, m, moved)
    disp = np.linalg.norm(moved - tree_pts, axis=1)
    stats = {
        "insideBefore": round(float((before <= 0).mean()), 3), "insideAfter": round(float((after <= 0).mean()), 3),
        "movedOver1mmShare": round(float((disp > 0.001).mean()), 3), "displacementP95Mm": mm(np.quantile(disp, 0.95)),
        "displacementMaxMm": mm(disp.max()),
    }
    return warp, stats


def rbf(x, rnd, sigma):
    centres = np.array(rnd["centres"])
    weights = np.array(rnd["weights"])
    out = np.zeros_like(x)
    for i in range(0, len(x), 2000):
        d2 = ((x[i:i + 2000, None, :] - centres[None, :, :]) ** 2).sum(-1)
        out[i:i + 2000] = np.exp(-d2 / (2 * sigma * sigma)) @ weights
    return out


def ureter_join(d, m, side):
    """The opening of the placed HRA pelvis nearest to its own ureter, and which end of the
    Z-Anatomy ureter curve is the upper one."""
    pos, tri = d["pelvis"]
    placed = pos @ m[:3, :3].T + m[:3, 3]
    edges = np.sort(np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), axis=1)
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = uniq[counts == 1]
    adj = {}
    for a, b in boundary:
        adj.setdefault(int(a), []).append(int(b))
        adj.setdefault(int(b), []).append(int(a))
    seen, loops = set(), []
    for s0 in sorted(adj):
        if s0 in seen:
            continue
        stack, loop = [s0], []
        seen.add(s0)
        while stack:
            i = stack.pop()
            loop.append(i)
            for j in adj[i]:
                if j not in seen:
                    seen.add(j)
                    stack.append(j)
        loops.append(loop)
    top = m[:3, :3] @ d["top_h"] + m[:3, 3]
    outlet = min(loops, key=lambda lp: np.linalg.norm(placed[lp].mean(0) - top))
    curve = bpy.data.objects[f"Ureter.{side}"]
    pts = curve.data.splines[0].bezier_points
    first = np.array((curve.matrix_world @ pts[0].co)[:])
    last = np.array((curve.matrix_world @ pts[-1].co)[:])
    end = "first" if first[2] > last[2] else "last"
    return {"near": placed[outlet].mean(0).round(4).tolist(), "end": end,
            "gapMm": mm(np.linalg.norm(placed[outlet].mean(0) - (first if end == "first" else last)))}


# ---------------------------------------------------------------- labyrinth

PART_NAMES = ["vestibule", "cochlea", "anterior", "posterior", "lateral", "crus"]


def segment_labyrinth(ear_right):
    v, f = external_meshes.read_ply(os.path.join(DIR, "openear", "ScalaVestibuli.ply"), 0.001)
    st = external_meshes.read_ply(os.path.join(DIR, "openear", "ScalaTympani.ply"), 0.001)
    n = len(v)
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    vn = np.zeros_like(v)
    for k in range(3):
        np.add.at(vn, f[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True)
    t_self = tree(v, f)
    diam = np.full(n, np.nan)
    for i in range(n):
        hit = t_self.ray_cast(Vector((v[i] - vn[i] * 1e-6).tolist()), Vector((-vn[i]).tolist()), 0.02)
        if hit[0] is not None:
            diam[i] = hit[3]
    _near, to_st = nearest(tree(*st), v)
    edges = np.unique(np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1), axis=0)
    nbrs = [[] for _ in range(n)]
    for a, b in edges:
        nbrs[a].append(b)
        nbrs[b].append(a)
    d = np.where(np.isnan(diam), np.nanmedian(diam), diam)
    for _ in range(4):
        d = np.array([(d[i] + d[nb].sum()) / (1 + len(nb)) for i, nb in enumerate(nbrs)])
    VEST, COCH, TUBE = 0, 1, 2
    label = np.full(n, TUBE)
    label[d > 0.0025] = VEST
    label[(to_st < 0.0009) & (d <= 0.0025)] = COCH

    def components(mask):
        comp = np.full(n, -1)
        c = 0
        for s0 in range(n):
            if not mask[s0] or comp[s0] >= 0:
                continue
            stack = [s0]
            comp[s0] = c
            while stack:
                i = stack.pop()
                for j in nbrs[i]:
                    if mask[j] and comp[j] < 0:
                        comp[j] = c
                        stack.append(j)
            c += 1
        return comp

    comp = components(label == TUBE)
    canal_idx = np.where(comp == int(np.argmax(np.bincount(comp[comp >= 0]))))[0]
    P = v[canal_idx]
    remaining = np.arange(len(P))
    planes = []
    for _ in range(3):
        best = None
        for _ in range(4000):
            s3 = rng.choice(remaining, 3, replace=False)
            nrm = np.cross(P[s3[1]] - P[s3[0]], P[s3[2]] - P[s3[0]])
            if np.linalg.norm(nrm) < 1e-12:
                continue
            nrm /= np.linalg.norm(nrm)
            inl = remaining[np.abs((P[remaining] - P[s3[0]]) @ nrm) < 0.00075]
            if best is None or len(inl) > len(best):
                best = inl
        c0 = P[best].mean(0)
        _w, vec = np.linalg.eigh(np.cov((P[best] - c0).T))
        nrm = vec[:, 0]
        planes.append((nrm, c0))
        remaining = np.setdiff1d(remaining, best[np.abs((P[best] - c0) @ nrm) < 0.00075])
    m = np.array(ear_right["matrix"])
    rot = m[:3, :3] / np.cbrt(np.linalg.det(m[:3, :3]))
    lateral = int(np.argmax([abs((rot @ nrm)[2]) for nrm, _ in planes]))
    dist = np.stack([np.abs((P - c) @ nrm) for nrm, c in planes], axis=1)
    assign = dist.argmin(1)
    others = [k for k in range(3) if k != lateral]
    body_y = {k: (m @ np.append(P[assign == k].mean(0), 1))[1] for k in others}
    anterior = min(others, key=lambda k: body_y[k])  # Blender: -Y is the front
    posterior = [k for k in others if k != anterior][0]
    lab = np.where(label == VEST, 0, np.where(label == COCH, 1, -1))
    lab[(label == TUBE) & ~np.isin(np.arange(n), canal_idx)] = 1
    code = {anterior: 2, posterior: 3, lateral: 4}
    lab[canal_idx] = [code[k] for k in assign]
    crus = (dist[:, anterior] < 0.0012) & (dist[:, posterior] < 0.0012) & (dist[:, lateral] > 0.0015)
    lab[canal_idx[crus]] = 5
    for _ in range(6):
        new = lab.copy()
        for i in np.where(lab >= 2)[0]:
            vals = [lab[j] for j in nbrs[i] if lab[j] >= 2]
            if vals:
                new[i] = int(np.argmax(np.bincount(vals + [lab[i]], minlength=6)))
        lab = new
    for c in range(6):
        idx = set(np.where(lab == c)[0].tolist())
        seen, parts = set(), []
        for s0 in sorted(idx):
            if s0 in seen:
                continue
            stack, part = [s0], []
            seen.add(s0)
            while stack:
                i = stack.pop()
                part.append(i)
                for j in nbrs[i]:
                    if j in idx and j not in seen:
                        seen.add(j)
                        stack.append(j)
            parts.append(part)
        parts.sort(key=len, reverse=True)
        for part in parts[1:]:
            for i in part:
                vals = [lab[j] for j in nbrs[i] if lab[j] != c]
                if vals:
                    lab[i] = int(np.bincount(vals).argmax())
    tri_lab = np.array([np.bincount(lab[t], minlength=6).argmax() for t in f])
    # One cut plane per boundary loop between two parts.
    face_of_edge = {}
    for fi, t in enumerate(f):
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            face_of_edge.setdefault((min(a, b), max(a, b)), []).append(fi)
    boundary = {}
    for (a, b), faces in face_of_edge.items():
        if len(faces) == 2 and tri_lab[faces[0]] != tri_lab[faces[1]]:
            pair = tuple(sorted((int(tri_lab[faces[0]]), int(tri_lab[faces[1]]))))
            boundary.setdefault(pair, []).append((a, b))
    cuts = []
    centroid = {c: v[np.unique(f[tri_lab == c])].mean(0) for c in range(6)}
    for (pa, pb), edge_list in sorted(boundary.items()):
        adj = {}
        for a, b in edge_list:
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
        seen = set()
        for s0 in sorted(adj):
            if s0 in seen:
                continue
            stack, loop = [s0], []
            seen.add(s0)
            while stack:
                i = stack.pop()
                loop.append(i)
                for j in adj[i]:
                    if j not in seen:
                        seen.add(j)
                        stack.append(j)
            if len(loop) < 8:
                continue
            q = v[loop]
            c0 = q.mean(0)
            _w, vec = np.linalg.eigh(np.cov((q - c0).T))
            nrm = vec[:, 0]
            near_a = v[np.unique(f[tri_lab == pa])]
            near_a = near_a[np.linalg.norm(near_a - c0, axis=1) < 0.003]
            ref = near_a.mean(0) if len(near_a) else centroid[pa]
            if (ref - c0) @ nrm < 0:
                nrm = -nrm
            radius = float(np.linalg.norm(q - c0, axis=1).max()) * 1.4
            cuts.append({"between": [pa, pb], "point": c0.round(9).tolist(), "normal": nrm.round(9).tolist(),
                         "radius": round(radius, 9), "band": 0.0006})
    print("labyrinth parts (triangles):", {PART_NAMES[k]: int((tri_lab == k).sum()) for k in range(6)}, "cuts:", len(cuts))
    return {"names": PART_NAMES, "labels": "".join(str(int(x)) for x in tri_lab), "cuts": cuts}


ear = fit_ear()
labyrinth = segment_labyrinth(ear["ear-r"])
kidney, warps, joins = fit_kidney()
result = {
    "$comment": "Generated by packages/tools/blender/fit_external.py (pnpm data:fit) from the snapshot and the external files; reviewed and committed. Transforms map the source geometry (metres; glTF converted to Blender axes) to Blender world space; curve warps are used by the warp-curves fixes (their SHA-256 is declared there); ureter joins are the values for the join-tube-end fixes.",
    "blender": bpy.app.version_string,
    "transforms": {**ear, **kidney},
    "labyrinth": labyrinth,
    "curveWarps": warps,
    "ureterJoins": joins,
}
# Indented, but every list of numbers on one line: the file stays readable and diffable.
text = json.dumps(result, indent=1)
text = re.sub(r"\[\s*([-0-9.e,\s]+?)\s*\]", lambda mt: "[" + ",".join(x.strip() for x in mt.group(1).split(",")) + "]", text)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(text + "\n")
for key, field in warps.items():
    print(f"warp {key}: sha256 {external_meshes_digest(field)}")
print(f"written {OUT}")
