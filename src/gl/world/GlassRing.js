import * as THREE from 'three';
import { getWorld } from '../World.js';

export default class GlassRing {
    constructor() {
        const world = getWorld();
        if (!world) {
            throw new Error('GlassRing: World singleton is not initialized');
        }

        this.scene = world.scene;
        this.resources = world.resources;

        this.mesh = new THREE.Group();

        /** ScrollTrigger scrubs these; each ring is its own “orbit”. */
        this.groupA = new THREE.Group();
        this.groupB = new THREE.Group();

        /** Local Y/Z sine drift — additive under GSAP-driven groups. */
        this.floatA = new THREE.Group();
        this.floatB = new THREE.Group();

        this.groupA.add(this.floatA);
        this.groupB.add(this.floatB);

        this.groupA.position.set(-0.35, 0.1, 0.5);
        this.groupB.position.set(0.28, -0.1, -0.5);

        this.mesh.add(this.groupA, this.groupB);
        this.scene.add(this.mesh);

        /** @type {THREE.MeshPhysicalMaterial | null} */
        this.goldMaterial = null;
        /** @type {Set<THREE.BufferGeometry>} */
        this._geometries = new Set();
        this._built = false;

        this.ready = this._init();
    }

    async _init() {
        try {
            const [gltfA, gltfB] = await Promise.all([
                this.resources.waitFor('ringA'),
                this.resources.waitFor('ringB'),
            ]);

            this.goldMaterial = new THREE.MeshPhysicalMaterial({
                color:                 new THREE.Color('#d4af37'),
                metalness:           1.0,
                roughness:           0.05,
                clearcoat:           1.0,
                clearcoatRoughness:  0.02,
                ior:                 2.5,
                envMapIntensity:     0,
            });

            this._ingestGltf(gltfA, this.floatA);
            this._ingestGltf(gltfB, this.floatB);
            this._built = true;
        } catch (e) {
            console.error('GlassRing: failed to load ring GLBs', e);
        }
    }

    /**
     * Fit glTF to scene units. Uses mesh-only world AABB so empties/cameras/lights in the export
     * cannot shrink scale to invisibility; clamps scale if bounds are degenerate.
     *
     * Blender: Apply Scale/Rotation (Ctrl+A), export only the ring mesh(es), remove stray empties.
     * @param {THREE.Object3D} root
     * @param {number} targetMaxDim - max axis length after normalize (~0.9–1.2 for hero rings at z≈5)
     */
    _normalizeModelToScene(root, targetMaxDim) {
        root.updateMatrixWorld(true);

        const _unionMeshWorldBox = (outBox) => {
            let found = false;
            root.traverse((child) => {
                if (!(child.isMesh || child.isSkinnedMesh) || !child.geometry) return;
                const g = child.geometry;
                if (!g.boundingBox) g.computeBoundingBox();
                const bb = g.boundingBox;
                if (!bb || bb.isEmpty()) return;
                child.updateWorldMatrix(true, false);
                const meshBox = bb.clone().applyMatrix4(child.matrixWorld);
                if (!found) {
                    outBox.copy(meshBox);
                    found = true;
                } else {
                    outBox.union(meshBox);
                }
            });
            return found;
        };

        const box = new THREE.Box3();
        let ok = _unionMeshWorldBox(box);
        if (!ok || box.isEmpty()) {
            console.warn(
                'GlassRing: no mesh AABB — falling back to setFromObject. Check GLB has visible Mesh geometry.',
            );
            box.setFromObject(root);
        }

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
        let s = targetMaxDim / maxDim;
        s = THREE.MathUtils.clamp(s, 0.03, 3000);

        root.scale.setScalar(s);
        root.updateMatrixWorld(true);

        const box2 = new THREE.Box3();
        ok = _unionMeshWorldBox(box2);
        if (!ok || box2.isEmpty()) {
            box2.setFromObject(root);
        }
        const center = box2.getCenter(new THREE.Vector3());
        root.position.sub(center);
    }

    /**
     * @param {import('three/examples/jsm/loaders/GLTFLoader.js').GLTF} gltf
     * @param {THREE.Group} floatRoot
     */
    _ingestGltf(gltf, floatRoot) {
        gltf.scene.traverse((child) => {
            if (!child.isMesh) return;
            if (child.geometry) {
                this._geometries.add(child.geometry);
            }
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
                if (m) m.dispose();
            }
            child.material = this.goldMaterial;
            child.castShadow = true;
        });
        this._normalizeModelToScene(gltf.scene, 1.0);
        floatRoot.add(gltf.scene);
    }

    update() {
        const t = performance.now() * 0.001;

        this.floatA.position.y = Math.sin(t * 0.88) * 0.024 + Math.sin(t * 0.31 + 0.7) * 0.008;
        this.floatA.position.z = Math.sin(t * 0.62 + 1.15) * 0.019;

        this.floatB.position.y = Math.sin(t * 1.12 + 2.1) * 0.027 + Math.sin(t * 0.41) * 0.009;
        this.floatB.position.z = Math.sin(t * 0.71 + 0.25) * 0.021;
    }

    destroy() {
        if (this.scene && this.mesh) {
            this.scene.remove(this.mesh);
        }

        if (this.goldMaterial) {
            this.goldMaterial.dispose();
            this.goldMaterial = null;
        }

        for (const geo of this._geometries) {
            geo.dispose();
        }
        this._geometries.clear();

        this.floatA = null;
        this.floatB = null;
        this.groupA = null;
        this.groupB = null;
        this.mesh = null;
        this._built = false;
    }
}
