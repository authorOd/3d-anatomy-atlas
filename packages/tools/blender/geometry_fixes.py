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
"""Declared corrections of the source geometry, applied by export_zanatomy.py.

The export stays a thin conversion of Z-Anatomy. The few places where the source geometry is
knowingly changed are listed with their reasons in packages/data/sources/geometry-fixes.json,
applied here and reported in export.json, so every change is explicit and reproducible:

  close-hole     Fills an opening of an object's base mesh with rings of quads around a centre
                 fan. The new positions minimise the discrete bi-Laplacian energy (finite-volume
                 weights) over the patch and the old border, so the patch continues the curvature
                 of the surrounding surface. Modifiers and objects generated from the mesh (the
                 stomach mucosa is made from the stomach by Geometry Nodes) follow the patch.
  join-tube-end  Moves the end of a curve tube so that its end ring lies exactly on an opening of
                 another object ("opening": the loops are matched by arc length) or on its
                 surface ("surface": along the tube). The displacement of the end ring is
                 interpolated by the angle around the tube and fades out along it. An optional
                 endRadius first narrows a flared end (the curve point radius of the end points).
  seal-opening   Lays the border of an opening onto the surface of another object (closest
                 points, smoothed along the border); the displacement is harmonic within a given
                 distance from the border along the mesh. Suits openings whose edge is not flat,
                 e.g. with a step that a tube cannot follow.
  warp-curves    Moves the control points of a curve (and their handles) by a smooth field of
                 Gaussian radial basis functions computed by fit_external.py (external-fit.json,
                 identified by its SHA-256); a round may set its own sigma. Adapts the
                 Z-Anatomy intrarenal vessels, modelled for another kidney, to the kidneys placed
                 from HRA, and moves the ureters out of their neighbours.

Tubes and sealed objects are moved before their trailing Solidify modifiers, which are then
applied again, so walls keep their thickness. Coordinates in the fixes file are Blender world
coordinates of the source (metres, Z up); they only select the opening to work on.
"""

import hashlib
import heapq
import json
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import interpolate_bezier

KINDS = ("close-hole", "join-tube-end", "seal-opening", "warp-curves")
# Fields that document or check a fix and do not change the geometry.
DOCUMENTATION = ("reason", "note", "targets", "maxGap")
# An opening selected by a fix must be this close to the declared point.
SELECT_TOLERANCE = 0.01
# The open end of a tube must be this close to the end of its curve.
END_TOLERANCE = 0.005


class FixError(RuntimeError):
    """A declared fix cannot be applied to the source; the export stops."""


def load(path):
    with open(path, encoding="utf-8") as fh:
        fixes = json.load(fh)["fixes"]
    ids = [f["id"] for f in fixes]
    if len(set(ids)) != len(ids):
        raise FixError("geometry fixes: duplicate ids")
    for fix in fixes:
        if fix["kind"] not in KINDS:
            raise FixError(f"{fix['id']}: unknown kind {fix['kind']!r}")
    return fixes


def definitions(fixes):
    """What the geometry depends on: every fix without its documentation fields."""
    return [{k: v for k, v in fix.items() if k not in DOCUMENTATION} for fix in fixes]


# --- helpers -----------------------------------------------------------------------------------

def ordered_loops(bm):
    """Boundary loops of a BMesh as ordered lists of vertex indices."""
    edges_of = {}
    for e in bm.edges:
        if e.is_boundary:
            for v in e.verts:
                edges_of.setdefault(v.index, []).append(e)
    used = set()
    loops = []
    for edges in edges_of.values():
        for start in edges:
            if start.index in used:
                continue
            used.add(start.index)
            first, current = start.verts[0], start.verts[1]
            loop = [first.index]
            while current.index != first.index:
                loop.append(current.index)
                step = next((e for e in edges_of[current.index] if e.index not in used), None)
                if step is None:
                    break
                used.add(step.index)
                current = step.other_vert(current)
            loops.append(loop)
    return loops


def nearest_loop(bm, point, what):
    """Indices of the boundary loop whose centre is nearest to `point` (world space)."""
    best, best_distance = None, math.inf
    for loop in ordered_loops(bm):
        centre = np.array([list(bm.verts[i].co) for i in loop]).mean(axis=0)
        distance = float(np.linalg.norm(centre - point))
        if distance < best_distance:
            best, best_distance = loop, distance
    if best is None or best_distance > SELECT_TOLERANCE:
        raise FixError(f"{what}: no opening within {SELECT_TOLERANCE * 1000:.0f} mm of {[round(float(x), 4) for x in point]}")
    return best


