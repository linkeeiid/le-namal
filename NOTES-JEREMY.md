# Le Namal — notes de build

Restaurant casher · Lyon 6e (2 rue Baraban) · Ethan & Lily · ouvert depuis 2 ans.
Site repris du design Claude **"Le Namal - Gris"** et porté en HTML/CSS/JS vanille
(comme Blade Society), pour pouvoir l'héberger 100% gratuit sur GitHub Pages.

## Fichiers
- `index.html` — page d'accueil (hero, histoire, cuisine, galerie, horaires, services,
  réservation, contact + carte, certification casher, footer, Espace Ethan).
- `menu.html` — la carte (entrées / plats / desserts), note casher, événements privés.
- `app.js` — toute la logique de réservation + les effets (barre de progression,
  retour-en-haut, apparitions au scroll, parallaxe, compteurs).
- `img/` — déposer les vraies photos ici (voir `img/LISEZ-MOI.txt`).

## Ce qui marche déjà (testé en local)
- Design fidèle au modèle, responsive (menu burger sur mobile).
- **Réservation intelligente** : ne propose que les services réellement ouverts ce
  jour-là (Lun–Jeu midi+soir · Ven midi · Sam fermé · Dim soir) et génère les
  créneaux par tranches de 30 min. Validation nom/tél FR/email/date/couverts.
  Écran de confirmation avec récapitulatif + n° de référence.
- **Espace Ethan** (lien discret en bas de page) : code `namal69`, liste les
  réservations reçues, permet de les supprimer.

## Logo
Ton **emblème d'origine** (cercle pinceau + "Le Namal / RESTAURANT") a été **extrait
de ton affiche `img/logo.jpg`** : on a détouré le cercle central et rendu le fond gris
transparent, en deux versions :
- `img/logo-ink.png` — emblème foncé (barre du haut, fond clair)
- `img/logo-light.png` — emblème clair (pieds de page, fond sombre)
Ce sont les vrais logos affichés sur le site. Le **hero** garde le grand "Le Namal"
(vectoriel lisse) + "RESTAURANT" en texte net.
- ⚠️ Ne supprime pas `img/logo.jpg` (c'est la source). Si tu obtiens un jour un logo
  **PNG fond transparent** de meilleure qualité, remplace `logo-ink.png` /
  `logo-light.png` par les tiens, mêmes noms.

## ⚠️ Important — état actuel des réservations
Pour l'instant les réservations sont stockées **sur l'appareil** (localStorage),
exactement comme la maquette. Donc une réservation faite par un client n'arrive
PAS encore chez Ethan. C'est l'étape suivante.

## Prochaine étape : brancher comme Blade Society (tout gratuit)
Réutiliser la recette éprouvée :
1. **Firebase Realtime Database** (REST) — stocker les réservations en ligne pour
   qu'Ethan les voie depuis son téléphone (données minimales en public ; tél/email
   uniquement dans la notif).
2. **Cloudflare Worker** — point d'entrée sécurisé qui :
   - envoie un **email** au resto + **accusé de réception** au client via **Brevo**
     (300/jour gratuit) → fonctions `notifyRestaurant` / `notifyClient` dans `app.js`.
   - envoie une **notification téléphone** à Ethan (Web Push PWA, ou Telegram) →
     fonction `notifyWebhook`.
3. **PWA** (manifest + service worker) pour l'install sur le tel d'Ethan + push.
4. Plus tard : domaine (ex. lenamal-lyon.fr ~10€/an), mentions légales/RGPD,
   anti-spam L1, Google Business Profile.

Les 3 fonctions `notify*` dans `app.js` sont déjà en place (placeholders) : il
suffira d'y coller les appels `fetch` vers le Worker.

## Tester en local
Ouvre simplement `index.html` dans le navigateur (double-clic). Tout fonctionne
en local, sauf la carte OpenStreetMap qui a besoin d'internet.
