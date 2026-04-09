import * as THREE from 'three';

export default class Renderer {
    /**
     * @param {import('../utils/Sizes.js').default | { width: number; height: number; pixelRatio: number }} sizes
     * @param {THREE.Scene} scene
     * @param {THREE.PerspectiveCamera} camera
     * @param {HTMLCanvasElement} [canvas]
     */
    constructor(sizes, scene, camera, canvas) {
        const params = { antialias: true, alpha: false, powerPreference: 'high-performance' };
        if (canvas) {
            params.canvas = canvas;
        }
        this.instance = new THREE.WebGLRenderer(params);
        this.instance.setSize(sizes.width, sizes.height);
        this.instance.domElement.style.width = `${sizes.width}px`;
        this.instance.domElement.style.height = `${sizes.height}px`;
        this.instance.setPixelRatio(sizes.pixelRatio);
        // Matches StudioDome interior (#EAE7DC); avoids flash while loading
        this.instance.setClearColor('#EAE7DC', 1);

        this.instance.outputColorSpace = THREE.SRGBColorSpace;
        this.instance.toneMapping = THREE.ACESFilmicToneMapping;
        this.instance.toneMappingExposure = sizes.coarsePointer ? 1.1 : 1.2;
        this.instance.shadowMap.enabled = true;

        if (!canvas) {
            document.body.appendChild(this.instance.domElement);
        }
    }

    resize(sizes) {
        this.instance.setSize(sizes.width, sizes.height);
        this.instance.domElement.style.width = `${sizes.width}px`;
        this.instance.domElement.style.height = `${sizes.height}px`;
        this.instance.setPixelRatio(sizes.pixelRatio);
    }

    update(scene, camera) {
        this.instance.render(scene, camera);
    }

    dispose() {}
}
