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
- Kidney (HRA, Visible Human Male): no rotation (both bodies stand upright and face forward), so
  the kidneys keep their natural orientation. Nelder-Mead first finds one shift and uniform scale
  for both kidneys, minimising the Z-Anatomy intrarenal arteries and veins outside the convex hull
  of the HRA parenchyma (arteries with a 1.5 mm margin), the distance from the renal branches'
  division to the HRA hilum, weakly the distance from the Z-Anatomy ureter's upper end to the HRA
  pelvi-ureteric junction, the suprarenal gland entering the hull by more than 4 mm and a scale
  far from 1; then a shift per kidney (the scale stays shared) that also keeps the neighbours
  (suprarenal gland, liver or spleen, intestine, pancreas, muscles, diaphragm, ribs, vertebrae,
  great vessels) out of the kidney. Where they still enter it, a smooth inward field gives the
  kidney their impressions (all its parts and its intrarenal vessels follow it; the vessel
  junctions and the pelvi-ureteric outlet stay). The Z-Anatomy intrarenal trees were modelled for
  another kidney: for each tree a smooth Gaussian field (warp-curves fix) moves the branches still
  outside inside the new kidney, holding the junction with the trunk. Another field moves each
  ureter out of its neighbours (warp-curves fix, ends held); its upper end is joined to the HRA
  pelvis and its lower end to the bladder (join-tube-end fixes).
- `--kidney-placement <external-fit.json>` reuses the kidney shifts and scale of an earlier fit and
  computes only the fields again (minutes instead of a quarter of an hour).
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
from mathutils.geometry import interpolate_bezier
from mathutils.kdtree import KDTree

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


def sample(v, n):
    return v if len(v) <= n else v[rng.choice(len(v), n, replace=False)]


def surface_points(pos, tri, lo, hi, spacing=0.0007):
    """Vertices and area-weighted random points (about one per spacing²) of the triangles that
    reach into a box, so that large triangles cutting through a structure are noticed too."""
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


def smooth_round(centres, targets, sigma):
    """One round of a smooth displacement field that moves the centres by about their targets:
    Gaussian kernels weighted by the targets divided by the local sum of kernels (a kernel
    smoother: no system is solved, so the field cannot oscillate between the centres). Rounds are
    repeated on what the previous ones left."""
    d2 = ((centres[:, None, :] - centres[None, :, :]) ** 2).sum(-1)
    weights = targets / np.maximum(np.exp(-d2 / (2 * sigma * sigma)).sum(1), 1.0)[:, None]
    return {"centres": centres.round(6).tolist(), "weights": weights.round(8).tolist()}


def pin_round(field, pins):
    """A last round that takes a few points (the pins) back exactly to where they were."""
    now = external_meshes.warp_points(pins, field)
    sigma = field["sigma"]
    d2 = ((now[:, None, :] - now[None, :, :]) ** 2).sum(-1)
    weights = np.linalg.solve(np.exp(-d2 / (2 * sigma * sigma)), pins - now)
    return {"centres": now.round(6).tolist(), "weights": weights.round(8).tolist()}


def jacobian_min(field, pts):
    """Smallest Jacobian determinant of a field at the given points (> 0: nothing is folded)."""
    moved = external_meshes.warp_points(pts, field)
    h = 0.0002
    jac = np.stack([(external_meshes.warp_points(pts + h * e, field) - moved) / h for e in np.eye(3)], axis=2)
    return round(float(np.linalg.det(jac).min()), 3)


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


# Rays for the enclosure test: the six axes and the eight diagonals, slightly tilted so that they
# do not run along edges of axis-aligned meshes.
ENCLOSURE = [Vector(v).normalized() for v in (
    (1, 0.013, 0.007), (-1, 0.011, -0.009), (0.009, 1, 0.012), (-0.008, -1, 0.01), (0.011, 0.006, 1), (-0.007, 0.012, -1),
    (1, 1.013, 0.991), (1, -0.987, 1.009), (-1, 1.006, -0.994), (-1, -0.992, 1.011),
    (0.989, 1.008, -1), (1.012, -1.01, -0.988), (-0.993, 0.989, 1.007), (-1.006, -1.012, -0.991))]


