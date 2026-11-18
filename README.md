# Portfolio — Jérémy Cailleux

Portfolio de développeur web, direction artistique **Cosmic Immersive** (influences sci-fi developer).
Site statique : HTML sémantique, CSS natif, JavaScript natif (≈ 1 Ko gzip), **Vite** pour le build.
Aucun framework, aucune ressource externe, aucune donnée envoyée.

## Commandes

```bash
npm install          # dépendances (vite, sharp)
npm run dev          # serveur de développement  → http://localhost:5173
npm run build        # build de production        → dist/
npm run preview      # prévisualiser dist/        → http://localhost:4173
npm run check        # contrôles du build : liens internes, ressources, CSP, structure
npm run images       # régénère src/img/ (AVIF + WebP) depuis assets-src/
```

Node `^20.19.0 || >=22.12.0` requis (Vite 8).

## Architecture

```
index.html                  Accueil (Hero, Projets, À propos, Compétences, Services, Contact)
404.html                    Page introuvable
projets/<slug>.html         Une étude de cas par projet (quantika, beercraft, lets-cook)
partials/                   Morceaux communs inclus au build : <!--@include nom-->
  head-common.html            thème, favicon, préchargement des polices, CSS, JS
  chrome.html                 sprite SVG, lien d'évitement, ciel étoilé, bandeau, header
  footer.html                 pied de page
src/css/styles.css          Tous les styles (importe stars.css, généré)
src/js/main.js              Menu mobile, apparition au scroll, rail de secteurs, formulaire (démo)
src/fonts/                  Instrument Serif (normal + italique), Inter — WOFF2 locales
src/img/                    Images optimisées (générées)
assets-src/                 Images d'origine (jamais servies)
public/                     favicon.svg, apple-touch-icon.png, og-image.jpg (copiés tels quels)
scripts/                    optimize-images.mjs, check-dist.mjs, og-template.html
vite.config.mjs             Pages, inclusions, balises SEO, robots.txt, sitemap.xml
vercel.json                 URL propres, en-têtes de sécurité (CSP), cache
```

### Ajouter une étude de cas

1. Copier `projets/quantika.html` en `projets/<nouveau-slug>.html` et adapter le contenu.
2. Ajouter la carte dans `index.html` (section Projets) avec un lien vers `/projets/<nouveau-slug>`.
3. `npm run build && npm run check`. La page est détectée automatiquement (build, sitemap).

### Règles à respecter (CSP stricte)

- **Aucun attribut `style=""`** ni balise `<style>` : utiliser des classes (voir « Utilitaires » en bas de `styles.css`).
- Le seul script inline autorisé est celui de `partials/head-common.html` (son empreinte SHA-256 est dans `vercel.json`).
  Si vous le modifiez, recalculez l'empreinte et mettez à jour `vercel.json` (`npm run check` signale l'écart).
- Aucune ressource externe (polices, CDN, analytics) : elles seraient bloquées.

## Mise en ligne : état « version de travail »

Par défaut le site est **non indexable** (`noindex`, `robots.txt` en `Disallow: /`), car des contenus sont encore provisoires.
Pour le lancement, définir ces variables d'environnement au build (Vercel → Settings → Environment Variables, Production) :

| Variable | Effet |
|---|---|
| `SITE_URL` | URL publique réelle (ex. `https://mon-domaine.fr`). Active canonical, `og:url`, `og:image` absolue, URL du JSON-LD. Sur Vercel, `VERCEL_PROJECT_PRODUCTION_URL` sert de repli. |
| `INDEXABLE=true` | Retire le `noindex`, ouvre `robots.txt` et génère `sitemap.xml` (si l'URL est connue). |

### Checklist avant lancement

- [ ] Remplacer tous les contenus provisoires (crochets `[…]`, badges « provisoire », « à fournir »).
- [ ] Renseigner les liens GitHub, LinkedIn, CV (`public/cv.pdf`) et mentions légales (26 liens `href="#"`).
- [ ] Ajouter de vraies captures pour Quantika et Let's Cook, un portrait, et confirmer les droits de la photo de galaxie.
- [ ] Supprimer le bandeau « VERSION DE TRAVAIL » (`partials/chrome.html`).
- [ ] Définir `SITE_URL` et `INDEXABLE=true`, puis mesurer (Lighthouse, PageSpeed) sur le déploiement réel.
- [ ] Brancher le formulaire de contact (actuellement en **démonstration** : il n'envoie rien). Si un service est ajouté, adapter `connect-src` / `form-action` dans la CSP.
- [ ] Ajouter `sameAs` (GitHub, LinkedIn) au JSON-LD dans `vite.config.mjs` une fois les profils renseignés.
