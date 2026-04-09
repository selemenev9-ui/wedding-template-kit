import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR  = path.join(__dirname, '..', 'public', 'photos');
const GALLERY_DIR = path.join(PHOTOS_DIR, 'gallery');
const JPEG_EXT = /\.jpe?g$/i;

async function buildGalleryManifest() {
    let entries;
    try {
        entries = await fs.readdir(GALLERY_DIR);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.warn('buildGalleryManifest: public/photos/gallery not found, skip');
            return;
        }
        throw err;
    }

    const webps = entries
        .filter((f) => /^(\d+)\.webp$/i.test(f))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (webps.length === 0) {
        console.warn('buildGalleryManifest: no N.webp in gallery, skip');
        return;
    }

    const manifest = {};
    for (const file of webps) {
        const n = parseInt(file.match(/^(\d+)/)[1], 10);
        const idx = n - 1;
        const meta = await sharp(path.join(GALLERY_DIR, file)).metadata();
        const w = meta.width ?? 1;
        const h = meta.height ?? 1;
        manifest[idx] = parseFloat((w / h).toFixed(4));
    }

    const outPath = path.join(__dirname, '..', 'public', 'gallery-manifest.json');
    await fs.writeFile(outPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    console.log(`✓ gallery-manifest.json (${Object.keys(manifest).length} ratios)`);
}

async function main() {
    await buildGalleryManifest();

    let entries;
    try {
        entries = await fs.readdir(PHOTOS_DIR);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error('public/photos/ does not exist');
            process.exit(1);
        }
        throw err;
    }

    const jpegs = entries.filter((name) => JPEG_EXT.test(name));
    if (jpegs.length === 0) {
        console.log('No .jpg/.jpeg files in public/photos/ (webp conversion skipped)');
        return;
    }

    for (const file of jpegs) {
        const inputPath = path.join(PHOTOS_DIR, file);
        const stat = await fs.stat(inputPath);
        if (!stat.isFile()) continue;

        const base = file.replace(JPEG_EXT, '');
        const outName = `${base}.webp`;
        const outputPath = path.join(PHOTOS_DIR, outName);

        await sharp(inputPath)
            .resize({ width: 1920, withoutEnlargement: true })
            .webp({ quality: 75, effort: 6 })
            .toFile(outputPath);

        console.log(`✓ ${outName}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
