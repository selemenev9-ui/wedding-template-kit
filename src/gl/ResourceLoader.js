import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * @typedef {{ name: string; type: 'hdri' | 'texture' | 'font' | 'gltf'; path: string }} AssetDescriptor
 */

export default class ResourceLoader {
    /**
     * @param {AssetDescriptor[]} assets
     */
    constructor(assets) {
        this.assets = assets;
        /** @type {Record<string, THREE.Texture | string | import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>} */
        this.items = {};

        /** @type {Map<string, { promise: Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }>} */
        this._deferreds = new Map();

        for (const asset of assets) {
            let resolve;
            let reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            this._deferreds.set(asset.name, {
                promise,
                resolve: /** @type {(v: unknown) => void} */ (resolve),
                reject: /** @type {(e: unknown) => void} */ (reject),
            });
        }

        this._textureLoader = new THREE.TextureLoader();
        this._hdrLoader = new HDRLoader();
        this._dracoLoader = new DRACOLoader();
        // Draco decoders load from Google CDN; warm TLS/DNS early via `<link rel="preconnect" href="https://www.gstatic.com">` in `index.html`.
        this._dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
        this._gltfLoader = new GLTFLoader();
        this._gltfLoader.setDRACOLoader(this._dracoLoader);
        this._gltfLoader.setMeshoptDecoder(MeshoptDecoder);
        /** @type {string[]} */
        this._fontBlobUrls = [];

        this._loadedCount = 0;
        this._loadAll();
    }

    /**
     * @param {string} name
     * @returns {Promise<unknown>}
     */
    waitFor(name) {
        const d = this._deferreds.get(name);
        if (!d) return Promise.reject(new Error(`ResourceLoader: asset "${name}" not in manifest`));
        return d.promise;
    }

    _loadAll() {
        const total = this.assets.length;

        /** @param {unknown} result */
        const onSuccess = (name, result) => {
            this.items[name] = result;
            const def = this._deferreds.get(name);
            if (def) def.resolve(result);

            this._loadedCount++;
            window.dispatchEvent(
                new CustomEvent('resources:progress', {
                    detail: { loaded: this._loadedCount, total, ratio: this._loadedCount / total },
                }),
            );
        };

        const tasks = this.assets.map((desc) => this._loadOne(desc, onSuccess));

        // Never block the aggregate on a single rejection or hang ALL listeners on Promise.all —
        // boot already uses per-asset `waitFor()`. `resources:ready` = “all load attempts settled”.
        Promise.allSettled(tasks).then((results) => {
            const rejected = results.filter((r) => r.status === 'rejected');
            if (rejected.length) {
                console.warn(
                    `ResourceLoader: ${rejected.length}/${results.length} asset(s) failed (see errors above).`,
                );
            }
            window.dispatchEvent(
                new CustomEvent('resources:ready', {
                    detail: {
                        ok: rejected.length === 0,
                        failed: rejected.length,
                        total: results.length,
                    },
                }),
            );
        });
    }

    /**
     * @param {AssetDescriptor} desc
     * @param {(name: string, result: unknown) => void} onSuccess
     * @returns {Promise<void>}
     */
    _loadOne(desc, onSuccess) {
        const { name, type, path } = desc;
        const def = this._deferreds.get(name);
        if (!def) return Promise.reject(new Error(`ResourceLoader: no deferred for "${name}"`));

        const fail = (err) => {
            def.reject(err);
            return Promise.reject(err);
        };

        if (type === 'hdri') {
            return new Promise((resolve, reject) => {
                this._hdrLoader.load(
                    path,
                    (texture) => {
                        onSuccess(name, texture);
                        resolve();
                    },
                    undefined,
                    (err) => { fail(err); reject(err); },
                );
            });
        }

        if (type === 'texture') {
            return new Promise((resolve, reject) => {
                this._textureLoader.load(
                    path,
                    (texture) => {
                        onSuccess(name, texture);
                        resolve();
                    },
                    undefined,
                    (err) => { fail(err); reject(err); },
                );
            });
        }

        if (type === 'font') {
            return fetch(path)
                .then((res) => {
                    if (!res.ok) {
                        throw new Error(`ResourceLoader font "${name}": ${res.status} ${path}`);
                    }
                    return res.blob();
                })
                .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    this._fontBlobUrls.push(url);
                    onSuccess(name, url);
                })
                .catch((err) => fail(err));
        }

        if (type === 'gltf') {
            return new Promise((resolve, reject) => {
                this._gltfLoader.load(
                    path,
                    (gltf) => {
                        onSuccess(name, gltf);
                        resolve();
                    },
                    undefined,
                    (err) => { fail(err); reject(err); },
                );
            });
        }

        return fail(new Error(`ResourceLoader: unknown type "${type}" for "${name}"`));
    }

    /**
     * @param {string} name
     * @returns {THREE.Texture | string | import('three/examples/jsm/loaders/GLTFLoader.js').GLTF | undefined}
     */
    get(name) {
        return this.items[name];
    }

    destroy() {
        for (const url of this._fontBlobUrls) {
            URL.revokeObjectURL(url);
        }
        this._fontBlobUrls = [];

        for (const key of Object.keys(this.items)) {
            const item = this.items[key];
            if (item && typeof item.dispose === 'function') {
                item.dispose();
            }
        }

        this.items = {};
        this._deferreds.clear();

        this._dracoLoader?.dispose();
        this._dracoLoader = null;
    }
}
