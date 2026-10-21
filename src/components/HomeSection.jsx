import { Center, Float } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { PALM_Z, dryX, layoutOf } from "../lib/coast";
import { SilentErrorBoundary } from "./ErrorBoundary";
import { MacBookPro } from "./MacBookPro";
import { PalmTree } from "./PalmTree";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

// Sand, fallen coconuts and grass under the palms: a lazy chunk mounted after
// the first visible frame, like the background sections (Experience)
const BeachDecor = lazy(() => import("./BeachDecor"));
// The sea to the right of the island, from the shore (lib/coast) to the
// horizon: a lazy chunk mounted after the first visible frame, like BeachDecor
const Sea = lazy(() => import("./Sea"));
// Seashells and crabs along the shore, and a few gulls: lazy chunks mounted
// after the first visible frame, like the sea
const ShoreLife = lazy(() => import("./ShoreLife"));
const Birds = lazy(() => import("./Birds"));
// A dolphin in the sea: a lazy chunk mounted after the first visible frame
const Dolphin = lazy(() => import("./Dolphin"));
// A towel, cooler, sunglasses, earbuds and a beach umbrella by the laptop:
// a lazy chunk mounted after the first visible frame, like BeachDecor
const BeachProps = lazy(() => import("./BeachProps"));

// The palm group on the island's beach, drawn after the logo: three palms
// from one patch of sand — a tall, nearly straight one; one rooted behind
// it, its trunk sweeping across it out over the water; a shorter one in
// front, leaning out to sea. It stands on the shore's sand point, at the
// depths the point is shaped around (lib/coast PALM_Z), on dry sand: the
// waves wash up the beach to dryX, the front foot stays FOOT_MARGIN further
// in, for the trunk's root flare and a little sand, the others `inland`
// more (both scaled with the palm), so the group follows the shoreline at
// every aspect. yaw turns a palm about its foot (0 leans it toward the land,
// PI out over the sea), bend scales its lean and curve.
const FOOT_MARGIN = 0.22;
const FAN = [
  { scale: 1, yaw: 0.15, bend: 0.4, seed: 11 },
  { scale: 1.03, yaw: Math.PI + 0.15, bend: 2.6, seed: 23 },
  { scale: 0.8, yaw: Math.PI - 0.5, bend: 1, seed: 37 },
];
const PALMS = {
  desktop: [{ ...FAN[0], inland: 0.31 }, { ...FAN[1], inland: 0.59 }, FAN[2]],
  landscape: [{ ...FAN[0], inland: 0.39 }, { ...FAN[1], inland: 0.88 }, FAN[2]],
  // An upright screen has no room for the group between the avatar and the
  // sun over the sea: the same three stand inland left of the avatar
  // instead, `foot` a screen fraction from the left at their depth, the
  // two that lean out to sea on wide screens turned the other way (yaw
  // mirrored), so all three lean away from the avatar toward the left edge
  // and the crowns rise high above his head. An iPad Pro held upright
  // (tall) has room for a bigger group further left.
  portrait: [
    { ...FAN[0], foot: 0.24 },
    { ...FAN[1], yaw: Math.PI - FAN[1].yaw, foot: 0.25 },
    { ...FAN[2], yaw: Math.PI - FAN[2].yaw, foot: 0.27 },
  ],
  tall: [
    { ...FAN[0], foot: 0.225 },
    { ...FAN[1], yaw: Math.PI - FAN[1].yaw, foot: 0.235 },
    { ...FAN[2], yaw: Math.PI - FAN[2].yaw, foot: 0.255 },
  ],
};
// The whole group's size by layout (each palm scales about its foot):
// mobile held sideways a touch smaller, so the crowns stay below the menu
// on the short screen; upright a little smaller too, so the crowns stay
// below the title and clear of the avatar's head
const SIZE = { desktop: 1, landscape: 0.9, portrait: 0.85, tall: 0.95 };

