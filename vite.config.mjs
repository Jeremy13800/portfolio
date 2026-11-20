// Configuration Vite : site statique multi-pages, sans framework.
//
// Variables d'environnement (build) :
//   SITE_URL    URL publique du site, ex. https://exemple.fr (sinon VERCEL_PROJECT_PRODUCTION_URL sur Vercel).
//               Sans URL réelle : pas de canonical, d'og:url, d'og:image absolue ni de sitemap.
//   INDEXABLE   "true" pour autoriser l'indexation (à définir au lancement). Par défaut le site
//               reste en noindex et robots.txt interdit l'exploration.
import { defineConfig } from "vite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const partialsDir = resolve(root, "partials");

const indexable = process.env.INDEXABLE === "true";
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
).replace(/\/+$/, "");

/* Pages : index, 404 et chaque projets/*.html (ajouter une étude de cas = ajouter un fichier) */
const projectSlugs = readdirSync(resolve(root, "projets"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""));

const input = {
  index: resolve(root, "index.html"),
  "404": resolve(root, "404.html"),
  ...Object.fromEntries(projectSlugs.map((s) => [`projets/${s}`, resolve(root, "projets", `${s}.html`)])),
};

const canonicalPath = (htmlPath) => {
  if (htmlPath === "/index.html") return "/";
  if (htmlPath === "/404.html") return null;
  return htmlPath.replace(/\.html$/, "");
};

function sitePlugin() {
  return {
    name: "portfolio-site",

    configureServer(server) {
      server.watcher.add(partialsDir);
      server.watcher.on("change", (file) => {
        if (file.startsWith(partialsDir)) server.ws.send({ type: "full-reload" });
      });
    },

    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // 1. Inclusions : <!--@include nom--> → partials/nom.html
        const out = html.replace(/<!--@include ([\w-]+)-->/g, (_, name) =>
          readFileSync(resolve(partialsDir, `${name}.html`), "utf8").trimEnd());

        // 2. Balises dépendantes de l'URL réelle et de l'état de lancement
        const path = canonicalPath(ctx.path);
        const tags = [];
        if (!indexable || path === null) {
          tags.push({ tag: "meta", attrs: { name: "robots", content: "noindex, nofollow" }, injectTo: "head" });
        }
        if (siteUrl && path !== null) {
          tags.push(
            { tag: "link", attrs: { rel: "canonical", href: siteUrl + path }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:url", content: siteUrl + path }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:image", content: `${siteUrl}/og-image.jpg` }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:image:width", content: "1200" }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:image:height", content: "630" }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:image:alt", content: "Jérémy Cailleux — Je construis des univers pour le web." }, injectTo: "head" },
            { tag: "meta", attrs: { name: "twitter:image", content: `${siteUrl}/og-image.jpg` }, injectTo: "head" },
          );
        }
        if (path === "/") {
          // Uniquement des informations réelles : nom, métier, URL, profils GitHub et LinkedIn (fournis par Jérémy), ville/région/pays (aucune adresse postale).
          const graph = [
            { "@type": "WebSite", name: "Jérémy Cailleux", inLanguage: "fr-FR", ...(siteUrl && { url: siteUrl }) },
            { "@type": "Person", name: "Jérémy Cailleux", jobTitle: "Développeur web", address: { "@type": "PostalAddress", addressLocality: "Istres", addressRegion: "Provence-Alpes-Côte d'Azur", addressCountry: "FR" }, sameAs: ["https://github.com/Jeremy13800", "https://www.linkedin.com/in/j%C3%A9r%C3%A9my-cailleux-7070b4373/"], ...(siteUrl && { url: siteUrl }) },
          ];
          tags.push({
            tag: "script",
            attrs: { type: "application/ld+json" },
            children: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
            injectTo: "head",
          });
        }
        return { html: out, tags };
      },
    },

    // robots.txt et sitemap.xml générés au build
    generateBundle() {
      const robots = indexable
        ? `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ""}`
        : "User-agent: *\nDisallow: /\n";
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });

      if (indexable && siteUrl) {
        const urls = ["/", ...projectSlugs.map((s) => `/projets/${s}`)];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map((u) => `  <url><loc>${siteUrl}${u === "/" ? "/" : u}</loc></url>`)
          .join("\n")}\n</urlset>\n`;
        this.emitFile({ type: "asset", fileName: "sitemap.xml", source: xml });
      }
      this.info(
        `SEO : ${indexable ? "indexable" : "noindex (INDEXABLE non défini)"} · URL ${siteUrl || "non définie (canonical, og:url, og:image et sitemap omis)"}`,
      );
    },
  };
}

export default defineConfig({
  plugins: [sitePlugin()],
  build: {
    outDir: "dist",
    assetsInlineLimit: 0, // aucune ressource en data: URI (CSP stricte)
    modulePreload: { polyfill: false },
    rollupOptions: { input },
  },
  appType: "mpa", // site multi-pages : pas de repli SPA vers index.html
  server: { open: false },
});
