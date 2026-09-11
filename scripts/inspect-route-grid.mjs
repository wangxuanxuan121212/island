import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
const records = readFileSync(
  ".dbg/trae-debug-log-map-navigation-state.ndjson",
  "utf8",
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const data = records
  .filter((record) => record.msg === "[DEBUG] walkable grid")
  .at(-1).data;
const { matrix, cell, minX, minZ, stations } = data;
const width = matrix[0].length,
  height = matrix.length;
const labels = matrix.map((row) => row.map(() => -1));
const sizes = [];
for (let z = 0; z < height; z++)
  for (let x = 0; x < width; x++) {
    if (matrix[z][x] || labels[z][x] !== -1) continue;
    const id = sizes.length,
      queue = [[x, z]];
    labels[z][x] = id;
    for (let index = 0; index < queue.length; index++) {
      const [cx, cz] = queue[index];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx,
          nz = cz + dz;
        if (
          nx < 0 ||
          nz < 0 ||
          nx >= width ||
          nz >= height ||
          matrix[nz][nx] ||
          labels[nz][nx] !== -1
        )
          continue;
        labels[nz][nx] = id;
        queue.push([nx, nz]);
      }
    }
    sizes.push(queue.length);
  }
const image = new PNG({ width: width * 5, height: height * 5 });
for (let z = 0; z < image.height; z++)
  for (let x = 0; x < image.width; x++) {
    const label = labels[Math.floor(z / 5)][Math.floor(x / 5)];
    const i = (z * image.width + x) * 4;
    const colors = [
      [99, 178, 143],
      [245, 166, 103],
      [145, 165, 227],
      [234, 139, 173],
      [210, 210, 112],
    ];
    const color = label < 0 ? [241, 243, 237] : colors[label % colors.length];
    for (let c = 0; c < 3; c++) image.data[i + c] = color[c];
    image.data[i + 3] = 255;
  }
writeFileSync("artifacts/driving/route-grid.png", PNG.sync.write(image));
writeFileSync(
  "artifacts/driving/route-grid.json",
  JSON.stringify(
    {
      sizes,
      stations: stations.map((s) => ({
        id: s.id,
        spawn: s.spawn,
        grid: [
          Math.round((s.spawn[0] - minX) / cell),
          Math.round((s.spawn[1] - minZ) / cell),
        ],
        component:
          labels[Math.round((s.spawn[1] - minZ) / cell)][
            Math.round((s.spawn[0] - minX) / cell)
          ],
      })),
    },
    null,
    2,
  ),
);