def loop_frame(points):
    """Centre, mean radius and plane normal of a loop of points."""
    centre = points.mean(axis=0)
    radius = float(np.linalg.norm(points - centre, axis=1).mean())
    _, _, vt = np.linalg.svd(points - centre)
    return centre, radius, vt[2]


def perpendicular_frame(axis):
    helper = np.eye(3)[int(np.argmin(np.abs(axis)))]
    u = np.cross(axis, helper)
    u /= np.linalg.norm(u)
    return u, np.cross(axis, u)


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def periodic_interp(theta, knots, values):
    """Linear interpolation of vectors given at angles, periodic in 2π."""
    order = np.argsort(knots)
    k = knots[order]
    v = values[order]
    k = np.concatenate([k[-1:] - 2.0 * math.pi, k, k[:1] + 2.0 * math.pi])
    v = np.concatenate([v[-1:], v, v[:1]])
    return np.stack([np.interp(theta, k, v[:, c]) for c in range(v.shape[1])], axis=1)


def trailing_solidify(obj):
    """Solidify modifiers at the end of the stack (moved surfaces are solidified again)."""
    active = [m for m in obj.modifiers if m.show_viewport]
    tail = []
    for m in reversed(active):
        if m.type != "SOLIDIFY":
            break
        tail.insert(0, m)
    if any(m.type == "SOLIDIFY" for m in active[: len(active) - len(tail)]):
        raise FixError(f"{obj.name}: Solidify must be last in the modifier stack of a corrected object")
    return tail


def evaluated(obj, without=()):
    """Evaluated world-space mesh (bpy) of `obj`, with the given modifiers switched off."""
    for m in without:
        m.show_viewport = False
    try:
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=False, depsgraph=depsgraph)
    finally:
        for m in without:
            m.show_viewport = True
    mesh.transform(obj.matrix_world)
    return mesh