def enclosed(t, p, misses=1):
    """Whether a point is enclosed by a surface: of rays in 14 directions at most `misses` escape.
    Unlike ray parity this works for thin closed shells (the HRA fibrous capsule is one: parity
    would count only the thin layer as inside) and for surfaces with small holes."""
    escaped = 0
    origin = Vector(p)
    for d in ENCLOSURE:
        if t.ray_cast(origin, d, 1.0)[0] is None:
            escaped += 1
            if escaped > misses:
                return False
    return True


def solid_grid(pos, tri, lo, hi, step=0.002):
    """Signed distance (metres, < 0 inside) to a surface on a grid, inside meaning enclosed."""
    shape = np.ceil((hi - lo) / step).astype(int) + 1
    axes = [lo[i] + step * np.arange(shape[i]) for i in range(3)]
    grid = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1).reshape(-1, 3)
    t = tree(pos, tri)
    values = np.empty(len(grid))
    for i, q in enumerate(grid):
        dist = t.find_nearest(Vector(q.tolist()))[3]
        values[i] = -dist if enclosed(t, q.tolist()) else dist
    return {"lo": lo, "step": step, "shape": shape, "values": values.reshape(shape)}


RAYS = [Vector((1, 0.0137, 0.0071)), Vector((0.0093, 1, 0.0117)), Vector((0.0109, 0.0061, 1))]


def inside(t, p):
    """Ray parity in three directions, two votes: robust for mirrored or slightly open meshes."""
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


