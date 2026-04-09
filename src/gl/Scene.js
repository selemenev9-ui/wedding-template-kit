import * as THREE from 'three';

export default class Scene {
    constructor() {
        this.instance = new THREE.Scene();

        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        const directional = new THREE.DirectionalLight(0xffffff, 1.6);
        directional.position.set(6, 10, 7);
        this.instance.add(ambient, directional);
    }
}
