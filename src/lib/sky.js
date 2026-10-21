// The Home sky's horizon haze: the scene's fog colour (SceneCanvas) until
// TimeOfDay (lazy) blends it along the evening. The CSS sky
// (--scene-horizon-color in index.css) and the index.html splash repeat it as
// literals.
export const HOME_FOG = "#f0c6b7";

// Sun placement as a screen fraction (x from the left, y from the top), so it
// holds at every viewport size; the CSS sky's radial warmth
// (--scene-sun-x/--scene-sun-y in index.css) and the index.html splash's copy
// of this sun are centered on the same fractions — keep them together when
// moving either. The camera pitches down at the origin, so its eye-level
// horizon crosses the screen ≈37 % from the top: the sun sits a little above
// that line, low over the sea.
// Mobile (both orientations): over the sea on the right, as on desktop.
export const SUN_SCREEN = { desktop: [0.855, 0.278], mobile: [0.8, 0.31] };