def to_bmesh(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    return bm


def coordinates(mesh):
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def face_normals(mesh):
    n = np.empty(len(mesh.polygons) * 3)
    mesh.polygons.foreach_get("normal", n)
    return n.reshape(-1, 3)


def neighbours_of(mesh):
    pairs = np.empty(len(mesh.edges) * 2, dtype=np.int64)
    mesh.edges.foreach_get("vertices", pairs)
    out = [[] for _ in range(len(mesh.vertices))]
    for a, b in pairs.reshape(-1, 2):
        out[a].append(b)
        out[b].append(a)
    return out


def mesh_tree(mesh, co=None):
    co = coordinates(mesh) if co is None else co
    return BVHTree.FromPolygons([Vector(c) for c in co], [tuple(p.vertices) for p in mesh.polygons])


def distances_to(tree, points):
    out = []
    for p in points:
        hit = tree.find_nearest(Vector(p))
        out.append(hit[3] if hit[0] is not None else math.inf)
    return np.array(out)


def gap_stats(d):
    return {"mean": round(float(d.mean()), 6), "max": round(float(d.max()), 6)}


def rounded(points):
    return [[round(float(x), 6) for x in p] for p in points]


def solidified(obj, mesh, modifiers):
    """`mesh` (world space) with copies of `obj`'s Solidify modifiers applied."""
    if not modifiers:
        return mesh
    scale = sum(obj.matrix_world.to_scale()) / 3.0
    helper = bpy.data.objects.new(f"{obj.name} (corrected)", mesh)
    bpy.context.scene.collection.objects.link(helper)
    for m in modifiers:
        copy = helper.modifiers.new(m.name, m.type)
        for prop in m.bl_rna.properties:
            if prop.is_readonly or prop.identifier in ("name", "type"):
                continue
            try:
                setattr(copy, prop.identifier, getattr(m, prop.identifier))
            except (AttributeError, TypeError):
                pass
        copy.thickness = m.thickness * scale
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    solid = bpy.data.meshes.new_from_object(helper.evaluated_get(depsgraph), preserve_all_data_layers=False, depsgraph=depsgraph)
    bpy.data.objects.remove(helper, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    return solid


# --- close-hole ----------------------------------------------------------------------------------

def close_hole(fix):
    obj = bpy.data.objects.get(fix["object"])
    if obj is None or obj.type != "MESH":
        raise FixError(f"{fix['id']}: mesh object {fix['object']!r} not found")
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    mw = obj.matrix_world
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()

    near = np.array(fix["near"], dtype=float)
    best, best_distance = None, math.inf
    for loop in ordered_loops(bm):
        centre = np.array([list(mw @ bm.verts[i].co) for i in loop]).mean(axis=0)
        distance = float(np.linalg.norm(centre - near))
        if distance < best_distance:
            best, best_distance = loop, distance
    if best is None or best_distance > SELECT_TOLERANCE:
        raise FixError(f"{fix['id']}: no opening of {fix['object']!r} near {fix['near']}")
    border = [bm.verts[i] for i in best]
    n = len(border)
    world_border = np.array([list(mw @ v.co) for v in border])
    centre, radius, _ = loop_frame(world_border)

    # New faces run along the old border opposite to the faces already there.
    edge = next(e for e in border[0].link_edges if e.is_boundary and e.other_vert(border[0]) is border[1])
    face = edge.link_faces[0]
    forward = any(l.vert is border[0] and l.link_loop_next.vert is border[1] for l in face.loops)
    material, smooth = face.material_index, face.smooth

    rings = int(fix.get("rings", 4))
    middle = sum((v.co for v in border), Vector()) / n
    added, created = [], []
    previous = border
    for k in range(1, rings + 1):
        t = k / (rings + 1)
        ring = [bm.verts.new(v.co.lerp(middle, t)) for v in border]
        added.extend(ring)
        for i in range(n):
            j = (i + 1) % n
            quad = (previous[j], previous[i], ring[i], ring[j]) if forward else (previous[i], previous[j], ring[j], ring[i])
            created.append(bm.faces.new(quad))
        previous = ring
    hub = bm.verts.new(middle)
    added.append(hub)
    for i in range(n):
        j = (i + 1) % n
        tri = (previous[j], previous[i], hub) if forward else (previous[i], previous[j], hub)
        created.append(bm.faces.new(tri))
    for f in created:
        f.material_index = material
        f.smooth = smooth
    bm.verts.index_update()

    # Positions: the discrete bi-Laplacian energy over the patch and the old border is minimised
    # with the surrounding surface fixed. The Laplacian uses finite-volume weights (dual edge
    # length over edge length, per dual area), which follow the shrinking rings of the patch;
    # they are taken from the current positions, and the solve is repeated twice with the result.
    unknown = {v.index: k for k, v in enumerate(added)}
    rows = added + border
    for _ in range(3):
        a = np.zeros((len(rows), len(added)))
        b = np.zeros((len(rows), 3))
        for r, v in enumerate(rows):
            area = sum(f.calc_area() / len(f.verts) for f in v.link_faces)
            scale = 1.0 / math.sqrt(max(area, 1e-12))
            for e in v.link_edges:
                middle_of_edge = (e.verts[0].co + e.verts[1].co) / 2.0
                dual = sum((f.calc_center_median() - middle_of_edge).length for f in e.link_faces)
                weight = scale * dual / max(e.calc_length(), 1e-12)
                u = e.other_vert(v)
                for w, coef in ((u, weight), (v, -weight)):
                    k = unknown.get(w.index)
                    if k is None:
                        b[r] -= coef * np.array(w.co)
                    else:
                        a[r, k] += coef
        solution, *_ = np.linalg.lstsq(a, b, rcond=None)
        for k, v in enumerate(added):
            v.co = Vector(solution[k])

    bm.normal_update()
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return {
        "id": fix["id"],
        "kind": "close-hole",
        "object": obj.name,
        "opening": {"vertices": n, "centre": rounded([centre])[0], "radius": round(radius, 6)},
        "added": {"vertices": len(added), "faces": len(created)},
        "seam": rounded(world_border),
    }


# --- join-tube-end -------------------------------------------------------------------------------

class TubeJoin:
    """Moves the end of a curve tube onto an opening or a surface of another object."""

    def __init__(self, fix, surfaces):
        self.fix = fix
        self.id = fix["id"]
        obj = bpy.data.objects.get(fix["object"])
        if obj is None or obj.type != "CURVE":
            raise FixError(f"{self.id}: curve object {fix['object']!r} not found")
        self.object = obj.name
        self.length = float(fix["blendLength"])
        if "endRadius" in fix:
            self._limit_end_radius(obj, fix["end"], float(fix["endRadius"]))
        self._centreline(obj, fix["end"])
        self.axis = self.line[0] - self.line[1]
        self.axis /= np.linalg.norm(self.axis)
        self.u, self.w = perpendicular_frame(self.axis)

        # The outer end ring: the open end of the bevelled surface before Solidify.
        sheet = evaluated(obj, trailing_solidify(obj))
        bm = to_bmesh(sheet)
        ring = np.array([list(bm.verts[i].co) for i in nearest_loop(bm, self.line[0], f"{self.id}: end of {self.object}")])
        bm.free()
        bpy.data.meshes.remove(sheet)
        s, centres = self._project(ring)
        if float(s.max()) > END_TOLERANCE:
            raise FixError(f"{self.id}: the open end of {self.object} is not at the end of its curve")
        self.ring = ring
        self.ring_angles = self._angles(ring, centres)
        self.reach = float(np.linalg.norm(ring - centres, axis=1).max())

        target = fix["target"]
        self.target_object = target["object"]
        self.target_kind = target["kind"]
        surface = surfaces.sheet(self.target_object)
        self.target_tree = BVHTree.FromBMesh(surface)
        if self.target_kind == "opening":
            opening = np.array([list(surface.verts[i].co) for i in nearest_loop(surface, np.array(target["near"], dtype=float), f"{self.id}: {self.target_object}")])
            goal = self._match_opening(ring, opening)
            self.seam = opening
        elif self.target_kind == "surface":
            goal = self._project_on_surface(ring, float(target.get("maxDistance", 0.03)))
            self.seam = goal
        else:
            raise FixError(f"{self.id}: unknown target kind {self.target_kind!r}")
        self.displacement = goal - ring
        self.before = None
        self.after = None

    def _centreline(self, obj, end):
        splines = obj.data.splines
        if len(splines) != 1 or splines[0].type != "BEZIER" or splines[0].use_cyclic_u:
            raise FixError(f"{self.id}: {obj.name} must be a single open Bézier spline")
        points = splines[0].bezier_points
        resolution = max(obj.data.resolution_u, 1) * 4
        line = []
        for a, b in zip(points[:-1], points[1:]):
            segment = interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, resolution + 1)
            line.extend(segment[1:] if line else segment)
        mw = obj.matrix_world
        line = np.array([list(mw @ p) for p in line])
        if end == "last":
            line = line[::-1]
        elif end != "first":
            raise FixError(f"{self.id}: end must be 'first' or 'last'")
        keep = np.concatenate([[True], np.linalg.norm(np.diff(line, axis=0), axis=1) > 1e-9])
        line = line[keep]
        arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))])
        # Only the part near the end matters; points further along project onto its far end.
        cut = int(np.searchsorted(arc, self.length + 0.02)) + 2
        self.line, self.arc = line[:cut], arc[:cut]

    def _project(self, points):
        """Arc length from the end and the nearest centreline point of each point."""
        a = self.line[:-1]
        ab = self.line[1:] - a
        lengths = np.linalg.norm(ab, axis=1)
        ap = points[:, None, :] - a[None, :, :]
        t = np.clip((ap * ab[None]).sum(axis=2) / (lengths ** 2)[None], 0.0, 1.0)
        nearest = a[None] + t[..., None] * ab[None]
        k = ((points[:, None, :] - nearest) ** 2).sum(axis=2).argmin(axis=1)
        idx = np.arange(len(points))
        return self.arc[k] + t[idx, k] * lengths[k], nearest[idx, k]

    def _angles(self, points, centres):
        r = points - centres
        r = r - np.outer(r @ self.axis, self.axis)
        return np.arctan2(r @ self.w, r @ self.u)

    def _winding(self, points):
        """Direction (±1) in which a loop goes around the tube axis."""
        x = (points - points.mean(axis=0)) @ self.u
        y = (points - points.mean(axis=0)) @ self.w
        return 1.0 if float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)) >= 0 else -1.0

    def _limit_end_radius(self, obj, end, radius):
        """Narrows a flared end: the points at that end whose radius exceeds `radius` take it."""
        points = list(obj.data.splines[0].bezier_points)
        if end == "last":
            points.reverse()
        changed = 0
        for point in points:
            if point.radius <= radius:
                break
            point.radius = radius
            changed += 1
        if changed == 0:
            raise FixError(f"{self.id}: the {end} end of {obj.name} is not wider than endRadius")
        bpy.context.view_layer.update()

    def _match_opening(self, ring, opening):
        """Points of the opening for the end ring vertices.

        Both loops are parametrised by arc length in the same direction around the tube; of all
        rotations of that correspondence, the one that moves the ring least is taken.
        """
        if self._winding(opening) != self._winding(ring):
            opening = opening[::-1]

        def parameters(points):
            lengths = np.linalg.norm(np.roll(points, -1, axis=0) - points, axis=1)
            return np.concatenate([[0.0], np.cumsum(lengths)[:-1]]) / lengths.sum()

        t_ring = parameters(ring)
        knots = np.concatenate([parameters(opening), [1.0]])
        closed = np.concatenate([opening, opening[:1]])

        def at(t):
            t = np.mod(t, 1.0)
            return np.stack([np.interp(t, knots, closed[:, c]) for c in range(3)], axis=1)

        offsets = np.linspace(0.0, 1.0, 1440, endpoint=False)
        costs = [float(np.sum((at(t_ring + o) - ring) ** 2)) for o in offsets]
        return at(t_ring + offsets[int(np.argmin(costs))])

    def _project_on_surface(self, ring, max_distance):
        """Where the lines along the tube through the end ring meet the target surface."""
        out = []
        for p in ring:
            hits = []
            for direction in (self.axis, -self.axis):
                hit = self.target_tree.ray_cast(Vector(p), Vector(direction), max_distance)
                if hit[0] is not None:
                    hits.append((hit[3], np.array(hit[0])))
            if not hits:
                raise FixError(f"{self.id}: {self.target_object} is not within {max_distance * 1000:.0f} mm along the tube")
            out.append(min(hits, key=lambda h: h[0])[1])
        return np.array(out)

    def _zone(self, co, neighbours):
        """Vertices reached from the end through the mesh while still within the blend length."""
        near = np.where(np.linalg.norm(co - self.line[0], axis=1) < self.length + self.reach + 0.01)[0]
        s = np.full(len(co), np.inf)
        centres = np.zeros_like(co)
        if len(near):
            s[near], centres[near] = self._project(co[near])
        radial = np.linalg.norm(co - centres, axis=1)
        allowed = (s < self.length) & (radial < 2.0 * self.reach)
        seeds = [int(i) for i in near if s[i] < 0.001 and allowed[i]]
        zone = set(seeds)
        stack = list(seeds)
        while stack:
            v = stack.pop()
            for u in neighbours[v]:
                if u not in zone and allowed[u]:
                    zone.add(u)
                    stack.append(u)
        idx = np.array(sorted(zone), dtype=np.int64)
        return idx, s[idx], centres[idx]

    def apply(self, mesh, co, neighbours):
        """Moved copy of the vertex positions of the tube's bevelled surface."""
        self.before = self.measure(mesh_tree(mesh, co), self.ring)
        idx, s, centres = self._zone(co, neighbours)
        out = co.copy()
        if len(idx):
            angles = self._angles(co[idx], centres)
            weight = smoothstep(1.0 - s / self.length)
            out[idx] += weight[:, None] * periodic_interp(angles, self.ring_angles, self.displacement)
        return out

    def measure(self, tree, ring):
        """Gap across the seam: the opening to the tube, or the end ring to the target surface."""
        if self.target_kind == "opening":
            return gap_stats(distances_to(tree, self.seam))
        return gap_stats(distances_to(self.target_tree, ring))

    def finish(self, mesh, co):
        self.after = self.measure(mesh_tree(mesh, co), self.ring + self.displacement)

    def report(self):
        return {
            "id": self.id,
            "kind": "join-tube-end",
            "object": self.object,
            "end": self.fix["end"],
            "target": {"object": self.target_object, "kind": self.target_kind},
            "blendLength": self.length,
            "moved": round(float(np.linalg.norm(self.displacement, axis=1).max()), 6),
            "gapBefore": self.before,
            "gapAfter": self.after,
            "seam": rounded(self.seam),
        }