// The laptop rests on the sand left of the avatar, on a beach towel
// with a cooler beside it (BeachProps) and sand under them (BeachDecor):
// the `laptop` prop tells both where. By composition: x, z, the middle of its base on the floor
// (Home-local); yaw, its turn about that middle (its keyboard faces
// (sin yaw, cos yaw) in xz); scale, its size (its base is 2.72 wide and
// 1.95 deep at 1). Upright screens lay it in the foreground, below-left of
// the avatar.
const LAPTOP = {
  desktop: { x: -1.45, z: -0.2, yaw: Math.PI / 4, scale: 0.27 },
  landscape: { x: -1.6, z: -2.5, yaw: Math.PI / 4, scale: 0.27 },
  portrait: { x: -0.3, z: 0.9, yaw: Math.PI / 4, scale: 0.117 },
  tall: { x: -0.45, z: 0.9, yaw: Math.PI / 4, scale: 0.135 },
};
// The model's base middle and underside, from its origin
const LAPTOP_BASE = [-0.023, 0.166, -0.253];

// The title, by composition: wide screens set it in the sky left of the
// avatar, below the menu's logo, clear of the palms, the sea and the sun;
// upright ones across the top, under the menu. Its middle sits at a screen
// fraction (x from the left, y from the top), `depth` down the view, and it
// is as large as fits `box` (screen width and height fractions), which
// leaves room for its gentle float.
const TITLE = {
  desktop: { at: [0.28, 0.285], depth: 8.5, box: [0.396, 0.176] },
  landscape: { at: [0.22, 0.245], depth: 8.5, box: [0.33, 0.22] },
  portrait: { at: [0.5, 0.145], depth: 8, box: [0.924, 0.121] },
  tall: { at: [0.5, 0.155], depth: 8, box: [0.858, 0.11] },
};
// Camera: SceneCanvas (position [0, 0.5, 5], fov 42, looking at the
// origin), so Home-local at (0, 1.5, 5), pitched down toward (0, 1, 0)
const HALF_FOV_TAN = Math.tan((21 * Math.PI) / 180);
const PITCH = Math.atan(0.1);
// Home-local point at a screen fraction, `depth` down the view
const onScreen = ([fx, fy], depth, aspect) => {
  const up = (1 - 2 * fy) * HALF_FOV_TAN * depth;
  return [
    (2 * fx - 1) * HALF_FOV_TAN * aspect * depth,
    1.5 - depth * Math.sin(PITCH) + up * Math.cos(PITCH),
    5 - depth * Math.cos(PITCH) - up * Math.sin(PITCH),
  ];
};
// The title's place, turn and scale (size: its width and height at scale
// 1). It faces the camera, so off to the side it still reads as flat as it
// did in the middle of the view.
const titlePlacement = ({ at, depth, box }, aspect, size) => {
  const position = onScreen(at, depth, aspect);
  const [dx, dy, dz] = [-position[0], 1.5 - position[1], 5 - position[2]];
  const view = 2 * HALF_FOV_TAN * depth;
  return {
    position,
    rotation: [-Math.asin(dy / Math.hypot(dx, dy, dz)), Math.atan2(dx, dz), 0, "YXZ"],
    scale: size ? Math.min((box[0] * view * aspect) / size[0], (box[1] * view) / size[1]) : 0,
  };
};
// The title sits on its own layer, which the camera renders and the
// contact-shadow pass does not: high over the sand, its shadow would print
// as a long dark streak far below it
const TITLE_LAYER = 6;
// The title is a two-line lockup: the first name above the surname, which
// is SURNAME times as big, each centred across, LINE_GAP (in first-name
// sizes) from the first name's baseline down to the surname's capitals
// (CAP high, in font sizes: Inter Bold). The font has no space glyph, so
// config.home.title writes the two names together, each capitalized.
const [FIRST_NAME, LAST_NAME] = config.home.title.split(/(?=[A-Z])/);
const SURNAME = 1.3;
const LINE_GAP = 0.3;
const CAP = 1.01;

// An upright screen past the breakpoint (an iPad Pro held upright) has
// the desktop's avatar, big in the middle, and the menu's logo top left:
// its palms, laptop and title keep clear of both
const spotOf = (isMobile, layout) => (!isMobile && layout === "portrait" ? "tall" : layout);

