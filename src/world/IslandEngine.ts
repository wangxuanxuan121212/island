import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { stations, stationById, type Site, type StationId } from "../data";
import { buildWorld, makeCar, type Solid, type WorldModels } from "./models";
import { batchMeshes } from "./batchMeshes";
import {
  RoutePlanner,
  distance,
  distanceToRoute,
  type RoutePoint,
} from "./routePlanner";
import { ISLAND, mapHeading } from "./roads";

export type DriveKey = "forward" | "backward" | "left" | "right" | "brake";
export type WorldState = {
  x: number;
  z: number;
  speed: number;
  heading: number;
  gear: "D" | "R" | "P";
  steering: number;
  inputs: DriveKey[];
  overview: boolean;
  navigation: NavigationState | null;
  station: StationId;
  started: boolean;
  markers: Array<{ id: StationId; x: number; y: number; visible: boolean }>;
};
export type NavigationState = {
  destination: StationId;
  distance: number;
  turn: number;
  bearing: number;
  arrived: boolean;
  reachable: boolean;
  path: RoutePoint[];
};
type Callbacks = {
  ready: () => void;
  update: (state: WorldState) => void;
  error: () => void;
};
let physicsReady: Promise<void> | undefined;

export class IslandEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 200);
  private model: WorldModels;
  private car: THREE.Group;
  private wheels: THREE.Group[];
  private world?: RAPIER.World;
  private body?: RAPIER.RigidBody;
  private vehicle?: RAPIER.DynamicRayCastVehicleController;
  private inputs = new Map<DriveKey, Set<string>>();
  private throttle = 0;
  private forwardSpeed = 0;
  private heading = 0.35;
  private previousPosition = new THREE.Vector3();
  private currentPosition = new THREE.Vector3();
  private previousRotation = new THREE.Quaternion();
  private currentRotation = new THREE.Quaternion();
  private retiredGeometry = new Set<THREE.BufferGeometry>();
  private scenery: Array<{ solid: Solid; materials: THREE.Material[] }> = [];
  private planner: RoutePlanner;
  private destination: StationId | null = null;
  private route: RoutePoint[] = [];
  private routeIndex = 0;
  private routeTime = 0;
  private arrived = false;
  private routeArrows: THREE.InstancedMesh;
  private noseArrow: THREE.Mesh;
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private time = 0;
  private lastUpdate = 0;
  private target = new THREE.Vector3(-5.1, 1.4, 2);
  private offset = new THREE.Vector3(20, 25, 30);
  private size = 22;
  private width = 1;
  private height = 1;
  private observer: ResizeObserver;
  private disposed = false;
  private started = false;
  private paused = false;
  private overview = false;
  private near: StationId = "welcome";
  private spawn: StationId = "welcome";
  private steering = 0;
  private zoomFactor = 1;
  private audio?: AudioContext;
  private oscillator?: OscillatorNode;
  private gain?: GainNode;
  private sound = false;
  private reduced: boolean;
  private motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  private shadows: boolean;
  private frameAverage = 1 / 60;
  private qualityTime = 0;
  private shadowTime = 0;

  constructor(
    private host: HTMLElement,
    private site: Site,
    private callbacks: Callbacks,
  ) {
    this.reduced = !site.appearance.motion || this.motionQuery.matches;
    this.shadows = site.appearance.shadows;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, innerWidth < 700 ? 1.15 : 1.4),
    );
    this.renderer.setClearColor("#b8deda");
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "王轩钰的三维个人小岛");
    canvas.dataset.testid = "island-canvas";
    host.appendChild(canvas);
    this.scene.background = new THREE.Color("#b8deda");
    this.scene.add(new THREE.HemisphereLight("#f1faff", "#779e73", 1.7));
    const sun = new THREE.DirectionalLight("#fff6e5", 2.5);
    sun.position.set(-15, 35, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -34,
      right: 34,
      top: 34,
      bottom: -34,
      near: 1,
      far: 100,
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: "#95cbc7", roughness: 0.75 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -1.38;
    water.receiveShadow = true;
    this.scene.add(water);
    const ripples = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.8, 0.06),
      new THREE.MeshBasicMaterial({
        color: "#effbf4",
        transparent: true,
        opacity: 0.5,
      }),
      400,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 400; i++) {
      dummy.position.set(
        ((i * 17.41) % 110) - 55,
        -1.36,
        ((i * 29.67) % 110) - 55,
      );
      dummy.rotation.x = -Math.PI / 2;
      dummy.scale.x = 0.5 + (i % 3);
      dummy.updateMatrix();
      ripples.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(ripples);
    this.model = buildWorld(this.scene);
    this.model.surroundings.visible = false;
    const vehicle = makeCar(site.appearance.carColor);
    this.car = vehicle.car;
    this.wheels = vehicle.wheels;
    this.car.position.set(1, 0.14, 2);
    this.car.rotation.y = 0.35;
    this.scene.add(this.car);
    this.planner = new RoutePlanner(this.model.solids);
    const softRoots = new Set<THREE.Object3D>();
    for (const solid of this.model.solids) {
      if (!solid.mesh) continue;
      softRoots.add(solid.mesh);
      const clones = new Map<THREE.Material, THREE.Material>();
      solid.mesh.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const clone = (original: THREE.Material) => {
          if (!clones.has(original)) clones.set(original, original.clone());
          return clones.get(original)!;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(clone)
          : clone(object.material);
      });
      this.scenery.push({ solid, materials: [...clones.values()] });
    }
    const animated = new Set<THREE.Object3D>([
      ...softRoots,
      ...this.model.flags,
      this.model.windmill,
      this.model.ball,
    ]);
    batchMeshes(this.model.welcome, animated, this.retiredGeometry);
    this.model.surroundings.children.forEach((island) =>
      batchMeshes(island, animated, this.retiredGeometry),
    );
    softRoots.forEach((root) =>
      batchMeshes(root, new Set(), this.retiredGeometry),
    );
    batchMeshes(this.car, new Set(this.wheels), this.retiredGeometry);
    this.wheels.forEach((wheel) =>
      batchMeshes(wheel, new Set(), this.retiredGeometry),
    );
    const arrow = new THREE.Shape();
    arrow.moveTo(0, 0.45);
    arrow.lineTo(-0.31, -0.03);
    arrow.lineTo(-0.12, -0.03);
    arrow.lineTo(-0.12, -0.38);
    arrow.lineTo(0.12, -0.38);
    arrow.lineTo(0.12, -0.03);
    arrow.lineTo(0.31, -0.03);
    arrow.closePath();
    const arrowGeometry = new THREE.ShapeGeometry(arrow);
    arrowGeometry.rotateX(Math.PI / 2);
    this.routeArrows = new THREE.InstancedMesh(
      arrowGeometry,
      new THREE.MeshBasicMaterial({
        color: "#d6943c",
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      256,
    );
    this.routeArrows.count = 0;
    this.routeArrows.frustumCulled = false;
    this.routeArrows.renderOrder = 1;
    this.scene.add(this.routeArrows);
    this.noseArrow = new THREE.Mesh(
      arrowGeometry,
      new THREE.MeshBasicMaterial({ color: "#527d69", side: THREE.DoubleSide }),
    );
    this.noseArrow.scale.setScalar(1.2);
    this.noseArrow.visible = false;
    this.scene.add(this.noseArrow);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.clearInputs);
    document.addEventListener("visibilitychange", this.visibility);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    this.motionQuery.addEventListener("change", this.motionChanged);
    this.frame = requestAnimationFrame(this.tick);
    physicsReady ??= RAPIER.init();
    physicsReady
      .then(() => {
        if (this.disposed) return;
        this.setupPhysics();
        this.callbacks.ready();
      })
      .catch(() => {
        if (!this.disposed) this.callbacks.error();
      });
  }

  private setupPhysics() {
    this.world = new RAPIER.World({ x: 0, y: -16, z: 0 });
    this.world.timestep = 1 / 60;
    const points: number[] = [];
    for (let i = 0; i < 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      for (const y of [-1.1, 0.16])
        points.push(
          Math.cos(angle) * ISLAND.radiusX,
          y,
          Math.sin(angle) * ISLAND.radiusZ,
        );
    }
    const ground = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    if (!ground) throw new Error("Island ground could not be created");
    this.world.createCollider(
      ground.setTranslation(ISLAND.x, 0, ISLAND.z).setFriction(1),
    );
    // Scenery shapes guide navigation only; they never block or lift the car.
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(1, 1.5, 2)
        .setRotation(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            0.35,
          ),
        )
        .setLinearDamping(0.35)
        .setAngularDamping(0.65)
        .enabledRotations(false, true, false)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.03, 0.43, 1.68)
        .setMass(180)
        .setFriction(0.4),
      this.body,
    );
    this.vehicle = this.world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    for (const [x, z] of [
      [-1.13, 1.16],
      [1.13, 1.16],
      [-1.13, -1.14],
      [1.13, -1.14],
    ]) {
      const i = this.vehicle.numWheels();
      this.vehicle.addWheel(
        { x, y: -0.1, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        0.43,
        0.58,
      );
      this.vehicle.setWheelSuspensionStiffness(i, 30);
      this.vehicle.setWheelSuspensionCompression(i, 4.4);
      this.vehicle.setWheelSuspensionRelaxation(i, 3.4);
      this.vehicle.setWheelMaxSuspensionForce(i, 8000);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.27);
      this.vehicle.setWheelFrictionSlip(i, 3.8);
      this.vehicle.setWheelSideFrictionStiffness(i, 1.6);
    }
    this.syncPose(true);
    this.renderer.domElement.dataset.physics = "rapier";
  }

  private resize = () => {
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    this.renderer.setSize(this.width, this.height);
    this.updateCamera(1);
  };

  private updateCamera(dt: number) {
    const aspect = this.width / Math.max(1, this.height);
    let desiredTarget: THREE.Vector3;
    let desiredSize: number;
    if (this.overview) {
      desiredTarget = new THREE.Vector3(-1, 0, -3);
      desiredSize = Math.max(55, 65 / aspect);
    } else if (!this.started) {
      desiredTarget =
        this.width <= 760
          ? new THREE.Vector3(0.2, 1.4, 0.4)
          : new THREE.Vector3(-5.1, 1.4, 2);
      desiredSize = Math.max(22, 22 / aspect);
    } else {
      const lookAhead = THREE.MathUtils.clamp(
        this.forwardSpeed * 0.34,
        -1.2,
        2.6,
      );
      desiredTarget = this.car.position
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(this.heading) * lookAhead,
            1,
            Math.cos(this.heading) * lookAhead - 1.4,
          ),
        );
      desiredSize = Math.max(30, 21 / aspect) * this.zoomFactor;
    }
    const blend = this.reduced ? 1 : 1 - Math.exp(-dt * 4);
    this.target.lerp(desiredTarget, blend);
    this.size = THREE.MathUtils.lerp(this.size, desiredSize, blend);
    this.camera.left = (-this.size * aspect) / 2;
    this.camera.right = (this.size * aspect) / 2;
    this.camera.top = this.size / 2;
    this.camera.bottom = -this.size / 2;
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  private physicsStep() {
    if (!this.world || !this.vehicle || !this.body) return;
    const active = this.started && !this.paused && !this.overview;
    const gas = active
      ? Number(this.inputs.has("forward")) - Number(this.inputs.has("backward"))
      : 0;
    const turn = active
      ? Number(this.inputs.has("left")) - Number(this.inputs.has("right"))
      : 0;
    const q = this.body.rotation();
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(q.x, q.y, q.z, q.w),
    );
    const velocity = this.body.linvel();
    this.forwardSpeed = velocity.x * facing.x + velocity.z * facing.z;
    this.heading = Math.atan2(facing.x, facing.z);
    const speed = Math.abs(this.forwardSpeed);
    const changingDirection = gas !== 0 && gas * this.forwardSpeed < -0.22;
    const braking =
      !active ||
      this.inputs.has("brake") ||
      changingDirection ||
      (this.inputs.has("forward") && this.inputs.has("backward"));
    const targetThrottle = braking ? 0 : gas;
    const throttleRate = targetThrottle === 0 ? 7 : 2.8;
    this.throttle += THREE.MathUtils.clamp(
      targetThrottle - this.throttle,
      -throttleRate / 60,
      throttleRate / 60,
    );
    const steeringLimit = THREE.MathUtils.lerp(
      0.82,
      0.36,
      Math.min(speed / 7.2, 1),
    );
    const steeringTarget = turn * steeringLimit;
    const steeringRate = turn ? 4.2 : 5.4;
    this.steering += THREE.MathUtils.clamp(
      steeringTarget - this.steering,
      -steeringRate / 60,
      steeringRate / 60,
    );
    const limit = gas < 0 ? 2.8 : 7.2 - Math.abs(this.steering) * 2.3;
    const power = Math.max(0, Math.min(1, (limit - speed) / 1.6));
    const brake = braking ? 65 : !gas ? 16 : speed > limit ? 12 : 0;
    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelEngineForce(
        i,
        braking ? 0 : this.throttle * (gas < 0 ? 400 : 640) * power,
      );
      this.vehicle.setWheelSteering(i, i < 2 ? this.steering : 0);
      this.vehicle.setWheelBrake(i, brake);
    }
    this.vehicle.updateVehicle(1 / 60);
    // Arcade yaw assistance keeps low-speed turns responsive while Rapier
    // continues to provide suspension, traction, acceleration and braking.
    const travelDirection =
      this.forwardSpeed < -0.25 || (gas < 0 && speed < 0.25) ? -1 : 1;
    const yawTarget =
      active && !this.inputs.has("brake")
        ? (this.steering / steeringLimit) *
          (0.95 + Math.min(speed / 10, 0.55)) *
          travelDirection
        : 0;
    this.body.setAngvel(
      {
        x: 0,
        y: THREE.MathUtils.lerp(this.body.angvel().y, yawTarget, 0.28),
        z: 0,
      },
      true,
    );
    this.world.step();
    if (active && turn && !braking && speed < 1) {
      const rotation = this.body.rotation();
      const assisted = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.heading + yawTarget / 60,
      );
      this.body.setRotation(
        new THREE.Quaternion(
          rotation.x,
          rotation.y,
          rotation.z,
          rotation.w,
        ).slerp(assisted, 1 - speed),
        true,
      );
    }
    if ((!gas || braking) && speed < 0.12) {
      this.body.setLinvel({ x: 0, y: this.body.linvel().y, z: 0 }, true);
      if (!turn) this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.forwardSpeed = 0;
    }
    this.protectShore();
    this.syncPose();
    const p = this.body.translation();
    this.wheels.forEach((wheel, i) => {
      wheel.position.y = 1 - (this.vehicle!.wheelSuspensionLength(i) ?? 0.43);
      wheel.rotation.set(
        this.vehicle!.wheelRotation(i) ?? 0,
        i < 2 ? this.steering : 0,
        0,
        "YXZ",
      );
    });
    if (p.y < -4 || Math.abs(p.x) > 75 || Math.abs(p.z) > 75)
      this.teleport(this.spawn, false);
  }

  private protectShore() {
    if (!this.body) return;
    const p = this.body.translation();
    const rx = ISLAND.radiusX - 2.2,
      rz = ISLAND.radiusZ - 2.2;
    const dx = p.x - ISLAND.x,
      dz = p.z - ISLAND.z;
    const ratio = Math.hypot(dx / rx, dz / rz);
    if (ratio <= 1) return;
    this.body.setTranslation(
      {
        x: ISLAND.x + dx / ratio,
        y: p.y,
        z: ISLAND.z + dz / ratio,
      },
      true,
    );
    const normal = new THREE.Vector3(
      dx / (rx * rx),
      0,
      dz / (rz * rz),
    ).normalize();
    const velocity = this.body.linvel();
    const outward = Math.max(0, velocity.x * normal.x + velocity.z * normal.z);
    this.body.setLinvel(
      {
        x: velocity.x - normal.x * outward,
        y: velocity.y,
        z: velocity.z - normal.z * outward,
      },
      true,
    );
  }

  private fadeScenery(dt: number) {
    let faded = 0;
    for (const { solid, materials } of this.scenery) {
      const dx = Math.max(
        0,
        Math.abs(this.car.position.x - solid.x) - solid.hx,
      );
      const dz = Math.max(
        0,
        Math.abs(this.car.position.z - solid.z) - solid.hz,
      );
      const nearby = Math.hypot(dx, dz) < 2;
      const target = this.started && !this.overview && nearby ? 0.18 : 1;
      if (target < 1) faded++;
      for (const mat of materials) {
        mat.opacity = THREE.MathUtils.damp(mat.opacity, target, 12, dt);
        const transparent = mat.opacity < 0.99;
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.depthWrite = !transparent;
          mat.needsUpdate = true;
        }
      }
    }
    this.renderer.domElement.dataset.fadedScenery = String(faded);
  }

  private syncPose(snap = false) {
    if (!this.body) return;
    this.previousPosition.copy(this.currentPosition);
    this.previousRotation.copy(this.currentRotation);
    const p = this.body.translation(),
      q = this.body.rotation();
    this.currentPosition.set(p.x, p.y - 1.1, p.z);
    this.currentRotation.set(q.x, q.y, q.z, q.w);
    if (snap) {
      this.previousPosition.copy(this.currentPosition);
      this.previousRotation.copy(this.currentRotation);
      this.car.position.copy(this.currentPosition);
      this.car.quaternion.copy(this.currentRotation);
    }
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    // #region debug-point A:frame-budget
    const debugFrameMs = now - (this.last || now);
    // #endregion
    const elapsed = (now - (this.last || now)) / 1000;
    const dt = Math.min(elapsed, 0.25);
    this.frameAverage = THREE.MathUtils.lerp(this.frameAverage, elapsed, 0.08);
    if (now - this.qualityTime > 1800 && this.frameAverage > 0.05) {
      this.qualityTime = now;
      const ratio = this.renderer.getPixelRatio();
      if (ratio > 0.85)
        this.renderer.setPixelRatio(Math.max(0.85, ratio - 0.2));
    }
    this.last = now;
    this.time += dt;
    this.accumulator += dt;
    while (this.accumulator >= 1 / 60) {
      this.accumulator -= 1 / 60;
      this.physicsStep();
    }
    if (this.body) {
      this.car.position.lerpVectors(
        this.previousPosition,
        this.currentPosition,
        this.accumulator * 60,
      );
      this.car.quaternion.slerpQuaternions(
        this.previousRotation,
        this.currentRotation,
        this.accumulator * 60,
      );
    }
    this.noseArrow.visible =
      this.started && !this.overview && this.car.position.y > -1;
    this.noseArrow.position.set(
      this.car.position.x + Math.sin(this.heading) * 2.85,
      0.34,
      this.car.position.z + Math.cos(this.heading) * 2.85,
    );
    this.noseArrow.rotation.y = this.heading;
    this.updateNavigation();
    this.fadeScenery(dt);
    if (!this.reduced) {
      this.model.trees.forEach((tree, i) => {
        tree.rotation.z = Math.sin(this.time * 0.8 + i) * 0.008;
      });
      this.model.flags.forEach((flag, i) => {
        flag.rotation.y = Math.sin(this.time * 2 + i) * 0.16;
      });
      this.model.windmill.rotation.z = this.time * 0.32;
      this.model.ball.position.y =
        0.56 + Math.abs(Math.sin(this.time * 0.9)) * 0.35;
    }
    this.updateCamera(dt);
    if (
      now - this.shadowTime >
      (Math.abs(this.forwardSpeed) > 0.1 ? 65 : 180)
    ) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowTime = now;
    }
    this.renderer.render(this.scene, this.camera);
    if (now - this.lastUpdate > 100) {
      // #region debug-point A-B:drive-timing
      if (
        location.hostname === "127.0.0.1" &&
        new URLSearchParams(location.search).has("driveDebug")
      )
        void fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          body: JSON.stringify({
            sessionId: "park-driving",
            runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
            hypothesisId: "A-B",
            location: "IslandEngine:tick",
            msg: "[DEBUG] driving frame",
            data: {
              frameMs: debugFrameMs,
              time: this.time,
              heading: this.heading,
              steering: this.steering,
              inputs: [...this.inputs.keys()],
              speed: this.forwardSpeed,
              x: this.car.position.x,
              z: this.car.position.z,
              calls: this.renderer.info.render.calls,
              triangles: this.renderer.info.render.triangles,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
      // #endregion
      this.lastUpdate = now;
      this.report();
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private report() {
    const x = this.car.position.x,
      z = this.car.position.z;
    const nearest = [...stations].sort(
      (a, b) =>
        Math.hypot(x - a.position[0], z - a.position[1]) -
        Math.hypot(x - b.position[0], z - b.position[1]),
    )[0];
    if (
      Math.hypot(x - nearest.position[0], z - nearest.position[1]) <
      nearest.radius + 1
    ) {
      this.near = nearest.id;
      this.spawn = nearest.id;
    }
    const markers = stations.map((station) => {
      const worldPosition = new THREE.Vector3(
        station.position[0],
        4.5,
        station.position[1],
      ).project(this.camera);
      const px = ((worldPosition.x + 1) / 2) * this.width;
      const py = ((1 - worldPosition.y) / 2) * this.height;
      const mobile = this.width <= 760;
      const inControls = mobile
        ? py < 232 || py > this.height - 270
        : py < 95 ||
          (px < 310 && py < 190) ||
          (px > this.width - 450 && py < 200) ||
          (px < 310 && py > this.height - 320) ||
          (px > this.width - 225 && py > this.height - 320) ||
          (Math.abs(px - this.width / 2) < 200 && py > this.height - 180);
      return {
        id: station.id,
        x: px,
        y: py,
        visible:
          !inControls &&
          px > 85 &&
          px < this.width - 85 &&
          py < this.height - 85 &&
          worldPosition.z < 1,
      };
    });
    const visible: typeof markers = [];
    for (const marker of [...markers].sort(
      (a, b) => Number(b.id === this.near) - Number(a.id === this.near),
    )) {
      if (!marker.visible) continue;
      if (
        visible.some(
          (other) =>
            Math.abs(other.x - marker.x) < 155 &&
            Math.abs(other.y - marker.y) < 52,
        )
      )
        marker.visible = false;
      else visible.push(marker);
    }
    const speed = Math.round(Math.abs(this.forwardSpeed) * 3.6);
    const navigation = this.navigationState();
    const gear =
      this.forwardSpeed < -0.12 ? "R" : this.forwardSpeed > 0.12 ? "D" : "P";
    const canvas = this.renderer.domElement;
    canvas.dataset.x = x.toFixed(3);
    canvas.dataset.z = z.toFixed(3);
    canvas.dataset.y = this.car.position.y.toFixed(3);
    canvas.dataset.vehicleModel = this.car.name;
    canvas.dataset.carColor = this.site.appearance.carColor;
    canvas.dataset.wheelRotation = this.wheels[0].rotation.x.toFixed(3);
    canvas.dataset.collisionMode = "scenery-pass-through";
    canvas.dataset.speed = String(speed);
    canvas.dataset.frames = String(this.renderer.info.render.frame);
    canvas.dataset.triangles = String(this.renderer.info.render.triangles);
    canvas.dataset.station = this.near;
    canvas.dataset.heading = this.heading.toFixed(4);
    canvas.dataset.forwardSpeed = this.forwardSpeed.toFixed(3);
    canvas.dataset.steering = this.steering.toFixed(3);
    canvas.dataset.throttle = this.throttle.toFixed(3);
    canvas.dataset.inputs = Array.from(this.inputs.keys()).join(",");
    canvas.dataset.gear = gear;
    canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    canvas.dataset.destination = this.destination ?? "";
    canvas.dataset.arrived = String(this.arrived);
    canvas.dataset.routeDistance = String(navigation?.distance ?? 0);
    canvas.dataset.routePoints = String(this.route.length);
    canvas.dataset.routeTurn = String(navigation?.turn ?? 0);
    if (this.audio && this.oscillator && this.gain) {
      this.oscillator.frequency.setTargetAtTime(
        48 + speed * 2,
        this.audio.currentTime,
        0.15,
      );
      this.gain.gain.setTargetAtTime(
        this.sound && this.started && !this.paused ? 0.012 + speed * 0.0003 : 0,
        this.audio.currentTime,
        0.2,
      );
    }
    this.callbacks.update({
      x,
      z,
      speed,
      heading: this.heading,
      gear,
      steering: this.steering,
      inputs: Array.from(this.inputs.keys()),
      overview: this.overview,
      navigation,
      station: this.near,
      started: this.started,
      markers,
    });
  }

  public start() {
    if (this.started) return;
    this.started = true;
    this.model.surroundings.visible = true;
    this.report();
  }

  public setOverview(value: boolean) {
    this.overview = value;
    if (value) this.start();
    this.clearInputs();
  }

  public setPaused(value: boolean) {
    this.paused = value;
    if (value) this.clearInputs();
  }

  public setInput(key: DriveKey, pressed: boolean, source = "control") {
    // #region debug-point C:drive-input
    if (
      location.hostname === "127.0.0.1" &&
      new URLSearchParams(location.search).has("driveDebug")
    )
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "park-driving",
          runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
          hypothesisId: "C",
          location: "IslandEngine:setInput",
          msg: "[DEBUG] driving input",
          data: {
            key,
            pressed,
            source,
            paused: this.paused,
            overview: this.overview,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
    // #endregion
    if (pressed && !this.paused && !this.overview) {
      this.start();
      const sources = this.inputs.get(key) ?? new Set<string>();
      sources.add(source);
      this.inputs.set(key, sources);
    } else {
      const sources = this.inputs.get(key);
      sources?.delete(source);
      if (!sources?.size) this.inputs.delete(key);
    }
  }

  public teleport(id: StationId, start = true) {
    if (!this.body) return;
    this.clearInputs();
    const station = stationById(id);
    this.spawn = id;
    this.near = id;
    this.throttle = 0;
    this.steering = 0;
    this.forwardSpeed = 0;
    this.heading =
      id === "welcome"
        ? 0.35
        : Math.atan2(-station.position[0], -station.position[1]);
    this.body.setTranslation(
      { x: station.spawn[0], y: 1.22, z: station.spawn[1] },
      true,
    );
    this.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.heading,
      ),
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.overview = false;
    this.syncPose(true);
    this.accumulator = 0;
    this.updateCamera(1);
    if (this.destination) this.replan();
    if (start) this.start();
    this.report();
    this.chime();
  }

  public reset() {
    this.teleport(this.spawn);
  }
  public zoom(delta: number) {
    this.zoomFactor = THREE.MathUtils.clamp(this.zoomFactor + delta, 0.7, 1.5);
  }

  public setDestination(destination: StationId | null) {
    this.destination = destination;
    this.arrived = false;
    this.overview = false;
    if (destination) {
      this.start();
      this.replan();
    } else {
      this.route = [];
      this.routeArrows.count = 0;
    }
    this.report();
  }

  private replan() {
    if (!this.destination) return;
    this.route = this.planner.find(this.car.position, this.destination);
    this.routeIndex = Math.min(1, this.route.length - 1);
    this.routeTime = this.time;
    this.arrived = false;
    this.drawRoute();
  }

  private drawRoute() {
    let count = 0;
    let spacing = 0.8;
    const marker = new THREE.Object3D();
    for (let i = Math.max(1, this.routeIndex); i < this.route.length; i++) {
      const a = this.route[i - 1],
        b = this.route[i];
      const length = distance(a, b);
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      while (spacing < length && count < 256) {
        marker.position.set(
          a.x + ((b.x - a.x) * spacing) / length,
          0.34,
          a.z + ((b.z - a.z) * spacing) / length,
        );
        marker.rotation.y = angle;
        marker.updateMatrix();
        this.routeArrows.setMatrixAt(count++, marker.matrix);
        spacing += 1.5;
      }
      spacing -= length;
    }
    this.routeArrows.count = count;
    this.routeArrows.instanceMatrix.needsUpdate = true;
  }

  private updateNavigation() {
    if (!this.destination || this.time - this.routeTime < 0.2 || this.paused)
      return;
    this.routeTime = this.time;
    const station = stationById(this.destination);
    const target = { x: station.spawn[0], z: station.spawn[1] };
    if (distance(this.car.position, target) < 2.1) {
      if (!this.arrived) this.chime();
      this.arrived = true;
      this.routeArrows.count = 0;
      return;
    }
    if (
      this.arrived ||
      !this.route.length ||
      distanceToRoute(this.car.position, this.route) > 2.3
    ) {
      this.replan();
      return;
    }
    const oldIndex = this.routeIndex;
    while (
      this.routeIndex < this.route.length - 1 &&
      distance(this.car.position, this.route[this.routeIndex]) < 1.5
    )
      this.routeIndex++;
    if (oldIndex !== this.routeIndex) this.drawRoute();
  }

  private navigationState(): NavigationState | null {
    if (!this.destination) return null;
    const point = this.route[Math.max(0, this.routeIndex)];
    let length = point ? distance(this.car.position, point) : 0;
    for (let i = this.routeIndex + 1; i < this.route.length; i++)
      length += distance(this.route[i - 1], this.route[i]);
    const bearing = point
      ? Math.atan2(point.x - this.car.position.x, point.z - this.car.position.z)
      : this.heading;
    const turn =
      THREE.MathUtils.euclideanModulo(
        bearing - this.heading + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
    return {
      destination: this.destination,
      distance: this.arrived ? 0 : Math.round(length),
      turn,
      bearing: mapHeading(bearing),
      arrived: this.arrived,
      reachable: this.route.length > 0,
      path: this.arrived
        ? []
        : this.route.slice(Math.max(0, this.routeIndex - 1)),
    };
  }

  public async setSound(enabled: boolean) {
    this.sound = enabled;
    if (enabled && !this.audio) {
      this.audio = new AudioContext();
      this.oscillator = this.audio.createOscillator();
      this.oscillator.type = "sine";
      this.gain = this.audio.createGain();
      this.gain.gain.value = 0;
      this.oscillator.connect(this.gain).connect(this.audio.destination);
      this.oscillator.start();
    }
    if (enabled) await this.audio?.resume();
    else if (this.audio && this.gain)
      this.gain.gain.setTargetAtTime(0, this.audio.currentTime, 0.03);
  }

  private chime() {
    if (!this.sound || !this.audio) return;
    const oscillator = this.audio.createOscillator(),
      gain = this.audio.createGain();
    oscillator.connect(gain).connect(this.audio.destination);
    oscillator.frequency.setValueAtTime(660, this.audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      880,
      this.audio.currentTime + 0.14,
    );
    gain.gain.setValueAtTime(0.025, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.3);
    oscillator.start();
    oscillator.stop(this.audio.currentTime + 0.31);
  }

  private keyMap: Record<string, DriveKey> = {
    ArrowUp: "forward",
    KeyW: "forward",
    ArrowDown: "backward",
    KeyS: "backward",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    Space: "brake",
  };
  private keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      target?.closest('input, textarea, select, [role="dialog"]') ||
      this.paused ||
      this.overview
    )
      return;
    if (event.code === "Space" && target?.closest("button, a")) return;
    const key = this.keyMap[event.code];
    if (key) {
      event.preventDefault();
      this.setInput(key, true, event.code);
    }
    if (event.code === "KeyR") this.reset();
  };
  private keyup = (event: KeyboardEvent) => {
    const key = this.keyMap[event.code];
    if (key) this.setInput(key, false, event.code);
  };
  private clearInputs = () => {
    // #region debug-point C:drive-clear
    if (
      location.hostname === "127.0.0.1" &&
      new URLSearchParams(location.search).has("driveDebug")
    )
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "park-driving",
          runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
          hypothesisId: "C",
          location: "IslandEngine:clearInputs",
          msg: "[DEBUG] clear input",
          data: { hidden: document.hidden },
          ts: Date.now(),
        }),
      }).catch(() => {});
    // #endregion
    this.inputs.clear();
    this.throttle = 0;
  };
  private visibility = () => {
    this.last = 0;
    this.accumulator = 0;
    if (document.hidden) {
      this.clearInputs();
      this.gain?.gain.setValueAtTime(0, this.audio?.currentTime ?? 0);
    }
  };
  private motionChanged = () => {
    this.reduced = !this.site.appearance.motion || this.motionQuery.matches;
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.error();
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.clearInputs);
    document.removeEventListener("visibilitychange", this.visibility);
    this.motionQuery.removeEventListener("change", this.motionChanged);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.world?.free();
    void this.audio?.close();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(mat);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    this.retiredGeometry.forEach((geometry) => geometry.dispose());
    materials.forEach((mat) => {
      if ("map" in mat && mat.map instanceof THREE.Texture) mat.map.dispose();
      mat.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
