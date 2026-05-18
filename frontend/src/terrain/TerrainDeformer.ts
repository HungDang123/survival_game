import * as THREE from 'three';
import { TerrainChunk, CHUNK_SIZE } from './TerrainChunk';
import type { TerrainModification } from './TerrainChunk';

export type DeformCallback = (mod: TerrainModification) => void;

export class TerrainDeformer {
  private chunks: Map<string, TerrainChunk>;
  private raycaster: THREE.Raycaster;
  private onModify: DeformCallback | null = null;

  private digStrength = -1.5;
  private buildStrength = 1.5;
  private brushRadius = 4;

  constructor(chunks: Map<string, TerrainChunk>) {
    this.chunks = chunks;
    this.raycaster = new THREE.Raycaster();
  }

  setCallback(cb: DeformCallback) {
    this.onModify = cb;
  }

  deform(
    camera: THREE.Camera,
    toolType: 'dig' | 'build',
    _scene: THREE.Scene
  ): void {
    const center = new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(center, camera);

    const meshes = Array.from(this.chunks.values()).map(c => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0) return;

    const hit = intersects[0];
    const point = hit.point;
    const chunkMesh = hit.object as THREE.Mesh;
    const chunkId = chunkMesh.userData.chunkId as string;
    const chunk = this.chunks.get(chunkId);
    if (!chunk) return;

    const deltaY = toolType === 'dig' ? this.digStrength : this.buildStrength;

    const positions = (chunkMesh.geometry as THREE.BufferGeometry).attributes.position;
    const worldOffsetX = chunk.chunkX * CHUNK_SIZE;
    const worldOffsetZ = chunk.chunkZ * CHUNK_SIZE;

    for (let i = 0; i < positions.count; i++) {
      const vx = positions.getX(i) + worldOffsetX;
      const vz = positions.getZ(i) + worldOffsetZ;
      const dx = vx - point.x;
      const dz = vz - point.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= this.brushRadius) {
        const falloff = 1 - dist / this.brushRadius;
        const localDelta = deltaY * falloff;
        chunk.applyModification(i, localDelta);

        if (this.onModify) {
          this.onModify({ chunkId, vertexIndex: i, deltaY: localDelta, toolType });
        }
      }
    }
  }
}
