import * as THREE from "three";

// Low-poly shapes for the office sinks (sink.js), in the sink's current
// frame (its matrix stack places them). Core three only. Solid shapes take
// an OfficeSink, an albedo (linear THREE.Color) and opts { ao, emissive };
// fan() also takes a GlowSink. Every face is wound to face outward.

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const n = new THREE.Vector3();

// Newell normal of a planar polygon (not normalised)
const polygonNormal = (pts) => {
  n.set(0, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n;
};

// A convex polygon as a fan, turned to face `outward` (a direction).
// albedo and opts.ao may hold one value per point.
export const polygon = (sink, pts, albedo, opts = {}, outward) => {
  let order = pts.map((_, i) => i);
  if (outward && polygonNormal(pts).dot(outward) < 0) order = order.reverse();
  const ao = opts.ao ?? 1;
  for (let k = 1; k < order.length - 1; k++) {
    const [i, j, l] = [order[0], order[k], order[k + 1]];
    sink.tri(pts[i], pts[j], pts[l], Array.isArray(albedo) ? [albedo[i], albedo[j], albedo[l]] : albedo, {
      ...opts,
      ao: Array.isArray(ao) ? [ao[i], ao[j], ao[l]] : ao,
    });
  }
};

// One triangle turned to face `outward`
export const orientedTri = (sink, a, b, c, albedo, opts, outward) => {
  e1.subVectors(b, a);
  e2.subVectors(c, a);
  if (n.crossVectors(e1, e2).dot(outward) < 0) sink.tri(a, c, b, albedo, opts);
  else sink.tri(a, b, c, albedo, opts);
};

const FACES = {
  "+x": [v3(1, 0, 0), (x, y, z) => [v3(x[1], y[0], z[0]), v3(x[1], y[1], z[0]), v3(x[1], y[1], z[1]), v3(x[1], y[0], z[1])]],
  "-x": [v3(-1, 0, 0), (x, y, z) => [v3(x[0], y[0], z[0]), v3(x[0], y[0], z[1]), v3(x[0], y[1], z[1]), v3(x[0], y[1], z[0])]],
  "+y": [v3(0, 1, 0), (x, y, z) => [v3(x[0], y[1], z[0]), v3(x[0], y[1], z[1]), v3(x[1], y[1], z[1]), v3(x[1], y[1], z[0])]],
  "-y": [v3(0, -1, 0), (x, y, z) => [v3(x[0], y[0], z[0]), v3(x[1], y[0], z[0]), v3(x[1], y[0], z[1]), v3(x[0], y[0], z[1])]],
  "+z": [v3(0, 0, 1), (x, y, z) => [v3(x[0], y[0], z[1]), v3(x[1], y[0], z[1]), v3(x[1], y[1], z[1]), v3(x[0], y[1], z[1])]],
  "-z": [v3(0, 0, -1), (x, y, z) => [v3(x[0], y[0], z[0]), v3(x[0], y[1], z[0]), v3(x[1], y[1], z[0]), v3(x[1], y[0], z[0])]],
};

// An axis-aligned box from its ranges [min, max]. opts.omit lists hidden
// faces ("-y+z"); opts.faces overrides the albedo per face ({ "+y": c }).
export const box = (sink, xs, ys, zs, albedo, opts = {}) => {
  const { omit = "", faces = {}, ...rest } = opts;
  for (const [name, [outward, corners]] of Object.entries(FACES)) {
    if (omit.includes(name)) continue;
    polygon(sink, corners(xs, ys, zs), faces[name] ?? albedo, rest, outward);
  }
};

// A box with every edge chamfered by `bevel`: 6 inset faces, 12 edge
// strips, 8 corner triangles
export const bevelBox = (sink, xs, ys, zs, bevel, albedo, opts = {}) => {
  const lo = [xs[0], ys[0], zs[0]];
  const hi = [xs[1], ys[1], zs[1]];
  const centre = v3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  // The point of corner `s` (signs per axis) on the face across `axis`
  const at = (s, axis) => {
    const c = [0, 1, 2].map((k) => (s[k] > 0 ? hi[k] : lo[k]));
    for (let k = 0; k < 3; k++) if (k !== axis) c[k] -= s[k] * bevel;
    return v3(...c);
  };
  const out = (pts) => pts.reduce((sum, p) => sum.add(p), v3(0, 0, 0)).divideScalar(pts.length).sub(centre);
  const signs = [-1, 1];
  const face = (pts) => polygon(sink, pts, albedo, opts, out(pts));
  for (let axis = 0; axis < 3; axis++) {
    const [a, b] = [(axis + 1) % 3, (axis + 2) % 3];
    for (const side of signs) {
      const corner = (sa, sb) => {
        const s = [0, 0, 0];
        s[axis] = side;
        s[a] = sa;
        s[b] = sb;
        return s;
      };
      face([at(corner(-1, -1), axis), at(corner(1, -1), axis), at(corner(1, 1), axis), at(corner(-1, 1), axis)]);
      // The edge strip along axis b between this face and the face across a
      for (const sa of signs) {
        face([at(corner(sa, -1), axis), at(corner(sa, 1), axis), at(corner(sa, 1), a), at(corner(sa, -1), a)]);
      }
    }
  }
  for (const sx of signs) for (const sy of signs) for (const sz of signs) {
    const s = [sx, sy, sz];
    face([at(s, 0), at(s, 1), at(s, 2)]);
  }
};

// A prism: a polygon outline extruded along an axis. axis "z": outline in
// [x, y], range along z; "y": outline in [x, z]; "x": outline in [y, z].
// opts.omit: "start" and/or "end" (the caps at the range's ends).
export const prism = (sink, outline, range, albedo, opts = {}) => {
  const { axis = "z", omit = "", ...rest } = opts;
  const to3 = ([p, q], w) => (axis === "z" ? v3(p, q, w) : axis === "y" ? v3(p, w, q) : v3(w, p, q));
  const along = axis === "z" ? v3(0, 0, 1) : axis === "y" ? v3(0, 1, 0) : v3(1, 0, 0);
  const contour = outline.map(([p, q]) => new THREE.Vector2(p, q));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [w, sign, name] of [[range[0], -1, "start"], [range[1], 1, "end"]]) {
    if (omit.includes(name)) continue;
    const facing = along.clone().multiplyScalar(sign);
    for (const [i, j, k] of faces) {
      orientedTri(sink, to3(outline[i], w), to3(outline[j], w), to3(outline[k], w), albedo, rest, facing);
    }
  }
  const ccw = THREE.ShapeUtils.isClockWise(contour) ? -1 : 1;
  for (let i = 0; i < outline.length; i++) {
    const [p0, q0] = outline[i];
    const [p1, q1] = outline[(i + 1) % outline.length];
    // The outline's outward normal, then into 3D
    const [np, nq] = [(q1 - q0) * ccw, -(p1 - p0) * ccw];
    const outward = to3([np, nq], 0);
    const pts = [to3(outline[i], range[0]), to3(outline[(i + 1) % outline.length], range[0]), to3(outline[(i + 1) % outline.length], range[1]), to3(outline[i], range[1])];
    polygon(sink, pts, albedo, rest, outward);
  }
};

