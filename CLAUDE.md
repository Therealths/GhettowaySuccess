# Ghettoway 2 Success — Companion (guide pour reprendre le projet)

Application web compagnon d'un **jeu de plateau** : chaque joueur a son téléphone, scanne les QR codes des cases du plateau, gère son Caïd (argent, drogue, cœurs, équipement, Sac), combat les autres et suit la patrouille de police. Le plateau physique reste la référence pour les déplacements ; l'appli fait les comptes, les tirages et les écrans.

L'utilisateur est **francophone** : répondre en français, textes de l'appli en français (apostrophes typographiques ’, guillemets « »).

---

## 1. Où tourne quoi

| | |
|---|---|
| Dépôt | `Therealths/GhettowaySuccess` (GitHub), branche `main` |
| Code de dev | `/home/thomas/Desktop/Claude/GhettowaySuccess`, l'appli est dans `Ghettoway2Success/` |
| Production | `~/ghettoway-prod` (clone du dépôt), service systemd **utilisateur** `ghettoway`, port 8795, `HOST=127.0.0.1` |
| Données de prod | `~/ghettoway-data` (`parties.json`, `historique.json`), via `GAME_DATA_DIR` |
| URL publique | https://thomscode.tail3e6d13.ts.net:10000 (Tailscale Funnel) |
| Ancien hébergeur | Render ne fait plus que rediriger (`process.env.RENDER` dans `server.js`) |

**Mise en ligne après un push :**
```
cd ~/ghettoway-prod && git pull && systemctl --user restart ghettoway
```
(`npm ci --omit=dev` dans `Ghettoway2Success/` seulement si les dépendances changent), puis vérifier `curl -s -o /dev/null -w "%{http_code}" https://thomscode.tail3e6d13.ts.net:10000/` et un `grep` du nouveau code dans le JS servi.

`APP_VERSION` change à chaque redémarrage du serveur : les clients ouverts sur une ancienne page se rechargent.

## 2. Règles de travail avec l'utilisateur

- **Commit / push / mise en ligne directement** après les tests, sans demander (accord du 2026-11-12). Message de commit en français, avec le pied :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Pour un **changement visuel nouveau**, montrer une maquette ou une capture avant (l'utilisateur suit souvent à distance, via Remote Control : lui envoyer des images ou des **MP4**. Les GIF de plusieurs Mo n'arrivent pas).
- Fichiers à partager avec l'utilisateur : `/home/thomas/Desktop/Claude/Ghettoway-partage/`.
- `server.js` et `package.json` sont en **fins de ligne CRLF** : les garder (éditer en Python avec `newline=''` et des `\r\n`).
- Le **service worker** (`public/sw.js`) sert les images en cache d'abord : une image modifiée doit **changer de nom de fichier** (ex. `fouille-balle-or.webp`), sinon les téléphones gardent l'ancienne.
- **PC fragile** (disque lent, RAM limitée) : un seul Chrome sans écran à la fois, lancé avec `nice -n 19` et `--renderer-process-limit=1`, avec un dossier de profil jetable supprimé ensuite. Arrêter le serveur de test après usage. Ne jamais tuer un processus qu'on n'a pas lancé (le serveur de prod tourne aussi en `node server.js`, vérifier le `PORT` dans `/proc/<pid>/environ`). Ne pas balayer `/tmp` (tmpfs en RAM). Le PC redémarre chaque nuit vers 4 h : le dossier scratchpad est alors vidé.
- Raccourcis de test du Scanner : **toujours cachés** aux joueurs (voir § 7), jamais de bouton visible.

## 3. Architecture

Node + Express + socket.io, client en **JavaScript sans framework** (Tailwind par CDN, icônes Phosphor `ph-bold ph-…`, polices Anton / Permanent Marker / Plus Jakarta Sans). Une seule page `public/index.html` avec tous les écrans ; chaque écran est un `div` `absolute inset-0` affiché/caché par classes `hidden` / `show`.

