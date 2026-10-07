// Fails (exit 1) if the night park's plan overlaps in any layout: the gravel
// path through the pond, a bed, a lamp post or a tree trunk; a lamp, bed or
// tree in the pond; a lamp in a bed; the H3/H4 party wall off the avatar's
// axis; the story window behind his head; the path not ending at the café
// door. Samples the same curve the ground draws (pathCurve).
// Usage: node scripts/check-park-layout.mjs
import { HOUSE, HOUSES, PARK, cafeDoor, houseSpans, pathCurve } from "../src/lib/parkLayout.js";

const SAMPLES = 200;

// Signed clearance of a point from an ellipse [cx, cz, rx, rz] grown by g
// (approximate; > 0 outside)
const ellipse = ([x, z], [cx, cz, rx, rz], g) =>
  (Math.hypot((x - cx) / (rx + g), (z - cz) / (rz + g)) - 1) * Math.min(rx + g, rz + g);

let failures = 0;
const fail = (key, message) => {
  failures++;
  console.log(`  FAIL ${key}: ${message}`);
};

for (const [key, park] of Object.entries(PARK)) {
  const curve = pathCurve(park);
  const path = curve.getSpacedPoints(SAMPLES).map((p) => [p.x, p.z]);
  const half = park.pathW / 2;
  const pond = [park.pond.x, park.pond.z, park.pond.rx, park.pond.rz];
  const nearest = (point) => Math.min(...path.map(([x, z]) => Math.hypot(x - point[0], z - point[1])));

  const pathPond = Math.min(...path.map((q) => ellipse(q, pond, half + 0.2)));
  if (pathPond < 0) fail(key, `path in the pond (${pathPond.toFixed(2)})`);
  park.beds.forEach((bed, i) => {
    const clear = Math.min(...path.map((q) => ellipse(q, bed, half + 0.15)));
    if (clear < 0) fail(key, `path on bed ${i} (${clear.toFixed(2)})`);
    const rim = Array.from({ length: 64 }, (_, k) => [bed[0] + bed[2] * Math.cos((k / 64) * 2 * Math.PI), bed[1] + bed[3] * Math.sin((k / 64) * 2 * Math.PI)]);
    if (Math.min(...rim.map((q) => ellipse(q, pond, 0.2))) < 0) fail(key, `bed ${i} in the pond`);
  });
  park.lamps.forEach((lamp, i) => {
    const clear = nearest(lamp) - half - 0.15;
    if (clear < 0) fail(key, `lamp ${i} on the path (${clear.toFixed(2)})`);
    if (ellipse(lamp, pond, 0.25) < 0) fail(key, `lamp ${i} in the pond`);
    park.beds.forEach((bed, j) => {
      if (ellipse(lamp, bed, 0.25) < 0) fail(key, `lamp ${i} in bed ${j}`);
    });
  });
  park.trees.forEach((tree, i) => {
    const clear = nearest(tree) - half - 0.2;
    if (clear < 0) fail(key, `tree ${i} on the path (${clear.toFixed(2)})`);
    if (ellipse(tree, pond, 0.3) < 0) fail(key, `tree ${i} in the pond`);
  });

  const spans = houseSpans(park);
  const wall = spans[2].x1;
  if (Math.abs(wall) > 0.25) fail(key, `H3/H4 party wall at x ${wall.toFixed(2)}`);
  const storyHouse = HOUSES.findIndex((house) => house.storyWindow);
  const story = spans[storyHouse].x0 + HOUSE.windowX[HOUSES[storyHouse].storyWindow.column] * HOUSES[storyHouse].W * park.row.scale;
  if (Math.abs(story) < HOUSE.unlitAxis) fail(key, `story window at x ${story.toFixed(2)}`);
  const [doorX, doorZ] = cafeDoor(park);
  const [endX, endZ] = park.path[park.path.length - 1];
  if (Math.abs(endX - doorX) > 0.05 || Math.abs(endZ - (doorZ + 1.3)) > 0.05)
    fail(key, `path ends at [${endX}, ${endZ}], the café door is at [${doorX.toFixed(2)}, ${(doorZ + 1.3).toFixed(2)}]`);

  console.log(`${key}: party wall ${wall.toFixed(2)}, story window ${story.toFixed(2)}, path-pond ${pathPond.toFixed(2)}`);
}

if (failures) {
  console.log(`check-park-layout: ${failures} failure(s)`);
  process.exit(1);
}
console.log("check-park-layout: all clear");