const side = new THREE.Vector3();
const side2 = new THREE.Vector3();

// A ring of `sides` points of radius r around point c, perpendicular to
// `axis` (unit), starting at angle `phase`
const ringAround = (c, axis, r, sides, phase = 0) => {
  side.set(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) side.set(0, 0, -1);
  side.sub(e1.copy(axis).multiplyScalar(side.dot(axis))).normalize();
  side2.crossVectors(axis, side);
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = phase + (i / sides) * Math.PI * 2;
    pts.push(c.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(side2, -Math.sin(a) * r));
  }
  return pts;
};

// A (truncated) cone from p0 (radius r0) to p1 (radius r1). opts.caps:
// true (both), "start", "end" or false; opts.phase turns the first side.
export const cylinderBetween = (sink, p0, p1, r0, r1, sides, albedo, opts = {}) => {
  const { caps = true, phase = 0, ...rest } = opts;
  const axis = p1.clone().sub(p0).normalize();
  const bottom = ringAround(p0, axis, r0, sides, phase);
  const top = ringAround(p1, axis, r1, sides, phase);
  const mid = p0.clone().add(p1).multiplyScalar(0.5);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const outward = bottom[i].clone().add(bottom[j]).add(top[i]).add(top[j]).multiplyScalar(0.25).sub(mid);
    if (r1 > 0) polygon(sink, [bottom[i], bottom[j], top[j], top[i]], albedo, rest, outward);
    else orientedTri(sink, bottom[i], bottom[j], p1, albedo, rest, outward);
  }
  if (r0 > 0 && (caps === true || caps === "start")) polygon(sink, bottom, albedo, rest, axis.clone().negate());
  if (r1 > 0 && (caps === true || caps === "end")) polygon(sink, top, albedo, rest, axis);
};

// An upright cylinder at [x, z] over [y0, y1], radii [bottom, top]
export const cylinder = (sink, [x, z], [y0, y1], [r0, r1], sides, albedo, opts) =>
  cylinderBetween(sink, v3(x, y0, z), v3(x, y1, z), r0, r1, sides, albedo, opts);

// An upright cone at [x, z] over [y0, y1] (the tip at y1)
export const cone = (sink, [x, z], [y0, y1], r, sides, albedo, opts) =>
  cylinderBetween(sink, v3(x, y0, z), v3(x, y1, z), r, 0, sides, albedo, opts);

