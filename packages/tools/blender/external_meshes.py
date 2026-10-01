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
"""Models from other open sources, placed into the Z-Anatomy scene before the export.

Declared in packages/data/sources/external.json (what goes where) and external-fit.json (the
transforms and the labyrinth parts computed by fit_external.py). The step removes the snapshot
objects it replaces, adds sided group labels ("Cochlea.l.g") and creates one mesh object per
declared structure:

  - GLB files are read directly (no importer): node transforms are composed, meshes of the listed
    nodes are merged and exact duplicate vertices welded; glTF Y-up becomes Blender Z-up;
  - PLY files (ASCII, millimetres) are scaled to metres;
  - the declared 4x4 transform places the geometry in the scene (a mirroring transform also
    reverses the triangle winding), followed by its warp field where there is one (the kidney
    impressions);
  - a labyrinth part keeps the triangles of its label after the declared plane cuts;
  - "clearOf" keeps a thin layer at a distance outside the surface it lies on (the HRA fibrous
    capsule lies 0.1-0.3 mm from the cortex, and coincident surfaces flicker when rendered).

Every created object carries an "svitylo_external" property that the export writes to
export.json (asset, source, names), so the build can credit it and name it.
"""

import json
import os
import struct

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


class ExternalError(Exception):
    pass


def load(spec_path, fit_path):
    with open(spec_path, encoding="utf-8") as fh:
        spec = json.load(fh)
    with open(fit_path, encoding="utf-8") as fh:
        fit = json.load(fh)
    return spec, fit


# ---------------------------------------------------------------- readers

def read_glb(path, nodes):
    """World-space triangles of the named nodes (Blender axes, metres), merged and welded."""
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _version, _length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ExternalError(f"{path}: not a GLB file")
    json_len, _ = struct.unpack_from("<I4s", data, 12)
    gltf = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8
    blob = data[bin_start:]
    if gltf.get("extensionsUsed"):
        raise ExternalError(f"{path}: extensions are not supported: {gltf['extensionsUsed']}")

    def accessor(i):
        acc = gltf["accessors"][i]
        view = gltf["bufferViews"][acc["bufferView"]]
        dtype = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[acc["componentType"]]
        width = {"SCALAR": 1, "VEC3": 3}[acc["type"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = view.get("byteStride")
        count = acc["count"]
        if stride and stride != width * np.dtype(dtype).itemsize:
            raw = np.frombuffer(blob, dtype=np.uint8, count=stride * count, offset=start).reshape(count, stride)
            arr = raw[:, : width * np.dtype(dtype).itemsize].copy().view(dtype)
        else:
            arr = np.frombuffer(blob, dtype=dtype, count=count * width, offset=start)
        return arr.reshape(count, width) if width > 1 else arr

    def local_matrix(node):
        if "matrix" in node:
            return np.array(node["matrix"], dtype=np.float64).reshape(4, 4).T
        t = np.array(node.get("translation", [0, 0, 0]), dtype=np.float64)
        x, y, z, w = node.get("rotation", [0, 0, 0, 1])
        r = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ])
        s = np.array(node.get("scale", [1, 1, 1]), dtype=np.float64)
        m = np.eye(4)
        m[:3, :3] = r * s
        m[:3, 3] = t
        return m

    world = {}

    def visit(i, parent):
        m = parent @ local_matrix(gltf["nodes"][i])
        world[i] = m
        for c in gltf["nodes"][i].get("children", []):
            visit(c, m)

    for scene in gltf.get("scenes", []):
        for i in scene.get("nodes", []):
            visit(i, np.eye(4))
    by_name = {n.get("name"): i for i, n in enumerate(gltf["nodes"])}
    positions, triangles, base = [], [], 0
    for name in nodes:
        if name not in by_name:
            raise ExternalError(f"{path}: node not found: {name}")
        i = by_name[name]
        node = gltf["nodes"][i]
        if "mesh" not in node:
            raise ExternalError(f"{path}: node has no mesh: {name}")
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            if prim.get("mode", 4) != 4:
                raise ExternalError(f"{path}: {name}: only triangle primitives are supported")
            pos = accessor(prim["attributes"]["POSITION"]).astype(np.float64)
            idx = accessor(prim["indices"]).astype(np.int64).reshape(-1, 3) if "indices" in prim else np.arange(len(pos)).reshape(-1, 3)
            m = world[i]
            pos = pos @ m[:3, :3].T + m[:3, 3]
            if np.linalg.det(m[:3, :3]) < 0:
                idx = idx[:, ::-1]
            positions.append(pos)
            triangles.append(idx + base)
            base += len(pos)
    pos = np.concatenate(positions)
    tri = np.concatenate(triangles)
    # glTF Y-up (x, y, z) → Blender Z-up (x, -z, y).
    pos = np.stack([pos[:, 0], -pos[:, 2], pos[:, 1]], axis=1)
    return weld(pos, tri)