def sdf_at(g, pts):
    """Trilinear signed distance; points outside the grid are far (1 m)."""
    f = (pts - g["lo"]) / g["step"]
    i0 = np.floor(f).astype(int)
    out = np.full(len(pts), 1.0)
    ok = np.all((i0 >= 0) & (i0 < g["shape"] - 1), axis=1)
    if not ok.any():
        return out
    i0, w = i0[ok], f[ok] - i0[ok]
    v = g["values"]
    acc = np.zeros(len(i0))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wt = (w[:, 0] if dx else 1 - w[:, 0]) * (w[:, 1] if dy else 1 - w[:, 1]) * (w[:, 2] if dz else 1 - w[:, 2])
                acc += wt * v[i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
    out[ok] = acc
    return out


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

KIDNEY_OBSTACLES = {
    "l": ["Suprarenal gland.l", "Spleen", "Descending colon", "Transverse colon", "Jejunum", "Duodenum", "Pancreas", "Stomach",
          "Psoas major.l", "Quadratus lumborum muscle.l", "Diaphragm", "Transversus abdominis muscle.l",
          "Eleventh rib.l", "Twelfth rib.l", "Vertebra T12", "Vertebra L1", "Vertebra L2", "Vertebra L3", "Abdominal aorta"],
    "r": ["Suprarenal gland.r", "Liver", "Gallbladder", "Duodenum", "Ascending colon", "Transverse colon", "Jejunum", "Pancreas",
          "Psoas major.r", "Quadratus lumborum muscle.r", "Diaphragm", "Transversus abdominis muscle.r",
          "Eleventh rib.r", "Twelfth rib.r", "Vertebra T12", "Vertebra L1", "Vertebra L2", "Vertebra L3",
          "Inferior vena cava (abdominal part)"],
}
URETER_OBSTACLES = {
    "l": ["Psoas major.l", "Iliacus muscle.l", "Descending colon", "Sigmoid colon", "Jejunum", "Abdominal aorta"],
    "r": ["Psoas major.r", "Iliacus muscle.r", "Duodenum", "Ascending colon", "Vermiform appendix", "Jejunum",
          "Inferior vena cava (abdominal part)"],
}


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
    capsule = external_meshes.read_glb(kidney, [f"VH_M_kidney_capsule_{S}"])
    hilum_mesh = external_meshes.read_glb(kidney, [f"VH_M_hilum_of_kidney_{S}"])
    hilum = hilum_mesh[0]
    # The kidney as a solid: the fibrous capsule (a thin closed shell) closed by the hilum.
    solid = (np.concatenate([capsule[0], hilum]), np.concatenate([capsule[1], hilum_mesh[1] + len(capsule[0])]))
    ureter_h = external_meshes.read_glb(ureter, [f"VH_M_ureter_{S}"])[0]
    return {
        "hull_n": np.array([q[0] for q in planes]), "hull_d": np.array([q[1] for q in planes]),
        "cortex": cortex, "solid": solid, "trees": trees, "junctions": junctions,
        "art": sample(trees["arteries"], 1500), "vein": sample(trees["veins"], 500),
        "adrenal": sample(world_mesh(f"Suprarenal gland.{side}")[0], 600),
        "hilum_z": junctions["arteries"],
        "top_z": ureter_z[ureter_z[:, 2] >= np.quantile(ureter_z[:, 2], 0.98)].mean(0),
        "hilum_h": hilum.mean(0),
        "top_h": ureter_h[ureter_h[:, 2] >= np.quantile(ureter_h[:, 2], 0.98)].mean(0),
        "pelvis": external_meshes.read_glb(ureter, [f"VH_M_renal_pelvis_{S}"]),
        # The solid kidney as a signed distance field (HRA frame): the neighbours must stay out of it.
        "solid_sdf": solid_grid(solid[0], solid[1], solid[0].min(0) - 0.012, solid[0].max(0) + 0.012),
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


def kidney_neighbours(d, side, m):
    """Vertices of the neighbours around a placed kidney (at most 900 of each) and their names."""
    placed = d["cortex"][0] @ m[:3, :3].T + m[:3, 3]
    lo, hi = placed.min(0) - 0.04, placed.max(0) + 0.04
    points, labels = [], []
    for name in KIDNEY_OBSTACLES[side]:
        pos = world_mesh(name)[0]
        near = pos[np.all((pos >= lo) & (pos <= hi), axis=1)]
        if len(near):
            chosen = sample(near, 900)
            points.append(chosen)
            labels.extend([name] * len(chosen))
    d["obstacles"] = np.concatenate(points)
    d["obstacle_names"] = np.array(labels)


def scaled(t, logs):
    m = np.eye(4)
    m[:3, :3] *= float(np.exp(logs))
    m[:3, 3] = t
    return m


def place_kidneys(sides):
    """Shifts and the shared scale of both kidneys (module docstring): matrices and fit records."""

    def side_energy(d, m):
        sa, _ = hull_signed(d, m, d["art"])
        sv, _ = hull_signed(d, m, d["vein"])
        guide = 0.3 if "obstacles" in d else 1.0
        e = guide * (np.mean(np.maximum(sa, 0) ** 2) + 0.3 * np.mean(np.maximum(sv, 0) ** 2) + 0.3 * np.mean(np.maximum(sa + 0.0015, 0) ** 2))
        e += 0.5 * np.sum((m[:3, :3] @ d["hilum_h"] + m[:3, 3] - d["hilum_z"]) ** 2)
        e += 0.05 * np.sum((m[:3, :3] @ d["top_h"] + m[:3, 3] - d["top_z"]) ** 2)
        if "obstacles" not in d:
            sd, _ = hull_signed(d, m, d["adrenal"])
            e += np.mean(np.maximum(-sd - 0.004, 0) ** 2)
        if "obstacles" in d:
            # Points of the neighbours inside the kidney (1 mm contact allowed), or inside the
            # convex hull near the hilum (outside the kidney, 3 mm allowed).
            scale = abs(np.linalg.det(m[:3, :3])) ** (1 / 3)
            local = (d["obstacles"] - m[:3, 3]) @ np.linalg.inv(m[:3, :3]).T
            depth = -sdf_at(d["solid_sdf"], local) * scale
            pen = np.maximum(depth - 0.001, 0)
            hull, _ = hull_signed(d, m, d["obstacles"])
            sinus = np.where(depth < 0, np.maximum(-hull - 0.003, 0), 0.0)
            e += 20 * np.sum(pen ** 2) / 200 + np.sum(sinus ** 2) / 200
        return e

    # 1. One shared shift and scale.
    def energy1(x):
        m = scaled(x[:3], x[3])
        return 1e6 * sum(side_energy(d, m) for d in sides.values()) + 2000 * x[3] ** 2

    x = np.concatenate([np.mean([d["hilum_z"] - d["hilum_h"] for d in sides.values()], axis=0), [0.0]])
    for step in ([0.01, 0.01, 0.01, 0.05], [0.002, 0.002, 0.002, 0.01], [0.0005, 0.0005, 0.0005, 0.003]):
        x, _val = nelder_mead(energy1, x, np.array(step), 1500)
    shared = scaled(x[:3], x[3])
    # 2. The neighbours of each placed kidney, then a shift per kidney (the scale stays shared).
    for side, d in sides.items():
        kidney_neighbours(d, side, shared)

    def energy2(y):
        return 1e6 * (side_energy(sides["l"], scaled(y[0:3], y[6])) + side_energy(sides["r"], scaled(y[3:6], y[6]))) + 2000 * y[6] ** 2

    y = np.concatenate([x[:3], x[:3], [x[3]]])
    for step in ([0.005] * 6 + [0.02], [0.001] * 6 + [0.005], [0.0002] * 6 + [0.002]):
        y, _val = nelder_mead(energy2, y, np.array(step), 3000)
    placement = {"l": scaled(y[0:3], y[6]), "r": scaled(y[3:6], y[6])}
    records = {side: {"scale": round(float(np.exp(y[6])), 4),
                      "shiftFromSharedMm": mm(np.linalg.norm(placement[side][:3, 3] - shared[:3, 3]))} for side in sides}
    return placement, records


def fit_kidney():
    """Both HRA kidneys (module docstring): placement, impressions, the fields of the intrarenal
    vessels and of the ureters, and the ureter joins."""
    sides = {"l": kidney_side("l", "left", "L"), "r": kidney_side("r", "right", "R")}
    previous = arg("--kidney-placement")
    if previous:
        with open(previous, encoding="utf-8") as fh:
            old = json.load(fh)["transforms"]
        placement = {side: np.array(old[f"kidney-{side}"]["matrix"], dtype=np.float64) for side in sides}
        records = {side: {k: old[f"kidney-{side}"]["fit"][k] for k in ("scale", "shiftFromSharedMm")} for side in sides}
        for side, d in sides.items():
            kidney_neighbours(d, side, placement[side])
    else:
        placement, records = place_kidneys(sides)
    transforms, warps, joins = {}, {}, {}
    for side, d in sides.items():
        m = placement[side]
        fit = dict(records[side])
        fit["hilumOffsetMm"] = mm(np.linalg.norm(m[:3, :3] @ d["hilum_h"] + m[:3, 3] - d["hilum_z"]))
        pins = np.array([d["junctions"]["arteries"], d["junctions"]["veins"], ureter_join(d, m, side)["near"]], dtype=np.float64)
        impression, fit["impressions"] = impression_warp(d, m, side, pins)
        for kind in ("arteries", "veins"):
            warp, stats = vessel_warp(d, m, kind)
            # The vessels inside the kidney follow its impressions.
            warp["rounds"] += [{**r, "sigma": impression["sigma"]} for r in impression["rounds"]]
            warps[f"kidney-{kind}-{side}"] = warp
            fit[kind] = stats
        transforms[f"kidney-{side}"] = {"matrix": m.round(12).tolist(), "warp": impression, "fit": fit}
        joins[side] = ureter_join(d, m, side, impression)
        warp, stats = ureter_warp(side, joins[side])
        warps[f"ureter-{side}"] = warp
        joins[side]["course"] = stats
        print(f"kidney {side}: {json.dumps(fit)}; ureter {json.dumps(joins[side])}")
    return transforms, warps, joins


def impression_warp(d, m, side, pins, sigma=0.008, cell=0.003, margin=0.0005, rounds=12):
    """Smooth inward field (Gaussian RBF rounds, world space) that gives the placed kidney the
    impressions of the neighbours still entering it: every point of a neighbour's surface inside
    the kidney (enclosed by the fibrous capsule and the hilum) ends up 0.5 mm outside. Points of
    the kidney surface (one per 3 mm cell, the deepest) carry the displacements, the vessel
    junctions and the pelvi-ureteric outlet (`pins`) stay in place; each round works on what the
    previous rounds left."""
    surface = (d["solid"][0] @ m[:3, :3].T + m[:3, 3], d["solid"][1])
    lo, hi = surface[0].min(0) - 0.002, surface[0].max(0) + 0.002
    scale = abs(np.linalg.det(m[:3, :3])) ** (1 / 3)
    inv = np.linalg.inv(m[:3, :3])
    points, labels = [], []
    for name in KIDNEY_OBSTACLES[side]:
        pos, tri = world_mesh(name)
        pts = surface_points(pos, tri, lo, hi)
        # The field only moves inwards: points farther out never enter.
        pts = pts[sdf_at(d["solid_sdf"], (pts - m[:3, 3]) @ inv.T) * scale < 0.002]
        points.append(pts)
        labels.extend([name] * len(pts))
    cand, names = np.concatenate(points), np.array(labels)
    field = {"sigma": sigma, "rounds": []}

    def entering():
        """Depth of each candidate inside the warped kidney and its nearest point on the surface."""
        depth, near = np.zeros(len(cand)), np.zeros_like(cand)
        t = tree(external_meshes.warp_points(surface[0], field), surface[1])
        for i, p in enumerate(cand):
            if enclosed(t, p.tolist()):
                loc, _n, _f, dist = t.find_nearest(Vector(p.tolist()))
                depth[i], near[i] = dist, loc[:]
        return depth, near

    depth, near = entering()
    before = {n: mm(depth[names == n].max()) for n in dict.fromkeys(names.tolist()) if depth[names == n].max() > 0}
    for _ in range(rounds):
        hit = np.where(depth > 0)[0]
        if len(hit) == 0:
            break
        q = near[hit]
        u = (q - cand[hit]) / depth[hit][:, None]
        target = -(depth[hit] + margin)[:, None] * u
        # One centre per 3 mm cell of the surface (the deepest), and the pins held.
        first = {}
        for k in np.argsort(-depth[hit]):
            first.setdefault(tuple(np.floor(q[k] / cell).astype(int).tolist()), k)
        idx = np.array(list(first.values()))
        centres = np.concatenate([q[idx], external_meshes.warp_points(pins, field)])
        targets = np.concatenate([target[idx], np.zeros((len(pins), 3))])
        field["rounds"].append(smooth_round(centres, targets, sigma))
        depth, near = entering()
    if field["rounds"]:
        field["rounds"].append(pin_round(field, pins))
        depth, near = entering()
    # The field must not fold the kidney: its surface and a 2 mm grid inside it.
    g = d["solid_sdf"]
    interior = (g["lo"] + np.argwhere(g["values"] < 0) * g["step"]) @ m[:3, :3].T + m[:3, 3]
    probe = np.concatenate([surface[0], interior])
    stats = {
        "depthBeforeMm": before, "rounds": len(field["rounds"]), "depthAfterMm": mm(depth.max()),
        "displacementMaxMm": mm(np.linalg.norm(external_meshes.warp_points(probe, field) - probe, axis=1).max()),
        "jacobianMin": jacobian_min(field, probe),
    }
    if stats["jacobianMin"] < 0.2:
        raise external_meshes.ExternalError(f"kidney {side}: the impressions fold the kidney ({stats})")
    return field, stats


def curve_line(name):
    """World-space centreline of a single Bézier curve object and its arc length from the start."""
    obj = bpy.data.objects[name]
    points = obj.data.splines[0].bezier_points
    line = []
    for a, b in zip(points[:-1], points[1:]):
        segment = interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, 33)
        line.extend(segment[1:] if line else segment)
    line = np.array([(obj.matrix_world @ v)[:] for v in line])
    return line, np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))])


