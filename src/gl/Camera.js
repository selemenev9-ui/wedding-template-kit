import * as THREE from 'three';

export default class Camera {
    constructor(sizes, scene) {
        this.instance = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
        this.instance.position.set(0, 0, 5);
        scene.add(this.instance);
    }

    setPosition(x, y, z) {
        this.instance.position.set(x, y, z);
    }

    /** Does not touch **`position`** — **`y`/`z`** are scrubbed by **`Scroll.js`** `masterTl`. */
    resize(sizes) {
        this.instance.aspect = sizes.width / sizes.height;
        this.instance.updateProjectionMatrix();
    }
}
