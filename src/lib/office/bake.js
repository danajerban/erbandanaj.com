import * as THREE from "three";

// The office's light, baked per vertex by the sink (OfficeSink): no real
// lights and no shadows (a new light would change every standard program's
// light count and recompile mid-scroll). Every colour here is sRGB hex,
// converted to linear by THREE.Color.

export const hex = (value) => new THREE.Color(value);

// Scandinavian minimalist, warm to match the beach
export const PALETTE = {
  limewash: hex("#f4e6da"), // walls
  cut: hex("#d9c0ad"), // cut wall ends and caps (the model cut)
  trim: hex("#fbf6f0"), // skirting, arch casing, window frames
  floorOak: [hex("#dcb27e"), hex("#d4a873"), hex("#e0b986")],
  seam: hex("#c4975f"),
  slabEdge: hex("#b88b5e"),
  oak: hex("#d2a46c"),
  oakGrain: hex("#bf8f55"),
  deskOak: hex("#c8964f"),
  deskGrain: hex("#b98544"),
  deskEdge: hex("#b5823f"),
  sand: hex("#ead9bd"),
  sandMotif: hex("#dcc6a3"),
  sandLine: hex("#f6ecdc"),
  coral: hex("#e07a5f"),
  clay: hex("#ab6450"), // the painted block behind each title
  seaTeal: hex("#3f8f94"),
  seaTealShade: hex("#2f6f74"),
  lace: hex("#fffaf3"),
  steel: hex("#1e1f22"),
  felt: hex("#4a4a4d"),
  feltSpeck: hex("#5a5a5d"),
  keyCase: hex("#3a3d42"),
  keyCap: hex("#8d9db0"),
  keyMod: hex("#5d6676"),
  keyAccent: hex("#e8553d"),
  silver: hex("#c9cbce"),
  ceramic: hex("#f4f2ee"),
  snakeLeaf: hex("#2f5a35"),
  snakeBand: hex("#3f6e3f"),
  snakeEdge: hex("#d8c04a"),
  bonsai: [hex("#4f7f3a"), hex("#6a9a48")],
  bonsaiPot: hex("#8a8b8d"),
  pebble: hex("#b9b6b0"),
  pothos: hex("#5f9447"),
  pouch: hex("#c9c7c3"),
  sticky: hex("#f3e7a6"),
};

// Light colours (lamps, glow decals)
export const LIGHT = {
  reading: hex("#ffc58a"),
  desk: hex("#ffc27a"),
  lightBar: hex("#fff0d8"),
  screen: hex("#cfdcff"),
  bias: hex("#9fb6ff"),
  afterglow: hex("#ff9c94"),
};

// Fill from the camera side; each corner's key from its window
export const FILL = new THREE.Vector3(-0.3, 0.4, 1).normalize();
export const KEY = {
  skills: new THREE.Vector3(-0.3, 0.5, -0.8).normalize(),
  projects: new THREE.Vector3(-1, 0.4, -0.2).normalize(),
};

// Room light on a face with normal n (unit), times its ambient occlusion
export const lit = (n, ao, key) =>
  (0.6 + 0.2 * n.y + 0.3 * Math.max(0, n.dot(key)) + 0.14 * Math.max(0, n.dot(FILL))) * ao;

const COS60 = Math.cos(Math.PI / 3);
const COS40 = Math.cos((40 * Math.PI) / 180);
const toLight = new THREE.Vector3();

// A lamp's light on point p (room frame) with normal n, added to `out`:
// albedo × colour × w × (1 − d/R)² × (0.25 + 0.75 max(0, n·L)), within R;
// a desk lamp (cone) only lights below its head, the light bar (front) only
// points in front of its plane. light = { p, color, R, w, cone?, front? }.
export const lampLight = (p, n, albedo, light, out = new THREE.Color(0, 0, 0)) => {
  if (light.front !== undefined && p.z <= light.front) return out;
  toLight.subVectors(light.p, p);
  const d = toLight.length();
  if (d >= light.R) return out;
  if (d > 0) toLight.divideScalar(d);
  else toLight.set(0, 1, 0);
  let f = light.w * (1 - d / light.R) ** 2 * (0.25 + 0.75 * Math.max(0, n.dot(toLight)));
  // dot(−L, down) = L.y
  if (light.cone) f *= THREE.MathUtils.smoothstep(toLight.y, COS60, COS40);
  out.r += albedo.r * light.color.r * f;
  out.g += albedo.g * light.color.g * f;
  out.b += albedo.b * light.color.b * f;
  return out;
};

// Baked ambient occlusion
const ramp = (dist, width, dark) => (dist >= width ? 1 : dark + (1 - dark) * Math.max(0, dist / width));
export const AO = {
  // A wall over the floor seam: 0.82 at the floor, 1 from 0.25 up
  wallFoot: (height) => ramp(height, 0.25, 0.82),
  // The floor in front of a wall: 0.85 at the wall, 1 from 0.3 out
  floorEdge: (dist) => ramp(dist, 0.3, 0.85),
  // A wall along a wall–wall corner: 0.85 at the corner, 1 from 0.2 out
  corner: (dist) => ramp(dist, 0.2, 0.85),
  // Inside a window or arch reveal
  reveal: 0.9,
};