def ureter_warp(side, join):
    """Smooth field that moves the Z-Anatomy ureter out of its neighbours (psoas, iliacus, colon,
    duodenum, great vessels), 1 mm past the nearest point of their surface (ray-parity inside
    test). Its course is judged as it will be after the upper end is joined to the pelvis (the
    join-tube-end fix moves the end onto the outlet and fades out along the blend length); both
    ends stay in place."""
    pts = world_mesh(f"Ureter.{side}")[0]
    lo, hi = pts.min(0) - 0.02, pts.max(0) + 0.02
    trees = []
    for name in URETER_OBSTACLES[side]:
        pos, tri = world_mesh(name)
        if np.any(pos.max(0) < lo) or np.any(pos.min(0) > hi):
            continue
        trees.append((tree(pos, tri), pos.min(0), pos.max(0)))

    def push_of(q):
        """Displacement that takes a point out of every neighbour (0 when it is clear)."""
        out = np.zeros(3)
        for t, mn, mx in trees:
            if np.any(q < mn) or np.any(q > mx) or not inside(t, q.tolist()):
                continue
            loc, _n, _f, dist = t.find_nearest(Vector(q.tolist()))
            direction = (np.array(loc[:]) - q) / max(dist, 1e-9)
            out += direction * (dist + margin)
        return out

    line, arc = curve_line(f"Ureter.{side}")
    top = line[-1] if join["end"] == "last" else line[0]
    bottom = line[0] if join["end"] == "last" else line[-1]
    from_top = arc[-1] - arc if join["end"] == "last" else arc
    with open(os.path.join(os.path.dirname(OUT), "geometry-fixes.json"), encoding="utf-8") as fh:
        blend = next(f for f in json.load(fh)["fixes"] if f["id"] == f"ureter-pelvis-{side}")["blendLength"]
    shift = np.array(join["near"]) - top
    index = KDTree(len(line))
    for i, v in enumerate(line):
        index.insert(v.tolist(), i)
    index.balance()

    def joined(x, x0):
        """Where points (now at x, originally at x0) will be after the upper join."""
        s = from_top[[index.find(v.tolist())[1] for v in x0]]
        t = np.clip(1 - s / blend, 0, 1)
        return x + (t * t * (3 - 2 * t))[:, None] * shift

    margin, sigma = 0.001, 0.006
    sample_pts = sample(pts, 1500)
    held = np.linalg.norm(sample_pts - top, axis=1) < 0.005
    held |= np.linalg.norm(sample_pts - bottom, axis=1) < 0.005
    field = {"sigma": sigma, "rounds": []}
    for _ in range(10):
        current = external_meshes.warp_points(sample_pts, field)
        push = np.array([push_of(q) for q in joined(current, sample_pts)])
        push[held] = 0.0
        moving = np.linalg.norm(push, axis=1) > 0
        if not moving.any():
            break
        use = moving | held
        field["rounds"].append(smooth_round(current[use], push[use], sigma))
    field["rounds"].append(pin_round(field, np.array([top, bottom])))
    check = sample(pts, 3000)
    moved = external_meshes.warp_points(check, field)
    before = np.array([np.linalg.norm(push_of(q)) for q in joined(check, check)])
    after = np.array([np.linalg.norm(push_of(q)) for q in joined(moved, check)])
    disp = np.linalg.norm(moved - check, axis=1)
    stats = {
        "rounds": len(field["rounds"]),
        "insideBefore": round(float((before > 0).mean()), 3), "depthBeforeMm": mm(max(before.max() - margin, 0)),
        "insideAfter": round(float((after > 0).mean()), 3), "depthAfterMm": mm(max(after.max() - margin, 0)),
        "displacementMaxMm": mm(disp.max()), "jacobianMin": jacobian_min(field, check),
    }
    if stats["jacobianMin"] < 0.2:
        raise external_meshes.ExternalError(f"ureter {side}: the field folds the ureter ({stats})")
    return field, stats


