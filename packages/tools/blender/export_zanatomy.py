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
"""Headless Blender export of the Z-Anatomy template (Startup.blend).

Usage:
  blender -t 1 -b Startup.blend --python export_zanatomy.py -- --out <dir> [--subsurf-max 1]
                                                                [--fixes geometry-fixes.json]
                                                                [--external external.json
                                                                 --external-fit external-fit.json
                                                                 --external-dir <dir>]

One thread (-t 1) keeps the export byte-reproducible: with several, Blender varies the last bit
of some normals from run to run.

For every mesh or curve object of the nine system collections the script evaluates the
object (modifiers applied, subdivision capped at --subsurf-max, curves converted to their
bevelled surface), bakes the world transform and writes indexed triangle geometry:

  <dir>/geometry-<system>.bin   little-endian blobs per object:
                                positions float32[3n], normals float32[3n],
                                indices uint32[3t], triangle material slots uint16[t]
  <dir>/export.json             inventory with offsets, source names, collections,
                                source parent chains, material slots, bounds, skipped
                                objects and material colours.

Coordinates stay in Blender space (Z up, -Y front, metres); the Node pipeline converts them.
The script does not rename or reinterpret anatomy: stable IDs, licence rules and splitting
are applied later, so this step stays a thin and reproducible conversion. The only changes of
the source geometry are the corrections declared in --fixes (geometry_fixes.py); export.json
records the geometric part of every declared fix and what each one did. Models from other open
sources (--external, external_meshes.py) replace the declared snapshot objects first; their
records carry an "external" entry (licence asset, credit, names).
"""

import json
import os
import sys

import bpy
import numpy as np

sys.dont_write_bytecode = True  # no __pycache__ next to the scripts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import external_meshes  # noqa: E402
import geometry_fixes  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in argv:
        return argv[argv.index(name) + 1]
    return default


OUT = os.path.abspath(arg("--out", "export"))
SUBSURF_MAX = int(arg("--subsurf-max", "1"))
FIXES = arg("--fixes")
EXTERNAL = arg("--external")
EXTERNAL_FIT = arg("--external-fit")
EXTERNAL_DIR = arg("--external-dir")
SYSTEM_PREFIXES = tuple(f"{i}:" for i in range(1, 10))

os.makedirs(OUT, exist_ok=True)
view_layer = bpy.context.view_layer


def system_collection(obj):
    for c in obj.users_collection:
        if c.name.startswith(SYSTEM_PREFIXES):
            return c.name
    return None


def unhide(lc):
    lc.exclude = False
    lc.hide_viewport = False
    lc.collection.hide_viewport = False
    for child in lc.children:
        unhide(child)


for lc in view_layer.layer_collection.children:
    if lc.name.startswith(SYSTEM_PREFIXES):
        unhide(lc)

for obj in bpy.data.objects:
    if system_collection(obj):
        obj.hide_viewport = False
        try:
            obj.hide_set(False)
        except RuntimeError:
            pass
        for mod in obj.modifiers:
            if mod.type == "SUBSURF":
                mod.levels = min(mod.levels, SUBSURF_MAX)

# Models from other open sources replace the declared snapshot objects (before the corrections,
# which may refer to them).
external_report = None
if EXTERNAL:
    spec, fit = external_meshes.load(EXTERNAL, EXTERNAL_FIT)
    external_report = external_meshes.apply(spec, fit, EXTERNAL_DIR)
    print(f"external: {len(external_report['removed'])} replaced, {len(external_report['objects'])} objects, "
          f"{len(external_report['groups'])} groups")


def external_of(obj):
    raw = obj.get("svitylo_external")
    return json.loads(raw) if raw else None


# Declared corrections: base meshes are changed in place; tubes and sealed openings come back
# as corrected world-space meshes that replace their evaluation below.
fixes = geometry_fixes.load(FIXES) if FIXES else []
fix_reports, corrected = geometry_fixes.prepare(fixes, fit.get("curveWarps") if EXTERNAL else None) if fixes else ([], {})
for report in fix_reports:
    print(f"fix {report['id']}: {json.dumps({k: v for k, v in report.items() if k != 'seam'})}")

view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()

materials = {}
for mat in bpy.data.materials:
    base = None
    if mat.use_nodes and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                base = list(node.inputs["Base Color"].default_value)
                break
    materials[mat.name] = {"viewport": list(mat.diffuse_color), "principled": base}


def parent_chain(obj):
    chain = []
    p = obj.parent
    while p is not None:
        chain.append(p.name)
        p = p.parent
    return chain


