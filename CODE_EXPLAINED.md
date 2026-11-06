# Hard Steel War – code walkthrough

This document describes `index.html`, the single file that contains the whole game. It is 60,214 lines and about 1.8 MB. `CNAME` holds one line, `hsw.neplytegr.cz`, the custom domain for GitHub Pages hosting.

The game is a browser tank-battle game with a Czech UI and an English translation. Everything runs offline in one HTML file, apart from the optional online features. The file's footer says "OFFLINE EDICE · VŠE V TOMTO SOUBORU".

Line numbers below are approximate and refer to the current file.

---

## 1. Layout of the file

| Lines | Content |
|---|---|
| 1–94 | `<head>`, meta tags and one large `<style>` block with all CSS |
| 95–118 | Three.js license comment and a few leftover lines |
| 119–134 | `<body>`: the HTML skeleton of every screen |
| 135–60213 | One big `<script>` |
| ├ 136–54707 | **Three.js (r16x, MIT) embedded in full**, as `const THREE = (() => {...})()` |
| └ 54708–60212 | **The game's own code**, about 5,500 lines, split into 31 "modules" |

About 90 % of the file is the embedded Three.js 3D library (WebGL renderer, geometries, materials, lights, loaders, animation, audio and so on). It is vendor code and can be ignored when reading the game. The rest of this document covers the game code.

---

## 2. CSS (lines 1–94)

- It uses a dark military palette: olive green `#14251b`, sand `#e9d2a8`, brass `#baa369`.
- Layout is built with CSS grid and flexbox.
- Responsive breakpoints are `1500px`, `1100px`, `900px`, `800px`, `720px`, `600px` and `580px`. A `@media(pointer:coarse)` block shows on-screen controls for touch devices.
- Main components styled:
  - `.topbar` – top navigation and player profile.
  - `.hero` – 3D tank preview in the hangar.
  - `.tank-card` and `.map-card` – selection cards.
  - `.deploy-panel` – battle setup.
  - `.battle-top` and `.battle-bottom` – the in-battle HUD, with a minimap, module-damage panel and ammo and status indicators.
  - `.modal` – dialogs.
  - `#workshop` – the appearance editor.
  - `.touch-controls` – mobile controls.
  - Server and multiplayer panels.
  - Special states such as the `nuke-cinematic` body class.

---

## 3. HTML skeleton (lines 119–134)

The page is a single-page app. Screens are shown and hidden with the `hidden` attribute.

- **`<header class="topbar">`** – the HARD STEEL WAR brand and the navigation buttons: *Hangár, Výzkum, Multiplayer, Příručka, TOP 5, Účet*. It also holds the player profile (XP, rank).
- **`<main id="hangar">`** – the main menu:
  - Hero section with a `<canvas id="scene">` showing a 3D preview of the selected tank.
  - Deploy panel (*PŘÍPRAVA BITVY*) with a **game-mode** `<select>` (Nadvláda, Týmový deathmatch, Zombie, Chaos, Online), a difficulty selector and the map choice.
  - Two tabs, *Vozidla* (vehicles) and *Mapy* (maps), with cards for the 15 tanks and 6 maps.
  - Footer with a link to the guide.
- **`<section id="battle">`** – the in-battle screen. It has a container for the 3D scene and the HUD: pause button, minimap, kill feed, scope overlay, camera-mode button, nuke button, touch controls, team roster and server chat.
- **`<div id="modal">`** – the generic modal dialog. It is reused for research tree, guide, settings, pause, results, score entry, customization, multiplayer and account.
- **`<section id="workshop">`** – the *Dílna* (workshop) for custom tank appearance and decals.

---

## 4. The game script, module by module (lines 54708–60212)

The code uses a hand-made module system. `const MODULES = {}` is filled with `MODULES["name.js"] = (() => {...; return {exports}})()`. Each module is an IIFE, and other modules read its exports with `const {X} = MODULES["name.js"]`. This is how the original multi-file source was bundled into one HTML file.

