# AutoProfit — App mobile (Capacitor)

Ce dossier transforme l'app AutoProfit (React) en vraie app iOS grâce à
[Capacitor](https://capacitorjs.com), construite automatiquement dans le
cloud via [Codemagic](https://codemagic.io) — pas besoin d'un Mac compatible
en local.

## Comment ça marche

1. Ce dépôt GitHub contient le code web (React + Tailwind).
2. Codemagic surveille ce dépôt : à chaque mise à jour, il installe les
   dépendances, construit l'app, l'empaquette avec Capacitor, et compile une
   vraie app iOS — automatiquement, sur une machine Apple dans le cloud.
3. Le fichier `codemagic.yaml` définit exactement ces étapes.

## Mettre à jour l'app

Pour publier une nouvelle version :
1. Remplace `src/AutoProfit.jsx` par la dernière version du code.
2. Envoie ("commit") le changement sur GitHub.
3. Codemagic reconstruit automatiquement l'app.

## Prochaines étapes (une fois le compte Apple Developer créé)

- Ajouter la signature automatique (certificats + profils de provisionnement)
  dans les réglages Codemagic (section "iOS code signing").
- Ajouter une étape de publication automatique vers TestFlight/App Store dans
  `codemagic.yaml` (section `publishing > app_store_connect`).
