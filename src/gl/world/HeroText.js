import { getWorld } from '../World.js';

/**
 * DOM-only hero names (`#hero-names`). No Three.js nodes — keeps `launchExperience` / `World.tryFadeEnvReflections`
 * wiring stable with a resolved `ready` promise and `goldMaterial: null`.
 */
export default class HeroText {
    constructor() {
        const world = getWorld();
        if (!world) {
            throw new Error('HeroText: World singleton is not initialized');
        }

        this.goldMaterial = null;
        this.ready = Promise.resolve();
    }

    destroy() {}
}