### Fichiers clients (`public/js/`, chargés dans cet ordre)
| Fichier | Rôle |
|---|---|
| `ui.js` | fenêtres de message (`showAppAlert`, `showAppConfirm`, file `msgQueue`/`msgIdle`), navigation `navTo`, `buzz()` (vibration), blocage copier-coller, PWA |
| `state.js` | `CAID_ROSTER`, `localPlayer`, `currentSession`, `combatModifiers`, effets radio (`isRadioEffectActive`, `getRadioEffectValue`) |
| `shops.js` | catalogues (`ARMORY_CATALOG`, `NIGHTCLUB_CATALOG`, `SPORTCLUB_CATALOG`, `DEALER_CATALOG`, surchargés par `catalog.json`), boutiques, Grossiste, paiement, **moteur des piles de cartes** (`placeDeckCard`, `applyDeckStackPositions`, `bindDeckSwipeAndDrag`) |
| `player.js` | stats (`getTotalAtk/Def/Pm`), `refreshHud` (+ `sync_player`), contrôle de police, `useItem`, équiper/vendre/jeter, coffre du QG |
| `combat.js` | écran de combat (choix de cible, duel, riposte, victoire/défaite, pillage) |
| `alliance.js`, `lootgroup.js` | alliances, pactes, partage du butin |
| `powers.js` | capacités spéciales des Caïds, Canette et Pied de biche (même écran), écran « TOUCHÉ ! » de la victime |
| `items.js` | table des Fouilles, découverte, écran **carte jouée**, ticket à gratter, pile d'objets du combat, Talkie, Passeport, préchargement des images |
| `sac.js` | écran **Sac** et bouton Sac de l'écran principal |
| `qr.js` | scanner (html5-qrcode), actions des cases (`processQrPayload`), raccourcis de test |
| `game.js` | création de partie, manches, rente du QG, fin de tour, **dé de patrouille** |
| `socket.js` | connexion et réception de tous les événements serveur |
| `testmode.js` | partie de test à 3 Caïds pilotés depuis un seul téléphone |

### Serveur (`server.js`)
- `rooms` en mémoire, sauvegardées dans `parties.json` (`saveRooms`), rechargées au démarrage.
- L'état d'un joueur est **envoyé par son téléphone** (`sync_player`, appelé par `refreshHud`) et gardé dans `room.players[]`. À la reconnexion, le serveur renvoie cet état et la **boîte aux lettres** (`mailbox`) des événements manqués, avec `late: true`.
- `sendToPlayer(p, event, data)` : envoie au joueur s'il est connecté, sinon met en boîte aux lettres.
- Effets **résolus par le serveur** (pour marcher même si la victime est hors ligne) : Siphon (cœur), **Pied de biche** (`crowbar_opened` → `crowbar_take`, `room.pendingCrowbar`), **Faire les poches** de Jamel (`steal_result`), **Talkie** (`rig_patrol` / `take_patrol_rig`, `room.patrolRig`), chien errant (`claim_stray_dog`), combats et pillage. Côté victime, quand `late` est vrai, ne **pas** retirer une seconde fois ce que le serveur a déjà retiré.
- Victoire : `pocketCash + safeCash >= 100 000 €` (`WIN_CASH`, `checkVictory`).
- Partie de test permanente `TEST` (3 joueurs `tok_test_1/2/3` : Burger Queen, Jamel Pépouze, J-Lo Gramme), remise à zéro par `reset_test_room`.

## 4. Règles du jeu dans l'appli

