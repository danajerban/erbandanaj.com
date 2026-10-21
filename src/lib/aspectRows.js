// Per-aspect tables: rows of [aspect, ...values], linear between, held at
// either end. The park's title and bench (parkLayout) and the moon
// (timeOfDay) are keyed by them. Pure, so node can import it.
export const byAspect = (rows, aspect) => {
  const i = rows.findIndex(([a]) => a >= aspect);
  if (i <= 0) return (i < 0 ? rows[rows.length - 1] : rows[0]).slice(1);
  const [from, to] = [rows[i - 1], rows[i]];
  const t = (aspect - from[0]) / (to[0] - from[0]);
  return from.slice(1).map((value, k) => value + (to[k + 1] - value) * t);
};