def glb_node_names(path):
    """Names of the nodes of a GLB file."""
    with open(path, "rb") as fh:
        data = fh.read()
    json_len, _ = struct.unpack_from("<I4s", data, 12)
    return {n.get("name") for n in json.loads(data[20:20 + json_len])["nodes"]}


def read_ply(path, scale):
    with open(path, encoding="ascii") as fh:
        nv = nf = 0
        while True:
            line = fh.readline()
            if not line:
                raise ExternalError(f"{path}: truncated header")
            line = line.strip()
            if line.startswith("format") and "ascii" not in line:
                raise ExternalError(f"{path}: only ASCII PLY files are supported")
            if line.startswith("element vertex"):
                nv = int(line.split()[-1])
            elif line.startswith("element face"):
                nf = int(line.split()[-1])
            elif line == "end_header":
                break
        pos = np.array([[float(x) for x in fh.readline().split()[:3]] for _ in range(nv)], dtype=np.float64) * scale
        tri = []
        for _ in range(nf):
            row = fh.readline().split()
            if row[0] != "3":
                raise ExternalError(f"{path}: only triangles are supported")
            tri.append([int(row[1]), int(row[2]), int(row[3])])
    return pos, np.array(tri, dtype=np.int64)


def weld(pos, tri):
    uniq, inverse = np.unique(pos, axis=0, return_inverse=True)
    tri = inverse.reshape(-1)[tri]
    keep = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
    return uniq, tri[keep]


# ---------------------------------------------------------------- labyrinth parts

