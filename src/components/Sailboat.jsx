import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ANIMATION_CONSTANTS } from "../constants/animation";
import { useMobile } from "../contexts/MobileContext";
import { layoutOf } from "../lib/coast";
import { TriangleSink } from "../lib/lowPoly";

// A small low-poly sloop far out on the sunset sea on Home: a terracotta
// hull with a teak deck and a cream cabin, a mainsail and a jib, a coral
// pennant at the masthead. The sun sits low behind it, so the sails glow
// warm where the light comes through them and the hull reads nearly as a
// silhouette, hazed a little toward the sky over the far water; under it a
// faint, rippled reflection. It rocks gently: a slow bob, roll and pitch;
// reduced motion holds it still.
//
// Part of the view, like the clouds and the gulls (Experience, Birds): it is
// placed by a screen fraction and a depth, so it holds its place at every
// viewport, and when the visitor leaves Home it stays put and dissolves
// into the haze as the water around it does (Sea: the nearer water first).
// Its mast stays lower than the camera's eye, so the whole boat sits under
// the eye-level horizon at any distance, clear of the clouds and the gulls
// above it. On wide screens it sails between the shore and the sun's
// reflection, left of where the dolphins leap; on upright and sideways
// phones and an upright iPad the dolphins leap all along the far water, so
// it sits nearer, below their water line, beside the glitter.
//
// One draw call, its own small program (no lights, no fog: the colours are
// baked per facet from the sun's direction and written as sRGB, like the
// sea's). Drawn after the sea (renderOrder), over it, without the depth
// test, so the swell between it and the camera never cuts its hull: it
// draws its own water line, and its facets are sorted far to near. A lazy
// chunk mounted after the first visible frame (Experience): it compiles its
// program off the main thread, then fades in. On its own layer, so the
// contact-shadow pass does not draw it.

const LAYER = 12;
const FADE_SECONDS = 2.5;
const { DISSOLVE_START: LEAVE_START, DISSOLVE_END: LEAVE_END } = ANIMATION_CONSTANTS;
// Camera: SceneCanvas (position [0, 0.5, 5]; its group, and so the floor,
// sits at y = -1)
const CAMERA_Z = 5;
const CAMERA_HEIGHT = 1.5;

// Where it sails, by composition (HomeSection's: an upright screen past the
// breakpoint is "tall"): x, the middle of its hull as a screen fraction from
// the left; depth, its distance down the floor from the camera; size, its
// length as a fraction of the screen's height; haze, how far its colours
// lean toward the sky over the far water. The mast (MAST, in lengths)
// stays under the eye-level horizon, and on upright and sideways screens the
// masthead stays below the nearest dolphin's water line (Dolphin's SPOT).
const SPOT = {
  desktop: { x: 0.735, depth: 45, size: 0.035, haze: 0.3 },
  landscape: { x: 0.735, depth: 12.5, size: 0.06, haze: 0.12 },
  portrait: { x: 0.75, depth: 26, size: 0.034, haze: 0.2 },
  tall: { x: 0.73, depth: 26, size: 0.029, haze: 0.2 },
};
// Yaw: the bow heads right and a little away, so its near side and the
// sails' faces turn toward the camera
const YAW = 0.42;

// The boat, in lengths, x toward the bow, y up from the water line, z to
// port (the side facing the camera). Hull stations from the transom to the
// stem: x, half-beam, sheer height, keel depth.
const STATIONS = [
  [-0.47, 0.11, 0.095, -0.03],
  [-0.3, 0.145, 0.09, -0.06],
  [-0.05, 0.155, 0.095, -0.075],
  [0.2, 0.13, 0.105, -0.065],
  [0.38, 0.07, 0.12, -0.04],
  [0.52, 0, 0.14, 0.02],
];
// Waterline flare: the chine sits this high, this share of the half-beam
const CHINE = [0.025, 0.86];
const MAST_X = 0.06;
const MAST = 1.12;
const MAST_HALF = 0.011;
const BOOM = 0.2;

