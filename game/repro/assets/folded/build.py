"""Paper Echo - house kit "folded" (折纸面).

Houses read as architectural card models: thin wall cards (thickness shows at corners and
in every cut-out window reveal), roofs as single folded sheets with a crisp ridge crease,
a second shallower "kick" fold near the eaves, and one sheet that laps past the ridge like
an overlapping card. Cut-out pieces become flaps (awnings, shutters, an ajar door).
Hard edges only, flat shading, no bevels.

Usage: bpy-venv/bin/python -I build.py <outdir>
Writes <outdir>/folded_<variant>.glb and <outdir>/kit.json.
Contract: metres, ground z=0, front (door side) = -Y, materials named by role.
"""
import sys, os, math, json, time
import bpy, bmesh
from mathutils import Vector, Matrix

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else '.'
os.makedirs(OUT, exist_ok=True)

TW = 0.04     # wall card thickness
TR = 0.038    # roof card thickness
ZB = -0.06    # walls run a little below ground so corners never float on the curved planet
OVS = 0.025   # end cards overshoot the side cards by this much (card-edge read at corners)

# debug colours only (the game recolours by material name from its palette)
DEBUG = {'wall': (0.94, 0.89, 0.76), 'roof': (0.25, 0.54, 0.59), 'trim': (0.85, 0.81, 0.71),
         'door': (0.48, 0.32, 0.21), 'window': (0.37, 0.50, 0.58), 'chimney': (0.64, 0.54, 0.47),
         'stone': (0.60, 0.58, 0.55), 'wood': (0.48, 0.35, 0.24), 'metal': (0.29, 0.31, 0.32),
         'cloth': (0.78, 0.25, 0.23), 'plant': (0.31, 0.55, 0.33), 'paper': (0.96, 0.94, 0.86)}


# ------------------------------------------------------------------ basics
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(role):
    m = bpy.data.materials.get(role)
    if m is None:
        m = bpy.data.materials.new(role)
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            b.inputs["Base Color"].default_value = (*DEBUG[role], 1)
            b.inputs["Roughness"].default_value = 1.0
    return m


def link(name, bm, role):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if role:
        me.materials.append(mat(role))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def solid(verts, faces, role, name):
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(v)) for v in verts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, role)


def hull(points, role, name):
    bm = bmesh.new()
    for p in points:
        bm.verts.new(Vector(p))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, role)


def quad(pts, normal, role, name):
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(Vector(p)) for p in pts])
    f.normal_update()
    if f.normal.dot(Vector(normal)) < 0:
        f.normal_flip()
    return link(name, bm, role)


def box(x0, x1, y0, y1, z0, z1, role, name, mp=None):
    c = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    if mp:
        c = [mp(*p) for p in c]
    return solid(c, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], role, name)


