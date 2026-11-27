"""
Procedural six-axis industrial robot arm for saintbdrh.github.io.

Original geometry, authored entirely in code (no third-party assets).
Run headless:

    blender -b --factory-startup -P blender/build_robot.py -- <repo-root> [--no-render]

Outputs
    public/models/robot.glb      Draco-compressed, Y-up, joint hierarchy J1..J6,
                                 per-part "explode" vectors (glTF extras), anchor
                                 nodes A_* for annotations, one baked clip "Survey".
    docs/renders/*.png           Offline product renders (Eevee, depth of field).

Coordinate system (Blender, Z-up, metres). X = forward, Y = lateral.
Zero pose: upper arm vertical, forearm horizontal, wrist straight.
This is an illustrative model. It is NOT the thesis hardware (Yahboom DOFBOT).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(argv[0]) if argv else os.getcwd()
RENDER = "--no-render" not in argv
GLB = os.path.join(ROOT, "public", "models", "robot.glb")
RENDERS = os.path.join(ROOT, "docs", "renders")
os.makedirs(os.path.dirname(GLB), exist_ok=True)
os.makedirs(RENDERS, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Survey"

robot_col = bpy.data.collections.new("Robot")
studio_col = bpy.data.collections.new("Studio")
scene.collection.children.link(robot_col)
scene.collection.children.link(studio_col)

# ---------------------------------------------------------------- materials
def material(name, rgb, metal, rough, coat=0.0, coat_rough=0.2):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if coat and "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = coat_rough
    return m

M = {
    "graphite": material("Graphite", (0.055, 0.058, 0.062), 0.35, 0.52, coat=0.25, coat_rough=0.35),
    "anodized": material("AnodizedBlack", (0.018, 0.019, 0.021), 0.6, 0.38),
    "aluminium": material("Aluminium", (0.80, 0.81, 0.82), 1.0, 0.27),
    "rubber": material("CableJacket", (0.012, 0.012, 0.013), 0.0, 0.62),
    "accent": material("AccentAnodized", (0.28, 0.43, 0.50), 0.85, 0.32),
    "glass": material("Lens", (0.01, 0.012, 0.016), 0.0, 0.05, coat=1.0, coat_rough=0.02),
}

# ---------------------------------------------------------------- helpers
WORLD = {}   # node name -> world location at rest (all rest rotations are identity)

def place(ob, parent, loc):
    robot_col.objects.link(ob)
    if parent:
        ob.parent = bpy.data.objects[parent]
        ob.location = Vector(loc) - WORLD[parent]
    else:
        ob.location = Vector(loc)

def joint(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = 0.12
    place(e, parent, loc)
    WORLD[name] = Vector(loc)
    return e

def to_gltf(v):
    """Blender Z-up vector -> glTF Y-up vector."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]

def finish(ob, mat, parent, loc, bevel, explode, angle=35, segs=3):
    me = ob.data
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    if bevel > 0:
        md = ob.modifiers.new("Bevel", "BEVEL")
        md.width = bevel
        md.segments = segs
        md.limit_method = "ANGLE"
        md.angle_limit = math.radians(angle)
        md.harden_normals = True
    place(ob, parent, loc)
    if explode:
        ob["explode"] = to_gltf(explode)
    return ob

def _rotate_axis(bm, axis):
    if axis == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "Y"))
    elif axis == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "X"))

