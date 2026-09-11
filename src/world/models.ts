import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { stations, type StationId } from "../data";
import { ISLAND, ROAD_WIDTH, roads, distanceToRoad, onIsland } from "./roads";

export const palette = {
  green: "#8bbe7a",
  grass: "#8cbd88",
  leaf: "#67b38b",
  pink: "#f2a9b5",
  coral: "#f16656",
  yellow: "#f3d47b",
  ivory: "#fffaf0",
  ink: "#374e54",
  teal: "#64bcb3",
  blue: "#89c2d5",
  stone: "#f0ede1",
  wood: "#bc8c64",
};
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function material(color: string) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 }),
    );
  return materials.get(color)!;
}
const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.IcosahedronGeometry(1, 1);

export function box(
  parent: THREE.Object3D,
  color: string,
  size: number[],
  position: number[],
  rounded = false,
) {
  const geometry = rounded
    ? new RoundedBoxGeometry(
        size[0],
        size[1],
        size[2],
        2,
        Math.min(...size) * 0.16,
      )
    : cube;
  const mesh = new THREE.Mesh(geometry, material(color));
  if (!rounded) mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function ball(
  parent: THREE.Object3D,
  color: string,
  scale: number[],
  position: number[],
) {
  const mesh = new THREE.Mesh(sphere, material(color));
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cylinder(
  parent: THREE.Object3D,
  color: string,
  r1: number,
  r2: number,
  height: number,
  position: number[],
  segments = 24,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r1, r2, height, segments),
    material(color),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function label(
  parent: THREE.Object3D,
  text: string,
  width: number,
  position: number[],
  color = palette.ink,
  bg = palette.ivory,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = color;
  ctx.font = 'bold 86px Arial, "PingFang SC", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 135, 950);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

export function tree(
  parent: THREE.Object3D,
  x: number,
  z: number,
  height = 5,
  color = palette.leaf,
  seed = 0,
) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  cylinder(
    group,
    palette.wood,
    0.19,
    0.29,
    height * 0.7,
    [0, height * 0.35, 0],
    7,
  );
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + seed;
    const branch = cylinder(
      group,
      palette.wood,
      0.09,
      0.14,
      height * 0.37,
      [Math.sin(a) * 0.4, height * 0.5, Math.cos(a) * 0.4],
      6,
    );
    branch.rotation.z = Math.sin(a) * 0.6;
    branch.rotation.x = Math.cos(a) * 0.6;
  }
  for (let i = 0; i < 13; i++) {
    const a = i * 2.399 + seed;
    const radius = Math.sqrt(i / 13) * height * 0.25;
    const size = ((0.65 + ((i * 7) % 5) * 0.09) * height) / 4;
    const leaf = ball(
      group,
      i % 4 === 0
        ? new THREE.Color(color)
            .lerp(new THREE.Color("#ffffff"), 0.16)
            .getStyle()
        : color,
      [size * 1.25, size, size * 1.1],
      [
        Math.cos(a) * radius,
        height * 0.65 +
          Math.sin(i * 1.7) * 0.35 +
          (1 - radius / (height * 0.3)) * height * 0.24,
        Math.sin(a) * radius,
      ],
    );
    leaf.rotation.set(i, a, 0);
  }
  parent.add(group);
  return group;
}

function flowers(parent: THREE.Object3D, x: number, z: number, color: string) {
  for (let j = 0; j < 5; j++) {
    const a = j * 2.4;
    const px = x + Math.cos(a) * 0.4,
      pz = z + Math.sin(a) * 0.4;
    cylinder(parent, "#73a679", 0.025, 0.025, 0.33, [px, 0.18, pz], 4);
    ball(parent, color, [0.12, 0.07, 0.12], [px, 0.38 + (j % 2) * 0.08, pz]);
  }
}

function planter(parent: THREE.Object3D, x: number, z: number, color: string) {
  cylinder(parent, "#e5e9dd", 0.76, 0.67, 0.38, [x, 0.3, z], 16);
  cylinder(parent, "#6e8f69", 0.64, 0.64, 0.06, [x, 0.51, z], 16);
  const planting = new THREE.Group();
  planting.position.y = 0.43;
  flowers(planting, x, z, color);
  parent.add(planting);
}

function roadSurface(parent: THREE.Group) {
  // Bake intersecting paths into one surface so junctions cannot z-fight.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = palette.grass;
  ctx.fillRect(0, 0, 2048, 2048);
  ctx.scale(2048 / (ISLAND.radiusX * 2), 2048 / (ISLAND.radiusZ * 2));
  ctx.translate(ISLAND.radiusX - ISLAND.x, ISLAND.radiusZ - ISLAND.z);
  const paths = new Path2D();
  for (const road of roads) {
    paths.moveTo(road.points[0].x, road.points[0].z);
    for (const point of road.points.slice(1)) paths.lineTo(point.x, point.z);
  }
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = "#e6edde";
  ctx.lineWidth = ROAD_WIDTH + 0.5;
  ctx.stroke(paths);
  ctx.strokeStyle = "#b7c7bf";
  ctx.lineWidth = ROAD_WIDTH;
  ctx.stroke(paths);
  ctx.strokeStyle = "#e7ecdf";
  ctx.lineWidth = 0.1;
  ctx.setLineDash([0.65, 0.95]);
  ctx.stroke(paths);
  ctx.setLineDash([]);
  for (const station of stations) {
    const [x, z] = station.position;
    for (const [radius, color] of [
      [station.radius * 0.73, "#e6ebdf"],
      [station.radius * 0.69, station.id === "park" ? "#8db782" : "#d6ded2"],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, z, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(1, 128),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.scale.set(ISLAND.radiusX, ISLAND.radiusZ, 1);
  surface.position.set(ISLAND.x, 0.166, ISLAND.z);
  surface.receiveShadow = true;
  parent.add(surface);
}

function bench(parent: THREE.Object3D, x: number, z: number, angle = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  for (const px of [-1.15, 1.15]) {
    box(group, palette.ink, [0.13, 1.4, 0.13], [px, 0.7, -0.3]);
    box(group, palette.ink, [0.13, 0.7, 0.13], [px, 0.35, 0.5]);
  }
  for (let i = 0; i < 3; i++) {
    box(
      group,
      palette.wood,
      [3, 0.13, 0.25],
      [0, 0.76, -0.15 + i * 0.28],
      true,
    );
    box(group, palette.wood, [3, 0.26, 0.12], [0, 1.05 + i * 0.3, -0.4], true);
  }
  parent.add(group);
}

function lamp(parent: THREE.Object3D, x: number, z: number) {
  cylinder(parent, palette.ink, 0.08, 0.13, 3.5, [x, 1.75, z], 8);
  box(parent, palette.ink, [0.7, 0.09, 0.7], [x, 3.3, z]);
  box(parent, "#fff2c1", [0.48, 0.65, 0.48], [x, 3.65, z], true);
  const top = cylinder(parent, palette.teal, 0, 0.58, 0.35, [x, 4.1, z], 4);
  top.rotation.y = Math.PI / 4;
  cylinder(parent, palette.ink, 0.3, 0.34, 0.17, [x, 0.1, z], 8);
}

function fence(
  parent: THREE.Object3D,
  x: number,
  z: number,
  length: number,
  angle = 0,
) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  for (let i = 0; i <= length; i++)
    box(group, palette.ivory, [0.16, 0.85, 0.16], [i - length / 2, 0.43, 0]);
  for (const y of [0.27, 0.63])
    box(group, palette.ivory, [length, 0.12, 0.1], [0, y, 0.03]);
  parent.add(group);
}

export function makeCar(color: string) {
  const car = new THREE.Group();
  car.name = "island-runabout";
  const wheels: THREE.Group[] = [];
  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.12,
  });
  const porcelain = new THREE.MeshStandardMaterial({
    color: "#f6f6e9",
    roughness: 0.5,
    metalness: 0.04,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: "#b6cbc6",
    roughness: 0.27,
    metalness: 0.65,
  });
  const upholstery = material("#dba692");
  const charcoal = material("#304c4d");
  const rubber = material("#3d4a48");
  const sculpt = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    size: [number, number, number],
    position: [number, number, number],
    radius = 0.12,
  ) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(
        ...size,
        radius > 0.2 ? 3 : Math.min(...size) < 0.12 ? 1 : 2,
        Math.min(radius, ...size.map((n) => n / 2)),
      ),
      mat,
    );
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const ring = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    radius: number,
    tube: number,
    position: [number, number, number],
    arc = Math.PI * 2,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 6, 28, arc),
      mat,
    );
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  sculpt(car, charcoal, [1.94, 0.22, 3.34], [0, 0.7, 0], 0.1);
  sculpt(car, paint, [2.04, 0.64, 1.24], [0, 1.09, 1.1], 0.29);
  sculpt(car, paint, [2.04, 0.6, 1.05], [0, 1.07, -1.24], 0.25);
  sculpt(car, porcelain, [1.96, 0.22, 1.2], [0, 1.46, 1.1], 0.1);
  sculpt(car, porcelain, [1.94, 0.17, 0.73], [0, 1.41, -1.39], 0.08);
  sculpt(car, charcoal, [1.66, 0.06, 1.62], [0, 0.85, -0.05], 0.025);
  for (const side of [-1, 1]) {
    sculpt(car, paint, [0.18, 0.32, 1.7], [side * 0.94, 0.94, -0.13], 0.08);
    sculpt(car, chrome, [0.08, 0.07, 2.5], [side * 1.03, 0.89, 0], 0.03);
    sculpt(car, charcoal, [0.3, 0.09, 1.18], [side * 1.05, 0.66, -0.06], 0.04);
    sculpt(
      car,
      porcelain,
      [0.09, 0.055, 0.91],
      [side * 1.14, 0.72, -0.06],
      0.025,
    );
    for (const z of [1.16, -1.14]) {
      const fender = ring(
        car,
        paint,
        0.63,
        0.15,
        [side * 1.08, 0.59, z],
        Math.PI,
      );
      fender.rotation.y = Math.PI / 2;
      const piping = ring(
        car,
        porcelain,
        0.66,
        0.025,
        [side * 1.24, 0.59, z],
        Math.PI,
      );
      piping.rotation.y = Math.PI / 2;
    }
  }

  for (const x of [-0.44, 0.44]) {
    sculpt(car, porcelain, [0.77, 0.16, 0.79], [x, 1.02, -0.29], 0.08);
    sculpt(car, upholstery, [0.69, 0.18, 0.71], [x, 1.13, -0.28], 0.09);
    sculpt(
      car,
      porcelain,
      [0.77, 0.74, 0.15],
      [x, 1.43, -0.64],
      0.07,
    ).rotation.x = -0.1;
    sculpt(
      car,
      upholstery,
      [0.65, 0.57, 0.09],
      [x, 1.44, -0.54],
      0.04,
    ).rotation.x = -0.1;
    for (let i = -1; i <= 1; i++)
      sculpt(
        car,
        porcelain,
        [0.014, 0.4, 0.017],
        [x + i * 0.16, 1.42, -0.473],
        0.007,
      );
  }
  sculpt(car, charcoal, [1.62, 0.19, 0.25], [0, 1.48, 0.63], 0.07);
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(-0.44, 1.63, 0.34);
  steeringWheel.rotation.x = -0.55;
  ring(steeringWheel, charcoal, 0.23, 0.032, [0, 0, 0]);
  for (const angle of [0, 2.1, 4.2])
    sculpt(
      steeringWheel,
      chrome,
      [0.018, 0.24, 0.026],
      [0, 0, 0],
      0.008,
    ).rotation.z = angle;
  ball(steeringWheel, "#dae6de", [0.055, 0.055, 0.025], [0, 0, 0.018]);
  car.add(steeringWheel);

  const windshield = new THREE.Group();
  windshield.position.set(0, 1.91, 0.78);
  windshield.rotation.x = -0.14;
  const glass = new THREE.Mesh(
    new RoundedBoxGeometry(1.64, 0.73, 0.025, 2, 0.012),
    new THREE.MeshStandardMaterial({
      color: "#a3d3d5",
      roughness: 0.22,
      metalness: 0.12,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    }),
  );
  windshield.add(glass);
  for (const x of [-0.86, 0.86])
    sculpt(windshield, chrome, [0.06, 0.89, 0.05], [x, 0, 0], 0.025);
  for (const y of [-0.41, 0.41])
    sculpt(windshield, porcelain, [1.76, 0.06, 0.055], [0, y, 0], 0.025);
  sculpt(
    windshield,
    charcoal,
    [0.025, 0.32, 0.025],
    [-0.32, -0.16, 0.035],
    0.01,
  ).rotation.z = -0.48;
  car.add(windshield);

  for (const side of [-1, 1]) {
    for (const z of [0.72, -1.24]) {
      const post = cylinder(
        car,
        "#e7ece2",
        0.034,
        0.034,
        1.15,
        [side * 0.88, 1.99, z],
        10,
      );
      post.rotation.z = side * 0.04;
    }
    sculpt(car, chrome, [0.31, 0.045, 0.045], [side * 1.02, 1.94, 0.63], 0.02);
    sculpt(car, paint, [0.11, 0.25, 0.32], [side * 1.18, 1.98, 0.62], 0.05);
    sculpt(car, chrome, [0.015, 0.19, 0.23], [side * 1.24, 1.98, 0.62], 0.007);
  }
  sculpt(car, paint, [2.1, 0.09, 2.5], [0, 2.58, -0.28], 0.04);
  sculpt(car, porcelain, [2.17, 0.18, 2.58], [0, 2.67, -0.28], 0.085);
  for (const x of [-0.7, 0.7])
    sculpt(car, paint, [0.08, 0.012, 2.15], [x, 2.764, -0.28], 0.006);

  for (const z of [-1.82, 1.77])
    sculpt(car, chrome, [2.1, 0.12, 0.16], [0, 0.87, z], 0.06);
  for (const x of [-0.68, 0.68]) {
    const housing = cylinder(
      car,
      "#e9ede3",
      0.25,
      0.25,
      0.1,
      [x, 1.2, 1.71],
      24,
    );
    housing.rotation.x = Math.PI / 2;
    const lens = cylinder(
      car,
      "#ffedbc",
      0.185,
      0.185,
      0.04,
      [x, 1.2, 1.78],
      24,
    );
    lens.rotation.x = Math.PI / 2;
    ring(car, chrome, 0.22, 0.025, [x, 1.2, 1.77]);
    sculpt(car, upholstery, [0.14, 0.055, 0.06], [x, 0.96, 1.74], 0.025);
    sculpt(
      car,
      material("#df786a"),
      [0.17, 0.24, 0.065],
      [x, 1.13, -1.77],
      0.035,
    );
  }
  for (const y of [1.02, 1.1, 1.18])
    sculpt(car, charcoal, [0.53, 0.025, 0.04], [0, y, 1.728], 0.012);
  const badge = label(
    car,
    "xw.",
    0.38,
    [0, 1.33, 1.735],
    palette.ink,
    "#f6f6e9",
  );
  badge.scale.y = 1.35;
  label(car, "ISLAND 01", 0.54, [0, 0.76, 1.865], palette.ink, "#f6f6e9");

  const basket = new THREE.Group();
  basket.position.set(0, 1.58, -1.33);
  sculpt(basket, material("#c7ad7e"), [1.06, 0.29, 0.46], [0, 0, 0], 0.06);
  for (let i = 0; i < 6; i++)
    sculpt(
      basket,
      porcelain,
      [0.034, 0.24, 0.48],
      [-0.42 + i * 0.17, 0, 0],
      0.012,
    );
  sculpt(basket, upholstery, [0.34, 0.06, 0.5], [0.2, 0.18, 0], 0.025);
  car.add(basket);

  for (const [x, z] of [
    [-1.13, 1.16],
    [1.13, 1.16],
    [-1.13, -1.14],
    [1.13, -1.14],
  ]) {
    const wheel = new THREE.Group();
    wheel.name = `runabout-wheel-${wheels.length}`;
    wheel.position.set(x, 0.58, z);
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.56, 0.34, 28),
      rubber,
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheel.add(tire);
    for (const side of [-1, 1]) {
      ring(wheel, rubber, 0.46, 0.12, [side * 0.12, 0, 0]).rotation.y =
        Math.PI / 2;
      ring(wheel, porcelain, 0.35, 0.058, [side * 0.237, 0, 0]).rotation.y =
        Math.PI / 2;
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.265, 0.265, 0.03, 24),
        paint,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * 0.255;
      wheel.add(hub);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const vent = new THREE.Mesh(
          new THREE.SphereGeometry(0.029, 6, 4),
          charcoal,
        );
        vent.position.set(side * 0.28, Math.sin(a) * 0.19, Math.cos(a) * 0.19);
        wheel.add(vent);
      }
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.115, 12, 8),
        chrome,
      );
      cap.scale.set(0.42, 1, 1);
      cap.position.x = side * 0.28;
      wheel.add(cap);
    }
    car.add(wheel);
    wheels.push(wheel);
  }
  return { car, wheels };
}

