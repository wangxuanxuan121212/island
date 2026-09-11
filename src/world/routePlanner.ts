import PF from "pathfinding";
import { stations, stationById, type StationId } from "../data";
import type { Solid } from "./models";
import { roads, onIsland } from "./roads";

export type RoutePoint = { x: number; z: number };
const CELL = 0.5;
const MIN_X = -34,
  MIN_Z = -40;
const COLS = 138,
  ROWS = 140;
const CLEARANCE = 1.35;
export const distance = (a: RoutePoint, b: RoutePoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);

export class RoutePlanner {
  private grid: PF.Grid;
  private finder = new PF.AStarFinder({
    diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles,
  });

  constructor(solids: Solid[]) {
    const obstacles = solids.filter((solid) => solid.hy > 0.25);
    const matrix = Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) => {
        const x = MIN_X + col * CELL,
          z = MIN_Z + row * CELL;
        if (!onIsland(x, z, 2)) return 1;
        return Number(
          obstacles.some((solid) => {
            const angle = solid.rotation ?? 0;
            const dx = x - solid.x,
              dz = z - solid.z;
            const outsideX = Math.max(
              0,
              Math.abs(Math.cos(angle) * dx - Math.sin(angle) * dz) - solid.hx,
            );
            const outsideZ = Math.max(
              0,
              Math.abs(Math.sin(angle) * dx + Math.cos(angle) * dz) - solid.hz,
            );
            return Math.hypot(outsideX, outsideZ) < CLEARANCE;
          }),
        );
      }),
    );
    this.grid = new PF.Grid(matrix);
    // #region debug-point D:walkable-grid
    if (
      location.hostname === "127.0.0.1" &&
      new URLSearchParams(location.search).has("debug")
    )
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "map-navigation-state",
          runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
          hypothesisId: "D",
          msg: "[DEBUG] walkable grid",
          location: "RoutePlanner:constructor",
          data: {
            matrix,
            cell: CELL,
            minX: MIN_X,
            minZ: MIN_Z,
            stations,
            roads,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    // #endregion
  }

  private cell(point: RoutePoint): [number, number] | null {
    const cx = Math.round((point.x - MIN_X) / CELL),
      cz = Math.round((point.z - MIN_Z) / CELL);
    let best: [number, number] | null = null,
      nearest = Infinity;
    // A visitor may start navigation while passing through a building.
    for (let x = cx - 12; x <= cx + 12; x++)
      for (let z = cz - 12; z <= cz + 12; z++) {
        const d = Math.hypot(x - cx, z - cz);
        if (
          d < nearest &&
          this.grid.isInside(x, z) &&
          this.grid.isWalkableAt(x, z)
        ) {
          nearest = d;
          best = [x, z];
        }
      }
    return best;
  }

  public find(start: RoutePoint, destination: StationId): RoutePoint[] {
    const station = stationById(destination);
    const from = this.cell(start),
      to = this.cell({ x: station.spawn[0], z: station.spawn[1] });
    if (!from || !to) return [];
    const path = this.finder.findPath(...from, ...to, this.grid.clone());
    // #region debug-point D:path-result
    if (
      location.hostname === "127.0.0.1" &&
      new URLSearchParams(location.search).has("debug")
    )
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "map-navigation-state",
          runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
          hypothesisId: "D",
          msg: "[DEBUG] path result",
          location: "RoutePlanner:find",
          data: { start, destination, from, to, count: path.length },
          ts: Date.now(),
        }),
      }).catch(() => {});
    // #endregion
    if (!path.length) return [];
    return PF.Util.compressPath(path).map(([x, z]) => ({
      x: MIN_X + x * CELL,
      z: MIN_Z + z * CELL,
    }));
  }
}

export function distanceToRoute(point: RoutePoint, route: RoutePoint[]) {
  let nearest = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - a.x) * dx + (point.z - a.z) * dz) /
          (dx * dx + dz * dz || 1),
      ),
    );
    nearest = Math.min(
      nearest,
      Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz),
    );
  }
  return nearest;
}
