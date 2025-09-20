import * as THREE from 'three';
import { BasePreset, PresetConfig } from '../../core/PresetLoader';

export const config: PresetConfig = {
  name: 'Instanced Demo',
  description: 'Simple instanced cubes showcasing InstancedMesh',
  author: 'AI',
  version: '1.0.0',
  category: 'demo',
  tags: ['instanced', 'performance'],
  thumbnail: 'instanced_demo_thumb.png',
  note: 0,
  defaultConfig: {},
  controls: [],
  audioMapping: {},
  performance: { complexity: 'low', recommendedFPS: 60, gpuIntensive: false }
};

export class InstancedDemo extends BasePreset {
  private mesh!: THREE.InstancedMesh;

  init(): void {
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geometry, material, 100);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 100; i++) {
      matrix.setPosition(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      this.mesh.setMatrixAt(i, matrix);
    }
    this.scene.add(this.mesh);
  }

  update(_audio: any, _delta: number, time: number): void {
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 100; i++) {
      matrix.makeRotationY(time * 0.1 + i);
      matrix.setPosition(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      this.mesh.setMatrixAt(i, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
