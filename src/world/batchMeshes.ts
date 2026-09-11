import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Merge static geometry in root-local space without flattening animated groups.
export function batchMeshes(
  root: THREE.Object3D,
  animated: Set<THREE.Object3D>,
  retired: Set<THREE.BufferGeometry>,
) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  const visit = (object: THREE.Object3D) => {
    if (animated.has(object)) return;
    if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
      const group = buckets.get(object.material) ?? [];
      group.push(object);
      buckets.set(object.material, group);
    }
    object.children.forEach(visit);
  };
  root.children.forEach(visit);
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const copies = meshes.map((mesh) => {
      retired.add(mesh.geometry);
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      geometry.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld),
      );
      return geometry;
    });
    const geometry = mergeGeometries(copies);
    copies.forEach((copy) => copy.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, material);
    merged.castShadow = meshes.some((mesh) => mesh.castShadow);
    merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
    root.add(merged);
    meshes.forEach((mesh) => mesh.removeFromParent());
  }
}
