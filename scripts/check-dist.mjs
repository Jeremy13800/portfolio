// Contrôles statiques du build (dist/) : liens internes, ressources, CSP, qualité de base.
// Usage : npm run build && npm run check
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
if (!existsSync(dist)) {
  console.error("dist/ introuvable : lancez d'abord `npm run build`.");
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page} : ${msg}`);
const warn = (page, msg) => warnings.push(`${page} : ${msg}`);

const pages = [
  ...readdirSync(dist).filter((f) => f.endsWith(".html")),
  ...readdirSync(join(dist, "projets")).filter((f) => f.endsWith(".html")).map((f) => `projets/${f}`),
];
const ids = {};
for (const p of pages) ids[p] = new Set([...readFileSync(join(dist, p), "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// hash CSP attendu pour l'unique script inline autorisé
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy")?.value ?? "";
const allowedHashes = [...csp.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]);

let placeholders = 0;
const externalLinks = [];
const resolvePage = (url) => {
  const clean = url.replace(/^\//, "").replace(/\/$/, "");
  if (clean === "") return "index.html";
  if (existsSync(join(dist, clean))) return clean;
  if (existsSync(join(dist, `${clean}.html`))) return `${clean}.html`;
  return null;
};

for (const page of pages) {
  const html = readFileSync(join(dist, page), "utf8");

  // Structure de base
  if (!/<html lang="fr"/.test(html)) err(page, "attribut lang manquant");
  if (!/<title>[^<]{5,}<\/title>/.test(html)) err(page, "title manquant");
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) err(page, "meta description manquante");
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(page, `${h1} balise(s) h1 (attendu : 1)`);
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(img[0])) err(page, `image sans alt : ${img[0].slice(0, 60)}`);
    if (!/\bwidth="/.test(img[0]) || !/\bheight="/.test(img[0])) err(page, `image sans width/height : ${img[0].slice(0, 60)}`);
  }

  // CSP : pas de style inline, scripts inline = hash autorisé
  if (/\sstyle="/.test(html)) err(page, "attribut style= présent (bloqué par la CSP)");
  if (/<style[\s>]/.test(html)) err(page, "balise <style> présente (bloquée par la CSP)");
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = createHash("sha256").update(m[1]).digest("base64");
    if (!allowedHashes.includes(hash)) err(page, `script inline non autorisé par la CSP (sha256-${hash})`);
  }

  // Liens sortants autorisés : uniquement des <a> https, ouverts dans un nouvel onglet avec rel="noopener"
  const externalAnchors = new Set();
  for (const a of html.matchAll(/<a\b[^>]*\bhref="(https:\/\/[^"]+)"[^>]*>/g)) {
    if (!/\btarget="_blank"/.test(a[0]) || !/\brel="[^"]*noopener/.test(a[0])) err(page, `lien externe sans target="_blank" rel="noopener" : ${a[1]}`);
    externalAnchors.add(a[1]);
  }
  if (externalAnchors.size) externalLinks.push(...[...externalAnchors].filter((u) => !externalLinks.includes(u)));

  // Ressources et liens
  for (const m of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
    const url = m[1];
    if (url === "#") { placeholders++; continue; }
    if (url.startsWith("mailto:")) continue;
    if (/^https?:\/\//.test(url)) { if (!externalAnchors.has(url)) err(page, `ressource ou lien externe : ${url}`); continue; }
    if (url.startsWith("#")) { if (!ids[page].has(url.slice(1))) err(page, `ancre introuvable : ${url}`); continue; }
    if (url.startsWith("/")) {
      const [path, hash] = url.split("#");
      const target = resolvePage(path);
      if (!target) err(page, `lien cassé : ${url}`);
      else if (hash && !ids[target]?.has(hash)) err(page, `ancre introuvable : ${url}`);
    }
  }
  for (const m of html.matchAll(/\bsrcset="([^"]*)"/g)) {
    for (const cand of m[1].split(",")) {
      const url = cand.trim().split(/\s+/)[0];
      if (url && !resolvePage(url)) err(page, `image srcset introuvable : ${url}`);
    }
  }
}

console.log(`${pages.length} pages contrôlées : ${pages.join(", ")}`);
if (placeholders) console.log(`ℹ ${placeholders} lien(s) provisoire(s) href="#" (GitHub, LinkedIn, CV, mentions légales) à renseigner.`);
for (const w of warnings) console.log(`⚠ ${w}`);
if (errors.length) {
  console.error(`\n${errors.length} erreur(s) :`);
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
if (externalLinks.length) console.log(`ℹ ${externalLinks.length} lien(s) sortant(s) (nouvel onglet, rel=noopener) : ${externalLinks.join(", ")}`);
console.log("✓ Aucune erreur (liens internes, ressources, CSP, structure).");
