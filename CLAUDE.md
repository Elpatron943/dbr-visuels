# dbr-visuels

Visuels publics de Daily Business Review (DBR) : couvertures et infographies du blog, posts LinkedIn, carrousels LinkedIn, one-pager. Ils sont produits par Nora, l'agent studio, selon le système de design DBR. Dépôt public : rien de confidentiel, uniquement des visuels destinés à être publiés.

## Arborescence

- `blog/<slug>/` : couverture (`cover.png`) et infographies de l'article, 1536 x 1024, avec `spec.json`.
- `carrousels/<slug>/` : carrousel LinkedIn, 1080 x 1350. Pages `01-cover.png`, `02-quote.png`, `03-flow.png`... numérotées sur deux chiffres, plus `carrousel.pdf`, `typefully.json` et `typefully-attached.json`.
- `posts/<AAAA-MM-JJ>-<slug>/` : post LinkedIn, `visuel.png` carré 1080 x 1080, avec `spec.json`, `typefully.json` et `image-attached.json`. La date est celle de publication.
- `one-pager/dbr-en-une-page/` : PDF et deux visuels portrait 1080 x 1350.
- `exemples/` : prototypes de gabarits (MEDDIC), pas de publication.
- `scripts/` : scripts Node des actions GitHub. `.github/workflows/` : les deux actions.

Slugs en minuscules, sans accent, séparés par des tirets. Un `spec.json` décrit les visuels : `format`, `kicker`, `slides` (`name`, `layout` parmi cover, grid, table, `title`, `cells`, etc.). Les mots en `*étoiles*` dans un titre sont mis en valeur.

## Actions GitHub

Les deux actions se déclenchent sur push vers `main` (et à la main), utilisent l'environnement `Typefully` et la variable `TYPEFULLY_API_KEY` (repli : `TYPELUFFY`). Aucune valeur de secret n'est stockée dans le dépôt.

- « Joindre les carrousels à Typefully » (`attach-carousel.yml`, `scripts/attach-carousel.mjs`, Node 20) : sur `carrousels/**/typefully.json` (`social_set_id`, `draft_id`, `pdf`, `file_name`, `alt_text`). Envoie le PDF et le joint au premier post LinkedIn du brouillon, sans toucher au texte, à la date ni au statut (seuls `draft` et `planned` sont acceptés). Écrit `typefully-attached.json`.
- « Joindre les images des posts à Typefully » (`attach-post-image.yml`, `scripts/attach-post-image.mjs`, Node 22) : sur `posts/**/typefully.json` (`social_set_id`, `draft_id`, `image`, `file_name`, `alt_text`). Ne crée jamais de brouillon. Ignore le post s'il est publié, part dans moins de 20 minutes ou a déjà une image. Vérifie ensuite texte, date et statut. Écrit `image-attached.json`.
- Chaque dossier n'est traité qu'une fois grâce au fichier marqueur. Ne jamais supprimer ni éditer à la main un marqueur sans demande explicite. Le bot (`dbr-visuels-bot`) commit ces marqueurs sur `main`.
- Rien n'est publié sans validation du fondateur : les brouillons restent planifiés et inertes.
- Nom de fichier envoyé à Typefully : lettres, chiffres, `_ . ( ) -`, extension `.pdf` (carrousels) ou `.png`/`.jpg` (posts).

## Règles de style DBR

- Fond `#0A0A0D`, or `#F5C542`, police Manrope.
- Aucun tiret long ni demi-cadratin, aucune flèche, aucun emoji dans les visuels et les textes.
- Écrire « pipeline », jamais « pipe ».
- Textes en français, ton sobre, sans formulation qui trahit l'IA.

## Règles de travail

- Dépôt public : aucun secret, aucune donnée client, seulement des noms de variables.
- Pour ajouter un visuel : créer le dossier au bon format de nommage, ajouter `spec.json`, puis `typefully.json` en dernier (c'est lui qui déclenche l'action).
- Contrôles disponibles : `node --check scripts/*.mjs`. Il n'y a pas de tests ni de CI de validation.
