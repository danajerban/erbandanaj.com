// The scene camera (SceneCanvas): at CAMERA_POSITION looking at the origin,
// CAMERA_FOV of vertical field. The sections rest 1 below the world origin,
// so in a section's own frame (y = 0 its floor, +z toward the camera) it
// stands CAMERA_HEIGHT above the floor at z CAMERA_Z, pitched down by PITCH
// toward (0, 1, 0). Plain numbers only (no three), so SceneCanvas and node
// scripts can import it.
export const CAMERA_POSITION = [0, 0.5, 5];
export const CAMERA_FOV = 42;
export const CAMERA_Z = CAMERA_POSITION[2];
export const CAMERA_HEIGHT = 1.5;
export const PITCH = Math.atan(CAMERA_POSITION[1] / CAMERA_Z);
export const HALF_FOV_TAN = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180));
