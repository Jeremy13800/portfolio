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
npm run test:api     # tests de /api/contact (Resend et Redis simulés)
npm run dev:api      # API de contact locale (Resend simulé), avec npm run dev
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

Les trois points d'entrée de la section Contact (e-mail, « Mission freelance », « Opportunité professionnelle ») ouvrent une fenêtre unique (`<dialog>` dans `index.html`, logique dans `src/js/contact.js`, chargée à la demande). Titre, description et objet prérempli dépendent de l'attribut `data-contact` ; sans JavaScript, les liens `mailto:` restent le repli.

**Architecture d'envoi** : navigateur → `GET/POST /api/contact` (Vercel Function, `api/contact.js`, logique dans `api/_lib/contact-core.mjs`) → API Resend. Le navigateur ne détient aucun secret. Le succès n'est affiché que si Resend a accepté le message (réponse avec identifiant) ; sinon, une erreur explicite est affichée.

| Variable (Vercel, jamais dans Git) | Rôle |
|---|---|
| `RESEND_API_KEY` | Clé API Resend (droit d'envoi uniquement) |
| `CONTACT_TO_EMAIL` | Boîte qui reçoit les messages |
| `CONTACT_FROM_EMAIL` | Expéditeur, sur un **domaine vérifié chez Resend** (jamais l'adresse du visiteur ; celle-ci est placée en `Reply-To`) |
| `CONTACT_FORM_SECRET` | Secret de signature des jetons (32 caractères minimum, aléatoire) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis partagé pour la limitation de débit (`KV_REST_API_URL` / `KV_REST_API_TOKEN` acceptés) |

Le modèle est dans `.env.example`. Si une variable manque, l'API répond `503 not_configured` et rien n'est envoyé.

**Protections** : méthodes limitées à GET (jeton) et POST ; JSON uniquement, 16 Ko maximum ; validation stricte côté serveur (nom 100, e-mail 254, objet 150, message 5 000 caractères ; caractères de contrôle et retours à la ligne refusés dans les en-têtes) ; champ piège (honeypot) ; **jeton signé HMAC** délivré par le serveur à l'ouverture de la fenêtre (délai minimal de 3 s, validité de 2 h, usage unique : non falsifiable par le navigateur) ; **limitation de débit partagée** dans Redis (5 messages par heure et par IP hachée, 100 par jour au total) ; contenu de l'e-mail échappé (HTML) ; aucune journalisation du message ni des données du visiteur ; réponses JSON sans information sensible.

**Limites** : la limitation par IP repose sur l'en-tête fourni par Vercel ; un attaquant disposant de nombreuses adresses IP peut la contourner, le plafond global de 100 messages par jour limite alors les dégâts (et peut bloquer les vrais visiteurs). Pas de CAPTCHA. Si Redis est indisponible, l'envoi échoue (jamais de succès simulé).

**Mise en route (une seule fois)** : créer un compte Resend et vérifier un domaine d'envoi ; créer une base Upstash Redis (Vercel Marketplace) ; renseigner les variables ci-dessus dans Vercel (Production, Preview si besoin) ; mettre à jour la page de mentions légales (elle indique encore qu'aucun formulaire n'existe : sous-traitants Resend et Upstash, données traitées, conservation) ; envoyer un premier message réel de test.

**Tester en local** : Vite seul n'exécute pas `/api`.
- `npm run test:api` : tests de la fonction (Resend et Redis simulés, aucun e-mail réel).
- `npm run dev:api` puis `npm run dev` : le site tourne avec l'API réelle du dépôt, Resend simulé (`MOCK_RESEND=ok|error|network`), le proxy Vite relayant `/api` vers le port 3001. Le message n'est jamais journalisé.
- Test avec vrais services : `npx vercel dev` (Vercel CLI, projet lié, variables dans `.env.local`).

### À ajouter quand les informations seront disponibles

- Lien vers un CV (`public/cv.pdf`) : dans le Hero et le pied de page.
- Mentions légales : la page `mentions-legales.html` existe (lien dans le pied de page) ; voir « Vérifications juridiques avant publication » ci-dessous.

## Vérifications juridiques avant publication

La page `mentions-legales.html` est une rédaction factuelle et prudente. **Elle n'est pas une validation juridique et ne doit pas être considérée comme conforme** tant que les points suivants ne sont pas résolus (ils ne le sont pas à ce jour) :

1. **Qualification du portfolio** (professionnel ou non professionnel) : la disponibilité pour des missions freelance peut influer sur la qualification ; aucune source consultée ne tranche. Les obligations d'identification de l'éditeur en dépendent.
2. **Adresse de domiciliation** : déterminer si une adresse (ou une adresse de domiciliation) doit être publiée. L'adresse personnelle n'est pas publiée et ne doit pas l'être sans décision explicite.
3. **Téléphone de l'hébergeur** : Vercel Inc. (nom et adresse repris de sa politique de confidentialité, en vigueur au 1er juin 2026) ne publie pas de numéro de téléphone sur les pages consultées. À confirmer si son affichage est juridiquement requis.

### Décision prise : conservation des e-mails

La durée de conservation des e-mails reçus via le contact du portfolio est **définie : 12 mois maximum à compter du dernier échange**, puis suppression (sauf conservation plus longue nécessaire pour respecter une obligation légale, gérer une relation contractuelle ou défendre des droits en justice). Il s'agit d'un choix de gestion, et non d'une durée imposée par le RGPD. Elle est indiquée dans la section Confidentialité de la page ; elle ne concerne ni les journaux techniques de l'hébergeur, ni d'autres traitements.

**À faire :** appliquer réellement cette politique dans la messagerie (suppression ou archivage des échanges de plus de 12 mois après le dernier message), par exemple par un rappel périodique.

Avant publication : faire valider la page par un professionnel du droit si nécessaire, mettre à jour la date « Dernière mise à jour » de la page.
