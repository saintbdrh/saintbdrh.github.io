"""
Procedural model of a Yahboom DOFBOT-style 6-DOF servo arm (5 joints + gripper),
built to the link lengths measured for the thesis (config.py):

    L1 90 mm (ground to shoulder axis), L2 83, L3 83, L4 79.6, L5 102.7

Original geometry authored in code; a stylised likeness, not Yahboom's CAD.
Also builds an Intel RealSense D435i-style depth camera on a stand.

    blender -b --factory-startup -P blender/build_dofbot.py -- <repo-root> [--no-render]

Rest pose: every link points straight up (+Z). Runtime maps the thesis angles:
    J1 about +Z = q1;  J2, J3, J4 about +Y = (90 - q2), -q3, -q4;  J5 about link axis = roll.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(argv[0]) if argv else os.getcwd()
RENDER = "--no-render" not in argv
GLB = os.path.join(ROOT, "public", "models", "dofbot.glb")
RENDERS = os.path.join(ROOT, "docs", "renders")
os.makedirs(os.path.dirname(GLB), exist_ok=True)
os.makedirs(RENDERS, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = bpy.data.collections.new("Robot"); scene.collection.children.link(col)
studio = bpy.data.collections.new("Studio"); scene.collection.children.link(studio)

L1, L2, L3, L4, L5 = 0.090, 0.083, 0.083, 0.0796, 0.1027

def material(name, rgb, metal, rough, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if coat and "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    return m

M = {
    "alu": material("BracketAluminium", (0.78, 0.79, 0.80), 1.0, 0.3),
    "servo": material("ServoCase", (0.02, 0.021, 0.024), 0.0, 0.42, coat=0.3),
    "horn": material("ServoHorn", (0.62, 0.64, 0.66), 1.0, 0.24),
    "base": material("BaseBlack", (0.012, 0.013, 0.015), 0.2, 0.5),
    "acrylic": material("SmokedAcrylic", (0.03, 0.035, 0.04), 0.0, 0.08, coat=1.0),
    "accent": material("Accent", (0.28, 0.43, 0.50), 0.85, 0.32),
    "rubber": material("Rubber", (0.01, 0.01, 0.011), 0.0, 0.7),
    "glass": material("Glass", (0.005, 0.006, 0.008), 0.0, 0.04, coat=1.0),
    "camera": material("CameraBody", (0.07, 0.072, 0.078), 0.6, 0.35),
}

WORLD = {}

def place(ob, parent, loc):
    col.objects.link(ob)
    if parent:
        ob.parent = bpy.data.objects[parent]
        ob.location = Vector(loc) - WORLD[parent]
    else:
        ob.location = Vector(loc)

def node(name, loc, parent=None, size=0.02):
    e = bpy.data.objects.new(name, None); e.empty_display_size = size
    place(e, parent, loc); WORLD[name] = Vector(loc); return e

def finish(ob, mat, parent, loc, bevel, segs=3):
    ob.data.materials.append(mat)
    for p in ob.data.polygons: p.use_smooth = True
    if bevel:
        md = ob.modifiers.new("Bevel", "BEVEL"); md.width = bevel; md.segments = segs
        md.limit_method = "ANGLE"; md.angle_limit = math.radians(35); md.harden_normals = True
    place(ob, parent, loc); return ob

def box(name, size, loc, mat, parent, bevel=0.0015):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return finish(bpy.data.objects.new(name, me), mat, parent, loc, bevel)

def cyl(name, r, depth, loc, mat, parent, axis="Z", segs=40, bevel=0.0008):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=depth)
    if axis == "Y": bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    if axis == "X": bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return finish(bpy.data.objects.new(name, me), mat, parent, loc, bevel)

def servo(prefix, center, parent, shaft="Y"):
    """Bus servo: ~40 x 20 x 40 mm case, metal horn on the shaft side."""
    size = (0.021, 0.036, 0.040) if shaft == "Y" else (0.022, 0.022, 0.040)
    box(prefix + "Case", size, center, M["servo"], parent, bevel=0.0025)
    if shaft == "Y":
        cyl(prefix + "Horn", 0.011, 0.004, (center[0], center[1] + 0.0195, center[2]), M["horn"], parent, axis="Y")
        cyl(prefix + "HornR", 0.008, 0.003, (center[0], center[1] - 0.0190, center[2]), M["horn"], parent, axis="Y")
        cyl(prefix + "Ring", 0.0115, 0.0012, (center[0], center[1] + 0.0177, center[2]), M["accent"], parent, axis="Y")

def plates(prefix, z0, z1, parent, w=0.022, gap=0.0195, t=0.0028):
    """Pair of machined side plates (U-bracket) spanning z0..z1."""
    mid = (z0 + z1) / 2; length = (z1 - z0) + 0.016
    for s, sd in ((1, "L"), (-1, "R")):
        box(f"{prefix}Plate{sd}", (w, t, length), (0, s * gap, mid), M["alu"], parent, bevel=0.0012)
        for z in (z0, z1):
            cyl(f"{prefix}Boss{sd}{int(z*1000)}", w / 2, t, (0, s * gap, z), M["alu"], parent, axis="Y", bevel=0.0008)
        box(f"{prefix}Slot{sd}", (w * 0.38, t * 1.05, length * 0.42), (0, s * gap, mid), M["servo"], parent, bevel=0.002)

# ------------------------------------------------------------ base and J1
node("Base", (0, 0, 0))
box("BaseBox", (0.15, 0.15, 0.034), (0, 0, 0.017), M["base"], "Base", bevel=0.004)
box("BaseTop", (0.142, 0.142, 0.004), (0, 0, 0.036), M["acrylic"], "Base", bevel=0.001)
for i, (sx, sy) in enumerate([(1, 1), (1, -1), (-1, 1), (-1, -1)]):
    cyl(f"BaseScrew{i}", 0.0035, 0.002, (0.061 * sx, 0.061 * sy, 0.0385), M["horn"], "Base", segs=12)
box("BaseConnector", (0.02, 0.04, 0.012), (-0.078, 0, 0.012), M["servo"], "Base", bevel=0.001)

node("J1", (0, 0, 0.038), "Base")
cyl("Turntable", 0.042, 0.008, (0, 0, 0.042), M["alu"], "J1", bevel=0.001)
cyl("TurntableRing", 0.0425, 0.0012, (0, 0, 0.0385), M["accent"], "J1")
servo("J2Servo", (0, 0, 0.078), "J1")
plates("Shoulder", 0.050, L1, "J1", w=0.026, gap=0.0215)
node("A_base", (0, 0.06, 0.03), "J1")

# ------------------------------------------------------------ J2 shoulder (L2)
node("J2", (0, 0, L1), "J1")
plates("UpperArm", L1, L1 + L2, "J2")
servo("J3Servo", (0, 0, L1 + L2 - 0.012), "J2")
node("A_shoulder", (0, 0.03, L1), "J2")

# ------------------------------------------------------------ J3 elbow (L3)
node("J3", (0, 0, L1 + L2), "J2")
plates("Forearm", L1 + L2, L1 + L2 + L3, "J3")
servo("J4Servo", (0, 0, L1 + L2 + L3 - 0.012), "J3")
node("A_elbow", (0, 0.03, L1 + L2), "J3")

# ------------------------------------------------------------ J4 wrist pitch (L4)
zJ4 = L1 + L2 + L3
node("J4", (0, 0, zJ4), "J3")
plates("Wrist", zJ4, zJ4 + 0.035, "J4", w=0.02)
servo("J5Servo", (0, 0, zJ4 + 0.052), "J4", shaft="Z")
node("A_wrist", (0, 0.03, zJ4), "J4")

# ------------------------------------------------------------ J5 wrist roll + gripper (L5 to the tip)
zJ5 = zJ4 + L4
node("J5", (0, 0, zJ5), "J4")
cyl("RollHorn", 0.012, 0.004, (0, 0, zJ5), M["horn"], "J5")
box("GripperPalm", (0.026, 0.056, 0.012), (0, 0, zJ5 + 0.010), M["alu"], "J5", bevel=0.0012)
box("GripperServo", (0.022, 0.04, 0.021), (-0.002, 0, zJ5 + 0.027), M["servo"], "J5", bevel=0.002)
box("GripperRail", (0.012, 0.05, 0.006), (0, 0, zJ5 + 0.041), M["alu"], "J5", bevel=0.001)
tip = zJ5 + L5
for s, nm in ((1, "FingerL"), (-1, "FingerR")):
    node(nm, (0, s * 0.014, zJ5 + 0.044), "J5", size=0.01)
    box(nm + "Link", (0.010, 0.004, 0.034), (0, s * 0.016, zJ5 + 0.061), M["alu"], nm, bevel=0.0008)
    box(nm + "Jaw", (0.012, 0.005, 0.030), (0, s * 0.012, tip - 0.016), M["alu"], nm, bevel=0.0008)
    box(nm + "Pad", (0.010, 0.002, 0.022), (0, s * 0.0085, tip - 0.014), M["rubber"], nm, bevel=0.0005)
node("TCP", (0, 0, tip), "J5")
node("A_tool", (0, 0.03, tip - 0.02), "J5")

# ------------------------------------------------------------ cable loom
def wire(name, pts, parent, r=0.0016):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r; cu.bevel_resolution = 2
    sp = cu.splines.new("BEZIER"); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = "AUTO"
    tmp = bpy.data.objects.new(name + "_c", cu); scene.collection.objects.link(tmp)
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp)
    off = WORLD[parent]
    for v in me.vertices: v.co -= off
    return finish(bpy.data.objects.new(name, me), M["rubber"], parent, off, 0)

wire("WireUpper", [(-0.012, 0.0, L1 + 0.01), (-0.016, 0.0, L1 + L2 / 2), (-0.012, 0.0, L1 + L2 - 0.03)], "J2")
wire("WireFore", [(-0.012, 0.0, L1 + L2 + 0.01), (-0.016, 0.0, L1 + L2 + L3 / 2), (-0.012, 0.0, zJ4 - 0.03)], "J3")

# ------------------------------------------------------------ RealSense D435i-style camera on a stand (separate root)
def raw(name, bm, mat, parent, loc, bevel=0.0):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    if bevel:
        md = ob.modifiers.new("Bevel", "BEVEL"); md.width = bevel; md.segments = 4
    col.objects.link(ob); ob.parent = parent; ob.location = loc
    return ob

rs = bpy.data.objects.new("RealSense", None); col.objects.link(rs)
for nm, r, d, z, mat in (("StandFoot", 0.035, 0.006, 0.003, M["base"]), ("StandPole", 0.006, 0.36, 0.18, M["alu"])):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=r, radius2=r, depth=d)
    raw(nm, bm, mat, rs, (0, 0, z))
head = bpy.data.objects.new("RealSenseHead", None); col.objects.link(head); head.parent = rs; head.location = (0, 0, 0.37)
for nm, size, mat, bevel in (("RSBody", (0.025, 0.090, 0.025), M["camera"], 0.004), ("RSFace", (0.002, 0.084, 0.020), M["glass"], 0.001)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    raw(nm, bm, mat, head, (0.0128 if nm == "RSFace" else 0, 0, 0), bevel)
for i, y in enumerate((-0.025, 0.0, 0.015, 0.03)):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0045, radius2=0.0045, depth=0.002)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    raw(f"RSLens{i}", bm, M["horn"] if i == 0 else M["glass"], head, (0.0142, y, 0))

bpy.context.view_layer.update()

# ------------------------------------------------------------ export
bpy.ops.object.select_all(action="DESELECT")
for ob in col.objects: ob.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=GLB, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
    export_extras=True, export_cameras=False, export_lights=False, export_animations=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
)
tris = 0
dg = bpy.context.evaluated_depsgraph_get()
for ob in col.objects:
    if ob.type == "MESH":
        ev = ob.evaluated_get(dg); m = ev.to_mesh(); m.calc_loop_triangles(); tris += len(m.loop_triangles); ev.to_mesh_clear()
print("EXPORTED", GLB, os.path.getsize(GLB), "TRIANGLES", tris)
if not RENDER:
    sys.exit(0)

# ------------------------------------------------------------ preview render (pose: reaching forward)
pose = {"J1": ("z", 20), "J2": ("y", 90 - 55), "J3": ("y", 60), "J4": ("y", 45)}
for n, (ax, d) in pose.items():
    ob = bpy.data.objects[n]; r = [0, 0, 0]; r["xyz".index(ax)] = math.radians(d); ob.rotation_euler = r
rs.location = (-0.2, 0.22, 0); rs.rotation_euler = (0, 0, math.radians(-40))
floor = bpy.data.meshes.new("Floor")
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3); bm.to_mesh(floor); bm.free()
fo = bpy.data.objects.new("Floor", floor); studio.objects.link(fo); floor.materials.append(material("Floor", (0.006, 0.007, 0.008), 0, 0.5))
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.002, 0.0025, 1)
def area(name, loc, target, size, power, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, "AREA"); l.energy = power; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); studio.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
area("Key", (0.6, -0.5, 0.7), (0.05, 0, 0.2), 0.6, 40, (1, 0.97, 0.94))
area("Rim", (-0.5, 0.5, 0.5), (0.05, 0, 0.2), 0.8, 45, (0.8, 0.9, 1))
area("Top", (0, 0, 1.0), (0, 0, 0.2), 0.5, 10)
cd = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cd); studio.objects.link(cam); scene.camera = cam
cam.location = (0.62, -0.55, 0.32)
aim = Vector((0.06, 0, 0.19))
cam.rotation_euler = (aim - cam.location).to_track_quat("-Z", "Y").to_euler()
cd.lens = 55; cd.dof.use_dof = True; cd.dof.focus_distance = (cam.location - aim).length; cd.dof.aperture_fstop = 4
engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
scene.render.engine = next(e for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES") if e in engines)
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.view_settings.view_transform = "AgX"
scene.render.filepath = os.path.join(RENDERS, "dofbot.png")
bpy.ops.render.render(write_still=True)
print("RENDERED dofbot.png")
