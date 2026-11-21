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
- Classement artistes Top 10/20/50/100, affiché intégralement dans la page.
- **Course des morceaux** : deux animations **indépendantes**. La courbe cumulative (Top 10 avec classement latéral) et la course quotidienne Top 10/20/50/100 ont chacune leurs commandes de lecture, leur vitesse et leur curseur de date. Une combobox commune choisit entre **minutes cumulées** et **nombre de lectures ≥ 30 secondes cumulé**. Chaque lecture est attribuée au titre Spotify (URI quand elle existe), sans requête externe.
- Top 10 cumulatif **jour par jour**, animé à 15, 30, 60 ou 120 jours/seconde (30 par défaut), avec pause, reprise et curseur temporel.
- Export CSV des morceaux sur la période sélectionnée.

### Définitions de calcul

**Durée écoutée** : somme des `ms_played` (historique étendu) ou `msPlayed` (standard), y compris les sessions interrompues et les lectures inférieures à 30 secondes. Un événement de **lecture ≥ 30 s** correspond à un enregistrement Spotify dont la durée jouée est au moins 30 000 ms : ce n'est pas nécessairement une écoute complète du titre.

**Semaines** : du lundi au dimanche ; semaine calculée sur la date locale à Paris, y compris pour les années à cheval. Les semaines sans écoute sont représentées.

**Course de courbes** : chaque semaine (lundi-dimanche) est agrégée à partir des minutes réellement écoutées. En mode cumulatif, les durées s’ajoutent depuis la première semaine de l’archive. Les courbes et le classement interpolent les semaines voisines pour fluidifier le déplacement. Les classements sont recalculés à partir de tous les artistes, et non d’une liste figée.

**Top 10 animé** : durées cumulées depuis le premier jour de l'archive, recalculées à chaque date. Les jours sans écoute restent présents. Les valeurs affichées pendant les interpolations entre deux jours servent à fluidifier l'animation ; le total exact à chaque date entière est conservé.

**Morceaux** : identifiés par URI Spotify lorsque disponible ; sinon par artiste, nom et album. Des variantes différentes peuvent donc compter comme deux titres. Pour la course des morceaux, le mode « Écoutes » compte une lecture uniquement si `ms_played >= 30000` (ou `msPlayed` dans le format standard). Le mode « Minutes » additionne toutes les durées jouées, même si le titre a été interrompu. Les deux animations conservent des dates indépendantes quand on change de métrique.

## Structure