def labyrinth_part(pos, tri, parts, code):
    """Triangles of one labyrinth part after the declared plane cuts (specimen frame)."""
    labels = np.array([int(c) for c in parts["labels"]], dtype=np.int64)
    if len(labels) != len(tri):
        raise ExternalError(f"labyrinth labels: {len(labels)} for {len(tri)} triangles")
    bm = bmesh.new()
    verts = [bm.verts.new(p.tolist()) for p in pos]
    layer = bm.faces.layers.int.new("part")
    for t, lab in zip(tri, labels):
        f = bm.faces.new((verts[t[0]], verts[t[1]], verts[t[2]]))
        f[layer] = int(lab)
    bm.faces.ensure_lookup_table()
    for cut in parts["cuts"]:
        a, b = cut["between"]
        point = np.array(cut["point"])
        normal = np.array(cut["normal"])
        near = [f for f in bm.faces
                if f[layer] in (a, b)
                and np.linalg.norm(np.array(f.calc_center_median()[:]) - point) < cut["radius"]]
        geom = list({e for f in near for e in f.edges}) + near + list({v for f in near for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=point.tolist(), plane_no=normal.tolist())
        for f in bm.faces:
            if f[layer] not in (a, b):
                continue
            c = np.array(f.calc_center_median()[:])
            if np.linalg.norm(c - point) >= cut["radius"] or abs((c - point) @ normal) > cut["band"]:
                continue
            f[layer] = a if (c - point) @ normal > 0 else b
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    keep = [f for f in bm.faces if f[layer] == code]
    bm.verts.index_update()
    bm.verts.ensure_lookup_table()
    used = sorted({v.index for f in keep for v in f.verts})
    remap = {old: new for new, old in enumerate(used)}
    out_pos = np.array([bm.verts[i].co[:] for i in used]) if used else np.zeros((0, 3))
    out_tri = np.array([[remap[v.index] for v in f.verts] for f in keep], dtype=np.int64)
    bm.free()
    return out_pos, out_tri


def warp_points(points, field):
    """Moves points by a smooth field: Gaussian radial basis functions in rounds, each applied to
    the result of the previous one (a round may set its own sigma)."""
    out = np.array(points, dtype=np.float64)
    for rnd in field.get("rounds", []):
        centres = np.array(rnd["centres"], dtype=np.float64)
        weights = np.array(rnd["weights"], dtype=np.float64)
        sigma = float(rnd.get("sigma", field["sigma"]))
        for i in range(0, len(out), 4096):
            d2 = ((out[i:i + 4096, None, :] - centres[None, :, :]) ** 2).sum(-1)
            out[i:i + 4096] += np.exp(-d2 / (2 * sigma * sigma)) @ weights
    return out


def keep_clear(obj, other, distance):
    """Moves the vertices of `obj` that face the same way as the nearest part of `other`'s surface
    to at least `distance` outside it, along its normal; returns how many moved and how far."""
    ref = other.data
    orient = 1.0 if signed_volume(ref) >= 0 else -1.0
    tree = BVHTree.FromPolygons([v.co[:] for v in ref.vertices], [p.vertices[:] for p in ref.polygons])
    mesh = obj.data
    flip = 1.0 if signed_volume(mesh) >= 0 else -1.0
    moved, largest = 0, 0.0
    for v in mesh.vertices:
        loc, nor, _i, _d = tree.find_nearest(v.co)
        if loc is None:
            continue
        nor = nor * orient
        if (v.normal * flip).dot(nor) < 0.5:
            continue
        gap = (v.co - loc).dot(nor)
        if gap < distance:
            v.co = v.co + nor * (distance - gap)
            moved += 1
            largest = max(largest, distance - gap)
    mesh.update()
    return moved, largest


def signed_volume(mesh):
    """Six times the signed volume enclosed by a mesh (> 0 when its faces point outwards)."""
    co = [v.co for v in mesh.vertices]
    total = 0.0
    for p in mesh.polygons:
        a = co[p.vertices[0]]
        for i in range(1, len(p.vertices) - 1):
            total += a.dot(co[p.vertices[i]].cross(co[p.vertices[i + 1]]))
    return total


# ---------------------------------------------------------------- scene changes

def apply(spec, fit, source_dir):
    """Replaces the declared snapshot objects; returns a report for export.json."""
    removed = []
    for name in spec["remove"]:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise ExternalError(f"object to replace not found in the snapshot: {name}")
        for child in list(obj.children):
            child.parent = None
        bpy.data.objects.remove(obj, do_unlink=True)
        removed.append(name)

    def collection(name):
        col = bpy.data.collections.get(name)
        if col is None:
            raise ExternalError(f"collection not found: {name}")
        return col

    def parent_to(obj, parent_name):
        parent = bpy.data.objects.get(parent_name)
        if parent is None:
            raise ExternalError(f"parent not found: {parent_name}")
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()

    for group in spec["groups"]:
        if bpy.data.objects.get(group["name"]) is not None:
            raise ExternalError(f"group already exists: {group['name']}")
        empty = bpy.data.objects.new(group["name"], None)
        collection(group["system"]).objects.link(empty)
        parent_to(empty, group["parent"])
        empty["svitylo_external"] = json.dumps({"group": True})

    cache = {}
    created = []
    for spec_obj in spec["objects"]:
        src = spec_obj["source"]
        key = json.dumps(src, sort_keys=True)
        if key not in cache:
            path = os.path.join(source_dir, src["file"])
            if src["file"].endswith(".glb"):
                cache[key] = read_glb(path, src["nodes"])
            else:
                cache[key] = read_ply(path, src.get("scale", 1.0))
        pos, tri = cache[key]
        if "labyrinthPart" in spec_obj:
            parts = fit["labyrinth"]
            pos, tri = labyrinth_part(pos, tri, parts, parts["names"].index(spec_obj["labyrinthPart"]))
        placement = fit["transforms"][spec_obj["transform"]]
        m = np.array(placement["matrix"], dtype=np.float64)
        world = pos @ m[:3, :3].T + m[:3, 3]
        if "warp" in placement:
            world = warp_points(world, placement["warp"])
        if np.linalg.det(m[:3, :3]) < 0:
            tri = tri[:, ::-1]
        if bpy.data.objects.get(spec_obj["name"]) is not None:
            raise ExternalError(f"object already exists: {spec_obj['name']}")
        mesh = bpy.data.meshes.new(spec_obj["name"])
        mesh.from_pydata(world.tolist(), [], tri.tolist())
        mesh.validate(verbose=False)
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        material = bpy.data.materials.get(spec_obj["material"]) or bpy.data.materials.new(spec_obj["material"])
        mesh.materials.append(material)
        obj = bpy.data.objects.new(spec_obj["name"], mesh)
        collection(spec_obj["system"]).objects.link(obj)
        parent_to(obj, spec_obj["parent"])
        obj["svitylo_external"] = json.dumps({
            "asset": spec_obj["asset"],
            "source": spec_obj["credit"],
            **({"en": spec_obj["en"]} if "en" in spec_obj else {}),
            **({"la": spec_obj["la"]} if "la" in spec_obj else {}),
        })
        created.append({"name": spec_obj["name"], "triangles": int(len(tri))})
    # After all objects exist: thin layers kept clear of the surface they lie on.
    for spec_obj, record in zip(spec["objects"], created):
        if "clearOf" in spec_obj:
            other = bpy.data.objects.get(spec_obj["clearOf"]["object"])
            if other is None or other.type != "MESH":
                raise ExternalError(f"{spec_obj['name']}: clearOf object not found: {spec_obj['clearOf']['object']}")
            moved, largest = keep_clear(bpy.data.objects[spec_obj["name"]], other, float(spec_obj["clearOf"]["distance"]))
            record["clearOf"] = {"object": other.name, "verticesMoved": moved, "largestMove": round(largest, 6)}
    return {"removed": removed, "groups": [g["name"] for g in spec["groups"]], "objects": created}
