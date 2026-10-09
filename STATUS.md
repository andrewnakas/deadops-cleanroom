# Dead Ops clean room (public title: GRAVESHIFT): status

Live: https://andrewnakas.github.io/deadops-cleanroom/ · repo: andrewnakas/deadops-cleanroom

## Works (2026-10-09)
- **Zombies mode playable** in the browser: keyboard and mouse, gamepad (standard mapping) and touch.
- **Original map, "Starlight Picturehouse":** lobby (start), stair hall, balcony, projection booth (power switch),
  auditorium with seats, stage and screen, dressing rooms and back alley. It has 5 buyable doors, 10 boarded windows,
  4 drink machines, the Refinery (weapon upgrade), 5 crate spots, 7 wall-buys, tripmines and a fire axe.
  Source: `export/web/maps/cinema.js` (MapKit boxes and ramps → render, collision BVH and baked navmesh).
- **Systems:** round rules, economy, power-ups, crate and upgrade logic are MIT code with our own ids and values in
  `data/game.json`. Every weapon, perk, power-up, machine and map has an original name.
- **Assets:** 26 CC0 GLBs (Quaternius zombies, wolves, guns, soldiers; Pichuliru frag) and 12 ambientCG surfaces.
  Procedural props, posters and film reel. Sound and music are synthesised in code. Announcer lines are Piper TTS
  (ryan-high) placeholders.
- **Tests:** `npm test` 17/17, `test:routes` 6/6 physical routes, `test:weapons` 15/15 (and --upgraded),
  `test:mobile` pass, `test:waves` reaches round 10 headless with 0 errors (hound round included).
- **Gates:** `check:licences` gives 2389 manifest rows / 81 shipped media / **0 failing**; `check:marks` gives **0 hits**.

## Decisions
- **Public title "Graveshift":** "Dead Ops" stays as the repo id only, because it is close to the name of a mini-game
  in the franchise.
- **Manifest:** built statically from the dirty reference's data files rather than by running it, because the
  retail LFS textures were never downloaded. Same coverage: every model, animation, texture, sound and map file
  it references. The runtime also logs every request (`game.debug.assetLog()`).
- **Manifest kept local:** `assets/manifest.csv` and `tools/build_manifest.py` contain reference file names, so they
  stay local and gitignored. `check_manifest.py` runs locally before each publish.
- **CC0 sources:** models come from poly.pizza and only pages marked "CC0 1.0" are used (the fetch script refuses
  anything else). Surfaces come from ambientCG at 512 px.
- **Animation:** the viewmodel is animated procedurally in code. Zombies and wolves use their CC0 embedded clips.
- **Scratch and dirty files:** on D: (`D:\n64work\deadops\kino` is the dirty reference, LFS skipped;
  `D:\n64work\deadops\dl` holds downloads).

## Next
1. Visual polish: viewmodel arms and hands, lighting balance after power-on, more set dressing.
2. MP: `tdm` mode with team spawns, first to 75, scoreboard, create-a-class (3 perks), generic killstreaks, bots
   with difficulty tiers, and an original three-lane suburban arena. Later, WebRTC P2P.

## For the morning
- Play it at the link above. Please look at feel, weapon balance and the map layout.
- Record the announcer: script in `assets/voice_lines.csv` (19 lines).
- Confirm the title "Graveshift" (rename = `data/game.json` title + index.html).
