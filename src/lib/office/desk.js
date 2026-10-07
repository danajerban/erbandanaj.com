import * as THREE from "three";
import { LIGHT } from "./bake";

// Projects: the owner's desk from the photos (desk corner step).
// out = { solid: OfficeSink, glow: GlowSink }; ctx = { isMobile, layout,
// random }; room-frame coordinates (ProjectsSection pushes the desk
// vignette onto both sinks around buildDesk).

// The desk's lights (room frame, before the vignette): the desk lamp's cone
// and its broad room fill, the monitor light bar (only in front of its
// plane) and the screen's spill
export const DESK_LIGHTS = [
  { p: new THREE.Vector3(1.72, 1.18, -1.38), color: LIGHT.desk, R: 1.0, w: 0.7, cone: true },
  { p: new THREE.Vector3(1.72, 1.18, -1.38), color: LIGHT.desk, R: 3.0, w: 0.25 },
  { p: new THREE.Vector3(1.35, 1.262, -1.48), color: LIGHT.lightBar, R: 0.6, w: 0.5, front: -1.5 },
  { p: new THREE.Vector3(1.35, 1.065, -1.45), color: LIGHT.screen, R: 1.2, w: 0.35 },
];

// Desk, its items, laptop, monitor body, light bar, desk lamp, bonsai ×2,
// desk glow decals
// eslint-disable-next-line no-unused-vars
export const buildDesk = (out, ctx) => {};

// The backpack: true scale, outside the vignette
// eslint-disable-next-line no-unused-vars
export const buildBackpack = (out, ctx) => {};