// sRGB, written as is (the attribute keeps the hex values)
const HULL = "#b4543b";
const BOTTOM = "#7d3a2f";
const DECK = "#d3a77c";
const CABIN = "#f3d2b4";
const SPAR = "#5b3a2f";
const SAIL = "#f7e9d6";
const SAIL_SHADE = "#d9b39f";
const SAIL_GLOW = "#ffc39a";
const PENNANT = "#e0603f";
// The sky over the far water (Sea's SKY_LINE), and the far water itself
// (Sea's far water: that sky a touch deeper), which tints the reflection
const HAZE = "#edc0b5";
const WATER = "#d59ea0";
// The reflection: how much of the water's colour it takes, how strong it is
// at the water line, how fast it fades with depth below it, and how tight
// its ripples are (lengths)
const REFLECT_TINT = 0.55;
const REFLECT_ALPHA = 0.75;
const REFLECT_FADE = 0.35;
const REFLECT_RIPPLE = 70;

// sRGB hex as a GLSL vec3, and as a THREE.Color holding the same values
const glsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `vec3(${[16, 8, 0].map((s) => (((n >> s) & 255) / 255).toFixed(3)).join(", ")})`;
};
const srgb = (hex) => new THREE.Color().setHex(parseInt(hex.slice(1), 16), THREE.LinearSRGBColorSpace);

const VERTEX = /* glsl */ `
  uniform float uWater;
  attribute vec3 aColor;
  attribute float aReflect;
  varying vec3 vColor;
  varying float vAbove;
  varying float vReflect;
  void main() {
    vColor = aColor;
    vReflect = aReflect;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vAbove = world.y - uWater;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// The boat above the water line; its reflection below it, fading with
// depth and broken into ripples
const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uLeave;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAbove;
  varying float vReflect;
  void main() {
    float side = vReflect > 0.5 ? -vAbove : vAbove;
    if (side < 0.0) discard;
    float alpha = uOpacity;
    if (vReflect > 0.5) {
      float d = side / uScale;
      alpha *= ${REFLECT_ALPHA.toFixed(2)} * exp(-d / ${REFLECT_FADE.toFixed(2)}) * (0.6 + 0.4 * sin(d * ${REFLECT_RIPPLE.toFixed(1)}));
    }
    gl_FragColor = vec4(mix(vColor, ${glsl(HAZE)}, uLeave * 0.8), alpha);
  }
`;

// Every facet as [a, b, c, color, kind]: kind 0 is solid (lit from the
// front only), 1 is sailcloth (the light shining through it too)
const buildFacets = () => {
  const facets = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const quad = (a, b, c, d, color) => {
    facets.push([a, b, c, color, 0], [a, c, d, color, 0]);
  };
  // Hull: each station's port sheer, port chine, keel, starboard chine,
  // starboard sheer
  const rings = STATIONS.map(([x, w, top, keel]) => [
    v(x, top, w),
    v(x, CHINE[0], w * CHINE[1]),
    v(x, keel, 0),
    v(x, CHINE[0], -w * CHINE[1]),
    v(x, top, -w),
  ]);
  for (let i = 0; i < rings.length - 1; i++) {
    const [a, b] = [rings[i], rings[i + 1]];
    quad(a[0], b[0], b[1], a[1], HULL);
    quad(a[1], b[1], b[2], a[2], BOTTOM);
    quad(a[2], b[2], b[3], a[3], BOTTOM);
    quad(a[3], b[3], b[4], a[4], HULL);
    quad(a[4], b[4], b[0], a[0], DECK);
  }
  const transom = rings[0];
  quad(transom[0], transom[1], transom[3], transom[4], HULL);
  facets.push([transom[1], transom[2], transom[3], BOTTOM, 0]);
  // A low cabin on the deck, aft of the mast
  const [x0, x1, w, y0, y1] = [-0.2, MAST_X - 0.02, 0.085, 0.09, 0.15];
  const box = [v(x0, y0, w), v(x1, y0, w), v(x1, y1, w * 0.8), v(x0, y1, w * 0.8)];
  const back = box.map((p) => v(p.x, p.y, -p.z));
  quad(box[0], box[1], box[2], box[3], CABIN);
  quad(back[1], back[0], back[3], back[2], CABIN);
  quad(box[3], box[2], back[2], back[3], CABIN);
  quad(box[1], back[1], back[2], box[2], CABIN);
  quad(back[0], box[0], box[3], back[3], CABIN);
  // Mast, a thin square spar, and the boom along the mainsail's foot
  const spar = (from, to, half) => {
    const sides = [v(half, 0, half), v(-half, 0, half), v(-half, 0, -half), v(half, 0, -half)];
    const dir = to.clone().sub(from);
    const turn = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), dir.clone().normalize());
    const at = (p, end) => p.clone().applyQuaternion(turn).add(end);
    for (let i = 0; i < 4; i++) {
      const [p, q] = [sides[i], sides[(i + 1) % 4]];
      quad(at(p, from), at(q, from), at(q, to), at(p, to), SPAR);
    }
  };
  const clew = v(-0.4, BOOM + 0.02, 0.1);
  spar(v(MAST_X, 0.1, 0), v(MAST_X, MAST, 0), MAST_HALF);
  spar(v(MAST_X, BOOM, 0), clew, MAST_HALF * 0.8);
  // Sails, each billowed to leeward (toward the camera) by a middle point,
  // so their facets catch the light differently
  const sail = (corners, billow) => {
    const middle = corners.reduce((sum, p) => sum.add(p), v(0, 0, 0)).divideScalar(3).add(billow);
    for (let i = 0; i < 3; i++) facets.push([corners[i], corners[(i + 1) % 3], middle, SAIL, 1]);
  };
  sail([v(MAST_X, BOOM + 0.02, 0), v(MAST_X, MAST - 0.04, 0), clew], v(-0.02, 0, 0.05));
  sail([v(MAST_X, MAST - 0.16, 0), v(0.5, 0.15, 0), v(0.16, 0.2, 0.09)], v(0.01, 0, 0.04));
  // The pennant, streaming aft from the masthead
  facets.push([v(MAST_X, MAST, 0), v(MAST_X, MAST - 0.045, 0), v(MAST_X - 0.11, MAST - 0.03, 0.01), PENNANT, 0]);
  return facets;
};
const FACETS = buildFacets();

