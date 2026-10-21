// Fails (exit 1) if the night park's plan overlaps in any layout: the gravel
// path through the pond, a bed, a lamp post or a tree trunk; a lamp, bed or
// tree in the pond; a lamp in a bed; the H3/H4 party wall off the avatar's
// axis; the story window behind his head; the path not ending at the café
// door. Samples the same curve the ground draws (pathCurve).
// The lawn's small things, at each layout's named screen sizes (the first
// bench moves with the width): a bench, the dog or a pond rock on the path,
// in the pond, a bed, on a lamp post or a tree trunk, behind the railing,
// on the other bench (the dog lies at the first bench's foot, nowhere else;
// the first bench itself is older than this check and is not held to it);
// a pebble where it should not lie; on desktop any of
// them in the contact card's corner (CARD_ZONE), on phones and the iPad the
// second bench in the card's band (y > 0.70); and any of them within 2r of
// the moon (MOON_AT) at the Contact rest.
// Usage: node scripts/check-park-layout.mjs
import {
  BENCH,
  BENCH_HALF,
  DOG_R,
  HOUSE,
  HOUSES,
  MAILBOX_AT,
  PARK,
  RAILING_FRONT,
  avatarAt,
  benchClear,
  benches,
  cafeDoor,
  dogAt,
  ellipseClear as ellipse,
  houseSpans,
  inCardZone,
  pathCurve,
  pathPebbles,
  pondRocks,
  restProjector,
} from "../src/lib/parkLayout.js";
import { MOON_AT } from "../src/lib/timeOfDay.js";