export type Solid = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  rotation?: number;
  dynamic?: boolean;
  mesh?: THREE.Object3D;
};
export type WorldModels = {
  welcome: THREE.Group;
  surroundings: THREE.Group;
  solids: Solid[];
  trees: THREE.Group[];
  flags: THREE.Mesh[];
  windmill: THREE.Group;
  ball: THREE.Mesh;
};

export function buildWorld(scene: THREE.Scene): WorldModels {
  const welcome = new THREE.Group();
  const surroundings = new THREE.Group();
  const solids: Solid[] = [];
  const trees: THREE.Group[] = [];
  const flags: THREE.Mesh[] = [];
  scene.add(welcome, surroundings);
  const islands = new Map<StationId, THREE.Group>();

  // One continuous ground connects every district, including the grass shortcuts.
  for (const [rx, rz, height, y, color] of [
    [ISLAND.radiusX + 1.15, ISLAND.radiusZ + 1.15, 0.16, -1.12, "#78c5bd"],
    [ISLAND.radiusX + 0.45, ISLAND.radiusZ + 0.45, 0.28, -0.91, "#d5ddd3"],
    [ISLAND.radiusX, ISLAND.radiusZ, 0.95, -0.38, "#c6d5bd"],
    [ISLAND.radiusX, ISLAND.radiusZ, 0.12, 0.1, palette.grass],
  ] as const) {
    const ground = cylinder(
      welcome,
      color,
      1,
      1,
      height,
      [ISLAND.x, y, ISLAND.z],
      128,
    );
    ground.scale.set(rx, 1, rz);
  }
  roadSurface(welcome);

  for (const station of stations) {
    const group = new THREE.Group();
    group.position.set(station.position[0], 0, station.position[1]);
    islands.set(station.id, group);
    (station.id === "welcome" ? welcome : surroundings).add(group);
    // Decorations stay outside the promenade; all remain pass-through.
    for (let i = 0; i < 10; i++) {
      const a = i * 2.399 + station.number.length;
      const radius = station.radius * 0.86;
      const x = Math.cos(a) * radius,
        z = Math.sin(a) * radius;
      const wx = x + station.position[0],
        wz = z + station.position[1];
      if (
        !onIsland(wx, wz, 1.6) ||
        distanceToRoad(wx, wz) < ROAD_WIDTH / 2 + 0.5
      )
        continue;
      if (i % 3 === 0)
        flowers(group, x, z, i % 2 ? palette.ivory : palette.coral);
      else
        ball(
          group,
          i % 2 ? "#dfe6d5" : "#f8f2df",
          [0.38, 0.22, 0.32],
          [x, 0.22, z],
        );
    }
  }

  const start = islands.get("welcome")!;
  trees.push(
    tree(start, -4.2, -4.8, 5.6, palette.pink),
    tree(start, 1.2, -5.9, 5.8, palette.pink, 1),
  );
  bench(start, -1.4, -4.7);
  lamp(start, -5.5, -3);
  planter(start, -3.5, -3.9, palette.ivory);
  planter(start, 0.8, -4.3, palette.coral);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    box(
      start,
      i % 5 === 0 ? "#b7c8ba" : "#f1f2e8",
      [0.42, 0.016, 0.2],
      [Math.sin(a) * 4.7, 0.217, Math.cos(a) * 4.7],
    ).rotation.y = a;
  }
  const sign = new THREE.Group();
  sign.position.set(4.5, 0, -3.5);
  sign.rotation.y = -0.35;
  box(sign, palette.wood, [0.16, 2.5, 0.16], [0, 1.25, 0]);
  box(sign, palette.ivory, [2.7, 0.67, 0.17], [0, 2.2, 0], true);
  label(sign, "STAY CURIOUS", 2.5, [0, 2.2, 0.092]);
  box(sign, palette.teal, [2.3, 0.55, 0.17], [0.1, 1.5, 0], true);
  label(sign, "下一站 →", 2.0, [0.1, 1.5, 0.095], palette.ivory, palette.teal);
  start.add(sign);

  const career = islands.get("career")!;
  const companies = [
    { x: -4.3, z: -1.2, height: 3.1, color: "#95b6c6", name: "McKINSEY" },
    { x: -0.3, z: -3.3, height: 4.7, color: "#f1d786", name: "ByteDance" },
    { x: 3.8, z: -1.9, height: 3.7, color: "#9bc5b7", name: "ANT GROUP" },
  ];
  for (const building of companies) {
    const { x, z, height: h, color, name } = building;
    const facade = new THREE.Group();
    career.add(facade);
    box(facade, palette.ivory, [3.3, h, 2.9], [x, h / 2 + 0.15, z], true);
    box(facade, color, [3.6, 0.32, 3.2], [x, h + 0.3, z], true);
    box(facade, color, [3.4, 0.65, 0.35], [x, 2.1, z + 1.48], true);
    label(facade, name, 3, [x, 2.1, z + 1.67], palette.ink, color);
    for (const wx of [-0.86, 0.86])
      for (let y = 1; y < h - 0.1; y += 1.2)
        box(
          facade,
          "#749ca7",
          [0.6, 0.73, 0.05],
          [x + wx, y + 0.2, z + 1.47],
          true,
        );
    box(facade, palette.ink, [0.63, 1.05, 0.07], [x, 0.66, z + 1.5], true);
    box(facade, "#577d78", [2.6, 0.12, 1.4], [x, h + 0.52, z - 0.2], true);
    for (const px of [-0.85, 0.85]) planter(career, x + px, z + 2.15, color);
    solids.push({
      x: x + career.position.x,
      y: h / 2,
      z: z + career.position.z,
      hx: 1.65,
      hy: h / 2,
      hz: 1.45,
      mesh: facade,
    });
  }
  trees.push(
    tree(career, -5.9, 3.9, 4.2, palette.leaf),
    tree(career, 5.8, 1.2, 4.2, "#c6d992"),
  );
  bench(career, -5.6, 1.8, 1.15);
  lamp(career, 5.6, 2.7);

  const labPlot = islands.get("lab")!;
  const lab = new THREE.Group();
  labPlot.add(lab);
  box(lab, palette.ivory, [7.0, 2.9, 4.5], [0, 1.6, -1.7], true);
  box(lab, palette.teal, [7.3, 0.32, 4.8], [0, 3.24, -1.7], true);
  box(lab, "#527f8c", [5.8, 1.5, 0.1], [0, 1.67, 0.6], true);
  for (const x of [-1.9, 0, 1.9])
    box(lab, palette.ivory, [0.12, 1.6, 0.13], [x, 1.67, 0.67]);
  for (const x of [-2, 0, 2]) {
    box(lab, "#405f77", [1.7, 0.09, 2.4], [x, 3.47, -1.7]).rotation.x = 0.12;
    for (let i = 0; i < 4; i++)
      box(lab, "#82b3c2", [1.6, 0.02, 0.025], [x, 3.62, -2.6 + i * 0.55]);
  }
  label(
    lab,
    "IDEAS → SYSTEMS",
    5.5,
    [0, 2.92, 0.74],
    palette.ink,
    palette.ivory,
  );
  for (let i = 0; i < 3; i++) {
    box(
      lab,
      ["#f4d584", "#f09187", "#98bcce"][i],
      [0.85, 0.9 + i * 0.4, 0.8],
      [-4.8, 0.65 + i * 0.2, -1.0 + i],
      true,
    );
  }
  const robot = new THREE.Group();
  robot.position.set(4.7, 0.15, 2);
  box(robot, palette.ivory, [1.35, 1.15, 1.0], [0, 1.1, 0], true);
  box(robot, palette.teal, [1.2, 0.68, 1.0], [0, 0.2, 0], true);
  box(robot, palette.ink, [0.97, 0.45, 0.08], [0, 1.15, 0.53], true);
  for (const x of [-0.25, 0.25])
    ball(robot, "#daf3db", [0.095, 0.095, 0.06], [x, 1.18, 0.6]);
  cylinder(robot, palette.ink, 0.04, 0.04, 0.5, [0, 1.88, 0], 6);
  ball(robot, palette.coral, [0.16, 0.16, 0.16], [0, 2.15, 0]);
  labPlot.add(robot);
  solids.push({
    x: labPlot.position.x,
    y: 1.6,
    z: labPlot.position.z - 1.7,
    hx: 3.6,
    hy: 1.6,
    hz: 2.3,
    mesh: lab,
  });
  planter(labPlot, -2.8, 1.45, palette.yellow);
  planter(labPlot, 2.8, 1.45, palette.pink);
  trees.push(
    tree(labPlot, 4.9, 3.8, 4.4, "#b5cc86"),
    tree(labPlot, 5.2, -4.3, 5.4, palette.leaf),
  );

  const campusPlot = islands.get("campus")!;
  const campus = new THREE.Group();
  campusPlot.add(campus);
  box(campus, "#e1a09b", [7, 2.7, 3.2], [0, 1.5, -1.6], true);
  box(campus, palette.ivory, [7.3, 0.25, 3.5], [0, 2.95, -1.6]);
  box(campus, palette.ivory, [2.6, 4.4, 3.6], [0, 2.35, -1.6], true);
  const roof = cylinder(campus, "#ad6573", 0, 2.2, 1.2, [0, 5.05, -1.6], 4);
  roof.rotation.y = Math.PI / 4;
  for (const x of [-2.6, -1.7, 1.7, 2.6]) {
    box(campus, "#7a9a9c", [0.54, 0.8, 0.06], [x, 1.9, 0.04], true);
    box(campus, palette.ivory, [0.16, 2, 0.35], [x, 1.2, 0.15]);
  }
  label(campus, "复旦大学", 2.5, [0, 3.6, 0.22], "#9f5b6b");
  box(campus, "#567778", [0.9, 1.7, 0.1], [0, 1.0, 0.25], true);
  for (let i = 0; i < 3; i++)
    box(
      campus,
      "#eee8d9",
      [4 - i * 0.3, 0.18, 1.3 - i * 0.3],
      [0, 0.12 + i * 0.15, 0.65],
    );
  solids.push({
    x: campusPlot.position.x,
    y: 2,
    z: campusPlot.position.z - 1.6,
    hx: 3.6,
    hy: 2,
    hz: 1.7,
    mesh: campus,
  });
  planter(campusPlot, -2.8, 1.5, palette.pink);
  planter(campusPlot, 2.8, 1.5, palette.pink);
  trees.push(
    tree(campusPlot, -5.4, 2, 4.7, palette.pink, 4),
    tree(campusPlot, -1.8, 5.7, 5.1, palette.leaf),
  );
  bench(campusPlot, 5.4, -0.6, -0.5);

  const park = islands.get("park")!;
  box(park, "#61a6a0", [10.5, 0.11, 6.7], [0, 0.18, -1]);
  box(park, "#89babb", [8.8, 0.02, 5.3], [0, 0.25, -1]);
  for (const x of [-4.4, 4.4, -3.3, 3.3, 0])
    box(park, palette.ivory, [0.05, 0.025, 5.3], [x, 0.27, -1]);
  for (const z of [-3.65, 1.65, -2.2, 0.2])
    box(park, palette.ivory, [8.8, 0.025, 0.05], [0, 0.27, z]);
  const net = new THREE.Group();
  park.add(net);
  for (const z of [-3.9, 1.9])
    cylinder(net, palette.ink, 0.055, 0.055, 1.2, [0, 0.82, z], 8);
  box(net, palette.ivory, [0.06, 0.05, 5.8], [0, 1.36, -1]);
  for (let j = 0; j < 24; j++)
    box(net, "#638f85", [0.022, 0.82, 0.022], [0, 0.89, -3.8 + j * 0.24]);
  for (let j = 0; j < 4; j++)
    box(net, "#638f85", [0.022, 0.022, 5.7], [0, 0.55 + j * 0.21, -1]);
  fence(park, 0, -5.2, 11);
  bench(park, 4.1, 4.1, Math.PI);
  trees.push(
    tree(park, -6.1, 2.5, 4.5, palette.leaf),
    tree(park, 5.7, -4.3, 4.1, "#d5d995"),
  );
  const tennisBall = ball(park, "#eff597", [0.3, 0.3, 0.3], [2.5, 0.56, -0.5]);
  solids.push({
    x: park.position.x,
    y: 0.8,
    z: park.position.z - 1,
    hx: 0.07,
    hy: 0.6,
    hz: 2.85,
    mesh: net,
  });

  const contactPlot = islands.get("contact")!;
  const contact = new THREE.Group();
  contactPlot.add(contact);
  box(contact, "#f8f0d7", [3.8, 2.8, 3.3], [0, 1.5, -1], true);
  box(contact, "#eaaa7e", [4.3, 0.4, 3.8], [0, 3.1, -1], true);
  label(contact, "POST & HELLO", 3.4, [0, 2.35, 0.71], palette.ink, "#f8f0d7");
  box(contact, palette.teal, [0.9, 1.6, 0.09], [0, 1, 0.72], true);
  box(contact, palette.coral, [0.95, 1.25, 0.8], [2.8, 0.9, 1.1], true);
  box(contact, palette.ink, [0.65, 0.12, 0.03], [2.8, 1.2, 1.52]);
  cylinder(contact, palette.ink, 0.07, 0.07, 1, [2.8, 0.3, 1.1], 6);
  trees.push(tree(contactPlot, -3.8, -2, 4.8, palette.pink));
  solids.push({
    x: contactPlot.position.x,
    y: 1.5,
    z: contactPlot.position.z - 1,
    hx: 2,
    hy: 1.5,
    hz: 1.7,
    mesh: contact,
  });
  planter(contactPlot, -2.2, 1.5, palette.yellow);

  const windmill = new THREE.Group();
  windmill.position.set(4, 4.8, -3.8);
  cylinder(contactPlot, palette.ivory, 0.35, 0.65, 4.6, [4, 2.3, -3.8], 12);
  ball(windmill, palette.yellow, [0.23, 0.23, 0.23], [0, 0, 0.06]);
  for (let i = 0; i < 3; i++) {
    const wing = new THREE.Group();
    wing.rotation.z = (i * Math.PI * 2) / 3;
    box(wing, palette.ivory, [0.26, 2, 0.09], [0, 1, 0], true);
    windmill.add(wing);
  }
  contactPlot.add(windmill);

  const garden = new THREE.Group();
  surroundings.add(garden);
  for (let i = 0; i < 34; i++) {
    const angle = (i / 34) * Math.PI * 2;
    const x = ISLAND.x + Math.cos(angle) * (ISLAND.radiusX - 3.8);
    const z = ISLAND.z + Math.sin(angle) * (ISLAND.radiusZ - 3.8);
    if (distanceToRoad(x, z) < ROAD_WIDTH / 2 + 2.1) continue;
    if (
      stations.some((s) => Math.hypot(x - s.position[0], z - s.position[1]) < 7)
    )
      continue;
    trees.push(
      tree(
        garden,
        x,
        z,
        3.3 + (i % 3) * 0.35,
        i % 4 === 0 ? palette.pink : i % 3 === 0 ? "#a7c776" : "#5c9f7b",
        i,
      ),
    );
    flowers(garden, x + 0.8, z + 0.8, i % 2 ? palette.yellow : palette.ivory);
  }
  for (const [x, z, angle] of [
    [-8, -10, -0.5],
    [5, -20, -0.6],
    [4, 12, Math.PI],
    [-19, -12, 0.8],
  ]) {
    bench(garden, x, z, angle);
    lamp(garden, x + 1.9, z - 0.6);
    planter(garden, x - 1.9, z - 0.6, palette.pink);
  }
  // The seaside deck is scenery, on the same traversable ground as the park.
  const deck = new THREE.Group();
  deck.position.set(-2, 0, -25);
  for (let i = 0; i < 11; i++)
    box(
      deck,
      i % 2 ? "#caa982" : "#dfbc94",
      [5.4, 0.06, 0.29],
      [0, 0.2, -1.5 + i * 0.31],
    );
  bench(deck, 0, -0.8);
  for (const x of [-2.4, 2.4])
    cylinder(deck, "#6e8d86", 0.12, 0.12, 0.9, [x, 0.6, -1.5], 10);
  garden.add(deck);

  for (const station of stations) {
    if (station.id === "welcome") continue;
    const group = islands.get(station.id)!;
    const x = station.radius * 0.55,
      z = station.radius * 0.45;
    cylinder(group, palette.ivory, 0.045, 0.07, 3.4, [x, 1.7, z], 8);
    const flag = box(
      group,
      station.color,
      [1.0, 0.6, 0.03],
      [x + 0.5, 3.05, z],
    );
    flags.push(flag);
  }
  scene.updateMatrixWorld(true);
  for (const trunk of trees) {
    const point = trunk.getWorldPosition(new THREE.Vector3());
    if (
      !solids.some(
        (solid) => Math.hypot(solid.x - point.x, solid.z - point.z) < 0.1,
      )
    ) {
      solids.push({
        x: point.x,
        y: 1.4,
        z: point.z,
        hx: 0.3,
        hy: 1.4,
        hz: 0.3,
        mesh: trunk,
      });
    }
  }
  return {
    welcome,
    surroundings,
    solids,
    trees,
    flags,
    windmill,
    ball: tennisBall,
  };
}
