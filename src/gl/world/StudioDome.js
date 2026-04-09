import * as THREE from 'three';

/**
 * Interior cyclorama: large inverted sphere, matte studio fill — does not receive shadows (shadow catcher only).
 */
export default class StudioDome {
    constructor() {
        /** @type {THREE.Mesh | null} */
        this.mesh = null;
        /** @type {THREE.SphereGeometry | null} */
        this._geometry = null;
        /** @type {THREE.MeshStandardMaterial | null} */
        this._material = null;
    }

    /**
     * @param {{ scene: THREE.Scene }} options
     */
    init(options) {
        const scene = options?.scene;
        if (!(scene instanceof THREE.Scene)) {
            return;
        }

        this.disposeMesh();

        this._geometry = new THREE.SphereGeometry(40, 64, 64);
        this._material = new THREE.MeshStandardMaterial({
            color: '#EAE7DC',
            side: THREE.BackSide,
            roughness: 1.0,
            metalness: 0.0,
            envMapIntensity: 0,
        });

        this.mesh = new THREE.Mesh(this._geometry, this._material);
        this.mesh.receiveShadow = false;
    }

    disposeMesh() {
        if (this.mesh) {
            this.mesh.removeFromParent();
            this.mesh = null;
        }
        if (this._geometry) {
            this._geometry.dispose();
            this._geometry = null;
        }
        if (this._material) {
            this._material.dispose();
            this._material = null;
        }
    }

    dispose() {
        this.disposeMesh();
    }
}