### Localization
- **`i18n-content.js`** (54709) – a large list of `[Czech, English]` pairs for content strings: mode names, HUD labels, chaos abilities, account texts.
- **`i18n-multiplayer.js`** (54866) – the same for multiplayer texts.
- **`i18n.js`** (54955) – the translation engine:
  - `resolveLanguage()` picks the language. A `.cz` host gives Czech, a `.com` host gives English, otherwise the browser language decides. A manual override is stored in `localStorage` under `hsw-language`.
  - It keeps a dictionary of source phrases in Czech, which stay unchanged in the simulation and save data. A regex built from the dictionary translates visible text.
  - It walks DOM text nodes and attributes (`translateNode`, `localize`) and keeps the originals in `WeakMap`s so the language can be switched back.
  - It skips `script`, `style`, `svg`, inputs, textareas and elements marked `translate="no"`, so tank IDs, nicknames and imported images are never translated.
  - `mountLocalization` and `setLanguage` hook it into the page.

### Utility and network
- **`dev-code.js`** (55366) – the developer-mode unlock check. `matchesDevCode` compares typed input with `day × month + normalized Wi-Fi SSID`. The browser never exposes the SSID, so it must come from a local launcher.
- **`realtime.js`** (55373) – networking for peer-to-peer style rooms:
  - Generates 8-character room codes from an unambiguous alphabet (`roomCode`, `normalizeRoomCode`).
  - `RealtimeTransport` speaks the Supabase Realtime (Phoenix) JSON protocol over WebSocket with no SDK. It uses an ephemeral Broadcast channel, `MULTIPLAYER_VERSION = 32`.
- **`online-config.js`** (55432) – `ONLINE_CONFIG` with the Supabase URL and a **publishable** (public) key. The comment says secret keys must never be put in this file.

### Game data and world
- **`data.js`** (55438) – all static data.
  - `NATIONS`: Germany, USA, USSR.
  - `TANKS` – 15 vehicles, each with:
    - nation, name, variant, role, rank, research cost and prerequisite (`requires`);
    - gun, armor (front, side, rear), speed, reload time, penetration and a description;
    - optional overrides such as `gunCaliber`, `damageScale`, `weapon:'autocannon'` and `wheeled`.

    | Nation | Tanks |
    |---|---|
    | Germany | Panzer IV F2 and H, Tiger H1 and E, Tiger II, Maus |
    | USA | M4A1, M4A2, M4A3 76, M18 Hellcat, M26 Pershing |
    | USSR | T-34 (1941, 1942, 85), IS-1, IS-2, BTR-80A, BMPT |

    The rank and `requires` fields form the research tree.
  - Math helpers: `clamp`, `smooth`, `mix`, `hill`, and obstacle builders `building`, `rock`, `tree`.
  - **Terrain and maps:**
    - `riverCenter` and `MAP_SPECS` define a sinuous river and five bridges for the valley, desert and winter maps.
    - `groundHeight`, `rampHeight`, `terrainHeight` and `surfaceHeight` compute elevation, including bridge decks and ramps.
    - `onRoad` and `terrainAt` give the surface type.
    - `makeObstacles` creates the buildings, rocks and trees.
    - `urbanMap()` procedurally builds the city and industrial maps (road grid, building blocks, courtyards, parks), keeping capture zones clear of buildings.
    - `createBattleMap(id, seed)` generates a **random hill layout per match** from a seed. It is deterministic, so multiplayer clients can reproduce it. Generated maps are cached in `variants`, and `releaseBattleMap` frees them.
  - **Six maps:** Zelené údolí (valley), Písečná bouře (desert), Zimní průlom (winter), Ocelové město (city), Průmyslový uzel (works) and Široká pláň (open plains). Each has three capture zones A, B and C.
  - `getTank` and `getMap` are lookups.

### AI and physics helpers
- **`tactics.js`** (55756) – `TacticalDirector`, the team-level AI. It collects reports and contacts, issues orders to bots (`plan`, `goal`, `huntObjectives`, `crossing`, `cover`) and decides where tanks push, defend or find a crossing.
- **`spatial.js`** (55854) – `ObstacleIndex`, a spatial grid for static obstacles. Moving tanks are still checked with exact queries.
- **`ballistics.js`** (55863) – geometry of the weapons:
  - `weaponGeometry` and `secondaryWeaponGeometry` give muzzle positions. The Maus has a coaxial gun, and the BMPT has two autocannons and missiles.
  - `hullPose`, `weaponFrame` and `solveWeaponAim` compute the pitch and yaw needed to hit a target given hull tilt.
  - Helpers include `pointSegmentDistance`, `obstacleDistance`, `segmentBox` (a slab intersection for fast shells that avoids tunnelling) and `localPoint`.

