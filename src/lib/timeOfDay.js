// The time of day: one object for the whole scene. The scroll is one evening,
// Home sunset → Skills afterglow → Projects blue hour → Contact night.
// <TimeOfDay> writes it once per frame, before every other frame callback;
// lazy parts read it in their own useFrame (never React state). Only lazy
// modules import this file, so it stays off the path to the first frame.
// Until <TimeOfDay> runs, every field holds its Home value.

// The moon's centre in screen fractions, per layout (the HomeSection keys:
// an upright screen past the breakpoint is "tall")
export const MOON_AT = {
  desktop: [0.9, 0.25],
  tall: [0.82, 0.12],
  portrait: [0.76, 0.17],
  landscape: [0.87, 0.2],
};

export const timeOfDay = {
  t: 0, // section position, clamped to 0..3
  s: 0, // eased t: holds still around each section's rest
  night: 0, // s / 3
  lamps: 0, // lamp bulbs, windows, string lights: 0, 0.5, 1, 1 at the rests
  stars: 0, // 0, 0, 0.15, 1 at the rests
  moon: 0, // the moon's opacity: 0, 0, 0.25, 1 at the rests
  moonAt: MOON_AT.desktop, // the moon's centre for the current layout
};