// The facets placed (yawed, at `scale`), coloured from the sun's direction
// and the haze, sorted far to near from the camera at `camera` (boat-local,
// unrotated), in one triangle sink: first their reflection (mirrored in the
// water line, tinted with the water), then the boat
const buildGeometry = (scale, toSun, camera, haze) => {
  const turn = new THREE.Matrix4().makeRotationY(YAW);
  const sink = new TriangleSink(false);
  const normal = new THREE.Vector3();
  const sky = srgb(HAZE);
  const color = new THREE.Color();
  const placed = FACETS.map(([a, b, c, hex, kind]) => {
    const [pa, pb, pc] = [a, b, c].map((p) => p.clone().multiplyScalar(scale).applyMatrix4(turn));
    const middle = pa.clone().add(pb).add(pc).divideScalar(3);
    normal.subVectors(pb, pa).cross(pc.clone().sub(pa)).normalize();
    // The face the camera sees
    if (normal.dot(camera.clone().sub(middle)) < 0) normal.negate();
    const front = Math.max(normal.dot(toSun), 0);
    const through = Math.max(-normal.dot(toSun), 0);
    if (kind === 1) {
      color.copy(srgb(SAIL_SHADE)).lerp(srgb(SAIL), 0.35 + 0.65 * front).lerp(srgb(SAIL_GLOW), 0.55 * through);
    } else {
      color.copy(srgb(hex)).multiplyScalar(0.62 + 0.38 * front);
    }
    color.lerp(sky, haze);
    return { points: [pa, pb, pc], color: color.clone(), far: middle.distanceTo(camera), rig: kind === 1 || hex === SPAR || hex === PENNANT };
  });
  // The hull first, then the rig above it, each far to near
  placed.sort((p, q) => p.rig - q.rig || q.far - p.far);
  const water = srgb(WATER);
  for (const { points, color: c } of placed) {
    const tint = c.clone().lerp(water, REFLECT_TINT);
    sink.tri(...points.map((p) => new THREE.Vector3(p.x, -p.y, p.z)), tint, tint, tint);
  }
  for (const { points, color: c } of placed) sink.tri(...points, c, c, c);
  const geometry = sink.build();
  geometry.setAttribute("aColor", geometry.getAttribute("color"));
  geometry.deleteAttribute("color");
  const reflect = new Float32Array(placed.length * 6);
  reflect.fill(1, 0, placed.length * 3);
  geometry.setAttribute("aReflect", new THREE.BufferAttribute(reflect, 1));
  return geometry;
};