def vessel_warp(d, m, kind):
    """Smooth field that moves the points of the tree outside the placed kidney inside it
    (arteries 1 mm, veins 0.5 mm deep); the junction with the trunk stays in place. Coarse to
    fine (sigma 20 mm down to 6 mm): the branches far outside move together first, so that the
    tree does not fold."""
    tree_pts = d["trees"][kind]
    junction = d["junctions"][kind]
    margin = 0.001 if kind == "arteries" else 0.0005
    field = {"sigma": 0.006, "rounds": []}
    pts = sample(tree_pts, 1500)
    held = np.linalg.norm(pts - junction, axis=1) < 0.006
    for sigma in (0.02, 0.02, 0.014, 0.014, 0.01, 0.01, 0.008, 0.008, 0.006, 0.006, 0.006, 0.006):
        current = external_meshes.warp_points(pts, field)
        sd, n = hull_signed(d, m, current)
        out = (sd + margin > 0) & ~held
        if out.mean() < 0.002:
            break
        use = out | held
        push = np.where(out[:, None], -(sd + margin)[:, None] * n, 0.0)
        field["rounds"].append({**smooth_round(current[use], push[use], sigma), "sigma": sigma})
    field["rounds"].append(pin_round(field, junction[None, :]))
    moved = external_meshes.warp_points(tree_pts, field)
    before, _ = hull_signed(d, m, tree_pts)
    after, _ = hull_signed(d, m, moved)
    disp = np.linalg.norm(moved - tree_pts, axis=1)
    stats = {
        "rounds": len(field["rounds"]), "insideBefore": round(float((before <= 0).mean()), 3),
        "insideAfter": round(float((after <= 0).mean()), 3), "movedOver1mmShare": round(float((disp > 0.001).mean()), 3),
        "displacementP95Mm": mm(np.quantile(disp, 0.95)), "displacementMaxMm": mm(disp.max()),
        "jacobianMin": jacobian_min(field, sample(tree_pts, 3000)),
    }
    if stats["jacobianMin"] < 0.2:
        raise external_meshes.ExternalError(f"intrarenal {kind}: the field folds the tree ({stats})")
    return field, stats


def ureter_join(d, m, side, field=None):
    """The opening of the placed HRA pelvis nearest to its own ureter, and which end of the
    Z-Anatomy ureter curve is the upper one."""
    pos, tri = d["pelvis"]
    placed = external_meshes.warp_points(pos @ m[:3, :3].T + m[:3, 3], field or {})
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
    top = external_meshes.warp_points((m[:3, :3] @ d["top_h"] + m[:3, 3])[None], field or {})[0]
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
    "$comment": "Generated by packages/tools/blender/fit_external.py (pnpm data:fit) from the snapshot and the external files; reviewed and committed. Transforms map the source geometry (metres; glTF converted to Blender axes) to Blender world space, followed by their warp (the kidney impressions) where present; curve warps are used by the warp-curves fixes (their SHA-256 is declared there); ureter joins are the values for the join-tube-end fixes.",
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