# --- seal-opening --------------------------------------------------------------------------------

class OpeningSeal:
    """Lays the border of an opening onto the surface of another object."""

    def __init__(self, fix, surfaces):
        self.fix = fix
        self.id = fix["id"]
        obj = bpy.data.objects.get(fix["object"])
        if obj is None or obj.type != "MESH":
            raise FixError(f"{self.id}: mesh object {fix['object']!r} not found")
        self.object = obj.name
        self.onto = fix["onto"]
        self.falloff = float(fix["falloff"])
        self.smoothing = int(fix.get("smoothing", 3))
        self.near = np.array(fix["near"], dtype=float)
        self.onto_tree = BVHTree.FromBMesh(surfaces.final(self.onto))
        self.before = None
        self.after = None
        self.seam = None
        self.moved = 0.0

    def _closest(self, points):
        out = []
        for p in points:
            hit = self.onto_tree.find_nearest(Vector(p))
            if hit[0] is None:
                raise FixError(f"{self.id}: {self.onto} has no surface")
            out.append(list(hit[0]))
        return np.array(out)

    def apply(self, mesh, co, neighbours):
        bm = to_bmesh(mesh)
        border = nearest_loop(bm, self.near, f"{self.id}: {self.object}")
        bm.free()
        points = co[border]
        # Closest points of the surface; the moves are then smoothed along the border and put
        # back on the surface, so corners of the border do not fold the seam back on itself.
        goal = self._closest(points)
        for _ in range(self.smoothing):
            moves = goal - points
            moves = (np.roll(moves, 2, axis=0) + np.roll(moves, 1, axis=0) + moves + np.roll(moves, -1, axis=0) + np.roll(moves, -2, axis=0)) / 5.0
            goal = self._closest(points + moves)
        displacement = goal - points
        self.before = gap_stats(distances_to(self.onto_tree, points))
        self.moved = float(np.linalg.norm(displacement, axis=1).max())

        # The vertices within `falloff` of the border along the mesh move; their displacement
        # is harmonic: the border's displacement on the border, zero just outside the region.
        distance = {int(v): 0.0 for v in border}
        queue = [(0.0, int(v)) for v in border]
        heapq.heapify(queue)
        while queue:
            d, v = heapq.heappop(queue)
            if d > distance.get(v, math.inf):
                continue
            for u in neighbours[v]:
                nd = d + float(np.linalg.norm(co[u] - co[v]))
                if nd < self.falloff and nd < distance.get(u, math.inf):
                    distance[u] = nd
                    heapq.heappush(queue, (nd, u))
        fixed = {int(v): displacement[k] for k, v in enumerate(border)}
        free = [v for v in distance if v not in fixed]
        index = {v: k for k, v in enumerate(free)}
        a = np.zeros((len(free), len(free)))
        b = np.zeros((len(free), 3))
        for k, v in enumerate(free):
            a[k, k] = len(neighbours[v])
            for u in neighbours[v]:
                if u in index:
                    a[k, index[u]] -= 1.0
                elif u in fixed:
                    b[k] += fixed[u]
        out = co.copy()
        if free:
            solution = np.linalg.solve(a, b)
            for k, v in enumerate(free):
                out[v] += solution[k]
        for v, d in fixed.items():
            out[v] += d
        self.seam = out[border]
        return out

    def finish(self, mesh, co):
        self.after = gap_stats(distances_to(self.onto_tree, self.seam))

    def report(self):
        return {
            "id": self.id,
            "kind": "seal-opening",
            "object": self.object,
            "onto": self.onto,
            "falloff": self.falloff,
            "moved": round(self.moved, 6),
            "gapBefore": self.before,
            "gapAfter": self.after,
            "seam": rounded(self.seam),
        }