const createBoat = () => {
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uLeave: { value: 0 }, uWater: { value: 0 }, uScale: { value: 1 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.layers.set(LAYER);
  // After the sea (renderOrder 1), over it
  mesh.renderOrder = 2;
  mesh.visible = false;
  return mesh;
};

export default function Sailboat({ sun }) {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const aspect = size.width / size.height;
  const layout = layoutOf(isMobile, aspect);
  const spot = SPOT[!isMobile && layout === "portrait" ? "tall" : layout];
  const mesh = useMemo(createBoat, []);
  const scroll = useScroll();
  const ready = useRef(false);
  const fade = useRef(0);
  const time = useRef(0);

  // Its place, size and colours: the camera never moves, so this only
  // re-runs on resize
  const placement = useMemo(() => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const { x, depth, size: share, haze } = spot;
    const at = new THREE.Vector3((x - 0.5) * 2 * tanV * aspect * depth, 0, CAMERA_Z - depth);
    const scale = share * 2 * tanV * depth;
    // Toward the sun from the boat: the sun is far down the view, at its
    // screen place
    camera.updateMatrixWorld();
    const toSun = new THREE.Vector3((sun[0] * 2 - 1) * tanV * aspect, (1 - sun[1] * 2) * tanV, -1)
      .transformDirection(camera.matrixWorld);
    const eye = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_Z).sub(at);
    // Its water line below the eye-level horizon, in half screen heights, as
    // the sea's `far` haze term
    const far = Math.exp(-CAMERA_HEIGHT / (depth * tanV) / 0.35);
    return { at, scale, far, geometry: buildGeometry(scale, toSun, eye, haze) };
  }, [camera, spot, aspect, sun]);

  useLayoutEffect(() => {
    mesh.geometry = placement.geometry;
    mesh.position.copy(placement.at);
    mesh.parent.updateWorldMatrix(true, false);
    // The water line, in world height
    mesh.material.uniforms.uWater.value = mesh.parent.localToWorld(placement.at.clone()).y;
    mesh.material.uniforms.uScale.value = placement.scale;
    return () => placement.geometry.dispose();
  }, [mesh, placement]);

  useEffect(() => {
    ready.current = false;
    fade.current = 0;
    let live = true;
    const { gl, scene } = get();
    camera.layers.enable(LAYER);
    gl.compileAsync(mesh, camera, scene)
      .catch(() => {})
      .then(() => {
        if (live) ready.current = true;
      });
    return () => {
      live = false;
      camera.layers.disable(LAYER);
      mesh.material.dispose();
    };
  }, [mesh, camera, get]);

  // Reduced motion: no fade in (it appears at once), and it holds still
  useFrame((_, delta) => {
    if (!ready.current) return;
    if (fade.current < 1) {
      fade.current = prefersReducedMotion ? 1 : Math.min(1, fade.current + delta / FADE_SECONDS);
    }
    // How far the visitor has scrolled from Home toward Skills
    const leave = THREE.MathUtils.smoothstep(scroll.offset * (scroll.pages - 1), LEAVE_START, LEAVE_END);
    // The sea's own dissolve at the boat's water line (Sea's FRAGMENT): the
    // water there goes when its distance from the horizon, `far`, runs out
    const alpha = THREE.MathUtils.smoothstep(placement.far + 0.3 - leave * 1.3, 0, 0.3);
    const opacity = THREE.MathUtils.smoothstep(fade.current, 0, 1) * alpha;
    mesh.material.uniforms.uOpacity.value = opacity;
    mesh.material.uniforms.uLeave.value = leave;
    mesh.visible = opacity > 0;
    if (prefersReducedMotion || !mesh.visible) return;
    // A slow bob, roll and pitch, out of step with each other
    const t = (time.current += Math.min(delta, 0.1));
    mesh.position.y = placement.at.y + 0.035 * placement.scale * Math.sin(t * 1.21);
    mesh.rotation.set(0.06 * Math.sin(t * 0.86 + 1.3), 0, 0.03 * Math.sin(t * 1.53 + 0.4));
  });

  return <primitive object={mesh} />;
}