def prism(profile, a0, a1, mp, role, name):
    """Extrude a planar 2D profile (p,q) along a third axis a in [a0,a1]; mp(a,p,q)->xyz."""
    n = len(profile)
    v = [mp(a0, p, q) for p, q in profile] + [mp(a1, p, q) for p, q in profile]
    f = [list(range(n)), list(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return solid(v, f, role, name)


def offset_path(path, d, side=1):
    P = [Vector((float(p[0]), float(p[1]))) for p in path]
    N = []
    for i in range(len(P) - 1):
        dv = (P[i + 1] - P[i]).normalized()
        N.append(Vector((dv.y, -dv.x)) * side)
    out = []
    for i in range(len(P)):
        if i == 0:
            m = N[0]
        elif i == len(P) - 1:
            m = N[-1]
        else:
            a, b = N[i - 1], N[i]
            m = (a + b) / (1 + a.dot(b))
        out.append(P[i] + m * d)
    return [(p.x, p.y) for p in out]


def strip(path, t, side=1):
    """A folded card in section: the polyline plus its offset, closed. side=+1 -> thickness to the
    right of travel (below a left-to-right roof line)."""
    return [tuple(p) for p in path] + list(reversed(offset_path(path, t, side)))


def interp(path, s):
    for (s0, z0), (s1, z1) in zip(path, path[1:]):
        if min(s0, s1) - 1e-9 <= s <= max(s0, s1) + 1e-9:
            return z0 + (z1 - z0) * (s - s0) / (s1 - s0)
    (s0, z0), (s1, z1) = (path[0], path[1]) if s < path[0][0] else (path[-2], path[-1])
    return z0 + (z1 - z0) * (s - s0) / (s1 - s0)


def clip(path, a, b):
    pts = [(a, interp(path, a))] + [p for p in path if a < p[0] < b] + [(b, interp(path, b))]
    return pts


CUTTERS = []


def cut(target, cutter):
    m = target.modifiers.new("cut", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.object = cutter
    m.solver = "EXACT"
    try:
        m.material_mode = "INDEX"
    except Exception:
        pass
    cutter.hide_render = True
    CUTTERS.append(cutter)


def MPX(a, p, q):   # ridge along X: a=x, p=y(section), q=z
    return (a, p, q)


def MPY(a, p, q):   # ridge along Y: a=y, p=x(section), q=z
    return (p, a, q)


# ------------------------------------------------------------------ facade frame
class Fac:
    """A wall face: u along the face (to the right when seen from outside), v up, w outward."""
    def __init__(s, O, r, n, slab=None):
        s.O, s.r, s.n, s.slab = Vector(O), Vector(r), Vector(n), slab

    def P(s, u, v, w=0.0):
        return tuple(s.O + s.r * u + Vector((0, 0, 1)) * v + s.n * w)

    def mp(s):   # for prisms/boxes: (u, v, w) -> xyz
        return lambda u, v, w: s.P(u, v, w)

    def box(s, u0, u1, v0, v1, w0, w1, role, name):
        return box(u0, u1, v0, v1, w0, w1, role, name, mp=lambda u, v, w: s.P(u, v, w))

    def quad(s, u0, u1, v0, v1, w, role, name):
        return quad([s.P(u0, v0, w), s.P(u1, v0, w), s.P(u1, v1, w), s.P(u0, v1, w)], s.n, role, name)

    def hole(s, u0, u1, v0, v1, slab=None):
        c = box(u0, u1, v0, v1, -TW - 0.03, 0.03, None, "cutter", mp=lambda u, v, w: s.P(u, v, w))
        cut(slab or s.slab, c)

    def window(s, u0, u1, v0, v1, nu=1, nv=1, mull=0.032, slab=None, name="win"):
        du = (u1 - u0 - (nu - 1) * mull) / nu
        dv = (v1 - v0 - (nv - 1) * mull) / nv
        for i in range(nu):
            for j in range(nv):
                a, b = u0 + i * (du + mull), v0 + j * (dv + mull)
                s.hole(a, a + du, b, b + dv, slab)
        s.quad(u0 - 0.012, u1 + 0.012, v0 - 0.012, v1 + 0.012, -TW - 0.003, 'window', name)

    def section(s, path, t, u0, u1, role, name, side=1):
        """Folded strip whose section path is given in (w, v), extruded along u."""
        return prism(strip(path, t, side), u0, u1, lambda a, p, q: s.P(a, q, p), role, name)

    def flap_top(s, u0, u1, vtop, h, ang, role='wall', name='flap', t=TW):
        """A cut-out piece hinged on its top edge, folded outward by ang (deg from hanging)."""
        a = math.radians(ang)
        d = (-math.cos(a), math.sin(a))          # (v,w) along the flap
        e = (-math.sin(a), -math.cos(a))         # (v,w) thickness direction
        pts = []
        for sl, c in ((0, 0), (h, 0), (h, t), (0, t)):
            pts.append((vtop + d[0] * sl + e[0] * c, d[1] * sl + e[1] * c))
        prof = pts  # in (v, w)
        return prism(prof, u0, u1, lambda a_, p, q: s.P(a_, p, q), role, name)

    def flap_side(s, uh, width, v0, v1, ang, sg=1, role='wall', name='shutter', t=TW, w0=0.0):
        """Side-hinged card (shutter or door) at u=uh, extending toward sg*u when closed."""
        a = math.radians(ang)
        d = (sg * math.cos(a), math.sin(a))      # (u,w)
        e = (sg * math.sin(a), -math.cos(a))
        prof = []
        for sl, c in ((0, 0), (width, 0), (width, t), (0, t)):
            prof.append((uh + d[0] * sl + e[0] * c, w0 + d[1] * sl + e[1] * c))
        return prism(prof, v0, v1, lambda a_, p, q: s.P(p, a_, q), role, name)

    def door(s, u0, u1, v0, v1, ajar=0.0, slab=None, name='door'):
        s.hole(u0, u1, v0, v1, slab)
        if ajar > 0:
            s.flap_side(u0, u1 - u0, v0, v1, ajar, 1, 'door', name, t=0.03)
            # warm room behind the gap: glows at night
            s.quad(u0 - 0.08, u1 + 0.08, v0 - 0.02, v1 + 0.08, -TW - 0.13, 'window', name + '_room')
            s.box(u0 - 0.08, u0 - 0.06, v0 - 0.02, v1 + 0.08, -TW - 0.13, -TW, 'window', name + '_rs')
            s.box(u1 + 0.06, u1 + 0.08, v0 - 0.02, v1 + 0.08, -TW - 0.13, -TW, 'window', name + '_rs2')
        else:
            s.box(u0 + 0.002, u1 - 0.002, v0, v1 - 0.002, -TW, -0.014, 'door', name)

    def steps(s, u0, u1, n=2, rise=0.05, tread=0.1, role='trim', name='steps'):
        p = [(n * tread, 0.0)]
        for i in range(n):
            w = (n - i) * tread
            p += [(w, (i + 1) * rise), ((n - i - 1) * tread if i < n - 1 else -0.01, (i + 1) * rise)]
        return s.section(p, 0.022, u0, u1, role, name, side=-1)


# ------------------------------------------------------------------ assemblies
def gable_shell(ax, S0, S1, L0, L1, mid, name, skip=()):
    """Thin card walls under a roof whose (mid-thickness) section line is `mid` (s,z).
    ax='x': ridge along X (gables at x=L0/L1, eave walls at y=S0/S1); ax='y': ridge along Y."""
    mp = MPX if ax == 'x' else MPY
    top = clip(mid, S0 - OVS, S1 + OVS)
    prof = [(S0 - OVS, ZB), (S1 + OVS, ZB)] + list(reversed(top))
    W = {}
    if 'gA' not in skip:
        W['gA'] = prism(prof, L0, L0 + TW, mp, 'wall', name + '_gA')
    if 'gB' not in skip:
        W['gB'] = prism(prof, L1 - TW, L1, mp, 'wall', name + '_gB')
    if 'eA' not in skip:
        W['eA'] = box(L0 + TW, L1 - TW, S0, S0 + TW, ZB, interp(mid, S0), 'wall', name + '_eA',
                      mp=lambda l, s, z: mp(l, s, z))
    if 'eB' not in skip:
        W['eB'] = box(L0 + TW, L1 - TW, S1 - TW, S1, ZB, interp(mid, S1), 'wall', name + '_eB',
                      mp=lambda l, s, z: mp(l, s, z))
    return W


def sheet(ax, path, L0, L1, name, t=TR, role='roof'):
    return prism(strip(path, t), L0, L1, MPX if ax == 'x' else MPY, role, name)


def fold_path(pts):
    """Build a roof top-surface path from (s, z0) start and a list of (s_next, pitch_deg, up?)."""
    (s, z), out = pts[0], [pts[0]]
    for s1, pitch in pts[1:]:
        z = z + (s1 - s) * math.tan(math.radians(pitch))
        s = s1
        out.append((s, z))
    return out


def lap(path_end_prev, path_end, length):
    (s0, z0), (s1, z1) = path_end_prev, path_end
    d = Vector((s1 - s0, z1 - z0)).normalized() * length
    return (s1 + d.x, z1 + d.y)


def roof_window(ax, sheet_obj, hi, lo, a, b, l0, l1, nl=1, mull=0.03, flap=None, name='rwin'):
    """Cut-out window in a roof sheet: holes through the card along the slope hi->lo (top-surface
    points in section coords), glass just under the sheet. flap=deg props the cut piece open,
    hinged on its upper edge (a roof hatch)."""
    mp = MPX if ax == 'x' else MPY
    H, Lo = Vector(hi), Vector(lo)
    d = (Lo - H).normalized()
    n = Vector((-d.y, d.x))
    if n.y < 0:
        n = -n
    P = lambda sl, c, l: mp(l, *(H + d * sl + n * c))
    def hexa(pts):
        return [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    dl = (l1 - l0 - (nl - 1) * mull) / nl
    for i in range(nl):
        q0 = l0 + i * (dl + mull)
        q1 = q0 + dl
        c = [P(a, -TR - 0.03, q0), P(b, -TR - 0.03, q0), P(b, -TR - 0.03, q1), P(a, -TR - 0.03, q1),
             P(a, 0.03, q0), P(b, 0.03, q0), P(b, 0.03, q1), P(a, 0.03, q1)]
        cutter = solid(c, hexa(c), None, 'cutter')
        cut(sheet_obj, cutter)
    g = -TR - 0.004
    nn = Vector(mp(0, *n)) - Vector(mp(0, 0, 0))
    quad([P(a - 0.012, g, l0 - 0.012), P(b + 0.012, g, l0 - 0.012), P(b + 0.012, g, l1 + 0.012), P(a - 0.012, g, l1 + 0.012)],
         nn, 'window', name)
    if flap:
        f_ = math.radians(flap)
        fv = d * math.cos(f_) + n * math.sin(f_)
        gv = -n * math.cos(f_) + d * math.sin(f_)
        O = H + d * a
        Q = lambda sl, c, l: mp(l, *(O + fv * sl + gv * c))
        L = b - a
        c = [Q(0, 0, l0), Q(L, 0, l0), Q(L, 0, l1), Q(0, 0, l1), Q(0, TR, l0), Q(L, TR, l0), Q(L, TR, l1), Q(0, TR, l1)]
        solid(c, hexa(c), 'roof', name + '_flap')


def tube_chimney(cx, cy, z0, z1, a=0.18, t=0.025, tilt=(0, 3, 0), role='chimney', name='chim'):
    """Square card tube: two full cards + two inner cards (front/back overshoot like glued tabs)."""
    h = a / 2
    parts = [box(-h - 0.012, h + 0.012, -h, -h + t, 0, z1 - z0, role, name + '1'),
             box(-h - 0.012, h + 0.012, h - t, h, 0, z1 - z0, role, name + '2'),
             box(-h, -h + t, -h + t, h - t, 0, z1 - z0 - 0.03, role, name + '3'),
             box(h - t, h, -h + t, h - t, 0, z1 - z0 - 0.03, role, name + '4')]
    for o in parts:
        o.location = (cx, cy, z0)
        o.rotation_euler = tuple(math.radians(v) for v in tilt)
    return parts


def folded_leaf(x, y, z, h, w, yaw, role='plant', name='leaf'):
    c, s_ = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    R = lambda px, py: (x + px * c - py * s_, y + px * s_ + py * c)
    pts = [(0, 0, 0), (0, 0.015, h), (-w, -0.02, h * 0.55), (w, -0.02, h * 0.55), (0, 0.03, h * 0.45)]
    return hull([(*R(px, py), z + pz) for px, py, pz in pts], role, name)


def hex_log(x, y, z, r, length, axis='y', role='wood', name='log'):
    bm = bmesh.new()
    rot = {'y': Matrix.Rotation(math.radians(90), 4, 'X'), 'x': Matrix.Rotation(math.radians(90), 4, 'Y'),
           'z': Matrix.Identity(4)}[axis]
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6, radius1=r, radius2=r, depth=length,
                          matrix=Matrix.Translation((x, y, z)) @ rot)
    return link(name, bm, role)


# ------------------------------------------------------------------ variants
def v_letter():
    """Side-gable cottage, ridge along X set back of centre, both slopes kicked at the eaves,
    front sheet laps past the ridge. Ajar door with steps, awning flap, mailbox, card-tube chimney."""
    W, D = 1.40, 1.00
    L0, L1, S0, S1 = -W / 2, W / 2, -D / 2, D / 2
    front = fold_path([(-0.68, 1.00 - 0.18 * math.tan(math.radians(17))), (-0.30, 17), (0.06, 47)])
    back = fold_path([front[-1], (0.32, -40), (0.66, -16)])
    path = front + back[1:]
    mid = offset_path(path, TR / 2)
    sheet('x', front + [lap(front[-2], front[-1], 0.09)], L0 - 0.11, L1 + 0.15, 'roofF')
    sheet('x', back, L0 - 0.11, L1 + 0.15, 'roofB')
    Wd = gable_shell('x', S0, S1, L0, L1, mid, 'w')

    F = Fac((0, S0, 0), (1, 0, 0), (0, -1, 0), Wd['eA'])
    F.door(-0.50, -0.20, 0.10, 0.66, ajar=32)
    F.steps(-0.56, -0.14, n=2, rise=0.05, tread=0.10, role='chimney')
    F.window(0.08, 0.52, 0.36, 0.76, nu=2, nv=1)
    F.flap_top(0.06, 0.54, 0.80, 0.22, 74)
    # mailbox on a post beside the steps
    F.box(-0.675, -0.650, ZB, 0.50, 0.11, 0.135, 'door', 'mpost')
    F.box(-0.735, -0.590, 0.48, 0.60, 0.05, 0.21, 'door', 'mbox')
    F.box(-0.745, -0.580, 0.60, 0.62, 0.04, 0.22, 'door', 'mlid')

    R = Fac((L1, 0, 0), (0, 1, 0), (1, 0, 0), Wd['gB'])
    R.window(-0.20, 0.14, 0.40, 0.74, nu=1, nv=2)
    R.window(-0.04, 0.12, 1.00, 1.16)
    Lf = Fac((L0, 0, 0), (0, -1, 0), (-1, 0, 0), Wd['gA'])
    Lf.window(-0.15, 0.15, 0.42, 0.72)
    B = Fac((0, S1, 0), (-1, 0, 0), (0, 1, 0), Wd['eB'])
    B.window(-0.46, -0.10, 0.40, 0.76, nu=2)
    B.window(0.16, 0.40, 0.40, 0.76)
    tube_chimney(0.40, 0.27, 0.95, 1.80, tilt=(0, 3, 0))


def v_saltbox():
    """Gable to the front, ridge pushed left: a short steep slope and a long kicked sweep to the
    right over a low wall with a woodpile. Shutter folded open, bench, door canopy tab."""
    W, D = 1.30, 1.10
    S0, S1, L0, L1 = -W / 2, W / 2, -D / 2, D / 2
    left = fold_path([(-0.80, 1.12 - 0.15 * math.tan(math.radians(60))), (-0.40, 60)])
    right = fold_path([left[-1], (0.12, -44), (0.82, -18)])
    path = left + right[1:]
    mid = offset_path(path, TR / 2)
    sheet('y', left + [lap(left[-2], left[-1], 0.08)], L0 - 0.17, L1 + 0.09, 'roofL')
    rs = sheet('y', right, L0 - 0.17, L1 + 0.09, 'roofR')
    roof_window('y', rs, right[0], right[1], 0.16, 0.42, -0.30, 0.10, nl=2, name='rwin')
    Wd = gable_shell('y', S0, S1, L0, L1, mid, 'w')

    F = Fac((0, L0, 0), (1, 0, 0), (0, -1, 0), Wd['gA'])
    F.door(-0.47, -0.18, 0.05, 0.62)
    F.box(-0.53, -0.12, ZB, 0.05, 0.0, 0.12, 'wood', 'sill_step')
    F.section([(-0.01, 0.74), (0.17, 0.74), (0.19, 0.69)], 0.02, -0.53, -0.12, 'roof', 'canopy')
    F.window(0.02, 0.40, 0.30, 0.86, nu=2, nv=2)
    F.flap_side(0.40, 0.19, 0.30, 0.86, 125, sg=-1)
    F.window(-0.49, -0.31, 1.06, 1.26)
    F.section([(0.15, 0.0), (0.15, 0.17), (0.03, 0.17), (0.03, 0.0)], 0.022, 0.04, 0.38, 'wood', 'bench', side=1)

    R = Fac((S1, 0, 0), (0, 1, 0), (1, 0, 0), Wd['eB'])
    R.window(-0.32, -0.02, 0.34, 0.66)
    for i, (u, v) in enumerate([(0.10, 0.06), (0.22, 0.06), (0.34, 0.06), (0.16, 0.16), (0.28, 0.16), (0.22, 0.26)]):
        p = R.P(u, v, 0.07)
        hex_log(p[0], p[1], p[2], 0.055, 0.20, axis='x', name='log%d' % i)
    Lf = Fac((S0, 0, 0), (0, -1, 0), (-1, 0, 0), Wd['eA'])
    Lf.window(-0.32, -0.02, 0.44, 0.80, nv=2)
    Lf.window(0.12, 0.34, 0.44, 0.80)
    B = Fac((0, L1, 0), (-1, 0, 0), (0, 1, 0), Wd['gB'])
    B.window(-0.12, 0.24, 0.40, 0.76, nu=2)
    B.window(0.31, 0.49, 1.06, 1.24)


def v_tower():
    """Two-storey card tower with an off-centre pyramid cap, and a lean-to wing against it.
    Stacked windows (a lantern at night), red cloth awning over the wing's shop window."""
    x0, x1, y0, y1 = -0.72, -0.02, -0.42, 0.42
    ze = 1.70
    # tower cards: front/back full width (overshoot), left/right between
    tf = box(x0 - OVS, x1 + OVS, y0, y0 + TW, ZB, ze, 'wall', 't_f')
    tb = box(x0 - OVS, x1 + OVS, y1 - TW, y1, ZB, ze, 'wall', 't_b')
    tl = box(x0, x0 + TW, y0 + TW, y1 - TW, ZB, ze, 'wall', 't_l')
    tr = box(x1 - TW, x1, y0 + TW, y1 - TW, ZB, ze, 'wall', 't_r')
    # pyramid: four facets, card fascia at the eaves, apex pushed back-left
    ov = 0.12
    ez = 1.64
    c = [(x0 - ov, y0 - ov), (x1 + ov, y0 - ov), (x1 + ov, y1 + ov), (x0 - ov, y1 + ov)]
    apex = ((x0 + x1) / 2 - 0.03, 0.05, 2.30)
    verts = [apex] + [(x, y, ez) for x, y in c] + [(x, y, ez - TR) for x, y in c]
    faces = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1), (1, 2, 6, 5), (2, 3, 7, 6), (3, 4, 8, 7), (4, 1, 5, 8),
             (5, 6, 7, 8)]
    solid(verts, faces, 'roof', 'pyramid')
    # wing: lean-to, ridge axis Y, section s = x
    wpath = [(-0.10, 1.30), (0.86, 1.30 - 0.96 * math.tan(math.radians(27)))]
    wmid = offset_path(wpath, TR / 2)
    sheet('y', wpath, y0 - 0.15, y1 + 0.08, 'wroof')
    Wg = gable_shell('y', x1 - 0.02, 0.72, y0, y1, wmid, 'wing', skip=('eA',))

    F = Fac((0, y0, 0), (1, 0, 0), (0, -1, 0), tf)
    F.door(-0.51, -0.21, 0.04, 0.62)
    F.box(-0.56, -0.16, ZB, 0.04, 0.0, 0.10, 'wall', 'tstep')
    F.window(-0.52, -0.20, 1.00, 1.44, nu=1, nv=2)
    Fw = Fac((0, y0, 0), (1, 0, 0), (0, -1, 0), Wg['gA'])
    Fw.window(0.10, 0.62, 0.30, 0.72, nu=3)
    Fw.section([(-0.01, 0.82), (0.21, 0.72), (0.215, 0.63)], 0.016, 0.06, 0.66, 'cloth', 'awning')
    Tl = Fac((x0, 0, 0), (0, -1, 0), (-1, 0, 0), tl)
    Tl.window(-0.15, 0.15, 0.40, 0.72)
    Tl.window(-0.12, 0.12, 1.06, 1.40)
    Tr = Fac((x1, 0, 0), (0, 1, 0), (1, 0, 0), tr)
    Tr.window(-0.12, 0.12, 1.38, 1.58)
    Tb = Fac((0, y1, 0), (-1, 0, 0), (0, 1, 0), tb)
    Tb.window(0.22, 0.52, 1.02, 1.40)
    Rw = Fac((0.72, 0, 0), (0, 1, 0), (1, 0, 0), Wg['eB'])
    Rw.window(-0.22, 0.14, 0.32, 0.62, nu=2)
    Bw = Fac((0, y1, 0), (-1, 0, 0), (0, 1, 0), Wg['gB'])
    Bw.window(-0.55, -0.25, 0.36, 0.66)


def v_concertina():
    """Two front gables of different height from one concertina-folded sheet (M roof), lap at
    the tall ridge, a folded rain spout at the valley over a barrel, planter under the big window."""
    W, D = 1.50, 1.04
    S0, S1, L0, L1 = -W / 2, W / 2, -D / 2, D / 2
    A = fold_path([(-0.92, 1.02 - 0.17 * math.tan(math.radians(22))), (-0.62, 22), (-0.36, 60)])
    B = fold_path([A[-1], (0.02, -47), (0.40, 40), (0.62, -55), (0.92, -20)])
    path = A + B[1:]
    mid = offset_path(path, TR / 2)
    sheet('y', A + [lap(A[-2], A[-1], 0.085)], L0 - 0.14, L1 + 0.09, 'roofA')
    sheet('y', B, L0 - 0.14, L1 + 0.09, 'roofB')
    Wd = gable_shell('y', S0, S1, L0, L1, mid, 'w')

    F = Fac((0, L0, 0), (1, 0, 0), (0, -1, 0), Wd['gA'])
    F.door(-0.525, -0.225, 0.05, 0.62)
    F.window(-0.525, -0.225, 0.67, 0.80, nu=2)
    F.window(-0.44, -0.28, 1.00, 1.22)
    F.box(-0.58, -0.17, ZB, 0.05, 0.0, 0.11, 'door', 'stepslab')
    F.window(0.16, 0.62, 0.36, 0.82, nu=2, nv=2)
    F.window(0.33, 0.47, 1.00, 1.16)
    F.box(0.14, 0.64, 0.0, 0.20, 0.0, 0.13, 'door', 'planter')
    for i, (u, h, yaw) in enumerate([(0.20, 0.17, -20), (0.31, 0.22, 10), (0.42, 0.15, 35), (0.52, 0.20, -5), (0.60, 0.13, 25)]):
        p = F.P(u, 0.19, 0.065)
        folded_leaf(p[0], p[1], p[2], h, 0.05, yaw, name='leaf%d' % i)
    # rain spout: a small V-folded card at the valley, and the barrel it feeds
    vz = interp(path, 0.02) - TR - 0.005
    prism(strip([(-0.04, vz + 0.05), (0.02, vz), (0.08, vz + 0.05)], 0.014), L0 + 0.06, L0 - 0.21, MPY, 'roof', 'spout')
    hex_log(0.02, L0 - 0.12, 0.13, 0.085, 0.26, axis='z', role='door', name='barrel')

    Lf = Fac((S0, 0, 0), (0, -1, 0), (-1, 0, 0), Wd['eA'])
    Lf.window(-0.26, 0.08, 0.40, 0.72)
    Lf.flap_top(-0.28, 0.10, 0.76, 0.20, 70)
    Rr = Fac((S1, 0, 0), (0, 1, 0), (1, 0, 0), Wd['eB'])
    Rr.window(-0.10, 0.24, 0.40, 0.72, nu=2)
    Bk = Fac((0, L1, 0), (-1, 0, 0), (0, 1, 0), Wd['gB'])
    Bk.window(-0.58, -0.22, 0.40, 0.76, nu=2)
    Bk.window(0.20, 0.50, 0.40, 0.76)


def v_skillion():
    """Workshop: one sheet rising left-to-right (a wedge seen from the front) that folds down over
    the tall side like an envelope flap. Shop window + high window = the brightest front at night.
    Card canopy tab over the door, crates by the side."""
    W, D = 1.36, 1.06
    S0, S1, L0, L1 = -W / 2, W / 2, -D / 2, D / 2
    zl, zr = 0.96, 1.68
    p = math.degrees(math.atan2(zr - zl, W))
    t = math.tan(math.radians(p))
    edge = (S1 + 0.13, zr + 0.13 * t)
    vis = math.radians(64)
    path = [(S0 - 0.13, zl - 0.13 * t), edge, (edge[0] + 0.17 * math.cos(vis), edge[1] - 0.17 * math.sin(vis))]
    mid = offset_path(path, TR / 2)
    sheet('y', path, L0 - 0.12, L1 + 0.08, 'roof')
    Wd = gable_shell('y', S0, S1, L0, L1, mid, 'w')

    F = Fac((0, L0, 0), (1, 0, 0), (0, -1, 0), Wd['gA'])
    F.door(-0.49, -0.19, 0.05, 0.64)
    F.window(-0.49, -0.19, 0.69, 0.82, nu=2)
    F.box(-0.55, -0.13, ZB, 0.05, 0.0, 0.12, 'wood', 'stepslab')
    F.section([(-0.01, 0.90), (0.20, 0.90), (0.22, 0.85)], 0.02, -0.55, -0.13, 'roof', 'canopy')
    F.window(0.02, 0.58, 0.30, 0.84, nu=3, nv=2)
    F.window(0.22, 0.56, 1.02, 1.32, nu=2)

    R = Fac((S1, 0, 0), (0, 1, 0), (1, 0, 0), Wd['eB'])
    R.window(-0.06, 0.28, 0.36, 0.70)
    R.flap_top(-0.08, 0.30, 0.74, 0.20, 70)
    R.window(-0.02, 0.28, 1.04, 1.34)
    R.box(-0.46, -0.20, 0.0, 0.18, 0.0, 0.20, 'wood', 'crate1')
    R.box(-0.42, -0.24, 0.18, 0.32, 0.01, 0.17, 'wood', 'crate2')
    R.box(-0.16, 0.02, 0.0, 0.14, 0.0, 0.16, 'wood', 'crate3')
    Lf = Fac((S0, 0, 0), (0, -1, 0), (-1, 0, 0), Wd['eA'])
    Lf.window(-0.16, 0.16, 0.40, 0.70)
    B = Fac((0, L1, 0), (-1, 0, 0), (0, 1, 0), Wd['gB'])
    B.window(-0.50, -0.10, 0.40, 0.80, nu=2, nv=2)
    B.window(0.18, 0.44, 0.40, 0.70)


def v_aframe():
    """A-frame on low knee-wall cards: two tall sheets folded at an off-centre ridge, flared at the
    foot; the left sheet laps the ridge. Sheet overshoots the glazed front gable; porch deck,
    lantern by the door, a propped roof hatch on each side."""
    W, D = 1.30, 1.16
    S0, S1, L0, L1 = -0.62, 0.62, -D / 2, D / 2
    left = fold_path([(-0.78, 0.36), (-0.60, 28), (-0.02, 66)])
    right = fold_path([left[-1], (0.60, -64), (0.78, -30)])
    path = left + right[1:]
    mid = offset_path(path, TR / 2)
    ls = sheet('y', left + [lap(left[-2], left[-1], 0.075)], L0 - 0.15, L1 + 0.06, 'roofL')
    rs = sheet('y', right, L0 - 0.15, L1 + 0.06, 'roofR')
    roof_window('y', rs, right[0], right[1], 0.36, 0.68, -0.32, -0.04, flap=28, name='hatchR')
    roof_window('y', ls, left[2], left[1], 0.42, 0.68, 0.08, 0.32, flap=22, name='hatchL')
    Wd = gable_shell('y', S0, S1, L0, L1, mid, 'w')

    F = Fac((0, L0, 0), (1, 0, 0), (0, -1, 0), Wd['gA'])
    F.door(-0.42, -0.16, 0.08, 0.58, ajar=24)
    F.window(-0.05, 0.31, 0.28, 0.92, nu=2, nv=3)
    F.window(-0.10, 0.06, 1.10, 1.38)
    F.box(-0.60, 0.52, ZB, 0.08, 0.0, 0.15, 'wood', 'deck')
    # lantern on a bracket between door and window
    F.box(-0.13, -0.11, 0.66, 0.68, 0.0, 0.11, 'door', 'bracket')
    F.box(-0.16, -0.08, 0.50, 0.62, 0.05, 0.13, 'window', 'lantern')
    F.box(-0.165, -0.075, 0.62, 0.64, 0.045, 0.135, 'door', 'lantern_cap')

    Bk = Fac((0, L1, 0), (-1, 0, 0), (0, 1, 0), Wd['gB'])
    Bk.window(-0.18, 0.18, 0.36, 0.86, nu=2, nv=2)
    Lf = Fac((S0, 0, 0), (0, -1, 0), (-1, 0, 0), Wd['eA'])
    Lf.window(-0.30, -0.06, 0.12, 0.28, nu=2)


VARIANTS = [('letter', v_letter), ('saltbox', v_saltbox), ('tower', v_tower),
            ('concertina', v_concertina), ('skillion', v_skillion), ('aframe', v_aframe)]


def finalize(name):
    scn = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    keep = [o for o in scn.objects if o not in CUTTERS]
    for o in keep:
        if o.modifiers:
            ev = o.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev)
            o.modifiers.clear()
            o.data = me
    for c in CUTTERS:
        bpy.data.objects.remove(c, do_unlink=True)
    CUTTERS.clear()
    for o in scn.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.object.join()
    h = bpy.context.view_layer.objects.active
    h.name = h.data.name = 'folded_' + name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = h.data
    # tidy: weld coincident verts from booleans, drop zero-area faces
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    h["kind"] = "house"
    h["kit"] = "folded"
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    roles = sorted({h.material_slots[p.material_index].name for p in me.polygons})
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    stats = dict(name=name, tris=tris, roles=roles, nroles=len(roles),
                 bbox=[round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs), 3)],
                 xr=[round(min(xs), 3), round(max(xs), 3)], yr=[round(min(ys), 3), round(max(ys), 3)])
    fn = os.path.join(OUT, 'folded_%s.glb' % name)
    bpy.ops.export_scene.gltf(filepath=fn, export_format='GLB', use_selection=False, export_apply=True,
                              export_yup=True, export_extras=True, export_materials='EXPORT',
                              export_normals=True)
    stats['bytes'] = os.path.getsize(fn)
    return stats


if __name__ == '__main__':
    t0 = time.time()
    only = os.environ.get('ONLY')
    files, allstats = [], []
    for name, fn in VARIANTS:
        if only and name not in only.split(','):
            continue
        reset()
        fn()
        st = finalize(name)
        allstats.append(st)
        files.append('folded_%s.glb' % name)
        print('[stats]', json.dumps(st))
    if not only:
        with open(os.path.join(OUT, 'kit.json'), 'w') as f:
            json.dump({'files': files}, f)  # game.js spreads houses evenly over the list (KITS[i % n])
    print('[done] %d variants in %.1fs' % (len(files), time.time() - t0))
