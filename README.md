# Listening Atlas — Spotify, en local

Application **100 % statique**, prête pour **GitHub Pages**. Aucun backend, aucune clé API, aucun outil de compilation, aucun appel externe : le site s'ouvre, tu importes ton archive `.zip` Spotify et les données sont analysées **dans ton navigateur**.

## Déployer en deux minutes

1. Crée un dépôt GitHub public, par exemple `listening-atlas`.
2. Décompresse **le contenu** du ZIP de ce projet **à la racine du dépôt**. Le fichier `index.html` doit être directement à la racine (pas dans un dossier supplémentaire).
3. Dans **Settings → Pages → Build and deployment**, sélectionne **Deploy from a branch**, puis **main** et **/(root)**.
4. Ouvre `https://TON-PSEUDO.github.io/listening-atlas/` dès que GitHub indique que le site est publié.
5. Importe l'archive ZIP de ton historique Spotify. La même application fonctionne également en ouvrant `index.html` depuis ton disque local.

Aucun `npm install`, aucune étape de build, aucun secret GitHub ni variable d'environnement ne sont nécessaires.

## Export Spotify à importer

Demande l'**Historique d'écoute étendu / Extended Streaming History** depuis les [paramètres de confidentialité Spotify](https://www.spotify.com/account/privacy/). Il arrive sous forme de ZIP avec plusieurs fichiers `Streaming_History_Audio_20xx.json`. L'export standard `StreamingHistory_*.json` est aussi reconnu, mais il fournit moins de métadonnées.

L'import :
- lit **uniquement les fichiers JSON audio/musicaux pertinents** ;
- ignore les vidéos, podcasts et livres audio ;
- extrait artiste, titre, album (si disponible), durée, date, heure, URI de morceau (si disponible) ;
- ne conserve **pas** les adresses IP, pays, appareils ni autres champs privés ;
- n'effectue **aucune requête réseau** : le traitement se fait dans la mémoire de ton navigateur ;
- ne sauvegarde pas les fichiers importés entre les visites (il faut réimporter après un rechargement de page).

L'historique étendu peut contenir beaucoup de données sensibles. **Ne l'ajoute pas au dépôt GitHub**. Importe-le seulement via l'interface du site ; il restera local.

## Fonctionnalités

- Vue d'ensemble : minutes/heures écoutées, événements de lecture d'au moins 30 secondes, artistes et titres distincts.
- Filtrage par année, courbe mensuelle, classement artistes/morceaux (temps ou lectures ≥ 30 secondes).
- Habitudes par heure, heatmap jours × heures (fuseau `Europe/Paris`).
- Focus sur un artiste, classements annuels et recherche de titres.
- **Course de courbes animée** : les artistes du top 10 changent au fil des semaines, en mode « Par semaine » ou « Cumul depuis le début ». Caméra glissante sur ~6 mois, top 10 dynamique, focus artiste, lecture/pause, seek et vitesses 15/30/60/120 jours/seconde.
- Frise défilable de gauche à droite pour les **10 artistes les plus écoutés sur la totalité de l'historique**, avec **minutes par semaine**.
- Course chronologique **jour par jour** : Top 10, 20, 50 ou 100 artistes, avec classement vertical défilable. Vitesse 15, 30, 60 ou 120 jours/seconde (30 par défaut), pause, reprise et curseur temporel.
- Course de courbes hebdomadaire en mode **semaine** ou **cumul**, avec axe vertical interpolé en douceur et traits fins pour éviter les sauts de zoom.
- Export CSV des morceaux sur la période sélectionnée.

### Définitions de calcul

**Durée écoutée** : somme des `ms_played` (historique étendu) ou `msPlayed` (standard), y compris les sessions interrompues et les lectures inférieures à 30 secondes. Un événement de **lecture ≥ 30 s** correspond à un enregistrement Spotify dont la durée jouée est au moins 30 000 ms : ce n'est pas nécessairement une écoute complète du titre.

**Semaines** : du lundi au dimanche ; semaine calculée sur la date locale à Paris, y compris pour les années à cheval. Les semaines sans écoute sont représentées.

**Course de courbes** : chaque semaine (lundi-dimanche) est agrégée à partir des minutes réellement écoutées. En mode cumulatif, les durées s’ajoutent depuis la première semaine de l’archive. Les courbes et le classement interpolent les semaines voisines pour fluidifier le déplacement. Les classements sont recalculés à partir de tous les artistes, et non d’une liste figée.

**Top 10 animé** : durées cumulées depuis le premier jour de l'archive, recalculées à chaque date. Les jours sans écoute restent présents. Les valeurs affichées pendant les interpolations entre deux jours servent à fluidifier l'animation ; le total exact à chaque date entière est conservé.

**Morceaux** : identifiés par URI Spotify lorsque disponible ; sinon par artiste, nom et album. Des variantes différentes peuvent donc compter comme deux titres.

## Structure

```text
index.html          # Point d'entrée GitHub Pages
styles.css          # Design responsive, aucune police externe
app.js              # Parser ZIP, normalisation, calculs et graphiques
favicon.svg         # Icône locale
vendor/jszip.min.js # JSZip, compression ZIP intégrée
vendor/JSZIP-LICENSE.txt
README.md
.gitignore
```

## Confidentialité et limites

Toutes les statistiques proviennent **uniquement** de l'export importé. Pas d'API Spotify, pas d'enrichissement des genres ou des jaquettes, pas de statistiques sur des périodes absentes du fichier. Le navigateur peut consommer temporairement de la mémoire pour traiter l'archive ; une limite de sécurité de 850 Mo de JSON décompressé est appliquée.

L'application ne transmet ni ne journalise les données d'écoute. Si tu utilises un fork public, ne publie pas de ZIP Spotify, de fichiers JSON personnels ou d'exports CSV privés.

## Développement

HTML, CSS et JavaScript natifs ; JSZip v3.10.1 inclus en local sous double licence MIT/GPLv3. Il est possible de modifier le site en éditant directement ses fichiers, puis en rechargeant la page.
