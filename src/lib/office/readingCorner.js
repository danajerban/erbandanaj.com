import * as THREE from "three";
import { LIGHT } from "./bake";

// Skills: the reading corner (reading corner step): armchair, floor lamp,
// side table, bookcase, books, pothos, reading glow decals.
// out = { solid: OfficeSink, glow: GlowSink }; ctx = { isMobile, layout,
// random }; room-frame coordinates.

// The floor lamp's shade centre: its pool of light and a broad room fill
export const READING_LIGHTS = [
  { p: new THREE.Vector3(-2.2, 1.36, -1.25), color: LIGHT.reading, R: 1.8, w: 0.55 },
  { p: new THREE.Vector3(-2.2, 1.36, -1.25), color: LIGHT.reading, R: 3.0, w: 0.18 },
];

// eslint-disable-next-line no-unused-vars
export const buildReadingCorner = (out, ctx) => {};