# --- driver --------------------------------------------------------------------------------------

class Surfaces:
    """World-space surfaces of objects, with corrections already made taken into account."""

    def __init__(self):
        self.corrected = {}

    def sheet(self, name):
        """Surface before trailing Solidify (the outer surface of a wall made by Solidify)."""
        obj = bpy.data.objects[name]
        mesh = evaluated(obj, trailing_solidify(obj))
        bm = to_bmesh(mesh)
        bpy.data.meshes.remove(mesh)
        return bm

    def final(self, name):
        mesh = self.corrected.get(name)
        if mesh is not None:
            return to_bmesh(mesh)
        mesh = evaluated(bpy.data.objects[name])
        bm = to_bmesh(mesh)
        bpy.data.meshes.remove(mesh)
        return bm


def correct(obj, corrections):
    """World-space evaluated mesh of `obj` with its corrections applied."""
    solidify = trailing_solidify(obj)
    mesh = evaluated(obj, solidify)
    co = coordinates(mesh)
    neighbours = neighbours_of(mesh)
    before = face_normals(mesh)
    for c in corrections:
        co = c.apply(mesh, co, neighbours)
    mesh.vertices.foreach_set("co", co.ravel())
    mesh.update()
    flipped = int(((before * face_normals(mesh)).sum(axis=1) < 0).sum())
    if flipped:
        raise FixError(f"{obj.name}: {flipped} faces turned over by {', '.join(c.id for c in corrections)}")
    for c in corrections:
        c.finish(mesh, co)
    return solidified(obj, mesh, solidify)


