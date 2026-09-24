// Fails if any `@media (max-width: …)` in src/**/*.css differs from the JS
// MOBILE_THRESHOLD in src/contexts/MobileContext.jsx. The inline splash media
// query in index.html is the one accepted duplicate and is not checked.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const jsSource = readFileSync("src/contexts/MobileContext.jsx", "utf8");
const threshold = jsSource.match(/MOBILE_THRESHOLD = (\d+)/)?.[1];
if (!threshold) {
  console.error("check-breakpoint: MOBILE_THRESHOLD not found in MobileContext.jsx");
  process.exit(1);
}

const cssFiles = readdirSync("src", { recursive: true })
  .filter((file) => file.endsWith(".css"))
  .map((file) => join("src", file));

let failed = false;
for (const file of cssFiles) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const width = line.match(/@media[^{]*max-width:\s*(\d+)px/)?.[1];
    if (width && width !== threshold) {
      console.error(
        `${file}:${i + 1}: max-width ${width}px != MOBILE_THRESHOLD ${threshold}px`,
      );
      failed = true;
    }
  });
}
process.exit(failed ? 1 : 0);
