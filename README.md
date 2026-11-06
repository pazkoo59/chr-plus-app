# CHR+

Appli Android perso pour suivre et piloter la Toyota C-HR+ à travers Home Assistant.

- **Voiture** : batterie, autonomie, ouvrants (vue de dessus), verrouillage, santé, position, klaxon, warnings.
- **Préchauffage** : clim en direct (lancer / arrêter, température, dégivrage), sièges et volant chauffants,
  planificateur de départ (heure, jours, avance, température, seuil de froid, dégivrage).
- **Recharge** : état, temps restant, charge programmée, tarif en cours, coûts, batterie sur 7 jours.
- **Trajets** : km jour / semaine / mois / année, score de conduite, km par jour sur 30 jours.

## Installer

1. Sur le téléphone, ouvre la page **Releases** du dépôt → `latest` → télécharge `CHR-Plus.apk`.
2. Autorise l'installation depuis le navigateur si Android le demande, puis installe.
3. Au premier lancement : colle l'adresse Nabu Casa et un **jeton d'accès longue durée** Home Assistant.

Chaque modification poussée sur `main` recompile l'APK (onglet **Actions**) et remplace la release `latest`.
La clé de signature est fixe (`app/chrplus.jks`), donc les mises à jour s'installent par-dessus : **garde ce dépôt privé**.

## Fonctionnement

Coque Android minimale (WebView) + appli HTML/JS dans `app/src/main/assets/`, qui parle directement à
l'API WebSocket de Home Assistant. Elle s'appuie sur les entités de l'intégration Toyota et sur les aides
créées pour le tableau de bord CHR+ (`input_number.chr_*`, `schedule.chr_jours_de_depart`,
`script.chr_lancer_prechauffage`, `automation.pre_chauffage_c_hr`…).

Le planificateur tourne **dans Home Assistant** : l'appli ne fait que changer les réglages, le préchauffage
se déclenche même si le téléphone est éteint.