### Core simulation
- **`simulation.js`** (55955) – the heart of the game:
  - `DIFFICULTY` (easy, normal, hard) sets bot aim error, thinking time, reaction time, damage multiplier and vision range.
  - `MinHeap` backs A* pathfinding.
  - `BATTLE_SETTINGS`: 2000 tickets, a 720 s duration, a 30-kill limit and a 12 s nuke cinematic.
  - **`class Game`** – one battle:
    - **Setup.** 6 vs 6 tanks. The player is `team 0, slot 0`. Allies come from the player's nation, and enemies come from the opposing nations with a similar rank. Spawns are on lanes near bridges.
    - **Main loop.** `update(dt, input)` splits time into steps of at most 1/30 s, which keeps collisions stable. `_step` runs one step.
    - **Player control.** `_playerControl`, `_aim`, `gunSolution` and `_move` (movement, hill-slope handling and collisions).
    - **Weapons.**
      - Main gun: `firePlayer` and `_fire`.
      - Machine gun with overheating: `fireMachineGunPlayer`.
      - Secondary gun: `fireSecondaryPlayer`.
      - Guided missiles: `fireMissilePlayer`, `_fireMissile` and `_guideMissile`.
      - Smoke: `smokePlayer` and `_smoke`.
    - **Ballistics.** `_updateShells`, `_traceSegment` and `raycast`. Shells can pass under bridges, and `predictShot` supports the aim indicator.
    - **Damage.** `_hit` applies a penetration vs armor model (angle, front/side/rear). Hits can damage six modules (`engine, tracks, turret, breech, ammo, crew`). `_addDamage` and `_recalculateXP` update the stats.
    - **Repair.** `repairPlayer` and `_startRepair`.
    - **Kills and respawn.** `_destroy` handles kills, deducts tickets, tracks the kill streak and unlocks the **nuke** after 10 kills. Respawns take 6 s for the player and 7–10 s for bots.
    - **Zones.** `_updateZones` runs the capture mechanic. Tanks inside a zone raise its progress. A contested zone does not change. Held zones drain the enemy's tickets.
    - **End of battle.** `_finish` ends the match. XP is `kills×100 + captures×140 + damage×0.2`, plus a win or loss bonus and a time bonus. XP is 0 if developer or chaos mode was used.
    - **Bots.** `_botControl`, `_botVisible`, `_visible` (smoke blocks line of sight), `_escapeHillside`, `_free`, `_lineFree`, and a navigation grid with A* (`_buildNav`, `_pathfind`).
    - **Chaos extras.** Developer tank (350 km/h), vanish or free flight, kamikaze drone, spawning "Tung Tung Sahur" and "Brr Brr Patapim" meme characters, skyfall, bridge destruction and `launchNuke`.
  - `specName` formats a tank's display name.

### Persistence and profile
- **`appearance.js`** (56754) – sanitises custom looks (paint, decals). Decals are data-URL images, validated by `normalizeDecal`, which checks type and size (`MAX_DECAL_LENGTH`). `importTankImage` loads and resizes a user image.
- **`leaderboard.js`** (56789) – `cleanNick` and `topFive`. `LocalLeaderboard` keeps the top five scores per mode in `localStorage` (key `iron-front-scores-v1`).

### Multiplayer
- **`multiplayer-game.js`** (56808) – shared online logic:
  - `sanitizeInput`, `normalizeProfile` and `normalizeMatch` validate everything that comes from the network.
  - `HostedBattle extends Game` runs a battle on the host or server, with one tank per player.
  - `makeSnapshot` and `validSnapshot` produce and check world snapshots.
  - `ReplicaBattle extends Game` is the client-side copy. It plays snapshots and interpolates, and only shows the effects.
