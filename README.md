# CHR+

Appli Android **non officielle** pour suivre et piloter une Toyota électrique (C-HR+, bZ4X, Urban Cruiser…)
à travers **Home Assistant**. Sans lien avec Toyota.

| Onglet | Contenu |
|---|---|
| **Voiture** | photo de ta voiture, batterie, autonomie, ouvrants (vue de dessus), verrouillage (empreinte pour déverrouiller), carte de position, santé, entretien, klaxon, warnings, **alertes** |
| **Préchauffage** | clim (lancer / arrêter, température, dégivrage), sièges et volant chauffants, **planificateur de départ** (chauffe et dégivre s'il fait froid, rafraîchit s'il fait chaud) |
| **Recharge** | état, temps restant, charge programmée, tarif en cours, **coût des recharges** (heures pleines / creuses), consommation aux 100 km, historique, batterie sur 7 jours |
| **Trajets** | km jour / semaine / mois / année, score de conduite, km par jour sur 30 jours |

Et aussi : **widget** d'écran d'accueil (batterie, autonomie, bouton Préchauffer), **raccourcis** par appui long sur
l'icône (Préchauffer, Verrouiller, Actualiser), ouverture instantanée avec les dernières valeurs, thème clair / sombre
qui suit le téléphone.

Seules les cartes que ta voiture sait remplir sont affichées.

## Ce qu'il faut

1. **Home Assistant**, joignable depuis le téléphone (Nabu Casa ou ta propre adresse).
2. L'intégration **Toyota EU community** installée (Marketplace / HACS) et connectée à ton compte MyToyota.
3. Un **jeton d'accès longue durée** : dans Home Assistant, ton profil → Sécurité → Jetons d'accès longue durée.
   Pour installer le planificateur et le suivi des coûts, le jeton doit venir d'un compte **administrateur**.

## Installer

Télécharge `CHR-Plus.apk` depuis la page **Releases** (version `latest`) sur le téléphone, autorise l'installation,
puis colle l'adresse de Home Assistant et le jeton au premier lancement.

L'appli trouve la voiture toute seule (par les identifiants internes de l'intégration, quelle que soit la langue
de Home Assistant). Dans ⚙ Réglages : choix de la voiture s'il y en a plusieurs, du capteur de température
extérieure et, en option, d'un capteur de tarif (heures pleines / creuses).

### Planificateur et suivi des coûts

S'ils n'existent pas encore, l'appli propose de les **installer en un bouton**. Elle crée dans Home Assistant
des réglages (`input_*`, `schedule`) et deux automatisations, tous nommés **« CHRplus … »** :

- `CHRplus préchauffage` : les jours choisis, lance la clim X minutes avant l'heure de départ s'il fait plus froid
  que le seuil. Tout tourne dans Home Assistant, même téléphone éteint.
- `CHRplus suivi des coûts` : estime l'énergie et le prix de chaque recharge (% gagné × capacité, ~10 % de pertes),
  au tarif en cours au début de la charge (heures pleines / creuses si un capteur de tarif est choisi), et le total
  du mois. Règle la capacité de la batterie et les prix dans l'onglet Recharge.
- `CHRplus alertes` : voiture pas verrouillée à 22 h, ouvrant ouvert 10 min, recharge terminée, batterie sous 20 %,
  envoyées sur le téléphone choisi (appli Home Assistant Companion).

La carte utilise des fonds © OpenStreetMap / © CARTO.

Pour tout retirer : supprime ce qui commence par « CHRplus » dans Paramètres → Automatisations et Paramètres → Entrées.

## Le jeton et la vie privée

L'adresse et le jeton restent dans le téléphone. L'appli parle **uniquement** à ton Home Assistant
(API WebSocket + REST), aucun autre serveur.

## Compiler soi-même

Chaque modification poussée sur `main` est compilée par GitHub Actions et publiée dans la release `latest`.
La signature utilise une clé fournie par le secret **`KEYSTORE_B64`** (keystore encodé en base64, alias `chrplus`,
mot de passe dans le secret facultatif `SIGNING_PASSWORD`, par défaut `chrplus-app`).
Garde toujours la même clé : sinon les mises à jour ne s'installent plus par-dessus.

Structure : coque Android minimale (WebView, `MainActivity.java`) + l'appli en HTML/JS dans `app/src/main/assets/`.