```text
index.html          # Point d'entrée GitHub Pages
styles.css          # Design responsive, aucune police externe
app.js              # Parser ZIP, normalisation, calculs et graphiques
tracks.js           # Courbe et classement de morceaux indépendants ; minutes et écoutes
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


## Analyses avancées (sans API)

La dernière section, **Analyses avancées**, apporte sept catégories repliables : réécoutes et concentration, skips et écoutes courtes, top albums et course cumulative des albums, découvertes et fidélité, records et sessions, plateformes/modes d’écoute, indices de diversité et d’obsession. Les listes et les graphiques se filtrent par année et par minutes ou lectures ≥ 30 secondes. La course des albums utilise toute la chronologie, indépendamment de l’année filtrée.

Les métadonnées facultatives (`skipped`, `shuffle`, `offline`, `incognito_mode`, `platform`) sont disponibles surtout dans l’archive étendue. Les pourcentages ne comptent que les événements ayant le champ correspondant. La plateforme est réduite à sa famille (Android, iOS, Windows, macOS, Linux, navigateur, autre) : **jamais de modèle précis d’appareil, d’IP ni de pays enregistrés**. Le skip explicite et le simple fait de jouer moins de 30 secondes sont deux mesures différentes.

Les **sessions** sont seulement estimées en regroupant les lectures dont le démarrage estimé se situe au plus 30 minutes après la précédente. La diversité effective utilise l’inverse de la somme des carrés des parts d’artistes ; les autres scores personnalisés sont documentés dans l’interface et ne sont pas officiels Spotify. Les « découvertes » sont les premières apparitions dans l’archive, pas les premières écoutes de toute une vie.

Les albums sont connus seulement lorsque l’export renseigne l’album. Les genres, BPM, tonalités et données acoustiques ne sont pas présents et ne sont pas inventés.

## Double import : statistiques musicales et observatoire technique

Le site propose désormais **deux emplacements ZIP indépendants**, suivis d'un seul bouton « Lancer l'analyse » :

1. **Historique d'écoute** (`my_spotify_data.zip` avec `Streaming_History_Audio_*.json`, ou `StreamingHistory_*.json`) : débloque toute la partie musicale, les courses d'artistes et de morceaux, et les analyses avancées.
2. **Journaux techniques** (`Spotify Technical Log Information/*.json`) : débloque l'**Observatoire technique** en bas de page ; il fonctionne même lorsque l'historique d'écoute n'est pas disponible.

Si tu ne fournis qu'une archive, l'autre partie reste masquée. Avec les deux, toutes les sections sont disponibles. Le bouton de lancement empêche l'analyse automatique lors de la simple sélection d'un fichier. Un mauvais ZIP n'annule pas l'analyse de l'autre archive.

L'Observatoire technique propose :

- **Panorama** : catégories de journaux, types d'événements les plus fréquents, fréquence mensuelle, activité par heure UTC et sélection de période ;
- **Lecture** : événements RawCoreStream (minutes et nombre de lectures signalées), raisons de démarrage/arrêt, shuffle, contenus téléchargés, médias non lancés ;
- **Qualité audio** : distribution des débits des fichiers sélectionnés, évolution des préférences Wi-Fi/données mobiles, normalisation, égaliseur, fondu enchaîné et lecture sans blanc ;
- **Réseau et cache** : journaux Download/ProgressiveDownload, compteurs CDN/cache, protocoles, progression de la taille du cache et nombre de titres hors ligne enregistrés ;
- **Appareils** : systèmes d'exploitation, modèles et catégories d'appareils, versions Spotify, Connect, routes de sortie, évolution des réglages de volume ;
- **Incidents** : PlaybackError, Stutter, RequestFailure et autres types de diagnostics, fréquence et motifs répertoriés ;
- **Bibliothèque et social** : événements d'ajout en playlist, partages, interactions Spotify Jam et autres ;
- **Explorateur de journaux** : choix parmi tous les types d'événements reconnus, courbes mensuelles, dictionnaire des champs avec présence, et histogrammes/séries temporelles pour des propriétés dont les valeurs sont explicitement autorisées ;
- **Export CSV** : table agrégée des comptes par type de journal et par mois, sans données individuelles.

**Interprétation :** les journaux techniques sont de la télémétrie partielle, et ne remplacent jamais l'historique musical. `RawCoreStream` n'est pas une liste exhaustive des écoutes ; les rapports `Download` et `CacheReport` ne donnent pas un compteur officiel des données consommées et peuvent se chevaucher. Les types d'erreurs désignent des traces, pas forcément des incidents subis. Les paramètres enregistrés sont des valeurs de rapports et non des mesures continues. Certaines propriétés ne disposent d'aucune définition officielle dans l'archive : elles sont présentées telles qu'elles sont nommées, sans interprétation arbitraire.

**Confidentialité :** les fichiers bruts ne quittent jamais l'appareil. Le parser technique ne conserve que des agrégats et des informations autorisées, sans identifiants d'appareil, adresses IP, MAC, adresses mail, jetons, URL ni identifiants de comptes tiers. Le code source public **ne contient aucune archive personnelle**. Les ZIP restent nécessaires après chaque rechargement.

**Compatibilité :** fichier `index.html` à la racine de GitHub Pages ; JavaScript vanilla, aucune API Spotify, aucune installation npm ; JSZip déjà embarqué. `technical.js`, `technical.css` et `import-manager.js` sont obligatoires en plus des fichiers existants.


## Troisième import : données du compte, Wrapped et espace privé

L'import principal offre maintenant **trois emplacements ZIP indépendants**. L'archive **Spotify Account Data** peut être importée seule, ou avec l'historique d'écoute et les journaux techniques. Chaque module s'affiche uniquement lorsqu'il dispose de données valides. Le bouton « Lancer l’analyse » déclenche le traitement local des archives sélectionnées ; rien n'est envoyé sur un serveur.

La rubrique « Données du compte » apparaît **tout en bas de page**, après l'observatoire technique, et contient :

- **Playlists** : nombre de playlists et de morceaux, taille des playlists, événements d'historique par mois et types d'opérations, explorateur filtrable d'une playlist ; ces événements ne sont pas toujours des ajouts.
- **Bibliothèque** : morceaux, albums, artistes, podcasts, recherche et classement des artistes les plus sauvegardés. Si l'historique d'écoute est présent, comparaison des morceaux enregistrés et écoutés par URI Spotify, avec limites de correspondance clairement indiquées.
- **Wrapped 2025** : statistiques fournies directement par Spotify, dont durées, découvertes, BPM pondéré, genres et classements. Les identifiants de genres `spotify:concept:…` n'ont pas de libellé local dans le ZIP : ils sont indiqués comme non résolus, sans leur inventer de noms.
- **Sound Capsule** : bilans par date, courbes de minutes et de lectures, événements marquants par catégorie, listes de titres et d'artistes. Les bilans ne se substituent pas à un historique complet.
- **Écoutes de l'export de compte** : activités dénombrées sans addition aux statistiques musicales (car elles recouvrent partiellement le premier ZIP).
- **Recherche et Marquee** : statistiques globales anonymisées, nombre et évolution des recherches et catégories de segments.
- **Zone sensible censurée** : les recherches **textuelles**, informations du profil, inférences publicitaires et messages de l'archive du compte sont **absents du DOM** jusqu'à une action explicite « Révéler mes informations ». « Recensurer » vide le contenu affiché, et quitter l'onglet le masque automatiquement. Les identifiants techniques et publicitaires ne sont jamais révélés. Ne révèle pas cette zone devant une personne non autorisée. Ce masquage est une protection **visuelle et ergonomique**, pas du chiffrement.

L'application n'emploie toujours **aucune API tierce**, aucun stockage persistant et aucune requête pour les fichiers importés. Les scripts `account.js` et `account.css` sont nécessaires. Les ZIP personnels ne doivent **jamais** être ajoutés au dépôt GitHub public.