def field_digest(field):
    """SHA-256 of a warp field in canonical JSON (the fix declares it, so a refit is noticed)."""
    return hashlib.sha256(json.dumps(field, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def warp_curves(fix, fields):
    """Moves the control points and handles of a curve by a declared smooth field: Gaussian radial
    basis functions applied in rounds (each round to the result of the previous one)."""
    field = (fields or {}).get(fix["field"])
    if field is None:
        raise FixError(f"{fix['id']}: field {fix['field']!r} not found (external-fit.json curveWarps)")
    if field_digest(field) != fix["fieldSha256"]:
        raise FixError(f"{fix['id']}: field {fix['field']!r} differs from the declared fieldSha256; update the fix")
    obj = bpy.data.objects.get(fix["object"])
    if obj is None or obj.type != "CURVE":
        raise FixError(f"{fix['id']}: {fix['object']} is not a curve object")
    mw = obj.matrix_world
    inv = mw.inverted()
    refs = []
    for spline in obj.data.splines:
        if spline.type == "BEZIER":
            for bp in spline.bezier_points:
                bp.handle_left_type = "FREE"
                bp.handle_right_type = "FREE"
                refs.extend([(bp, "co"), (bp, "handle_left"), (bp, "handle_right")])
        else:
            refs.extend((p, "point") for p in spline.points)
    world = np.array([(mw @ (Vector(getattr(o, a)[:]) if a != "point" else o.co.xyz))[:] for o, a in refs])
    moved = world.copy()
    for rnd in field["rounds"]:
        sigma = float(rnd.get("sigma", field["sigma"]))
        centres = np.array(rnd["centres"])
        weights = np.array(rnd["weights"])
        d2 = ((moved[:, None, :] - centres[None, :, :]) ** 2).sum(-1)
        moved = moved + np.exp(-d2 / (2 * sigma * sigma)) @ weights
    for (o, a), co in zip(refs, moved):
        local = inv @ Vector(co.tolist())
        if a == "point":
            o.co = (local.x, local.y, local.z, o.co.w)
        else:
            setattr(o, a, local)
    return {"id": fix["id"], "kind": "warp-curves", "object": fix["object"],
            "maxDisplacement": float(np.linalg.norm(moved - world, axis=1).max()), "seam": []}


def prepare(fixes, fields=None):
    """Applies the declared fixes.

    Base meshes and curves are changed in place; for tubes and sealed openings the corrected
    world-space meshes are returned. Returns (reports, meshes): the export uses `meshes[name]`
    instead of evaluating those objects. `fields` holds the warp fields of warp-curves fixes.
    """
    reports = [close_hole(f) for f in fixes if f["kind"] == "close-hole"]
    reports.extend(warp_curves(f, fields) for f in fixes if f["kind"] == "warp-curves")
    bpy.context.view_layer.update()
    surfaces = Surfaces()
    # Tubes first: seals are laid onto the corrected tubes.
    for kind, cls in (("join-tube-end", TubeJoin), ("seal-opening", OpeningSeal)):
        corrections = [cls(f, surfaces) for f in fixes if f["kind"] == kind]
        for name in dict.fromkeys(c.object for c in corrections):
            if name in surfaces.corrected:
                raise FixError(f"{name}: an object is corrected by one kind of fix only")
            surfaces.corrected[name] = correct(bpy.data.objects[name], [c for c in corrections if c.object == name])
        reports.extend(c.report() for c in corrections)
    bpy.context.view_layer.update()
    order = {f["id"]: i for i, f in enumerate(fixes)}
    reports.sort(key=lambda r: order[r["id"]])
    return reports, surfaces.corrected
