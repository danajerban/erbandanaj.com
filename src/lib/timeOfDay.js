import { byAspect } from "./aspectRows.js";

// The time of day: one object for the whole scene. The scroll is one evening,
// Home sunset → Skills afterglow → Projects blue hour → Contact night.
// <TimeOfDay> writes it once per frame, before every other frame callback;
// lazy parts read it in their own useFrame (never React state). Only lazy
// modules import this file, so it stays off the path to the first frame.
// Until <TimeOfDay> runs, every field holds its Home value.

// The moon's centre in screen fractions, by layout (lib/coast sceneLayoutOf)
// and aspect. Phones: per layout. Desktop and tall: [aspect, x, y] rows,
// linear between, held at the ends: upright screens high and left of the
// corner; squarish ones high, above the near lamp posts and below the menu;
// wide ones over the pond; very wide ones further left, clear of the far
// tree.
const MOON_PHONE = { portrait: [0.76, 0.17], landscape: [0.87, 0.2] };
const MOON_DESKTOP = [
  [0.75, 0.82, 0.12],
  [1, 0.9, 0.15],
  [1.12, 0.9, 0.15],
  [1.2, 0.9, 0.25],
  [1.85, 0.9, 0.25],
  [2, 0.86, 0.25],
  [2.2, 0.82, 0.25],
  [2.4, 0.8, 0.25],
  [2.6, 0.77, 0.25],
  [3, 0.7, 0.25],
];
export const moonAt = (layout, aspect) => MOON_PHONE[layout] ?? byAspect(MOON_DESKTOP, aspect);

export const timeOfDay = {
  s: 0, // eased section position (0..3): holds still around each section's rest
  night: 0, // s / 3
  lamps: 0, // lamp bulbs, windows, string lights: 0, 0.5, 1, 1 at the rests
  stars: 0, // 0, 0, 0.15, 1 at the rests
  moon: 0, // the moon's opacity: 0, 0, 0.25, 1 at the rests
  moonAt: moonAt("desktop", 16 / 9), // the moon's centre for the current screen
};
