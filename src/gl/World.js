import * as THREE from 'three';
import { PMREMGenerator } from 'three';
import gsap from 'gsap';
import Camera from './Camera.js';
import Renderer from './Renderer.js';
import ResourceLoader from './ResourceLoader.js';
import StudioDome from './world/StudioDome.js';

export default class World {
    static instance = null;

    /**
     * @param {{ canvas?: HTMLCanvasElement; sizes: { width: number; height: number; pixelRatio: number; coarsePointer?: boolean } }} config
     */
    constructor(config) {
        if (World.instance) {
            return World.instance;
        }

        if (!config) {
            throw new Error('World: config is required');
        }
        const { canvas, sizes } = config;
        if (!sizes) {
            throw new Error('World: config.sizes is required');
        }
        const { width, height, pixelRatio } = sizes;
        if (typeof width !== 'number' || typeof height !== 'number' || typeof pixelRatio !== 'number') {
            throw new Error('World: sizes must include numeric width, height, and pixelRatio');
        }
        if (width <= 0 || height <= 0) {
            throw new Error('World: sizes width and height must be positive');
        }
        if (canvas != null && !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('World: canvas must be an HTMLCanvasElement when provided');
        }

        World.instance = this;

        this.scene = new THREE.Scene();
        this.camera = new Camera(sizes, this.scene);
        this.renderer = new Renderer(sizes, this.scene, this.camera.instance, canvas);
        this.renderer.instance.shadowMap.type = THREE.VSMShadowMap;

        this.studioDome = new StudioDome();
        this.studioDome.init({ scene: this.scene });
        if (this.studioDome.mesh) {
            this.scene.add(this.studioDome.mesh);
        }

        // Softer key (less directional “hot” edges); fill from ambient compensates brightness
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.05);
        this.directionalLight.position.set(-4.0, 5.0, 4.0);
        this.directionalLight.castShadow = true;
        const sh = this.directionalLight.shadow;
        const lowShadow = sizes.coarsePointer === true;
        sh.mapSize.width  = lowShadow ? 512 : 2048;
        sh.mapSize.height = lowShadow ? 512 : 2048;
        sh.camera.near = 0.5;
        sh.camera.far = 25;
        // Hero rings ~±1.5 world XY; ±6 sufficient with catcher z=-1.5 (behind rear ring ~-0.85)
        sh.camera.left = -6;
        sh.camera.right = 6;
        sh.camera.top = 6;
        sh.camera.bottom = -6;
        sh.bias   = lowShadow ? -0.005 : -0.001;
        sh.radius = lowShadow ? 4 : 12;
        this.scene.add(this.ambientLight, this.directionalLight);

        const shadowGeo = new THREE.PlaneGeometry(25, 25);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.45 });
        this.shadowCatcher = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadowCatcher.position.z = -1.5;
        this.shadowCatcher.receiveShadow = true;
        this.scene.add(this.shadowCatcher);

        this.resources = new ResourceLoader([
            { name: 'envMap', type: 'hdri', path: '/hdri/studio_small_09_1k.hdr' },
            { name: 'ringA', type: 'gltf', path: '/models/ring_a.glb' },
            { name: 'ringB', type: 'gltf', path: '/models/ring_b.glb' },
        ]);

        /** Set from `main.js` when `HeroText` is created (layered load). */
        this.heroText = null;
        /** @type {import('./world/GlassRing.js').default | null} */
        this.glassRing = null;
        /** @type {import('./world/GalleryRibbon.js').default | null} */
        this.galleryRibbon = null;
        /** Shared raycaster + NDC mouse for gallery / future hits (single instance per World). */
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(-1, -1);
        /** Avoid double-running GSAP env fades on the same material instance. */
        this._envReflectionFadeStarted = new WeakSet();

        this.resources.waitFor('envMap').then(() => {
            this._setupEnvironment();
        }).catch((err) => {
            console.error('World: envMap failed', err);
        });
    }

    /**
     * Smooth env reflection reveal on metal (avoids HDRI “pop”). Safe to call repeatedly as hosts appear.
     * @param {{ duration?: number }} [opts]
     */
    tryFadeEnvReflections(opts = {}) {
        const duration = opts.duration ?? 2;
        const env = this.scene?.environment;
        if (!env) return;

        /**
         * @param {THREE.MeshPhysicalMaterial | null | undefined} mat
         * @param {number} destIntensity
         */
        const run = (mat, destIntensity) => {
            if (!mat || this._envReflectionFadeStarted.has(mat)) return;
            this._envReflectionFadeStarted.add(mat);
            mat.envMap = env;
            mat.envMapIntensity = 0;
            mat.needsUpdate = true;
            gsap.to(mat, {
                envMapIntensity: destIntensity,
                duration,
                ease: 'power2.inOut',
                onUpdate: () => {
                    mat.needsUpdate = true;
                },
            });
        };

        run(this.heroText?.goldMaterial, 1.5);
        run(this.glassRing?.goldMaterial, 1.6);
    }

    _setupEnvironment() {
        const texture = this.resources.get('envMap');
        if (!texture) {
            return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new PMREMGenerator(this.renderer.instance);
        const envTexture = pmrem.fromEquirectangular(texture).texture;
        this.scene.environment = envTexture;
        pmrem.dispose();
        texture.dispose();
        delete this.resources.items.envMap;

        this.tryFadeEnvReflections();
    }

    /**
     * @param {number} x NDC in [-1, 1] (three.js convention)
     * @param {number} y NDC in [-1, 1]
     */
    updateMouse(x, y) {
        this.mouse.set(x, y);
    }

    update() {
        this.renderer.update(this.scene, this.camera.instance);
    }

    /**
     * Single resize orchestration for WebGL layer (camera + renderer + optional host resize hooks).
     * @param {number} width
     * @param {number} height
     * @param {number} pixelRatio
     */
    resize(width, height, pixelRatio) {
        const coarsePointer =
            typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
        const sizes = { width, height, pixelRatio, coarsePointer };
        this.camera.resize(sizes);
        this.renderer.resize(sizes);
        this.glassRing?.resize?.(sizes);
        this.galleryRibbon?.resize?.();
    }

    destroy() {
        if (this.scene) {
            if (this.scene.environment) {
                this.scene.environment.dispose();
            }
            this.scene.environment = null;
        }

        this.heroText = null;
        this.glassRing = null;
        this.galleryRibbon = null;

        this.resources?.destroy();
        this.resources = null;

        this.studioDome?.dispose();
        this.studioDome = null;

        if (this.shadowCatcher) {
            this.shadowCatcher.removeFromParent();
            this.shadowCatcher.geometry?.dispose();
            const m = this.shadowCatcher.material;
            if (m) m.dispose();
            this.shadowCatcher = null;
        }

        this.ambientLight = null;
        this.directionalLight = null;

        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.instance) {
                this.renderer.instance.dispose();
                const el = this.renderer.instance.domElement;
                if (el?.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }
        }

        this.scene.clear();

        World.instance = null;
    }
}

export const getWorld = () => World.instance;
