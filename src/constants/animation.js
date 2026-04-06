// Animation constants to avoid magic numbers throughout the codebase

export const ANIMATION_CONSTANTS = {
  // Scroll detection
  SCROLL_DELTA_THRESHOLD: 0.00001,

  // Rotation
  ROTATION_LERP_SPEED: 0.1,
  MOBILE_FORWARD_ROTATION: Math.PI / 2,
  MOBILE_BACKWARD_ROTATION: -Math.PI / 2,
  DESKTOP_BACKWARD_ROTATION: Math.PI,

  // Animation transitions
  ANIMATION_FADE_IN_DURATION: 0.5,
  ANIMATION_FADE_OUT_DURATION: 0.7,

  // Stagger delays
  SKILL_STAGGER_DELAY: 0.62,
  PROJECT_STAGGER_DELAY: 0.5,
};

export const getSectionsDistance = (isMobile) => isMobile ? 7 : 10;