def cyl(name, r, depth, loc, mat, parent=None, axis="Z", segs=48, bevel=0.006, explode=None, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    _rotate_axis(bm, axis)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return finish(bpy.data.objects.new(name, me), mat, parent, loc, bevel, explode)

def box(name, size, loc, mat, parent=None, bevel=0.01, explode=None, taper=None):
    """Rounded box. taper=(sx, sy) scales the +Z face for a cast, tapered look."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        if taper and v.co.z > 0:
            v.co.x *= taper[0]; v.co.y *= taper[1]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return finish(bpy.data.objects.new(name, me), mat, parent, loc, bevel, explode, angle=30, segs=4)

def bolt_circle(prefix, n, radius, at, head_r, parent, center=(0, 0), axis="Z", explode=None):
    for i in range(n):
        a = 2 * math.pi * i / n + math.pi / n
        if axis == "Z":
            loc = (center[0] + radius * math.cos(a), center[1] + radius * math.sin(a), at)
        else:  # bolt heads facing +/-X, circle in the YZ plane at x = at
            loc = (at, center[0] + radius * math.cos(a), center[1] + radius * math.sin(a))
        cyl(f"{prefix}_{i}", head_r, head_r * 0.7, loc, M["aluminium"], parent,
            axis=axis, segs=12, bevel=head_r * 0.25, explode=explode)

def cable(name, pts, radius, parent, explode=None):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.resolution_u = 10
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    tmp = bpy.data.objects.new(name + "_curve", cu)
    scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    ob = bpy.data.objects.new(name, me)
    # vertices are in world space; offset the mesh so the object sits at the parent origin
    off = WORLD[parent] if parent else Vector((0, 0, 0))
    for v in me.vertices:
        v.co -= off
    return finish(ob, M["rubber"], parent, off, 0, explode)

def anchor(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "SPHERE"
    e.empty_display_size = 0.02
    place(e, parent, loc)

G, A, AL, R, ACC = M["graphite"], M["anodized"], M["aluminium"], M["rubber"], M["accent"]

# ---------------------------------------------------------------- Base (static)
joint("Base", (0, 0, 0))
box("BasePlate", (0.58, 0.58, 0.04), (0, 0, 0.02), G, "Base", bevel=0.014)
for i, (sx, sy) in enumerate([(1, 1), (1, -1), (-1, 1), (-1, -1)]):
    cyl(f"AnchorBolt_{i}", 0.017, 0.014, (0.235 * sx, 0.235 * sy, 0.047), AL, "Base", segs=16, bevel=0.004)
cyl("Pedestal", 0.19, 0.30, (0, 0, 0.19), G, "Base", bevel=0.01)
cyl("PedestalFlange", 0.208, 0.026, (0, 0, 0.343), AL, "Base", bevel=0.005)
box("ConnectorHousing", (0.08, 0.13, 0.11), (-0.205, 0, 0.13), A, "Base", bevel=0.012)
cyl("ConnectorPlug", 0.028, 0.05, (-0.26, 0, 0.13), AL, "Base", axis="X", segs=24, bevel=0.004)
cable("BaseCable", [(-0.285, 0, 0.13), (-0.36, 0, 0.11), (-0.42, 0.03, 0.03), (-0.62, 0.12, 0.014)], 0.016, "Base")

# ---------------------------------------------------------------- J1 base yaw
joint("J1", (0, 0, 0.356), "Base")
cyl("Turntable", 0.2, 0.06, (0, 0, 0.388), G, "J1", bevel=0.008, explode=(0, 0, 0.04))
cyl("TurntableRing", 0.202, 0.006, (0, 0, 0.359), ACC, "J1", bevel=0.0015)
bolt_circle("TurntableBolt", 10, 0.168, 0.421, 0.011, "J1", explode=(0, 0, 0.06))
box("ShoulderColumn", (0.30, 0.28, 0.22), (0.05, 0, 0.52), G, "J1", bevel=0.05, taper=(0.86, 0.92))
cyl("J1Motor", 0.066, 0.17, (-0.13, 0, 0.52), A, "J1", bevel=0.008, explode=(-0.12, 0, 0))
cyl("J1MotorCap", 0.058, 0.016, (-0.13, 0, 0.613), AL, "J1", bevel=0.004, explode=(-0.12, 0, 0.05))
cable("ServiceLoop", [(-0.13, 0.04, 0.62), (-0.1, 0.11, 0.70), (0.02, 0.125, 0.74), (0.06, 0.11, 0.745)], 0.011, "J1",
      explode=(-0.06, 0.08, 0.04))

J2 = (0.12, 0, 0.66)
cyl("ShoulderHub", 0.128, 0.30, J2, G, "J1", axis="Y", bevel=0.012)
for s, sd in ((1, "L"), (-1, "R")):
    cyl(f"ShoulderCap_{sd}", 0.1, 0.022, (0.12, 0.161 * s, 0.66), AL, "J1", axis="Y", bevel=0.005, explode=(0, 0.11 * s, 0))
    cyl(f"ShoulderRing_{sd}", 0.104, 0.004, (0.12, 0.151 * s, 0.66), ACC, "J1", axis="Y", bevel=0.001, explode=(0, 0.08 * s, 0))
anchor("A_base", (-0.13, 0.0, 0.52), "J1")
anchor("A_shoulder", (0.12, 0.19, 0.66), "J1")

# ---------------------------------------------------------------- J2 shoulder pitch
J3 = (0.12, 0, 1.30)
joint("J2", J2, "J1")
box("UpperArm", (0.20, 0.17, 0.56), (0.12, 0, 0.98), G, "J2", bevel=0.045, taper=(0.78, 0.9))
cyl("UpperArmRoot", 0.112, 0.19, J2, G, "J2", axis="Y", bevel=0.01)
cyl("UpperArmHead", 0.094, 0.17, J3, G, "J2", axis="Y", bevel=0.01)
box("UpperArmCover", (0.11, 0.012, 0.40), (0.12, 0.088, 0.97), AL, "J2", bevel=0.005, taper=(0.82, 1.0), explode=(0, 0.09, 0))
box("UpperArmCoverR", (0.11, 0.012, 0.40), (0.12, -0.088, 0.97), A, "J2", bevel=0.005, taper=(0.82, 1.0), explode=(0, -0.09, 0))
cable("UpperArmCable", [(0.06, 0.12, 0.745), (0.0, 0.105, 0.86), (0.006, 0.1, 1.06), (0.04, 0.1, 1.22), (0.07, 0.092, 1.27)],
      0.011, "J2", explode=(-0.07, 0.06, 0))
for i, z in enumerate((0.88, 1.12)):
    box(f"CableClip_{i}", (0.03, 0.03, 0.022), (0.003 * i, 0.1, z), AL, "J2", bevel=0.004, explode=(-0.07, 0.06, 0))
anchor("A_upperarm", (0.12, 0.1, 1.0), "J2")

# ---------------------------------------------------------------- J3 elbow pitch
joint("J3", J3, "J2")
cyl("ElbowHub", 0.106, 0.25, J3, G, "J3", axis="Y", bevel=0.012)
for s, sd in ((1, "L"), (-1, "R")):
    cyl(f"ElbowCap_{sd}", 0.082, 0.02, (0.12, 0.134 * s, 1.30), AL, "J3", axis="Y", bevel=0.005, explode=(0, 0.09 * s, 0))
    cyl(f"ElbowRing_{sd}", 0.086, 0.004, (0.12, 0.125 * s, 1.30), ACC, "J3", axis="Y", bevel=0.001, explode=(0, 0.065 * s, 0))
cyl("ElbowMotor", 0.068, 0.2, (-0.035, 0, 1.30), A, "J3", axis="X", bevel=0.008, explode=(-0.12, 0, 0))
cyl("ElbowMotorCap", 0.06, 0.018, (-0.142, 0, 1.30), AL, "J3", axis="X", bevel=0.004, explode=(-0.17, 0, 0))
bolt_circle("ElbowMotorBolt", 6, 0.042, -0.152, 0.006, "J3", center=(0, 1.30), axis="X", explode=(-0.17, 0, 0))
cyl("ForearmRoot", 0.088, 0.16, (0.27, 0, 1.30), G, "J3", axis="X", bevel=0.01)
anchor("A_elbow", (0.12, 0.16, 1.30), "J3")

# ---------------------------------------------------------------- J4 forearm roll
J4 = (0.35, 0, 1.30)
joint("J4", J4, "J3")
cyl("ForearmSeam", 0.078, 0.012, (0.356, 0, 1.30), ACC, "J4", axis="X", bevel=0.002, explode=(0.02, 0, 0))
cyl("Forearm", 0.07, 0.34, (0.53, 0, 1.30), G, "J4", axis="X", bevel=0.008, r2=0.062)
cyl("ForearmBand", 0.073, 0.03, (0.43, 0, 1.30), AL, "J4", axis="X", bevel=0.004)
for s, sd in ((1, "L"), (-1, "R")):
    box(f"WristCheek_{sd}", (0.13, 0.024, 0.1), (0.74, 0.064 * s, 1.30), G, "J4", bevel=0.01, explode=(0, 0.06 * s, 0))
    cyl(f"WristCheekEnd_{sd}", 0.05, 0.024, (0.80, 0.064 * s, 1.30), G, "J4", axis="Y", bevel=0.006, explode=(0, 0.06 * s, 0))
    cyl(f"WristCap_{sd}", 0.032, 0.006, (0.80, 0.078 * s, 1.30), AL, "J4", axis="Y", bevel=0.0015, explode=(0, 0.08 * s, 0))
anchor("A_forearm", (0.53, 0.0, 1.38), "J4")

# ---------------------------------------------------------------- J5 wrist pitch
J5 = (0.80, 0, 1.30)
joint("J5", J5, "J4")
cyl("WristBody", 0.047, 0.104, J5, A, "J5", axis="Y", bevel=0.006)
cyl("WristNeck", 0.04, 0.07, (0.85, 0, 1.30), G, "J5", axis="X", bevel=0.005)
anchor("A_wrist", (0.80, 0.0, 1.37), "J5")

# ---------------------------------------------------------------- J6 tool roll + gripper
J6 = (0.885, 0, 1.30)
joint("J6", J6, "J5")
cyl("ToolFlange", 0.046, 0.016, (0.893, 0, 1.30), AL, "J6", axis="X", bevel=0.003, explode=(0.03, 0, 0))
cyl("ToolFlangeRing", 0.047, 0.004, (0.886, 0, 1.30), ACC, "J6", axis="X", bevel=0.001, explode=(0.02, 0, 0))
bolt_circle("FlangeBolt", 6, 0.031, 0.902, 0.0045, "J6", center=(0, 1.30), axis="X", explode=(0.03, 0, 0))
box("GripperBody", (0.064, 0.11, 0.07), (0.937, 0, 1.30), G, "J6", bevel=0.01, explode=(0.06, 0, 0))
box("GripperRail", (0.012, 0.096, 0.02), (0.972, 0, 1.30), AL, "J6", bevel=0.003, explode=(0.07, 0, 0))
box("CameraModule", (0.04, 0.054, 0.03), (0.933, 0, 1.357), A, "J6", bevel=0.006, explode=(0.05, 0, 0.06))
for s in (1, -1):
    cyl(f"CameraLens_{'L' if s > 0 else 'R'}", 0.011, 0.012, (0.956, 0.012 * s, 1.357), M["glass"], "J6",
        axis="X", segs=24, bevel=0.002, explode=(0.05, 0, 0.06))
for s, nm in ((1, "FingerL"), (-1, "FingerR")):
    loc = (1.012, 0.026 * s, 1.30)
    box(nm, (0.075, 0.012, 0.034), loc, AL, "J6", bevel=0.004, explode=(0.09, 0.03 * s, 0))
    WORLD[nm] = Vector(loc)
    box(nm + "Pad", (0.05, 0.004, 0.028), (1.022, 0.0185 * s, 1.30), R, nm, bevel=0.0015)
anchor("A_tool", (1.05, 0.0, 1.30), "J6")
anchor("A_camera", (0.956, 0.0, 1.39), "J6")
anchor("TCP", (1.05, 0.0, 1.30), "J6")

EXPLODE_JOINT = {"J1": (0, 0, 0.10), "J2": (0.0, 0, 0.12), "J3": (0, 0, 0.10),
                 "J4": (0.09, 0, 0), "J5": (0.07, 0, 0), "J6": (0.06, 0, 0)}
for n, v in EXPLODE_JOINT.items():
    bpy.data.objects[n]["explode"] = to_gltf(v)

# ---------------------------------------------------------------- baked clip "Survey" (12 s loop)
FPS = 24
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, 12 * FPS + 1
KEYS = {   # frame: (J1, J2, J3, J4, J5, J6) degrees; axes Z, Y, Y, X, Y, X
    1:   (-18, 14, 22, 0, 38, 0),
    73:  (12, 22, 34, 8, 30, 45),
    145: (26, 10, 18, -6, 52, 90),
    217: (-6, 18, 30, 4, 42, 30),
    289: (-18, 14, 22, 0, 38, 0),
}
AX = {"J1": 2, "J2": 1, "J3": 1, "J4": 0, "J5": 1, "J6": 0}
for fr, vals in KEYS.items():
    for name, deg in zip(("J1", "J2", "J3", "J4", "J5", "J6"), vals):
        ob = bpy.data.objects[name]
        rot = [0.0, 0.0, 0.0]; rot[AX[name]] = math.radians(deg)
        ob.rotation_euler = rot
        ob.keyframe_insert("rotation_euler", frame=fr)
for fr, gap in ((1, 0.0), (100, 0.0), (130, -0.008), (200, -0.008), (230, 0.0), (289, 0.0)):
    for s, nm in ((1, "FingerL"), (-1, "FingerR")):
        ob = bpy.data.objects[nm]
        ob.location.y = WORLD[nm].y - WORLD["J6"].y + gap * s
        ob.keyframe_insert("location", index=1, frame=fr)

scene.frame_set(1)
bpy.context.view_layer.update()

# ---------------------------------------------------------------- export GLB
bpy.ops.object.select_all(action="DESELECT")
for ob in robot_col.objects:
    ob.select_set(True)
export_kwargs = dict(
    filepath=GLB, export_format="GLB", use_selection=True, export_apply=True,
    export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
    export_animations=True, export_animation_mode="SCENE",
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
)
try:
    bpy.ops.export_scene.gltf(**export_kwargs)
except TypeError as e:
    print("export retry without animation mode:", e)
    export_kwargs.pop("export_animation_mode", None)
    bpy.ops.export_scene.gltf(**export_kwargs)
print("EXPORTED", GLB, os.path.getsize(GLB))

tris = 0
dg = bpy.context.evaluated_depsgraph_get()
for ob in robot_col.objects:
    if ob.type == "MESH":
        ev = ob.evaluated_get(dg)
        m = ev.to_mesh(); m.calc_loop_triangles(); tris += len(m.loop_triangles); ev.to_mesh_clear()
print("TRIANGLES", tris)

if not RENDER:
    sys.exit(0)

# ---------------------------------------------------------------- studio + offline renders
floor_mat = material("StudioFloor", (0.004, 0.0045, 0.005), 0.0, 0.5)
bm = bmesh.new()
prof = [(-6.0, 0.0), (2.4, 0.0)]
prof += [(2.4 + 1.2 * math.sin(a), 1.2 - 1.2 * math.cos(a)) for a in [i * math.pi / 24 for i in range(1, 13)]]
prof += [(3.6, 6.0)]
rows = [[bm.verts.new((-x, y, z)) for x, z in prof] for y in (-8, 8)]
for i in range(len(prof) - 1):
    bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
me = bpy.data.meshes.new("Cyc"); bm.to_mesh(me); bm.free()
for p in me.polygons:
    p.use_smooth = True
cyc = bpy.data.objects.new("Cyclorama", me); studio_col.objects.link(cyc); me.materials.append(floor_mat)

world = bpy.data.worlds.new("World"); scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.0022, 0.0025, 1)

def area(name, loc, target, size, power, color=(1, 1, 1), size_y=None):
    l = bpy.data.lights.new(name, "AREA"); l.energy = power; l.color = color
    l.shape = "RECTANGLE"; l.size = size; l.size_y = size_y or size
    o = bpy.data.objects.new(name, l); studio_col.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

area("Key", (2.4, -2.2, 2.8), (0.4, 0, 0.9), 2.2, 170, (1.0, 0.98, 0.95), size_y=1.4)
area("RimCool", (-1.6, 2.2, 2.2), (0.4, 0, 1.0), 3.0, 320, (0.78, 0.88, 0.95), size_y=0.35)
area("Top", (0.3, 0, 4.2), (0.3, 0, 0.6), 1.6, 45)
area("Kicker", (1.2, 2.6, 0.6), (0.4, 0, 0.9), 1.6, 70, (0.85, 0.92, 1.0), size_y=0.25)

cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_data)
studio_col.objects.link(cam); scene.camera = cam
cam_data.dof.use_dof = True

engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
scene.render.engine = next(e for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES") if e in engines)
print("ENGINE", scene.render.engine)
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 96
else:
    try:
        scene.eevee.taa_render_samples = 96
    except AttributeError:
        pass
vts = [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items]
scene.view_settings.view_transform = "AgX" if "AgX" in vts else "Filmic"
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.image_settings.file_format = "PNG"

def shot(fname, frame, loc, target, lens, fstop, focus=None):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    if isinstance(target, str):
        target = bpy.data.objects[target].matrix_world.translation.copy()
        loc = target + Vector(loc)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = lens
    cam_data.dof.aperture_fstop = fstop
    cam_data.dof.focus_distance = (Vector(focus or target) - Vector(loc)).length
    scene.render.filepath = os.path.join(RENDERS, fname)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", fname)

shot("01-hero.png", 1, (3.1, -2.6, 1.45), (0.42, 0, 0.82), 50, 4.0)
shot("02-survey.png", 145, (2.6, 2.4, 1.9), (0.45, 0, 0.9), 55, 4.0)
shot("03-wrist-closeup.png", 217, (0.75, -0.62, 0.22), "A_wrist", 85, 2.2)