// A tube along a polyline (a cylinder per segment)
export const tube = (sink, points, r, sides, albedo, opts = {}) => {
  for (let i = 0; i < points.length - 1; i++) {
    cylinderBetween(sink, points[i], points[i + 1], r, r, sides, albedo, { caps: false, ...opts });
  }
};

// Points of an ellipse around c: radii a and b on the plane's two axes
// ("xz" a floor, "xy" a back wall, "zy" a side wall)
export const ellipse = (c, a, b, segments, plane = "xz") => {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const [du, dv] = [Math.cos(t) * a, Math.sin(t) * b];
    if (plane === "xz") pts.push(v3(c.x + du, c.y, c.z + dv));
    else if (plane === "xy") pts.push(v3(c.x + du, c.y + dv, c.z));
    else pts.push(v3(c.x, c.y + dv, c.z + du));
  }
  return pts;
};

// A fan from a centre to a closed rim, facing opts.normal (default up).
// On a GlowSink the colours are light (rim usually black) and opts.channel
// picks lamps (0) or daylight (1); on an OfficeSink they are albedos.
export const fan = (sink, centre, rim, centreColor, rimColor, opts = {}) => {
  const { normal = v3(0, 1, 0), channel = 0, ...rest } = opts;
  for (let i = 0; i < rim.length; i++) {
    let [a, b] = [rim[i], rim[(i + 1) % rim.length]];
    e1.subVectors(a, centre);
    e2.subVectors(b, centre);
    if (n.crossVectors(e1, e2).dot(normal) < 0) [a, b] = [b, a];
    if (sink.isGlowSink) sink.tri(centre, a, b, centreColor, rimColor, rimColor, channel);
    else sink.tri(centre, a, b, [centreColor, rimColor, rimColor], rest);
  }
};

// A ribbon between two polylines. opts.double draws both sides; otherwise
// the winding follows left → right → next.
export const strip = (sink, left, right, albedo, opts = {}) => {
  const { double = false, ...rest } = opts;
  for (let i = 0; i < left.length - 1; i++) {
    const quad = [left[i], right[i], right[i + 1], left[i + 1]];
    const albedos = Array.isArray(albedo) ? [albedo[i], albedo[i], albedo[i + 1], albedo[i + 1]] : albedo;
    sink.quad(...quad, albedos, rest);
    if (double) sink.quad(quad[0], quad[3], quad[2], quad[1], Array.isArray(albedos) ? [albedos[0], albedos[3], albedos[2], albedos[1]] : albedos, rest);
  }
};

// A contact blob under furniture: an opaque fan 2 mm over the surface top
// y, its centre the surface albedo × 0.7, its rim the surface itself (same
// normal, so the rim meets the surface exactly)
export const contactShadow = (sink, x, z, rx, rz, under, y, segments = 16) => {
  const centre = v3(x, y + 0.002, z);
  fan(sink, centre, ellipse(centre, rx, rz, segments), under.clone().multiplyScalar(0.7), under);
};


const area2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