def mesh_arrays(mesh):
    """Indexed triangles with split (corner) normals, welded by (vertex, normal)."""
    mesh.calc_loop_triangles()
    if hasattr(mesh, "calc_normals_split"):
        mesh.calc_normals_split()
    n_verts = len(mesh.vertices)
    n_loops = len(mesh.loops)
    n_tris = len(mesh.loop_triangles)
    co = np.empty(n_verts * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    loop_vi = np.empty(n_loops, dtype=np.int64)
    mesh.loops.foreach_get("vertex_index", loop_vi)
    loop_n = np.empty(n_loops * 3, dtype=np.float32)
    if hasattr(mesh, "corner_normals"):
        mesh.corner_normals.foreach_get("vector", loop_n)
    else:
        mesh.loops.foreach_get("normal", loop_n)
    loop_n = loop_n.reshape(-1, 3)
    tri_loops = np.empty(n_tris * 3, dtype=np.int64)
    mesh.loop_triangles.foreach_get("loops", tri_loops)
    tri_mat = np.empty(n_tris, dtype=np.int64)
    mesh.loop_triangles.foreach_get("material_index", tri_mat)
    # Blender's Boolean modifier can leave uninitialised material indices on the faces it makes
    # (the ethmoid bone); they take the object's first material, so the export stays reproducible.
    tri_mat[(tri_mat < 0) | (tri_mat >= max(len(mesh.materials), 1))] = 0

    quant = np.round(loop_n * 4096.0).astype(np.int64)
    keys = np.stack([loop_vi, quant[:, 0], quant[:, 1], quant[:, 2]], axis=1)
    uniq, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    positions = co[uniq[:, 0]].astype(np.float32)
    normals = loop_n[first].astype(np.float32)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = np.where(lengths > 1e-8, normals / np.maximum(lengths, 1e-8), np.array([0.0, 0.0, 1.0], np.float32))
    indices = inverse[tri_loops].astype(np.uint32)
    return positions, normals.astype(np.float32), indices, tri_mat.astype(np.uint16)


records = []
skipped = []
handles = {}

# Label objects named "<Group>.g" carry the logical hierarchy of each system collection.
groups = []
for obj in bpy.data.objects:
    sys_name = system_collection(obj)
    if sys_name and obj.name.endswith(".g"):
        group = {"name": obj.name, "type": obj.type, "system": sys_name, "parents": parent_chain(obj)}
        if external_of(obj):
            group["external"] = True
        groups.append(group)

for obj in list(bpy.data.objects):
    sys_name = system_collection(obj)
    if not sys_name or obj.type not in ("MESH", "CURVE"):
        continue
    name = obj.name
    slots = [m.name if m else None for m in obj.data.materials]
    if name.endswith(".g") or "Text" in slots:
        skipped.append({"name": name, "system": sys_name, "reason": "label"})
        continue
    mesh = corrected.pop(name, None)
    if mesh is None:
        evaluated = obj.evaluated_get(depsgraph)
        try:
            mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=False, depsgraph=depsgraph)
        except RuntimeError as err:
            skipped.append({"name": name, "system": sys_name, "reason": f"evaluate-failed: {err}"})
            continue
        mesh.transform(obj.matrix_world)
    if len(mesh.polygons) == 0:
        bpy.data.meshes.remove(mesh)
        skipped.append({"name": name, "system": sys_name, "reason": "no-geometry"})
        continue
    mesh.validate(verbose=False)
    try:
        positions, normals, indices, tri_mat = mesh_arrays(mesh)
    except Exception as err:  # noqa: BLE001 - keep exporting, report the object
        skipped.append({"name": name, "system": sys_name, "reason": f"geometry-failed: {err}"})
        bpy.data.meshes.remove(mesh)
        continue
    mesh_slots = [m.name if m else None for m in mesh.materials]
    bpy.data.meshes.remove(mesh)
    if len(indices) == 0:
        skipped.append({"name": name, "system": sys_name, "reason": "no-triangles"})
        continue

    sys_key = sys_name.split(":")[0]
    fname = f"geometry-{sys_key}.bin"
    fh = handles.get(fname)
    if fh is None:
        fh = open(os.path.join(OUT, fname), "wb")
        handles[fname] = fh
    offset = fh.tell()
    for arr in (positions, normals, indices, tri_mat):
        fh.write(arr.astype(arr.dtype.newbyteorder("<")).tobytes())
    pad = (-fh.tell()) % 4
    if pad:
        fh.write(b"\0" * pad)

    records.append({
        "name": name,
        "type": obj.type,
        "system": sys_name,
        "parents": parent_chain(obj),
        "materials": mesh_slots,
        "vertices": int(len(positions)),
        "triangles": int(len(indices) // 3),
        "file": fname,
        "offset": int(offset),
        "bboxBlender": [float(v) for v in positions.min(axis=0)] + [float(v) for v in positions.max(axis=0)],
        **({"external": external_of(obj)} if external_of(obj) else {}),
    })

for fh in handles.values():
    fh.close()

if corrected:
    raise geometry_fixes.FixError(f"corrected objects that were not exported: {sorted(corrected)}")

with open(os.path.join(OUT, "export.json"), "w", encoding="utf-8") as out:
    json.dump({
        "blender": bpy.app.version_string,
        "subsurfMax": SUBSURF_MAX,
        "layout": "positions:f32x3,normals:f32x3,indices:u32x3,triangleMaterials:u16 (pad to 4)",
        "objects": records,
        "groups": groups,
        "skipped": skipped,
        "materials": materials,
        "fixes": {"definitions": geometry_fixes.definitions(fixes), "applied": fix_reports},
        **({"external": external_report} if external_report else {}),
    }, out, ensure_ascii=False, indent=1)

print(f"done: {len(records)} objects, {len(skipped)} skipped, "
      f"{sum(r['triangles'] for r in records)} triangles")