### Caïds (`CAID_ROSTER`)
| Caïd | Bonus | Malus | Capacité (1 fois par manche) |
|---|---|---|---|
| Burger Queen | 1 Kebab au départ | 0 PM en manche 1 | Boule de Graisse : rouler jusqu'à 5 cases |
| Joint Dujardin | 7 000 € au départ | 0 kg | Tour de Passe-Passe : échange de place (5 cases) |
| Nelson Sativa | 7 kg | 0 € | La Grosse Sieste : +1 cœur |
| Mary J Blunt | 1re Prostituée Niv. 1 gratuite | 1 seul cœur | Danse Lascive : −3 ATK à un rival (manche) |
| J-Lo Gramme | départ sur l'Église | 5 premiers kg au Grossiste au double | Prière : 50 % d'annuler un contrôle ou une agression (proposée d'office) |
| Tonteushi Kitano | mains nues = 3 ATK | 1er achat d'arme au double | Shuriken : −3 DÉF à un rival (manche) |
| Jamel Pépouze | 1 objet de Fouilles au hasard | départ devant le Commissariat | Vol à la Tire : vole 1 objet (le dernier du Sac) |
| Weed-Nesday | Poing Américain | 2 cœurs sur 3 | Siphon Vital : vole 1 cœur |

### Ressources et tour
- 3 cœurs au plus ; à 0, hôpital (intouchable jusqu'au début de son prochain tour).
- **PM** : 8 + bonus du véhicule (+ Vieilles baskets), radio comprise. Chaque action (attaque, Yencli, braquage, achat, objet ramassé) **décompte 2 PM** : c'est un aide-mémoire, rien n'est bloqué.
- Argent **sur soi** (`pocketCash`, `drugs`) et **au coffre du QG** (`safeCash`, `safeDrugs`) ; le coffre ne s'ouvre qu'en flashant le QR du QG.
- **Prostituées** : achetées au Nightclub, « en transit » (une à la fois) jusqu'au dépôt au QG, puis **rente** versée au coffre au début de chaque manche (`startRoundPhase1`).
- **Lascars** (Sportclub, 3 au plus) : +ATK et +DÉF.
- **Contrôle de police** : 30 % rien, 35 % drogue, 35 % armes ; saisie immédiate, +1 arrestation, fin de tour forcée. Le Passeport est proposé avant (écran plein page), puis la Prière de J-Lo.
- **Fin de tour** : le joueur lance le **dé de patrouille** (1 à 6 + bonus radio, direction au hasard), sauf « Grève au Commissariat ».
- **Combat** : attaque contre défense ; le perdant perd 1 cœur, le gagnant choisit un butin (cash, drogue ou prostituée en transit). Phase 2 de riposte possible. Alliances : attaques et braquages coordonnés, pactes de non-agression.

### Flash radio (`public/radio_events.json`, 30 événements, un tiré par manche par `drawRadio` dans `server.js`)
Chaque événement : `effectType` / `effectVal` (lus par `isRadioEffectActive` / `getRadioEffectValue`), champ libre éventuel (`getRadioField`), `message` de l'animateur et `rule` (grand chiffre, ton bonus/malus/plateau, lignes avant → après) pour la page Flash Radio.
- Descente de police (patrouille +2), Pénurie (Yencli +1 500 €), Canicule (véhicules à moteur −2 PM), Guerre des gangs (−30 % armes), Brouillard (Lac infranchissable), Grève au commissariat (patrouille immobile), Saisie aux douanes (Grossiste 1 500 €/kg), Soirée VIP (rente ×2), Tournoi au Sportclub (Lascars +1 ATK), Panne de fourgon (braquages +2 000 €), Couvre-feu (−2 PM à pied), Cargaison tombée du camion (−50 % protections).
- Krach du shit (`YENCLI_CASH_MULT` 0,5) et Festival en ville (`YENCLI_CASH_MULT` 2 + `policeClean: 0.15` : au contrôle, « rien » passe de 30 % à 15 %, le reste partagé drogue/armes).
- Soldes à l'Armurerie (`ARMORY_PRICE_MULT` 0,7, armes et protections), Soldes chez le Concessionnaire (`VEHICLE_PRICE_MULT` 0,7, `getDealerItemEffectivePrice`).
- Une balance dans le quartier (`INFORMANT`) : **vote sur la page Flash Radio**. `renderRadioCard` remplace les lignes de la règle par les rivaux à désigner (`informantRadioVote` / `renderInformantVote` dans `game.js`) ; le bouton du bas devient « Choisis un rival » (grisé) puis « Balancer X », puis « Passer à l'action » une fois le vote envoyé (« Vote envoyé · 1 / 3 votes »). Un joueur qui revient en pleine manche sans avoir voté est renvoyé sur la page radio (`informantMaybeVote`). Serveur : `informant_vote` / `informant_status` / `informant_vote_progress`, `room.informantVote`. Dépouillement quand tous les Caïds présents ont voté, ou à la fin du tour en cours s'il y a au moins un vote (`resolveInformantVote`) : le plus de votes, égalité tirée au sort, `informant_result` envoyé à tous (boîte aux lettres comprise). Tout le monde voit l'écran du résultat (`informantResultScreen`, tampon « BALANCÉ ») ; le Caïd désigné appuie sur « Subir le contrôle » et le contrôle a lieu **tout de suite**, même hors de son tour (`triggerPoliceInspection(true)` : sans confirmation, fin de tour forcée seulement si c'est son tour). Passeport et Prière restent proposés. Tests du serveur : `test_set_radio` (partie TEST seulement).
- Balances ciblées (`INFORMANT` + `policeTarget`) : Balance chez les dealers (`drugs`), Balance sur un trafic d'armes (`weapons`), Balance chez les macs (`prostitute`). Même vote ; le serveur renvoie `policeTarget` dans `informant_result` et le téléphone lance `triggerPoliceInspection(true, focus)` : contrôle **50 % rien / 50 % trouvé** sur ce seul objet (`POLICE_FOCUS`). La carte « Escort » (`PROSTITUTE_FOUND`) saisit la prostituée en transit (`localPlayer.prostituteInTransit = null`). `showPoliceScreen` n'affiche que les cartes possibles avec leurs vraies chances (`odds`, aussi pour le Festival) ; hors de son tour, la ligne « Ton tour » disparaît.
- Trop de criminalité (`EXTRA_PATROL_CAR`, `once: true`) : `room.policeCars = 2` **jusqu'à la fin de la partie**, l'événement sort de la pioche (`room.usedOnceRadio`). `policeCars` est envoyé avec `game_started`, `new_round_started`, `reconnect_success` → `currentSession.policeCars`. Les deux voitures avancent **du même lancer** (même nombre de cases, même sens) : l'écran de patrouille passe en `two-cars` (titre au pluriel, pastille ×2). La puce de durée de la page radio affiche « Toute la partie » pour un événement `once`.
- Nuit sans lune (`ATTACKER_ATK_BONUS` 2) : `nightAtkBonus()` ajouté à la stat envoyée et affichée par chaque attaquant (riposte comprise).
- Hôpital débordé (`NO_HEAL`) : Kebab refusé au Sac et « Hôpital débordé » dans la pile de combat ; la carte reste.
- Règlement de comptes (`COMBAT_WIN_CASH` 2000) : le serveur ajoute le bonus à chaque vainqueur et l'envoie (`winBonus`) ; le téléphone l'ajoute s'il n'est pas `late` et l'affiche sur l'écran VICTOIRE.
- Grève des transports (`BASKETS_PM_SET` 5) : métro fermé (règle du plateau seulement) et Vieilles baskets +5 PM.
- Flics en planque (`PROSTITUTE_REV_MULT` 0) : pas de rente ; la Seringue de botox n'est pas consommée.
- Chutes de neige exceptionnelles (`SNOW`) : `getTotalPm` ignore le véhicule (tout le monde à pied, 8 PM) et la patrouille est bloquée comme pendant la grève (écran « BLOQUÉE PAR LA NEIGE »).
- 3 manches calmes (`NONE`, ton `calme` bleu ciel) : Grand soleil sur la cité, Dimanche tranquille, Ciel bleu sur le périph. Rien ne change.

### Objets de Fouille (`FOUILLE_TABLE` dans `items.js`, même chance pour chacun)
| Objet | `eff` | Effet | Utilisation |
|---|---|---|---|
| Trognon de pomme, Arêtes de poisson, Rat crevé | `none` | rien | — |
| Vieille canette | `def_malus_round` | −1 DÉF à un rival (manche) | Sac (écran capacité) ou combat |
| Kebab | `heal` | +1 cœur | Sac ou combat ; un vieux Kebab sans `eff` est reconnu à son nom (`isHealItem`) |
| Couvercle de poubelle | `null_enemy_weapon` | arme adverse = 0 (1 combat) | Sac ou combat |
| Pot de Protéine | `double_muscles_atk` | Lascars ×2 jusqu'à la fin de la manche | Sac ou combat ; bloqué « Déjà actif » |
| Balle perforante | `double_weapon_atk` | bonus d'arme à feu ×2 (1 combat) | arme à feu requise, en attaque |
| Passeport diplomatique | `cancel_police` | annule un contrôle | **automatique** au contrôle |
| Sifflet | `stray_dog` | Chien errant +2 ATK / +2 DÉF jusqu'à ce qu'un autre le siffle | Sac ou combat |
| Liasse de billets / Sachet de beuh | `cash` / `drug` | +2 000 € / +2 kg | ramassés directement |
| Vieilles baskets | `pm_turn` | +3 PM ce tour | Sac |
| Manteau de fourrure | `free_prostitute` | Prostituée Niv. 1 gratuite | **automatique** au Nightclub |
| 4 Bons de réduction | `voucher` | −50 % sur le prochain achat de la boutique | Sac (« Activer ») |
| Seringue de botox | `botox` | prochaine rente des prostituées ×2 (une fois) | **automatique** au début de manche, s'il y a des prostituées au QG |
| Ticket à gratter | `scratch` | 1 chance sur 3 de gagner 5 000 € | Sac (« Gratter ») |
| Pied de biche | `crowbar` | coffre du QG d'un rival : jusqu'à **5 parts** (1 000 € ou 1 kg chacune) | Sac ; demande d'abord « es-tu devant son QG ? » |
| Talkie-walkie de flic | `patrol_reroll` | choisir en secret le dé et la direction de la **prochaine** patrouille (de n'importe quel joueur) | Sac |
| Lunettes de soleil | `double_fouille` | à la prochaine Fouille, 2 objets différents, on en garde un | **automatique** |

Objets jouables en combat : `isCombatItem` (durée `combat`, Kebab, Sifflet, Canette). Les autres sont visibles dans la pile mais grisés « Pas en combat ».

## 5. Écrans et animations (détails à respecter)

**Piège important :** quand un message est ouvert, `body.msg-open` met en pause **toutes** les animations sauf la liste d'exclusion dans `style.css` (`.msg-screen`, `.played-screen`, `.sac-screen`…). Un nouvel écran animé qui peut s'ouvrir pendant un message doit y être ajouté, sinon il reste figé.

- **Moteur des piles de cartes** (`shops.js`) : `placeDeckCard(el, d)` place une carte selon son écart `d` (fractionnaire) à la carte du dessus, par interpolation entre 3 positions (`DECK_STOPS` : devant ; ±1 juste derrière, penchée, opacité 0,52 ; ±2 cachée). `applyDeckStackPositions(prefix, total, index)` cale la pile (transition CSS 0,55 s) et pose la classe `deck-front` (les boutons sous les autres cartes sont masqués). `bindDeckSwipeAndDrag(id, onStep)` : les cartes suivent le doigt, résistance aux bouts, élan au lâcher (vitesse × 160 ms), `onStep(±1)` appelé une fois par carte passée ; un glissé n'est pas un clic. Utilisé par les 4 boutiques, le Sac et la pile du combat (ids des cartes `préfixe_i`).
- **Fouille** (`openFouille`, `revealFindScreen`) : au moins **2 s** de fouille, la ruelle tremble (`findShake`), des détritus emoji et de la poussière jaillissent de la poubelle (`spawnFindParticles`, origine 42 % / 55 %), puis la carte apparaît avec des rayons. Lunettes : deux cartes côte à côte (`openFouilleChoice`), la carte choisie s'affiche aussitôt (`findInstant`).
- **Carte jouée** (`showCardPlayed(it, rows, title, opts)` dans `items.js`, écran `#playedScreen`) : la carte arrive et grandit, un **tampon rond vert coché** (en haut à droite) s'écrase à 0,7 s avec flash, petite secousse et vibration, puis le titre et les lignes d'effet (valeur qui pulse), puis « Continuer ». Options : `kicker`, `stamp` (icône, tampon orange), `face` (HTML de la carte, ex. équipement), `action` (bouton en plus, ex. « Équiper maintenant »), `flyToSac` (la carte file vers le bouton Sac), `autoClose` (ms). Avec **plusieurs cartes** (combat) : éventail, une carte toutes les **1,2 s**, la suivante n'arrive qu'après le tampon de la précédente (`--lag`). Utilisé pour : objets du Sac, combat, achats et recrutements, carte dérobée, Passeport, Manteau, Botox, Talkie.
- **Ticket à gratter** : la carte du ticket se fait tamponner (`autoClose` 1,5 s), puis le ticket « Le Casse du Coin » (`ticket-gratter.webp`, image redressée à plat) arrive du bord droit en tournant (`ticketIn`). Couche argentée sur canvas (pinceau 24 px) ; à **60 %** gratté, tout se découvre (3 sacs de billets ou symboles mélangés). Le résultat est tiré avant.
- **Patrouille avec Talkie** : le dé roule, bulle BD « J'ai reçu un message au talkie ! » à 1,0 s, carte tamponnée « JOUÉE » à 2,3 s (choc + flash + secousse à +0,3 s), le dé ne tombe qu'à 3,7 s sur le résultat commandé.
- **Pied de biche** : confirmation « devant son QG ? », puis le **coffre-fort ouvert** (`qg-coffre.webp`) avec son contenu, curseur Argent ⇄ Drogue, « Prendre », résultat sur le même écran. La victime voit « TOUCHÉ ! … −X ».
- **Faire les poches (Jamel)** : « Son Sac était vide — RATÉ » sur l'écran du pouvoir, sinon la **carte dérobée en grand** (bandeau « Carte dérobée », tampon main).
- **Sac** (`sac.js`) : monte comme un panneau **sous le bandeau et les stats** (qui restent visibles, `top` calculé à l'ouverture). Argent sur soi / au QG, cases Équipé (toucher pour ranger), filtres Tout / Objets / Équipement, pile de cartes **sans boutons**, dont la taille s'adapte à la hauteur libre (`fitSacCards`). Toucher la carte du dessus → **zoom** en grand avec ses boutons (Utiliser / Équiper / Vendre / Jeter, « Retour au sac »), taille adaptée (`openSacZoom`).
- **Passeport au contrôle** : écran plein page « LES FLICS DÉBARQUENT ! » avec la carte, « Le garder » / « Sortir le passeport ».
- **Scanner** : le cadre à flasher se place et se dimensionne dans la place libre (`placeScanFrame`, variables CSS `--sw` / `--sy`).
- **Boutons de fermeture** (Fermer, Quitter, Retour, Annuler d'un écran, croix) : classe `btn-close`, rouge sombre discret. Les « Annuler » des fenêtres Oui/Non gardent leur style.
- Vibrations (`buzz`) : « TOUCHÉ ! », chaque tampon, vol réussi. Sans effet sur iPhone (Safari ne le permet pas).
- Préchargement de toutes les cartes 2,5 s après l'ouverture (`preloadCardImages`).
- Sélection de texte, copier, couper, coller et menu du toucher long bloqués (sauf la saisie dans les champs).

## 6. Cartes des objets (images)

Chaque objet a une carte au cadre « Fouille » : `public/fouille-<id>.webp` (768×1226, qualité 82) et `public/fouille-<id>-vignette.webp` (recadrage `(62,250,706,710)`, qualité 80). Le lien nom → image est `ITEM_ART` dans `items.js`.

Outils (hors dépôt) dans `~/.cache/ghettoway-tools/` :
- `bg/cut.mjs` : détourage (`@imgly/background-removal-node`, ~800 Mo de RAM, **une image à la fois**) : `nice -n 19 node cut.mjs <entrée> <sortie>`. Recadrer d'abord la source sur l'objet. Durcir l'alpha et boucher les trous avec PIL (pas de numpy). Il rate souvent les parties fines ou garde le sol : retracer un polygone à la main si besoin.
- `cartes/` : `card.html` (gabarit), `cards.json` (`id`, `img`, `t` titre, `e` effet, `q` réplique, `rot`, `sc`, `w` largeur, `ts` taille du titre), `render.cjs` → `card-<id>.png`. Lancer : `nice -n 19 node render.cjs <dossier contenant node_modules/puppeteer-core> <id>` (réinstaller `puppeteer-core` dans le scratchpad s'il a été vidé).

## 7. Tester

- `cd Ghettoway2Success && npm test` (22 tests du serveur, socket.io réel sur un port aléatoire).
- Serveur de test : `PORT=3100 GAME_DATA_DIR=<dossier jetable> nice -n 10 node server.js`.
- Dans le navigateur : `enterTestGame(1)` (J1 Burger Queen), `enterTestGame(2)` (J2 Jamel)… Pour **deux joueurs en même temps**, ouvrir l'un sur `http://localhost:3100` et l'autre sur `http://127.0.0.1:3100` (stockages séparés).
- Raccourcis de test (faux QR : boutiques, objets, Fouille, Ticket…) : **5 appuis rapides** sur le titre « FLASH UN QR CODE » (ou l'étiquette « Scanner ») de la page Scanner ; le choix est retenu sur le téléphone (`g2s_test_mode`).
- Le navigateur intégré de l'app de bureau ralentit ou fige les animations quand il n'est pas affiché : pour juger une animation, enregistrer avec un Chrome sans écran (puppeteer-core), captures en boucle, puis `ffmpeg` en MP4.
- Vérifier sur au moins deux hauteurs d'écran (375×812 et 375×667) ; le téléphone de l'utilisateur fait environ 412×830.