// A wall face with rectangular and arched holes, cut on a grid (the light
// and AO are per vertex). rect = { u: [u0, u1], v: [v0, v1] }; holes =
// [{ u: [a, b], v: [c, d], arch?, bottom? }]: an arched hole has straight
// jambs to d − r and a semicircular head up to d (r = half its width);
// bottom: false leaves out its bottom reveal (a sill covers it). basis =
// { o, u, v }: point (u, v) = o + u·U + v·V, the face looks along U × V.
// opts: ao(u, v), step (grid, 0.4), breaks { u, v } (extra grid lines, e.g.
// AO strip edges), depth (the reveals' depth into the wall; 0 none),
// revealAo (0.9), segments (12 per arch head). The non-rectangular cells
// beside an arch head are triangulated with THREE.ShapeUtils.
export const wallWithHoles = (sink, rect, holes, basis, albedo, opts = {}) => {
  const { ao = () => 1, step = 0.4, breaks = {}, depth = 0, revealAo = 0.9, segments = 12 } = opts;
  const at = (u, v) => basis.o.clone().addScaledVector(basis.u, u).addScaledVector(basis.v, v);
  const front = new THREE.Vector3().crossVectors(basis.u, basis.v).normalize();
  const heads = holes
    .filter((h) => h.arch)
    .map((h) => {
      const r = (h.u[1] - h.u[0]) / 2;
      return { hole: h, r, cu: (h.u[0] + h.u[1]) / 2, spring: h.v[1] - r };
    });
  const grid = (range, fixed, skip) => {
    const values = [range[0], range[1], ...fixed];
    for (let x = range[0] + step; x < range[1] - step * 0.25; x += step) if (!skip(x)) values.push(x);
    const inRange = values.filter((x) => x >= range[0] && x <= range[1]).map((x) => +x.toFixed(5));
    return [...new Set(inRange)].sort((a, b) => a - b);
  };
  const us = grid(
    rect.u,
    [...holes.flatMap((h) => h.u), ...heads.map((h) => h.cu), ...(breaks.u ?? [])],
    (x) => heads.some((h) => x > h.hole.u[0] && x < h.hole.u[1]),
  );
  const vs = grid(
    rect.v,
    [...holes.flatMap((h) => h.v), ...heads.map((h) => h.spring), ...(breaks.v ?? [])],
    (y) => heads.some((h) => y > h.spring && y < h.hole.v[1]),
  );
  const between = (values, lo, hi) => values.filter((x) => x > lo + 1e-6 && x < hi - 1e-6);
  const aoAt = (u, v) => ao(u, v);
  const arc = (h) => {
    const pts = [];
    for (let k = 0; k <= segments; k++) {
      const t = Math.PI - (k / segments) * Math.PI;
      pts.push(new THREE.Vector2(h.cu + h.r * Math.cos(t), h.spring + h.r * Math.sin(t)));
    }
    return pts;
  };
  // Triangulated 2D polygon on the face, wound to face front
  const piece = (contour) => {
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour.slice(), [])) {
      let [a, b, c] = [contour[i], contour[j], contour[k]];
      if (area2(a, b, c) < 0) [b, c] = [c, b];
      sink.tri(at(a.x, a.y), at(b.x, b.y), at(c.x, c.y), albedo, { ao: [aoAt(a.x, a.y), aoAt(b.x, b.y), aoAt(c.x, c.y)] });
    }
  };
  const drawn = new Set();
  const head = (h) => {
    if (drawn.has(h)) return;
    drawn.add(h);
    const pts = arc(h);
    const half = segments / 2;
    const [a, b] = h.hole.u;
    const top = h.hole.v[1];
    const edge = between(vs, h.spring, top);
    piece([...pts.slice(0, half + 1), new THREE.Vector2(a, top), ...edge.reverse().map((v) => new THREE.Vector2(a, v))]);
    piece([...pts.slice(half), ...between(vs, h.spring, top).map((v) => new THREE.Vector2(b, v)), new THREE.Vector2(b, top)]);
  };
  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < vs.length - 1; j++) {
      const [ua, ub, va, vb] = [us[i], us[i + 1], vs[j], vs[j + 1]];
      const [mu, mv] = [(ua + ub) / 2, (va + vb) / 2];
      const inHole = holes.some((h) => {
        const jamb = h.arch ? h.v[1] - (h.u[1] - h.u[0]) / 2 : h.v[1];
        return mu > h.u[0] && mu < h.u[1] && mv > h.v[0] && mv < jamb;
      });
      if (inHole) continue;
      const inHead = heads.find((h) => mu > h.hole.u[0] && mu < h.hole.u[1] && mv > h.spring && mv < h.hole.v[1]);
      if (inHead) {
        head(inHead);
        continue;
      }
      sink.quad(at(ua, va), at(ub, va), at(ub, vb), at(ua, vb), albedo, {
        ao: [aoAt(ua, va), aoAt(ub, va), aoAt(ub, vb), aoAt(ua, vb)],
      });
    }
  }
  if (!depth) return;
  // The reveals, split where the face is, so no edge has a T-junction
  const back = front.clone().multiplyScalar(-depth);
  const reveal = (p, q, inward) =>
    polygon(sink, [p, q, q.clone().add(back), p.clone().add(back)], albedo, { ao: revealAo }, inward);
  const run = (values, point, inward) => {
    for (let i = 0; i < values.length - 1; i++) reveal(point(values[i]), point(values[i + 1]), inward);
  };
  for (const h of holes) {
    const [a, b] = h.u;
    const [c, d] = h.v;
    const spring = h.arch ? d - (b - a) / 2 : d;
    const jamb = [c, ...between(vs, c, spring), spring];
    run(jamb, (v) => at(a, v), basis.u);
    run(jamb, (v) => at(b, v), basis.u.clone().negate());
    const across = [a, ...between(us, a, b), b];
    if (c > rect.v[0] + 1e-6 && h.bottom !== false) run(across, (u) => at(u, c), basis.v);
    if (!h.arch) run(across, (u) => at(u, d), basis.v.clone().negate());
    else {
      const pts = arc(heads.find((x) => x.hole === h)).map((p) => at(p.x, p.y));
      const centre = at((a + b) / 2, spring);
      for (let k = 0; k < pts.length - 1; k++) {
        reveal(pts[k], pts[k + 1], centre.clone().sub(pts[k].clone().add(pts[k + 1]).multiplyScalar(0.5)));
      }
    }
  }
};