const palmLayout = (isMobile, aspect) => {
  const layout = layoutOf(isMobile, aspect);
  const spot = spotOf(isMobile, layout);
  return PALMS[spot].map(({ inland = 0, foot, ...spec }, i) => {
    const z = PALM_Z[layout][i];
    const scale = spec.scale * SIZE[spot];
    const x =
      foot === undefined
        ? dryX(z, isMobile, aspect) - (FOOT_MARGIN + inland) * scale
        : (foot - 0.5) * 2 * HALF_FOV_TAN * aspect * (5 - z);
    return { ...spec, x, z, scale };
  });
};

export const HomeSection = ({ revealed }) => {
  const { isMobile, prefersReducedMotion } = useMobile();
  // Rounded, so the palms rebuild only when the aspect really changes
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const layout = layoutOf(isMobile, aspect);
  const palms = useMemo(() => palmLayout(isMobile, aspect), [isMobile, aspect]);
  // The dry line's x at depth z, where the beach dressing ends
  const dry = useMemo(() => (z) => dryX(z, isMobile, aspect), [isMobile, aspect]);
  const spot = spotOf(isMobile, layout);
  const laptop = LAPTOP[spot];
  // The title's width and height at scale 1, measured once its font loads
  // (hidden until then)
  const [titleSize, setTitleSize] = useState(null);
  const onTitleCentered = useCallback(({ width, height }) => setTitleSize([width, height]), []);
  const title = useMemo(() => titlePlacement(TITLE[spot], aspect, titleSize), [spot, aspect, titleSize]);
  const titleFont = isMobile ? 0.75 : 0.7;
  const titleLook = { layers: TITLE_LAYER, bevelEnabled: true, bevelThickness: isMobile ? 0.1 : 0.2, letterSpacing: 0.05 };
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.layers.enable(TITLE_LAYER);
    return () => camera.layers.disable(TITLE_LAYER);
  }, [camera]);
  return (
    <SectionGroup name="home">
      <group position={[laptop.x, 0, laptop.z]} rotation-y={laptop.yaw} scale={laptop.scale}>
        <MacBookPro position={LAPTOP_BASE} />
      </group>
      <PalmTree palms={palms} />
      {revealed && (
        <SilentErrorBoundary>
          <Suspense fallback={null}>
            <BeachDecor palms={palms} dry={dry} laptop={laptop} />
          </Suspense>
        </SilentErrorBoundary>
      )}
      {revealed && (
        <SilentErrorBoundary>
          <Suspense fallback={null}>
            <Sea />
          </Suspense>
        </SilentErrorBoundary>
      )}
      {revealed && (
        <SilentErrorBoundary>
          <Suspense fallback={null}>
            <ShoreLife palms={palms} />
          </Suspense>
        </SilentErrorBoundary>
      )}
      {revealed && (
        <SilentErrorBoundary>
          <Suspense fallback={null}>
            <Birds />
          </Suspense>
        </SilentErrorBoundary>
      )}
      {revealed && (
        <SilentErrorBoundary>
          <Suspense fallback={null}>
            <Dolphin />
          </Suspense>
        </SilentErrorBoundary>
      )}
      {revealed && (
        <SilentErrorBoundary>
          <Suspense fallback={null}>
            <BeachProps laptop={laptop} />
          </Suspense>
        </SilentErrorBoundary>
      )}
      <group position={title.position} rotation={title.rotation} scale={title.scale}>
        <Float floatIntensity={1} speed={prefersReducedMotion ? 0 : 1}>
          <Center cacheKey={isMobile} onCentered={onTitleCentered}>
            <Center disableY disableZ cacheKey={isMobile} position-y={(CAP * SURNAME + LINE_GAP) * titleFont}>
              <SectionTitle {...titleLook} size={titleFont}>
                {FIRST_NAME}
              </SectionTitle>
            </Center>
            <Center disableY disableZ cacheKey={isMobile}>
              <SectionTitle {...titleLook} size={titleFont * SURNAME}>
                {LAST_NAME}
              </SectionTitle>
            </Center>
          </Center>
        </Float>
      </group>
    </SectionGroup>
  );
};