- **`public-server.js`** (57003) – `PublicServerRoom`, a WebSocket client for a dedicated server at `/play`. It sends `join` and receives status, snapshots and events. `serverURL` enforces HTTPS (except localhost).
- **`public-battle.js`** (57062) – `PublicBattle`, the headless server-side version of `HostedBattle`. The server assigns each connection exactly one tank, and clients send only inputs, never positions, damage or score. It has bot fillers (`server-bot-profile`) and per-client views (`snapshotFor`, `eventsFor`).
- **`cloud-room.js`** (57125) – `CloudRoom` and `watchPublicLobby`, which find public lobbies through the Supabase cloud.
- **`public-server-config.js`** (57237) – `PUBLIC_SERVER_URL`. It is empty in this build, so the dedicated-server path is unset. The comment says to put the deployed Node server's HTTPS origin here and rebuild.
- **`public-server-ui.js`** (57244) – `PublicServerUI`, the server list, join buttons and chat.
- **`multiplayer.js`** (57304) – `MultiplayerRoom`, a private room for up to 8 players:
  - Host and peer roles, ready states, team assignment, settings, chat and `start`.
  - `sendInput` and `sendState` stream input and world state through `RealtimeTransport`.
  - `receive` handles incoming messages and validates event types and fields.
- **`room-links.js`** (57488) – `roomInviteCode` and `roomInviteLink`, invite links that only pre-select a room. The recipient still chooses a nickname and connects manually.
- **`multiplayer-ui.js`** (57505) – `MultiplayerUI`, the dialog for creating, joining and configuring rooms (teams, options, lobby).

### Accounts
- **`accounts.js`** (57621) – `PlayerAccount`, optional cloud progress through Supabase RPC calls. It handles `login`, a token (`token`), queued saves (`queue`, `flush`), `load`, score `submit` and `list`, `logout`, and cloud-vs-local progress merging (`cloudProgress`, `useRemote`). `accountUsername` and the `errors` map handle usernames and Czech error messages.
- **`account-ui.js`** (57757) – `AccountUI`, the *Účet* dialog (login, register, sync status). It also schedules saves.
- **`online-leaderboard.js`** (57869) – `OnlineLeaderboard`, a global TOP 5 leaderboard with a local fallback.

### Extra modes and editor
- **`workshop.js`** (57902) – `WorkshopEditor`, the decal editor. The user places, drags, scales and rotates a custom image on the tank's armor with undo support (`beforeChange`, `commit`). `boxHit` is a ray-box test used to pick surfaces.
- **`zombies.js`** (57974) – `ZombieGame extends Game`, the survival mode. Waves of zombies (`nextWave`), a shop between waves (`upgradeCost`, `buyUpgrade`), an auto-gun, zombie damage and `_endSurvival`.

### Graphics
- **`renderer.js`** (58081) – all 3D drawing with Three.js. Everything is generated procedurally in code, including geometry and textures, with **no runtime asset requests**.
  - **Helpers.** `random`, `hash`, `geometry` and `mat` give seeded randomness and a cache of geometries, textures and materials.
  - **Procedural textures.** `localTexture`, `paintTexture` (camouflage by nation), `markTexture` (insignia), `numberTexture`, `groundTexture` and `radialTexture`.
  - **Tank models.** `makeTank` calls `makeTankBase`, `makeSpecialTank` (Maus, M18, BTR-80A) or `makeBmpt`, and adds armor details with `addArmorDetails`. `slopedHull` shapes sloped armor, `addCustomDecal` projects user decals onto armor surfaces, and `mergeStatic` merges static meshes by material for speed.
  - **`class Renderer`.**
    - `setHangar` shows the preview tank, and `setBattle` loads the battle world.
    - World building: `buildTerrain` (heightmap mesh), `buildStreets`, `buildBridges`, `buildClutter` (trees, rocks), `buildProps` and `buildZones`.
    - `syncTanks`, `syncDrones`, `syncSahurs` and `renderZombies` update dynamic objects each frame.
    - Cameras: `updateView`, `updateOpticalCamera` (gunner scope), `updateCamera`, `setFreeLook`, `rotateCamera` and `zoom`. `setXray` shows tanks through walls.
    - Aiming: `aimFromScreen`, `aimFromCenter`, `castAim`, `aimForSight` and `getAimMarker`.
    - `projectTank` projects a tank to screen position for name tags.
    - Effects: `addEvent`, `spawnPuff`, `spawnGlow`, `spawnSpark`, `updateEffects`.
    - Workshop 3D tools: `workshopRay`, `pickWorkshopDecal`, `workshopSurface` and so on.
    - Quality: `setQuality`, `resize` and `dispose`.
