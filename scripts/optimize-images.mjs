// Génère les images optimisées (AVIF + WebP, plusieurs largeurs) dans src/img/
// à partir des originaux de assets-src/.
//
// Usage :  npm run images
//
// Les originaux ne sont jamais modifiés. Les sorties sont déterministes.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "assets-src");
const outDir = path.join(root, "src", "img");

/** nom de sortie → { fichier source, largeurs } */
const jobs = [
  { name: "beercraft", file: "beercraft.png", widths: [640, 1280], avifQ: 50, webpQ: 78 },
  { name: "galaxie-provisoire", file: "galaxie-provisoire.webp", widths: [688], avifQ: 50, webpQ: 78 },
];

await mkdir(outDir, { recursive: true });

for (const job of jobs) {
  const input = path.join(srcDir, job.file);
  const meta = await sharp(input).metadata();
  for (const w of job.widths) {
    const width = Math.min(w, meta.width);
    const base = sharp(input).resize({ width, withoutEnlargement: true });
    const avif = await base.clone().avif({ quality: job.avifQ, effort: 6 }).toFile(path.join(outDir, `${job.name}-${w}.avif`));
    const webp = await base.clone().webp({ quality: job.webpQ, effort: 6 }).toFile(path.join(outDir, `${job.name}-${w}.webp`));
    console.log(`${job.name}-${w}: ${width}x${avif.height}  avif ${(avif.size / 1024).toFixed(1)} Ko · webp ${(webp.size / 1024).toFixed(1)} Ko`);
  }
}
