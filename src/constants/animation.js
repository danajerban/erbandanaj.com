// Animation constants to avoid magic numbers throughout the codebase

export const ANIMATION_CONSTANTS = {
  // Scroll detection
  SCROLL_DELTA_THRESHOLD: 0.00001,

  // Rotation
  ROTATION_DAMP_LAMBDA: 6, // MathUtils.damp lambda ≈ lerp alpha 0.1 @ 60fps
  EMISSIVE_DAMP_LAMBDA: 6, // mailbox glow ease — same response curve as rotation
  MOBILE_FORWARD_ROTATION: Math.PI / 2,
  MOBILE_BACKWARD_ROTATION: -Math.PI / 2,
  DESKTOP_BACKWARD_ROTATION: Math.PI,

  // Animation transitions
  ANIMATION_FADE_IN_DURATION: 0.5,
  ANIMATION_FADE_OUT_DURATION: 0.7,
  // The walk keeps going this long after the scroll offset stops moving, so
  // the damped scroll's tiny tail and momentum pauses don't flicker to idle.
  WALK_HOLD_MS: 200,

  // Overlay card entrance: each card fades in and rises this many px, the
  // cards of one section staggered by this many seconds (both breakpoints).
  CARD_RISE_PX: 12,
  CARD_STAGGER_DELAY: 0.08,
};

export const getSectionsDistance = (isMobile) => isMobile ? 7 : 10;
