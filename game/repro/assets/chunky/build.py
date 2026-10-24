"""KIT "chunky" (厚实软体块) for Paper Echo -- headless bpy 5.2, one GLB per variant + kit.json.

Usage:  bpy-venv/bin/python -I build.py <outdir>

Family rules (shared by every variant):
  * thick masses with generous rounded bevels (0.05-0.07 m, 3 segments on walls/roofs)
  * oversized roofs: a solid slab 0.13-0.16 m thick, 0.18-0.24 m eave overhang
  * walls taper inward 1.5-2 deg, whole house leans ~1 deg, roof ridges sag 2-3 cm
  * deep-set openings: 0.055 m recess, glass/door set at the back, chunky sills
  * chunky chimneys with caps, lean 2-3 deg
  * <= 5 material roles per house, small props share a neighbour's role
Blender: Z up, front (door side) faces -Y, ground at z=0, footprint centred on origin.
Material NAME = role (wall/roof/trim/door/window/chimney/stone/wood/metal/cloth/plant/paper).
"""
import sys, os, math, json, time
import bpy, bmesh
from mathutils import Vector, Matrix

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith(".py") else "out"
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
tan = lambda d: math.tan(math.radians(d))

# debug colours only (the game recolours by role from its palette)
DBG = {"wall": (0.94, 0.88, 0.76), "roof": (0.25, 0.54, 0.59), "door": (0.48, 0.32, 0.21),
       "window": (0.37, 0.50, 0.58), "chimney": (0.64, 0.54, 0.47), "stone": (0.60, 0.58, 0.55),
       "wood": (0.60, 0.45, 0.31), "cloth": (0.78, 0.25, 0.23), "trim": (0.85, 0.81, 0.71),
       "metal": (0.29, 0.31, 0.32), "plant": (0.31, 0.55, 0.33), "paper": (0.96, 0.94, 0.86)}


# ----------------------------------------------------------------------------------------------
class Face:
    """A wall face for openings. axis: 'x' or 'y' (the normal axis); sign: +1/-1 (outward);
    half: distance of the face from the centre at z=zb; lean: inward taper angle (deg);
    cc: centre of the wall along the face's horizontal axis (for objects not centred on 0)."""
    def __init__(self, obj, axis, sign, half, lean=0.0, zb=0.0, centre=0.0):
        self.obj, self.axis, self.sign, self.half, self.t, self.zb = obj, axis, sign, half, tan(lean), zb
        self.centre = centre  # centre of the wall along the normal axis

    def plane(self, z):
        return self.centre + self.sign * (self.half - max(z - self.zb, 0.0) * self.t)

    def world(self, c, n, z):
        """c: coordinate along the face, n: coordinate along the normal axis."""
        return (n, c, z) if self.axis == "x" else (c, n, z)

    def size(self, sc, sn, sz):
        return (sn, sc, sz) if self.axis == "x" else (sc, sn, sz)


