export default class Sizes {
    constructor() {
        this.width  = window.innerWidth;
        this.height = window.innerHeight;

        const coarse = typeof window !== 'undefined' &&
            window.matchMedia('(pointer: coarse)').matches;
        this.coarsePointer = coarse;

        this.pixelRatio = Math.min(window.devicePixelRatio, 2.0);
    }
}