const SAMPLES = 200;
// Screen sizes per layout [W, H]: the first bench sits at −2·W/1920 + BENCH.x
const SIZES = {
  desktop: [[1800, 987], [1280, 800], [1920, 1080], [2560, 1440]],
  tall: [[1024, 1366]],
  portrait: [[393, 852], [402, 874]],
  landscape: [[852, 393], [874, 402]],
};
// The phones' and the iPad's card band; a bench's height (raw 2.12 × scale)
const CARD_BAND = 0.7;
const BENCH_TOP = 2.12 * BENCH.scale;

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

  // The lawn's small things
  const pondEllipse = [park.pond.x, park.pond.z, park.pond.rx, park.pond.rz];
  const railing = park.row.z + RAILING_FRONT;
  const rocks = pondRocks(park);
  rocks.forEach(([x, z, size], i) => {
    const at = [x, z];
    if (ellipse(at, pondEllipse, size * 0.3) < 0) fail(key, `rock ${i} in the pond`);
    if (nearest(at) - half - size < 0) fail(key, `rock ${i} on the path`);
    park.beds.forEach((bed, j) => ellipse(at, bed, size) < 0 && fail(key, `rock ${i} in bed ${j}`));
    park.lamps.forEach(([lx, lz], j) => Math.hypot(x - lx, z - lz) < size + 0.12 && fail(key, `rock ${i} on lamp ${j}`));
    park.trees.forEach(([tx, tz, ts], j) => Math.hypot(x - tx, z - tz) < size + 0.15 * ts && fail(key, `rock ${i} on tree ${j}`));
  });
  const pebbles = pathPebbles(park);
  pebbles.forEach(([x, z]) => {
    if (ellipse([x, z], pondEllipse, 0) < 0) fail(key, `pebble in the pond at [${x.toFixed(2)}, ${z.toFixed(2)}]`);
    if (park.beds.some((bed) => ellipse([x, z], bed, 0) < 0)) fail(key, `pebble in a bed at [${x.toFixed(2)}, ${z.toFixed(2)}]`);
    if (z < railing) fail(key, `pebble behind the railing at [${x.toFixed(2)}, ${z.toFixed(2)}]`);
  });

  for (const [W, H] of SIZES[key]) {
    const at = `${key} ${W}x${H}`;
    const sf = W / 1920;
    const aspect = W / H;
    const project = restProjector(key, aspect);
    const seats = benches(park, sf);
    const dog = dogAt(park, sf);
    // The first bench (ParkProps) predates this check: only the second is
    // held to the plan here; both are held to the new props below
    [seats[1]].forEach((bench) => {
      const i = 1;
      const clear = Math.min(...path.map((q) => benchClear(q, bench, half + 0.1)));
      if (clear < 0) fail(at, `bench ${i} on the path (${clear.toFixed(2)})`);
      const rim = Array.from({ length: 64 }, (_, k) => [pondEllipse[0] + pondEllipse[2] * Math.cos((k / 64) * 2 * Math.PI), pondEllipse[1] + pondEllipse[3] * Math.sin((k / 64) * 2 * Math.PI)]);
      if (benchClear([pondEllipse[0], pondEllipse[1]], bench, 0) < 0 || rim.some((q) => benchClear(q, bench, 0.1) < 0)) fail(at, `bench ${i} in the pond`);
      park.beds.forEach((bed, j) => {
        const edge = Array.from({ length: 32 }, (_, k) => [bed[0] + bed[2] * Math.cos((k / 32) * 2 * Math.PI), bed[1] + bed[3] * Math.sin((k / 32) * 2 * Math.PI)]);
        if (edge.some((q) => benchClear(q, bench, 0.05) < 0)) fail(at, `bench ${i} on bed ${j}`);
      });
      park.lamps.forEach((lamp, j) => benchClear(lamp, bench, 0.15) < 0 && fail(at, `bench ${i} on lamp ${j}`));
      park.trees.forEach((tree, j) => benchClear(tree, bench, 0.2 * tree[2]) < 0 && fail(at, `bench ${i} on tree ${j}`));
      rocks.forEach(([x, z, size], j) => benchClear([x, z], bench, size) < 0 && fail(at, `bench ${i} on rock ${j}`));
      if (benchClear(MAILBOX_AT, bench, 0.2) < 0) fail(at, `bench ${i} on the mailbox`);
      if (benchClear(avatarAt(key), bench, 0.35) < 0) fail(at, `bench ${i} on the avatar`);
      if (bench[1] - BENCH_HALF.along < railing) fail(at, `bench ${i} behind the railing`);
    });
    // The benches apart: no point of one's outline inside the other
    const outline = ([x, z, yaw]) => [-1, 1].flatMap((a) => [-1, 1].map((b) => [
      x + a * BENCH_HALF.across * Math.cos(yaw) + b * BENCH_HALF.along * Math.sin(yaw),
      z - a * BENCH_HALF.across * Math.sin(yaw) + b * BENCH_HALF.along * Math.cos(yaw),
    ]));
    if (outline(seats[0]).some((q) => benchClear(q, seats[1], 0.1) < 0) || outline(seats[1]).some((q) => benchClear(q, seats[0], 0.1) < 0)) fail(at, "the benches overlap");
    // The dog: at the first bench's foot, clear of everything else
    const dogPlace = [dog[0], dog[1]];
    if (benchClear(dogPlace, seats[0], DOG_R + 0.2) > 0) fail(at, "the dog is not by the first bench");
    if (benchClear(dogPlace, seats[1], DOG_R) < 0) fail(at, "the dog on the second bench");
    if (nearest(dogPlace) - half - DOG_R < 0) fail(at, "the dog on the path");
    if (ellipse(dogPlace, pondEllipse, DOG_R) < 0) fail(at, "the dog in the pond");
    park.beds.forEach((bed, j) => ellipse(dogPlace, bed, DOG_R) < 0 && fail(at, `the dog in bed ${j}`));
    park.lamps.forEach(([lx, lz], j) => Math.hypot(dog[0] - lx, dog[1] - lz) < DOG_R + 0.12 && fail(at, `the dog on lamp ${j}`));
    park.trees.forEach(([tx, tz, ts], j) => Math.hypot(dog[0] - tx, dog[1] - tz) < DOG_R + 0.15 * ts && fail(at, `the dog on tree ${j}`));
    const [ax, az] = avatarAt(key);
    if (Math.hypot(dog[0] - ax, dog[1] - az) < DOG_R + 0.4) fail(at, "the dog at the avatar's feet");
    // On screen: the card's place and the moon's 2r
    const outline3 = (bench) => outline(bench).flatMap(([x, z]) => [[x, 0, z], [x, BENCH_TOP, z]]);
    const dog3 = [[dog[0] - DOG_R, 0, dog[1]], [dog[0] + DOG_R, 0, dog[1]], [dog[0], 0.35, dog[1]]];
    const things = [
      ["bench 1", outline3(seats[1])],
      ["the dog", dog3],
      ...rocks.map(([x, z, size], i) => [`rock ${i}`, [[x - size, 0, z], [x + size, size, z], [x, 0, z + size]]]),
      ...pebbles.map(([x, z]) => ["a pebble", [[x, 0, z]]]),
    ];
    const r = Math.min(28, Math.max(18, 0.026 * Math.min(W, H)));
    const moon = MOON_AT[key];
    let moonClear = Infinity;
    for (const [name, points] of things) {
      const screen = points.map(project);
      if (screen.some((q) => inCardZone(key, q))) fail(at, `${name} in the contact card's corner`);
      for (const [fx, fy] of screen) moonClear = Math.min(moonClear, Math.hypot((fx - moon[0]) * W, (fy - moon[1]) * H));
    }
    if (key !== "desktop" && outline3(seats[1]).some((q) => project(q)[1] > CARD_BAND)) fail(at, "the second bench in the card's band");
    if (moonClear < 2 * r) fail(at, `a new prop ${moonClear.toFixed(0)} px from the moon (2r ${(2 * r).toFixed(0)})`);
    console.log(`  ${at}: ${pebbles.length} pebbles, ${rocks.length} rocks; moon clear by ${moonClear.toFixed(0)} px (2r ${(2 * r).toFixed(0)})`);
  }

  console.log(`${key}: party wall ${wall.toFixed(2)}, story window ${story.toFixed(2)}, path-pond ${pathPond.toFixed(2)}`);
}

if (failures) {
  console.log(`check-park-layout: ${failures} failure(s)`);
  process.exit(1);
}
console.log("check-park-layout: all clear");