class House:
    def __init__(self, name):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.name, self.scn = name, bpy.context.scene
        self.mats, self.parts, self.cutters, self.meta = {}, [], [], {}

    # ---------- materials / objects ----------
    def mat(self, role):
        if role not in self.mats:
            m = bpy.data.materials.new(role)
            if not m.node_tree:
                m.use_nodes = True
            b = m.node_tree.nodes.get("Principled BSDF")
            if b:
                b.inputs["Base Color"].default_value = (*DBG.get(role, (1, 0, 1)), 1)
                b.inputs["Roughness"].default_value = 1.0
            self.mats[role] = m
        return self.mats[role]

    def obj(self, name, bm, role, cutter=False):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.mat(role))
        ob = bpy.data.objects.new(name, me)
        self.scn.collection.objects.link(ob)
        (self.cutters if cutter else self.parts).append(ob)
        return ob

    def tag(self, ob, **kw):
        self.meta.setdefault(ob.name, {}).update(kw)
        return ob

    # ---------- primitives ----------
    @staticmethod
    def bevel(ob, w, seg=3, angle=30, profile=0.5):
        if w <= 0:
            return ob
        m = ob.modifiers.new("bev", "BEVEL")
        m.width, m.segments, m.limit_method = w, seg, "ANGLE"
        m.angle_limit, m.profile = math.radians(angle), profile
        m.miter_outer = "MITER_ARC"
        return ob

    def box(self, name, size, centre, role, bev=0.05, seg=3, taper=(0.0, 0.0), rot=None, cutter=False):
        """Rounded box. taper=(tx, ty): absolute inset of the TOP face per side."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            x, y, z = v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]
            if v.co.z > 0:
                x -= math.copysign(taper[0], x)
                y -= math.copysign(taper[1], y)
            v.co = Vector((x, y, z))
        if rot:
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                             matrix=Matrix.Rotation(math.radians(rot[1]), 4, rot[0]))
        bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(centre))
        ob = self.obj(name, bm, role, cutter)
        if not cutter:
            self.bevel(ob, bev, seg)
        return ob

    def prism(self, name, profile, axis, a0, a1, role, bev=0.05, seg=3, lean=0.0, half=(1, 1),
              cutter=False, shift=(0.0, 0.0)):
        """Polygon `profile` [(u,v)...] extruded along `axis` from a0 to a1.
        axis 'x': (u,v)->(y,z); axis 'y': (u,v)->(x,z). lean: inward taper (deg) of the walls,
        applied as a z-proportional scale towards the prism centre; half=(half_x, half_y)."""
        bm = bmesh.new()
        P = (lambda a, u, v: (a, u, v)) if axis == "x" else (lambda a, u, v: (u, a, v))
        A = [bm.verts.new(P(a0, u, v)) for u, v in profile]
        B = [bm.verts.new(P(a1, u, v)) for u, v in profile]
        bm.faces.new(A)
        bm.faces.new(B)
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((A[i], A[j], B[j], B[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if lean:
            t = tan(lean)
            for v in bm.verts:
                z = max(v.co.z, 0.0)
                v.co.x *= 1 - z * t / half[0]
                v.co.y *= 1 - z * t / half[1]
        if shift != (0.0, 0.0):
            bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((shift[0], shift[1], 0)))
        ob = self.obj(name, bm, role, cutter)
        if not cutter:
            self.bevel(ob, bev, seg)
        return ob

    def cyl(self, name, r, depth, centre, role, axis="z", seg=12, bev=0.0, bseg=2, r2=None):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                              depth=depth)
        if axis == "x":
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 4, "Y"))
        elif axis == "y":
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 4, "X"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(centre))
        ob = self.obj(name, bm, role)
        self.bevel(ob, bev, bseg, angle=40)
        return ob

    def hull(self, name, pts, role, bev=0.05, seg=3, lean=0.0, half=(1, 1)):
        bm = bmesh.new()
        for p in pts:
            bm.verts.new(p)
        ret = bmesh.ops.convex_hull(bm, input=bm.verts)
        junk = [g for g in ret["geom_interior"] + ret["geom_unused"] if isinstance(g, bmesh.types.BMVert)]
        if junk:
            bmesh.ops.delete(bm, geom=junk, context="VERTS")
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts[:], edges=bm.edges[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if lean:
            t = tan(lean)
            for v in bm.verts:
                z = max(v.co.z, 0.0)
                v.co.x *= 1 - z * t / half[0]
                v.co.y *= 1 - z * t / half[1]
        ob = self.obj(name, bm, role)
        self.bevel(ob, bev, seg)
        return ob

    def shell(self, name, polys, t, role="roof", bev=0.065, seg=3):
        """Open surface (list of polygons, shared corners welded) thickened upward by t (solidify),
        then rounded. Used for hipped / clipped roofs whose underside is a tent of planes."""
        bm = bmesh.new()
        cache = {}
        def V(p):
            key = tuple(round(c, 5) for c in p)
            if key not in cache:
                cache[key] = bm.verts.new(p)
            return cache[key]
        for poly in polys:
            bm.faces.new([V(p) for p in poly])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        if sum(f.normal.z for f in bm.faces) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        ob = self.obj(name, bm, role)
        so = ob.modifiers.new("solid", "SOLIDIFY")
        so.thickness, so.offset, so.use_even_offset, so.use_rim = t, 1.0, True, True
        so.use_quality_normals = True
        self.bevel(ob, bev, seg)
        return ob

    def cut(self, target, cutter):
        m = target.modifiers.new("cut", "BOOLEAN")
        m.operation, m.object, m.solver = "DIFFERENCE", cutter, "EXACT"
        return m

    # ---------- roofs ----------
    @staticmethod
    def offset_line(pts, t):
        """Offset an open polyline (u increasing, roof underside) upward by thickness t; the two
        ends are cut vertically (eave fascia). Returns the closed slab polygon."""
        segs = []
        for i in range(len(pts) - 1):
            a, b = Vector(pts[i]), Vector(pts[i + 1])
            d = (b - a).normalized()
            n = Vector((-d.y, d.x))
            segs.append((a + n * t, d))
        top = []
        q, d = segs[0]
        s = (pts[0][0] - q.x) / d.x
        top.append(q + d * s)
        for i in range(1, len(segs)):
            (q1, d1), (q2, d2) = segs[i - 1], segs[i]
            # q1 + d1*s = q2 + d2*r
            den = d1.x * d2.y - d1.y * d2.x
            s = ((q2.x - q1.x) * d2.y - (q2.y - q1.y) * d2.x) / den
            top.append(q1 + d1 * s)
        q, d = segs[-1]
        s = (pts[-1][0] - q.x) / d.x
        top.append(q + d * s)
        return list(pts) + [(p.x, p.y) for p in reversed(top)]

    def roof_slab(self, name, under, t, axis, a0, a1, role="roof", bev=0.06, seg=3):
        return self.prism(name, self.offset_line(under, t), axis, a0, a1, role, bev, seg)

    # ---------- openings ----------
    def opening(self, face, c, z0, w, h, kind="window", depth=0.055, shape="rect", mull=None,
                sill=True, sill_role="wall", mull_role=None, role=None, door_glass=False):
        """Cut a deep-set opening into face.obj and fill it with glass (kind='window') or a
        door slab (kind='door'). c: centre along the face; z0: bottom; shape rect|arch|round."""
        zc = z0 + h / 2
        p = face.plane(zc)
        sg = face.sign
        # profile in (c, z)
        if shape == "rect":
            prof = [(-w / 2, 0), (w / 2, 0), (w / 2, h), (-w / 2, h)]
        elif shape == "arch":
            r = w / 2
            prof = [(-r, 0), (r, 0)] + [(r * math.cos(math.pi * k / 8), h - r + r * math.sin(math.pi * k / 8))
                                        for k in range(0, 9)]
        else:  # round
            r = w / 2
            prof = [(r * math.cos(2 * math.pi * k / 16), r + r * math.sin(2 * math.pi * k / 16)) for k in range(16)]

        def slab(name, inset, n0, n1, role_, cut=False):
            pr = [(c + u, z0 + v) for u, v in prof]
            if inset:
                cx, cz = c, z0 + h / 2
                pr = [(cx + (u - cx) * (1 - 2 * inset / w), cz + (v - cz) * (1 - 2 * inset / h)) for u, v in pr]
            if face.axis == "x":
                ob = self.prism(name, pr, "x", n0, n1, role_, bev=0, cutter=cut)
            else:
                ob = self.prism(name, pr, "y", n0, n1, role_, bev=0, cutter=cut)
            return ob

        out = p + sg * 0.25
        back = p - sg * depth
        lo, hi = sorted((out, back))
        cutter = slab(f"c_{kind}", 0, lo, hi, "wall", cut=True)
        self.cut(face.obj, cutter)
        # fill: glass/door front sits 1.2 cm proud of the recess back, 4 cm thick into the wall
        f_front = back + sg * 0.012
        f_back = back - sg * 0.04
        lo, hi = sorted((f_front, f_back))
        fill_role = role or kind
        fill = slab(f"{kind}_fill", 0.002, lo, hi, fill_role)
        res = {"fill": fill, "plane": p}
        if kind == "door" and door_glass:
            gw, gh = w * 0.42, h * 0.22
            gz = z0 + h * 0.62
            g0 = f_front + sg * 0.006
            g1 = f_front - sg * 0.01
            lo, hi = sorted((g0, g1))
            gp = [(c - gw / 2, gz), (c + gw / 2, gz), (c + gw / 2, gz + gh), (c - gw / 2, gz + gh)]
            self.prism("door_glass", gp, face.axis, lo, hi, "window", bev=0)
        if mull:
            mr = mull_role or "wall"
            nm = f_front + sg * 0.02
            for kk, val in mull:
                if kk == "v":
                    sz = face.size(0.04, 0.035, h)
                    self.box("mull", sz, face.world(c + val, nm, zc), mr, bev=0)
                else:
                    sz = face.size(w, 0.035, 0.04)
                    self.box("mull", sz, face.world(c, nm, z0 + val), mr, bev=0)
        if sill and kind == "window":
            sz = face.size(w + 0.10, 0.09, 0.055)
            self.box("sill", sz, face.world(c, face.plane(z0) + sg * 0.02, z0 - 0.022), sill_role, bev=0.02, seg=1)
        return res

    # ---------- finish ----------
    def deform(self, ob, fn):
        for v in ob.data.vertices:
            v.co = fn(v.co.copy())

    def finalize(self, lean=1.0, sag=None, smooth_angle=48, extras=None):
        dg = bpy.context.evaluated_depsgraph_get()
        newm = {}
        for o in self.parts:
            ev = o.evaluated_get(dg)
            newm[o.name] = bpy.data.meshes.new_from_object(ev)
        for o in self.parts:
            o.modifiers.clear()
            o.data = newm[o.name]
            o.data.transform(o.matrix_world)
            o.matrix_world = Matrix.Identity(4)
        for c in self.cutters:
            bpy.data.objects.remove(c, do_unlink=True)
        if os.environ.get("PARTS"):
            agg = {}
            for o in self.parts:
                o.data.calc_loop_triangles()
                k = o.name.split(".")[0]
                agg[k] = agg.get(k, 0) + len(o.data.loop_triangles)
            print(self.name, sorted(agg.items(), key=lambda kv: -kv[1])[:14])
        # per-part hand-made deformation (sagging ridges etc.)
        for o in self.parts:
            md = self.meta.get(o.name, {})
            s = md.get("sag")
            if s:
                amt, axis, c0, hl, zmin = s
                k = 0 if axis == "x" else 1
                for v in o.data.vertices:
                    u = (v.co[k] - c0) / hl
                    if v.co.z > zmin:
                        v.co.z -= amt * max(0.0, 1 - u * u)
            r = md.get("tilt")
            if r:
                ang, axis, px, py = r
                M = (Matrix.Translation((px, py, 0)) @ Matrix.Rotation(math.radians(ang), 4, axis)
                     @ Matrix.Translation((-px, -py, 0)))
                o.data.transform(M)
        # join
        for o in self.scn.objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        house = bpy.context.view_layer.objects.active
        house.name = self.name
        house.data.name = self.name
        me = house.data
        # whole house leans a little (shear in x by height)
        tl = tan(lean)
        for v in me.vertices:
            v.co.x += v.co.z * tl
        # recentre the footprint (x/y bbox) on the origin, ground stays at z=0
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        me.transform(Matrix.Translation((-cx, -cy, 0)))
        # clean cel bands: smooth + sharp-by-angle + face-area weighted normals
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        wn = house.modifiers.new("wn", "WEIGHTED_NORMAL")
        wn.keep_sharp, wn.mode, wn.weight = True, "FACE_AREA", 70
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(house.evaluated_get(dg))
        house.modifiers.clear()
        house.data = me2
        house["kit"] = "chunky"
        house["variant"] = self.name
        if extras:
            for k, v in extras.items():
                house[k] = v
        me = house.data
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        roles = sorted({house.material_slots[p.material_index].name for p in me.polygons})
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
        bbox = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
        path = os.path.join(OUT, self.name + ".glb")
        bpy.ops.object.select_all(action="DESELECT")
        house.select_set(True)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                                  export_apply=True, export_yup=True, export_extras=True,
                                  export_materials="EXPORT", export_normals=True)
        info = dict(name=self.name, tris=tris, roles=roles,
                    bbox=[round(b, 3) for b in bbox], zmin=round(min(zs), 3),
                    centre=[round((max(xs) + min(xs)) / 2, 3), round((max(ys) + min(ys)) / 2, 3)],
                    bytes=os.path.getsize(path))
        print("[stats]", json.dumps(info))
        return info


# ==============================================================================================
# helpers shared by the variants
def gable_walls(h, name, W, D, H, RH, e=0.07, lean=2.0, axis="x", cx=0.0, cy=0.0, a0=None, a1=None, role="wall",
                bev=0.06):
    """Pentagon wall block. axis 'x': ridge along X (gables at +-X); axis 'y': ridge along Y."""
    if axis == "x":
        prof = [(-D / 2, 0), (D / 2, 0), (D / 2, H + e), (0, H + RH + e), (-D / 2, H + e)]
        ob = h.prism(name, prof, "x", -W / 2 if a0 is None else a0, W / 2 if a1 is None else a1, role,
                     bev=bev, lean=lean, half=(W / 2, D / 2), shift=(cx, cy))
    else:
        prof = [(-W / 2, 0), (W / 2, 0), (W / 2, H + e), (0, H + RH + e), (-W / 2, H + e)]
        ob = h.prism(name, prof, "y", -D / 2 if a0 is None else a0, D / 2 if a1 is None else a1, role,
                     bev=bev, lean=lean, half=(W / 2, D / 2), shift=(cx, cy))
    return ob


def gable_roof(h, name, span, H, RH, ov, t, axis, a0, a1, c=0.0, bev=0.065):
    """Chevron slab over a wall of width `span` (perpendicular to the ridge), centred at c."""
    m = RH / (span / 2)
    s = span / 2 + ov
    z0 = H - m * ov
    under = [(c - s, z0), (c, H + RH), (c + s, z0)]
    return h.roof_slab(name, under, t, axis, a0, a1, bev=bev)


def lantern(h, face, c, z, role_bracket="door"):
    n = face.plane(z)
    sg = face.sign
    h.box("lantern_arm", face.size(0.035, 0.10, 0.035), face.world(c, n + sg * 0.05, z + 0.08), role_bracket, bev=0.01, seg=1)
    h.box("lantern", face.size(0.085, 0.085, 0.11), face.world(c, n + sg * 0.095, z), "window", bev=0.012, seg=1)
    h.box("lantern_cap", face.size(0.11, 0.11, 0.035), face.world(c, n + sg * 0.095, z + 0.07), role_bracket, bev=0.01, seg=1)


# ==============================================================================================
# V1  "loaf": long low cottage under a heavy half-hipped (jerkinhead) roof that sags a little,
#     fat external gable chimney, woodpile, bench under the window
def v_loaf():
    h = House("chunky_loaf")
    W, D, H, RH, LEAN = 1.42, 1.02, 0.92, 0.50, 2.0
    ov, gov, t, e = 0.19, 0.15, 0.15, 0.07
    m = RH / (D / 2)
    s_ = D / 2 + ov
    z0, zr = H - m * ov, H + RH
    XL = W / 2 + gov
    yc = 0.27                    # half-width of the clipped gable top
    zc = zr - m * yc
    k = 1.05 * m                 # hip pitch
    XR = XL - (zr - zc) / k      # ridge end
    polys = [[(-XL, -s_, z0), (XL, -s_, z0), (XL, -yc, zc), (XR, 0, zr), (-XR, 0, zr), (-XL, -yc, zc)],
             [(XL, s_, z0), (-XL, s_, z0), (-XL, yc, zc), (-XR, 0, zr), (XR, 0, zr), (XL, yc, zc)],
             [(XL, -yc, zc), (XL, yc, zc), (XR, 0, zr)],
             [(-XL, yc, zc), (-XL, -yc, zc), (-XR, 0, zr)]]
    roof = h.shell("roof", polys, t, bev=0.065)
    h.tag(roof, sag=(0.035, "x", 0.0, XL, 0.3))
    # walls: convex hull under the roof's underside (+e so the tops hide inside the slab)
    hipW = zc + k * (XL - W / 2)
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            pts += [(sx * W / 2, sy * D / 2, 0.0), (sx * W / 2, sy * D / 2, H + e)]
        if hipW < zr:
            yw = (zr - hipW) / m
            pts += [(sx * W / 2, -yw, hipW + e), (sx * W / 2, yw, hipW + e)]
        else:
            pts += [(sx * W / 2, 0.0, zr + e)]
        pts += [(sx * min(XR, W / 2), 0.0, zr + e)]
    walls = h.hull("walls", pts, "wall", bev=0.06, lean=LEAN, half=(W / 2, D / 2))
    h.box("plinth", (W + 0.07, D + 0.07, 0.13), (0, 0, 0.035), "wall", bev=0.04, seg=1)
    front = Face(walls, "y", -1, D / 2, LEAN)
    back = Face(walls, "y", 1, D / 2, LEAN)
    left = Face(walls, "x", -1, W / 2, LEAN)
    right = Face(walls, "x", 1, W / 2, LEAN)
    h.opening(front, -0.25 * W, 0.10, 0.30, 0.56, kind="door", shape="arch")
    h.opening(front, 0.27, 0.36, 0.46, 0.34, mull=[("v", 0.0)])
    lantern(h, front, -0.25 * W + 0.24, 0.58)
    h.opening(back, 0.18, 0.38, 0.40, 0.30)
    h.opening(back, -0.40, 0.42, 0.22, 0.24)
    h.opening(left, -0.14, 0.36, 0.28, 0.30)
    h.opening(left, 0.10, 0.90, 0.20, 0.20, shape="round", sill=False)
    h.opening(right, -0.32, 0.40, 0.20, 0.26)
    # stone step at the door
    h.box("step", (0.44, 0.17, 0.09), (-0.25 * W, -D / 2 - 0.08, 0.035), "chimney", bev=0.03, seg=1)
    # external gable chimney: fat stepped stack + flue + cap, leaning out a touch
    cx = W / 2 + 0.10
    h.box("chim_base", (0.27, 0.46, 0.92), (cx, 0.10, 0.44), "chimney", bev=0.05, seg=2, taper=(0.03, 0.09))
    fl = h.box("chim_flue", (0.23, 0.27, 0.94), (cx - 0.01, 0.10, 1.34), "chimney", bev=0.045, seg=2, taper=(0.012, 0.012))
    cap = h.box("chim_cap", (0.33, 0.37, 0.075), (cx - 0.02, 0.10, 1.83), "chimney", bev=0.03, seg=1)
    for o in (fl, cap):
        h.tag(o, tilt=(-2.5, "Y", cx, 0.10))
    # bench under the window (door brown)
    by = -D / 2 - 0.11
    h.box("bench_seat", (0.52, 0.16, 0.05), (0.27, by, 0.20), "door", bev=0.02, seg=1)
    for sx in (-0.2, 0.2):
        h.box("bench_leg", (0.06, 0.13, 0.18), (0.27 + sx, by, 0.09), "door", bev=0.015, seg=1)
    # woodpile against the left gable, logs parallel to the wall, ends to the front
    for i, (xx, zz) in enumerate([(0.08, 0.065), (0.20, 0.065), (0.14, 0.18)]):
        h.cyl(f"log{i}", 0.066, 0.44, (-W / 2 - xx, 0.14, zz), "door", axis="y", seg=7, bev=0.015, bseg=1)
    return h.finalize(lean=0.8)


# V2  "tall": narrow two-storey, jettied upper floor on a timber band, hipped lid roof, outside stair
def v_tall():
    h = House("chunky_tall")
    W, D, H1, H2, LEAN = 1.06, 0.94, 0.82, 1.62, 1.5
    low = h.box("ground", (W, D, H1 + 0.08), (0, 0, (H1 + 0.08) / 2), "wall", bev=0.06,
                taper=((H1 + 0.08) * tan(LEAN), (H1 + 0.08) * tan(LEAN)))
    JF = 0.09  # front jetty
    W2, D2 = W + 0.10, D + JF
    up = h.box("upper", (W2, D2, H2 - H1 + 0.06), (0, -JF / 2, (H1 + H2 + 0.06) / 2), "wall", bev=0.06,
               taper=(0.8 * tan(LEAN), 0.8 * tan(LEAN)))
    # timber band between floors + brackets
    h.box("band", (W2 + 0.05, D2 + 0.05, 0.11), (0, -JF / 2, H1 + 0.04), "wood", bev=0.03, seg=1)
    for sx in (-0.40, 0.40):
        h.prism("bracket", [(-D / 2 + 0.02, H1 - 0.02), (-D / 2 - JF + 0.01, H1 - 0.02), (-D / 2 + 0.02, H1 - 0.20)],
                "x", sx - 0.035, sx + 0.035, "wood", bev=0.012, seg=1)
    # hipped lid roof (convex hull) with a fat fascia
    ov, z0, ft, zr = 0.20, H2 - 0.10, 0.13, 2.17
    x0, y0, y1 = W2 / 2 + ov, -D2 / 2 - JF / 2 - ov, D2 / 2 - JF / 2 + ov
    yc = (y0 + y1) / 2
    pts = []
    for zz in (z0, z0 + ft):
        pts += [(-x0, y0, zz), (x0, y0, zz), (x0, y1, zz), (-x0, y1, zz)]
    pts += [(-0.17, yc, zr), (0.17, yc, zr)]
    roof = h.hull("roof", pts, "roof", bev=0.065)
    h.tag(roof, sag=(0.02, "x", 0.0, x0, H2 + 0.2))
    # chimney (stucco) with a roof-coloured cap
    ch = h.box("chimney", (0.22, 0.22, 0.90), (0.30, 0.22, 1.86), "wall", bev=0.045, seg=2, taper=(0.01, 0.01))
    cp = h.box("chim_cap", (0.31, 0.31, 0.065), (0.30, 0.22, 2.33), "roof", bev=0.025, seg=1)
    for o in (ch, cp):
        h.tag(o, tilt=(2.5, "Y", 0.30, 0.22))
    fg = Face(low, "y", -1, D / 2, LEAN)
    bg = Face(low, "y", 1, D / 2, LEAN)
    rg = Face(low, "x", 1, W / 2, LEAN)
    fu = Face(up, "y", -1, D2 / 2, LEAN, zb=H1, centre=-JF / 2)
    lu = Face(up, "x", -1, W2 / 2, LEAN, zb=H1)
    ru = Face(up, "x", 1, W2 / 2, LEAN, zb=H1)
    bu = Face(up, "y", 1, D2 / 2, LEAN, zb=H1, centre=-JF / 2)
    h.opening(fg, -0.25 * W, 0.0, 0.28, 0.56, kind="door", shape="arch")
    h.opening(fg, 0.26, 0.28, 0.30, 0.36, mull=[("h", 0.20)])
    h.opening(fu, -0.25, 1.06, 0.28, 0.34, mull=[("v", 0.0)])
    h.opening(fu, 0.25, 1.06, 0.28, 0.34, mull=[("v", 0.0)])
    h.opening(lu, 0.0, 1.10, 0.26, 0.30)
    h.opening(ru, -0.10, 1.10, 0.26, 0.30)
    h.opening(rg, 0.05, 0.32, 0.24, 0.28)
    h.opening(bg, -0.18, 0.32, 0.28, 0.30)
    h.opening(bu, 0.18, 1.08, 0.26, 0.30)
    # outside masonry stair up the left side to an upper side door
    n, rise = 5, 0.18
    ys, ye, land = -0.40, 0.14, 0.44
    run = (ye - ys) / n
    prof = [(ys, 0.0)]
    for i in range(n):
        prof += [(ys + i * run, (i + 1) * rise), (ys + (i + 1) * run, (i + 1) * rise)]
    prof += [(land, n * rise), (land, 0.0)]
    # build as (u=y, v=z) along x, remove duplicate first point
    prof = [prof[0]] + prof[1:]
    sx0, sx1 = -W / 2 - 0.30, -W / 2 + 0.03
    st = h.prism("stair", prof, "x", sx0, sx1, "wall", bev=0.025, seg=2)
    lu_door = Face(up, "x", -1, W2 / 2, 0.0, zb=H1)
    h.opening(lu_door, 0.30, n * rise + 0.01, 0.22, 0.46, kind="door", shape="arch")
    lantern(h, fg, -0.25 * W + 0.23, 0.56, role_bracket="wood")
    return h.finalize(lean=-1.0)


# V3  "shop": mono-pitch roof high at the front, big shop window under a cloth awning, stovepipe
def v_shop():
    h = House("chunky_shop")
    W, D, HF, HB, LEAN = 1.36, 1.06, 1.42, 0.80, 1.5
    e = 0.08
    prof = [(-D / 2, 0), (D / 2, 0), (D / 2, HB + e), (-D / 2, HF + e)]
    walls = h.prism("walls", prof, "x", -W / 2, W / 2, "wall", bev=0.06, lean=LEAN, half=(W / 2, D / 2))
    m = (HF - HB) / D
    ovf, ovb, t = 0.25, 0.24, 0.165
    under = [(-D / 2 - ovf, HF + m * ovf), (D / 2 + ovb, HB - m * ovb)]
    roof = h.roof_slab("roof", under, t, "x", -W / 2 - 0.13, W / 2 + 0.13, bev=0.065)
    h.tag(roof, sag=(0.025, "x", 0.0, W / 2 + 0.13, 0.0))
    front = Face(walls, "y", -1, D / 2, LEAN)
    back = Face(walls, "y", 1, D / 2, LEAN)
    left = Face(walls, "x", -1, W / 2, LEAN)
    right = Face(walls, "x", 1, W / 2, LEAN)
    h.opening(front, -0.25 * W, 0.0, 0.30, 0.66, kind="door", door_glass=True)
    h.opening(front, 0.24, 0.26, 0.58, 0.50, mull=[("v", -0.10), ("v", 0.10)], sill=True)
    h.opening(front, 0.0, 1.07, 0.44, 0.19, sill=False)  # clerestory strip under the eave
    h.opening(right, -0.10, 0.36, 0.30, 0.34, mull=[("v", 0.0)])
    h.opening(left, 0.10, 0.50, 0.24, 0.28)
    h.opening(back, -0.20, 0.34, 0.30, 0.28)
    # awning over the shop window (cloth): sloped slab with a rolled valance
    yw = front.plane(0.95)
    ap = [(yw + 0.03, 0.99), (yw - 0.30, 0.85), (yw - 0.30, 0.75), (yw - 0.255, 0.75), (yw - 0.255, 0.82),
          (yw + 0.03, 0.94)]
    h.prism("awning", ap, "x", -0.10, 0.58, "cloth", bev=0.016, seg=2)
    # sign board over the door (door brown) and the door step
    h.box("sign", (0.42, 0.05, 0.13), (-0.25 * W, yw - 0.03, 0.82), "door", bev=0.02, seg=1)
    h.box("step", (0.42, 0.15, 0.07), (-0.25 * W, -D / 2 - 0.06, 0.025), "wall", bev=0.025, seg=1)
    # crates stacked at the front-left corner
    h.box("crate1", (0.24, 0.22, 0.20), (-W / 2 + 0.04, -D / 2 - 0.16, 0.10), "door", bev=0.025, seg=1)
    h.box("crate2", (0.19, 0.18, 0.16), (-W / 2 + 0.06, -D / 2 - 0.15, 0.28), "door", bev=0.022, seg=1,
          rot=("Z", 14))
    # stovepipe at the back right, rising through the low back roof
    h.cyl("pipe", 0.065, 0.92, (0.38, D / 2 - 0.08, 1.18), "door", seg=10, bev=0.012, bseg=1)
    h.cyl("pipe_cap", 0.11, 0.08, (0.38, D / 2 - 0.08, 1.67), "door", seg=10, bev=0.02, bseg=1, r2=0.06)
    return h.finalize(lean=1.2)


# V4  "barn": gambrel roof with the gable to the front, round loft window, stone plinth, side dormer
def v_barn():
    h = House("chunky_barn")
    W, D, H, LEAN = 1.22, 1.24, 0.74, 1.5
    kx, kz, rz = 0.40, 1.26, 1.62
    e = 0.07
    prof = [(-W / 2, 0), (W / 2, 0), (W / 2, H + e), (kx, kz + e), (0, rz + e), (-kx, kz + e), (-W / 2, H + e)]
    walls = h.prism("walls", prof, "y", -D / 2, D / 2, "wall", bev=0.06, lean=LEAN, half=(W / 2, D / 2))
    ov = 0.11
    m1 = (kz - H) / (W / 2 - kx)
    z0 = H - m1 * ov
    under = [(-W / 2 - ov, z0), (-kx, kz), (0, rz), (kx, kz), (W / 2 + ov, z0)]
    roof = h.roof_slab("roof", under, 0.135, "y", -D / 2 - 0.15, D / 2 + 0.15, bev=0.06)
    h.tag(roof, sag=(0.03, "y", 0.0, D / 2 + 0.15, 0.3))
    h.box("plinth", (W + 0.08, D + 0.08, 0.22), (0, 0, 0.08), "stone", bev=0.045, seg=2)
    front = Face(walls, "y", -1, D / 2, LEAN)
    back = Face(walls, "y", 1, D / 2, LEAN)
    left = Face(walls, "x", -1, W / 2, LEAN)
    h.opening(front, -0.25 * W, 0.19, 0.30, 0.56, kind="door", shape="arch")
    h.opening(front, 0.29, 0.32, 0.28, 0.32, mull=[("h", 0.16)], sill_role="stone")
    h.opening(front, 0.0, 0.94, 0.34, 0.34, shape="round", sill=False, mull=[("v", 0.0), ("h", 0.17)])
    h.opening(back, 0.0, 0.92, 0.30, 0.40, kind="door", role="door")  # hay door in the back gable
    h.opening(back, 0.30, 0.30, 0.24, 0.26, sill_role="stone")
    h.opening(left, 0.10, 0.28, 0.22, 0.20, sill_role="stone")
    # stone steps up to the raised door
    h.box("step1", (0.46, 0.16, 0.10), (-0.25 * W, -D / 2 - 0.13, 0.03), "stone", bev=0.03, seg=1)
    h.box("step2", (0.40, 0.10, 0.10), (-0.25 * W, -D / 2 - 0.06, 0.12), "stone", bev=0.03, seg=1)
    # shed dormer on the right roof slope (walls + its own lid)
    dx0, dx1, dy0, dy1, dz0, dz1 = 0.16, 0.64, -0.30, 0.14, 0.92, 1.36
    dw = h.box("dormer", (dx1 - dx0, dy1 - dy0, dz1 - dz0), ((dx0 + dx1) / 2, (dy0 + dy1) / 2, (dz0 + dz1) / 2),
               "wall", bev=0.04)
    dface = Face(dw, "x", 1, (dx1 - dx0) / 2, 0.0, centre=(dx0 + dx1) / 2)
    h.opening(dface, (dy0 + dy1) / 2, 1.06, 0.28, 0.22, sill=False, depth=0.045)
    dl = [(dx0 - 0.05, dz1 + 0.14), (dx1 + 0.12, dz1 - 0.04)]
    h.roof_slab("dormer_roof", dl, 0.09, "y", dy0 - 0.09, dy1 + 0.09, bev=0.035)
    # stone chimney on the left slope
    h.box("chimney", (0.25, 0.28, 0.82), (-0.30, 0.30, 1.50), "stone", bev=0.045, seg=2, taper=(0.012, 0.012))
    h.box("chim_cap", (0.34, 0.37, 0.07), (-0.30, 0.30, 1.93), "stone", bev=0.025, seg=1)
    # rain barrel at the front-right corner
    h.cyl("barrel", 0.115, 0.28, (W / 2 - 0.02, -D / 2 - 0.13, 0.14), "door", seg=12, bev=0.025, bseg=1)
    return h.finalize(lean=-0.8)


# V5  "porch": cross-gabled L; the front wing carries a big window, the door sits in a porch
#     recessed under the main roof (corner post + beam), bench and mailbox on the deck
def v_porch():
    h = House("chunky_porch")
    W, D, H, RH, LEAN = 1.46, 0.86, 0.80, 0.44, 2.0
    main = gable_walls(h, "main", W, D, H, RH, lean=LEAN)
    mroof = gable_roof(h, "main_roof", D, H, RH, 0.20, 0.145, "x", -W / 2 - 0.13, W / 2 + 0.13)
    h.tag(mroof, sag=(0.03, "x", 0.0, W / 2 + 0.13, 0.3))
    # front wing (gable to the front), x in [0.08, 0.70], y in [-0.86, -0.06]
    wx0, wx1, wy0 = 0.08, 0.70, -0.86
    wcx, ww = (wx0 + wx1) / 2, wx1 - wx0
    RHw = 0.30
    wprof = [(-ww / 2, 0), (ww / 2, 0), (ww / 2, H + 0.07), (0, H + RHw + 0.07), (-ww / 2, H + 0.07)]
    wing = h.prism("wing", wprof, "y", wy0, -0.06, "wall", bev=0.06, lean=LEAN, half=(ww / 2, -wy0), shift=(wcx, 0.0))
    gable_roof(h, "wing_roof", ww, H, RHw, 0.15, 0.135, "y", wy0 - 0.12, -0.12, c=wcx)
    # recessed porch: carve the front-left corner out of the main block, under the main roof
    PY = -0.17                      # recessed wall line
    pc = h.box("c_porch", (W / 2 + wx0 + 0.3, PY + D / 2 + 0.3, 1.8), ((-W / 2 - 0.3 + wx0) / 2, (PY - D / 2 - 0.3) / 2, 0.8),
               "wall", cutter=True)
    h.cut(main, pc)
    front_r = Face(main, "y", -1, -PY, 0.0)
    back = Face(main, "y", 1, D / 2, LEAN)
    left = Face(main, "x", -1, W / 2, LEAN)
    mright = Face(main, "x", 1, W / 2, LEAN)
    wfront = Face(wing, "y", -1, -wy0, LEAN)
    wright = Face(wing, "x", 1, ww / 2, LEAN, centre=wcx)
    h.opening(front_r, -0.25 * W, 0.07, 0.28, 0.54, kind="door", shape="arch")
    h.opening(wfront, wcx, 0.26, 0.40, 0.40, mull=[("v", 0.0), ("h", 0.26)])
    h.opening(wfront, wcx, 0.86, 0.16, 0.16, shape="round", sill=False)
    h.opening(wright, -0.66, 0.32, 0.24, 0.30)
    h.opening(mright, 0.12, 0.34, 0.26, 0.30)
    h.opening(back, -0.30, 0.34, 0.32, 0.30)
    h.opening(back, 0.35, 0.34, 0.26, 0.30)
    h.opening(left, 0.14, 0.34, 0.26, 0.30)
    # deck, corner post, beam along the old wall line
    px0 = -W / 2 - 0.02
    h.box("deck", (wx0 - px0, PY + D / 2 + 0.12, 0.07), ((px0 + wx0) / 2, (PY - D / 2 - 0.12) / 2, 0.035), "wood", bev=0.02, seg=1)
    h.box("deck_step", (0.36, 0.10, 0.045), (-0.25 * W, -D / 2 - 0.16, 0.0225), "wood", bev=0.015, seg=1)
    pxx, pyy = -W / 2 + 0.06, -D / 2 + 0.01
    h.box("post", (0.08, 0.08, 0.76), (pxx, pyy, 0.42), "wood", bev=0.018, seg=1)
    h.box("beam", (wx0 - px0 + 0.02, 0.09, 0.10), ((px0 + wx0) / 2, pyy, H - 0.07), "wood", bev=0.02, seg=1)
    # bench right of the door, lantern, mailbox on the post
    bx = -0.07
    h.box("bench", (0.27, 0.13, 0.05), (bx, PY - 0.09, 0.25), "wood", bev=0.02, seg=1)
    for sx in (-0.10, 0.10):
        h.box("bench_leg", (0.05, 0.11, 0.19), (bx + sx, PY - 0.09, 0.15), "wood", bev=0.012, seg=1)
    # free-standing mailbox on its own post at the front corner of the deck (out in the light)
    mx, my = -W / 2 - 0.09, -D / 2 - 0.10
    h.box("mail_post", (0.055, 0.055, 0.44), (mx, my, 0.22), "wood", bev=0.012, seg=1)
    h.box("mailbox", (0.15, 0.11, 0.11), (mx, my, 0.48), "door", bev=0.025, seg=1)
    lantern(h, front_r, -0.25 * W + 0.22, 0.58, role_bracket="wood")
    # stucco chimney on the back slope with a roof cap
    ch = h.box("chimney", (0.24, 0.24, 0.76), (-0.40, 0.20, 1.20), "wall", bev=0.045, seg=2, taper=(0.012, 0.012))
    cp = h.box("chim_cap", (0.33, 0.33, 0.065), (-0.40, 0.20, 1.60), "roof", bev=0.025, seg=1)
    for o in (ch, cp):
        h.tag(o, tilt=(-3.0, "Y", -0.40, 0.20))
    return h.finalize(lean=0.6)


VARIANTS = [v_loaf, v_tall, v_shop, v_barn, v_porch]

if __name__ == "__main__":
    only = os.environ.get("ONLY")
    infos = []
    for fn in VARIANTS:
        if only and only not in fn.__name__:
            continue
        infos.append(fn())
    if not only:
        with open(os.path.join(OUT, "kit.json"), "w") as f:
            json.dump({"files": [i["name"] + ".glb" for i in infos]}, f)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "stats.json") if not only else os.devnull, "w") as f:
        json.dump(infos, f, indent=1)
    print(f"[done] {len(infos)} variants in {time.time() - T0:.1f}s -> {OUT}")