- **`audio.js`** (59395) – `AudioEngine`, with **all sound synthesised with the Web Audio API** (no audio files). It has engine sounds per vehicle (`createEngine`), noise bursts for shots and explosions, a bus with effects, a `killConfirmed` sound, and `unlock` for browsers' autoplay rules.

### Input
- **`controls.js`** (59681) – `keyboardInput` maps keys to throttle and steering. `CruiseControl` toggles cruise control. `MouseLock` handles pointer lock and retries after rejections. `edgeLookDelta` lets the player keep turning when pointer lock is denied. `bindMouseButtons` copes with pointer and mouse event differences.

### Application glue
- **`app.js`** (59758) – ties everything together:
  - **State.** `progress` holds XP, unlocked tanks, selected tank and nation, selected map, stats and settings. It is saved to `localStorage` under `iron-front-progress-v1`, and the defaults unlock one starter tank per nation.
  - **UI rendering.** `renderHangar`, `tankSVG` and the `specialTankSVG`, `lateTankSVG` and `bmptSVG` drawings, `mapTexture` (minimap images), `switchHangarTab`, `selectTank`, `toast`.
  - **Dialogs.** `openModal` and `closeModal`, plus `showResearch` (the tree), `showCustomization` (workshop), `showZombieShop`, `showGuide`, `showSettings` and `pause`.
  - **Battle lifecycle.**
    - `startBattle` creates a `Game`, `ZombieGame` or multiplayer room.
    - `finishBattle` awards XP, saves it, counts wins and shows the result with a hint to the next unlock.
    - `backToHangar` resets the state.
  - **HUD.** `updateHUD` (health, modules, ammo, tickets, timer, zones, roster), `drawMinimap`, `drawTags` and `onGameEvent` (kill feed and notices).
  - **Input wiring.** `captureMouse`, `clearControls`, `releaseControls` and the many event listeners for keyboard, mouse and touch.
  - **Main loop.** `loop(now)` runs on `requestAnimationFrame` and takes `dt` capped at 0.05 s. It reads input, calls `game.update`, then `renderer.updateView` and `render`, then updates the HUD about every 90 ms. Any exception is caught: the game pauses and a message asks the player to return to the hangar.
  - **Scores.** `showScores` and `showScoreEntry`.
  - **Multiplayer glue.** `enterMultiplayer`, `finishMultiplayer` and `toggleServerChat`.
  - **Chaos menu.** `CHAOS_ABILITIES`, `updateChaosHUD` and `showChaosMenu`. The abilities are DEV Maus, Vanish, 5× Tung Tung Sahur, 5× Brr Brr Patapim, "Tanks into the air" and a kamikaze drone.
  - **Start-up.** `renderHangar()`, then `new Renderer(canvas)`, then `loop` starts. A debug handle `window.__IRON_FRONT__` exposes `game`, `progress`, `renderer` and `paused`.

---

## 5. Game modes

| Mode | Description |
|---|---|
| **Nadvláda** (battle) | 6 vs 6, capture zones A, B and C, ticket drain, 12-minute limit |
| **Týmový deathmatch** | Kills only, 30-kill limit, no zones |
| **Zombie** | Wave survival with an upgrade shop |
| **Chaos** | Fun abilities (DEV Maus, drones, meme characters, skyfall). No XP or score is awarded |
| **Online** | Private room (up to 8 players) or public server, with server-validated inputs |

## 6. Data stored in the browser

| Key | Content |
|---|---|
| `iron-front-progress-v1` | Player progress, selection, settings, custom appearances |
| `iron-front-scores-v1` | Local top-5 scores per mode |
| `hsw-language` | Language preference (`auto`, `cs`, `en`) |

## 7. Notes

- The code name is "Iron Front" in storage keys and the debug handle (`__IRON_FRONT__`). The shipped title is "Hard Steel War", so the game was probably renamed.
- A Supabase publishable key is in the file. That is designed to be public, but it is only safe if the project's row-level security and RPC permissions are set correctly.
- The dev-code unlock is client-side, so it only protects against casual use.
- This walkthrough comes from the file's structure and from reading the key parts of the code. Some internals, such as exact damage formulas and the bot AI details, were summarised rather than traced line by line.
