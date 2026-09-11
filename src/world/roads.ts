import { stationById, type StationId } from "../data";

export const ISLAND = { x: -1, z: -3, radiusX: 27, radiusZ: 26 };
export const ROAD_WIDTH = 6.4;
export const ROAD_LINKS: [StationId, StationId][] = [
  ["welcome", "career"],
  ["welcome", "lab"],
  ["welcome", "campus"],
  ["welcome", "park"],
  ["career", "contact"],
  ["contact", "lab"],
  ["career", "campus"],
  ["campus", "park"],
  ["lab", "park"],
];

const bends: Record<string, [number, number][]> = {
  "welcome-career": [[-5, 1]],
  "welcome-lab": [[6, -3]],
  "welcome-campus": [[-3, 8]],
  "welcome-park": [[7, 7]],
  "career-contact": [
    [-8, -5],
    [-7, -12],
  ],
  "contact-lab": [[3, -13]],
  "career-campus": [
    [-19, 2],
    [-18, 11],
    [-15, 16],
  ],
  "campus-park": [[1, 17]],
  "lab-park": [
    [18, -4],
    [20, 3],
    [19, 12],
  ],
};

export const roads = ROAD_LINKS.map(([from, to]) => {
  const a = stationById(from),
    b = stationById(to);
  return {
    from,
    to,
    points: [a.spawn, ...(bends[`${from}-${to}`] ?? []), b.spawn].map(
      ([x, z]) => ({ x, z }),
    ),
  };
});

export function onIsland(x: number, z: number, margin = 0) {
  return (
    ((x - ISLAND.x) / (ISLAND.radiusX - margin)) ** 2 +
      ((z - ISLAND.z) / (ISLAND.radiusZ - margin)) ** 2 <
    1
  );
}

export function distanceToRoad(x: number, z: number) {
  let nearest = Infinity;
  for (const road of roads) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
      );
      nearest = Math.min(
        nearest,
        Math.hypot(x - a.x - dx * t, z - a.z - dz * t),
      );
    }
  }
  return nearest;
}

// Same orientation as the fixed isometric camera, including its pitch.
export function projectMap(x: number, z: number) {
  const length = Math.hypot(20, 30);
  return {
    x: (30 * x - 20 * z) / length,
    y: ((20 * x + 30 * z) / length) * 0.57,
  };
}

export function mapPoint(x: number, z: number) {
  const p = projectMap(x, z);
  return { x: ((p.x + 22) / 48) * 100, y: ((p.y + 19) / 35) * 100 };
}

export function mapHeading(yaw: number) {
  const p = projectMap(Math.sin(yaw), Math.cos(yaw));
  return (Math.atan2(p.x, -p.y) * 180) / Math.PI;
}
