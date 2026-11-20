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
projets/<slug>.html         Une étude de cas par projet (auprodio, myplayertwo, asl, beercraft, quantika)
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

## Mise en ligne

Par défaut le site est **non indexable** (`noindex`, `robots.txt` en `Disallow: /`) : l'indexation s'active au lancement.
Pour le lancement, définir ces variables d'environnement au build (Vercel → Settings → Environment Variables, Production) :

| Variable | Effet |
|---|---|
| `SITE_URL` | URL publique réelle (ex. `https://mon-domaine.fr`). Active canonical, `og:url`, `og:image` absolue, URL du JSON-LD. Sur Vercel, `VERCEL_PROJECT_PRODUCTION_URL` sert de repli. |
| `INDEXABLE=true` | Retire le `noindex`, ouvre `robots.txt` et génère `sitemap.xml` (si l'URL est connue). |

### Contrôles avant chaque mise en ligne

`npm run build && npm run check` vérifie notamment l'absence de mentions provisoires (« à compléter », « provisoire », crochets, adresses fictives) et de liens `href="#"` dans les pages construites.

### Contact

Il n'y a pas de formulaire : le contact passe par des liens `mailto:` (voir `index.html`, section Contact). Si un formulaire est ajouté plus tard, prévoir un service d'envoi, adapter `connect-src` / `form-action` dans la CSP (`vercel.json`) et ne jamais afficher de confirmation tant que le message n'est pas réellement parti.

### À ajouter quand les informations seront disponibles

- Lien vers un CV (`public/cv.pdf`) : dans le Hero et le pied de page.
- Mentions légales : la page `mentions-legales.html` existe (lien dans le pied de page) ; voir « Vérifications juridiques avant publication » ci-dessous.

## Vérifications juridiques avant publication

La page `mentions-legales.html` est une rédaction factuelle et prudente. **Elle n'est pas une validation juridique et ne doit pas être considérée comme conforme** tant que les points suivants ne sont pas résolus (ils ne le sont pas à ce jour) :

1. **Qualification du portfolio** (professionnel ou non professionnel) : la disponibilité pour des missions freelance peut influer sur la qualification ; aucune source consultée ne tranche. Les obligations d'identification de l'éditeur en dépendent.
2. **Adresse de domiciliation** : déterminer si une adresse (ou une adresse de domiciliation) doit être publiée. L'adresse personnelle n'est pas publiée et ne doit pas l'être sans décision explicite.
3. **Téléphone de l'hébergeur** : Vercel Inc. (nom et adresse repris de sa politique de confidentialité, en vigueur au 1er juin 2026) ne publie pas de numéro de téléphone sur les pages consultées. À confirmer si son affichage est juridiquement requis.
4. **Paramètres Vercel** : vérifier dans le tableau de bord qu'aucune mesure d'audience ni journalisation supplémentaire n'est activée, et ce que le compte conserve comme données d'identification de l'éditeur.

### Décision prise : conservation des e-mails

La durée de conservation des e-mails reçus via le contact du portfolio est **définie : 12 mois maximum à compter du dernier échange**, puis suppression (sauf conservation plus longue nécessaire pour respecter une obligation légale, gérer une relation contractuelle ou défendre des droits en justice). Il s'agit d'un choix de gestion, et non d'une durée imposée par le RGPD. Elle est indiquée dans la section Confidentialité de la page ; elle ne concerne ni les journaux techniques de l'hébergeur, ni d'autres traitements.

**À faire :** appliquer réellement cette politique dans la messagerie (suppression ou archivage des échanges de plus de 12 mois après le dernier message), par exemple par un rappel périodique.

Avant publication : faire valider la page par un professionnel du droit si nécessaire, mettre à jour la date « Dernière mise à jour » de la page.
