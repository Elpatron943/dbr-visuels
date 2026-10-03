# DBR — visuels marketing

Visuels publics de Daily Business Review (blog et LinkedIn), produits par Nora, l'agent studio, selon le système de design DBR (fond #0A0A0D, or #F5C542, Manrope).

- `blog/<slug>/` : couverture et infographies des articles (1536 × 1024).
- `carrousels/<slug>/` : carrousels LinkedIn (1080 × 1350, PNG + PDF).
- `exemples/` : prototypes de gabarits.

Rien de confidentiel ici : uniquement des visuels destinés à être publiés.

## Carrousels LinkedIn : rattachement automatique

Quand Nora dépose `carrousels/<slug>/typefully.json` :

```json
{ "social_set_id": 339361, "draft_id": 123, "pdf": "carrousel.pdf", "file_name": "Titre-du-carrousel.pdf", "alt_text": "…" }
```

l'action GitHub « Joindre les carrousels à Typefully » envoie le PDF à Typefully et le joint au brouillon, sans toucher au texte ni à la date. Le brouillon reste planifié et inerte : rien n'est publié sans validation. Un fichier `typefully-attached.json` est ajouté une fois le rattachement fait. Secret requis : `TYPEFULLY_API_KEY`.
