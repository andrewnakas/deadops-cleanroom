# Dead Ops clean room (public title: GRAVESHIFT): status

Live: https://andrewnakas.github.io/deadops-cleanroom/ · repo: andrewnakas/deadops-cleanroom

## Works (2026-10-10)
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
- **Gates:** `check:licences` gives 2389 manifest rows / 93 shipped media / **0 failing**; `check:marks` gives **0 hits**.

- **Multiplayer (bots-only first release):** `mp.html` runs Team Deathmatch on the original three-lane arena
  **Maple Court** (`maps/suburb.js`): first to 75 or 10 minutes, team spawns, scoreboard (Tab), killfeed and minimap.
  Create-a-class has primary, secondary and 3 perk slots (9 original perks). Killstreaks are Scan (3), Airstrike (5)
  and RC Drone (7). Bots path on the navmesh along lanes, hear gunfire, and have four aim/reaction tiers
  (recruit, regular, hardened, veteran). `npm run test:tdm` runs a bots-only match to completion; three runs
  finished 75–45, 58–75 and 63–75 with 0 errors.

- **Online play (2026-10-09):** `mp.html` has HOST A ROOM / JOIN. Rooms are WebRTC peer-to-peer through PeerJS cloud
  signalling. The host runs bots, hit detection, health, score and killstreaks; a joining player takes over a bot
  slot, owns only their movement, and sends shot rays that the host checks. `npm run test:p2p` joins two real
  browsers and passes (slot takeover, position sync, shots and kills through the host, slot handed back on leave).

- **Feel and settings overhaul (2026-10-10):** recoil, spread, damage falloff, aim assist, hit markers, damage arcs,
  score popups, bloom and shadows with quality tiers, and a settings menu with key rebinding. This was the work the
  crashed session left uncommitted; it was reviewed, passed every suite and both gates, and is committed.
- **Pre-game lobby (2026-10-10):** a hosted room now waits in a lobby instead of starting at once. It shows both
  teams, lets each player switch team and ready up, lets the host remove a player, and starts on a 3 second
  countdown. Joining after the start still takes over a bot. Player names are stripped to plain characters on both
  ends. `npm run test:lobby` passes 10/10.
- **Local progression (2026-10-10):** XP for kills and for finishing or winning a match, six medals (Sharp Eye,
  Pair, Trio, Payback, Long Reach, Opening Shot), 30 levels, and weapons and perks that unlock by level (all open by
  level 9; table in `data/mp.json` "unlocks"). Saved in the browser only, so it is unranked and can be edited by the
  player. `npm run test:progress` passes 8/8.
- **Second mode, Recovery (2026-10-10):** a kill drops a marker; the other team collects it to score and the
  victim's team can grab it to deny. First to 50. Bots go for nearby markers, markers replicate to joiners, and the
  mode is chosen in the menu (`?mode=recovery`) and shown in the lobby. `npm run test:recovery` plays a bots-only
  match to the limit with 0 errors.
- **Second arena, Cinder Yard (2026-10-10):** an original freight yard (`maps/yard.js`): a raised loading dock with
  ramps to the north, a warehouse the service road runs through, and two rows of containers to the south. Chosen in
  the menu or with `?map=yard`; a room's join link carries the arena. `npm run test:yard` plays a bots-only match
  to 75 with 0 errors. The warehouse lighting was raised after one dark screenshot and has not been looked at since.
- **Match feel (2026-10-10):** 2.5 s of spawn protection (ends when you fire or throw), a red HUD arc pointing at
  whoever hit you, and frag grenades (2 per life on G, 2.2 s fuse; bots throw them, a joiner's throw goes through
  the host). Online players see the grenade in flight as well as the explosion.
- **Class slots (2026-10-10):** five saved classes (primary, secondary, three perks each). Changing class in a match
  applies on the next spawn; an online joiner can only pick a class before joining. The frag is also on the gamepad
  right bumper and the touch grenade button.
- **Online hardening (2026-10-10):** a joiner's killfeed keeps only the name colour and italic tags from the host,
  and joining retries for about 15 s so PLAY AGAIN on both sides brings the room back to the lobby.
- **Lobby chat, arena vote and rematch (2026-10-10, afternoon):** the lobby has a text chat (letters, digits and
  basic punctuation only, 80 characters, last 8 lines) and a vote button per arena. START MATCH loads the arena
  with the most votes (a tie keeps the current one); the host reloads on it and joiners follow. After a match the
  host's button is NEXT ARENA, which moves the whole room to the next arena's lobby; a joiner's is LEAVE ROOM.
- **Holdout mode (2026-10-10):** one marked zone (ring, beam, minimap circle); the team with more soldiers inside
  scores a point a second, first to 150, the zone moves every 30 s between three spots. Bots walk to it and lob
  frags at a zone the other team holds. Holding pays the player 50 XP per 5 s (host or solo only).
- **Third arena, "Gull Wharf" (2026-10-10):** boardwalk, fish market stalls, two boat sheds. 37/37 nav targets.
- **Host migration (2026-10-10):** when the host drops mid-match (data channel closes, or 8 s without a snapshot)
  the joiner in the lowest seat reopens the match as room `<code>M<seat>` from its last snapshot: soldiers, score,
  clock, markers and zone carry over, the old host's soldier becomes a bot, and the other joiners reconnect to
  their own seats. Tested with one host and two joiners in headless browsers on this PC, through to the match end.
  Limits: ammo and cooldowns of bots restart, in-flight grenades and streak drones are dropped, and if the heir
  also left, the others get a "THE HOST LEFT THE MATCH" end screen once their retries run out (not timed) and keep their XP.
- **Challenges and tours (2026-10-10):** seven lifetime challenges (kills, clean shots, wins, matches, trios,
  paybacks, long kills) with tiers that pay 500 XP times the tier, listed in the menu. At level 30 a START TOUR
  button resets level and unlocks and keeps totals and challenges (up to 5 tours). Browser-local like the rest.
- **MP announcer (2026-10-10):** 14 placeholder Piper lines (`mp_*`): match start, win, lose, draw, lead taken or
  lost, either team at 90% of the limit, zone moved, the three killstreaks, enemy airstrike, host changed. The
  host relays streak lines to joiners. Checked by a probe listing the lines spoken in a Holdout match; not
  listened to. They are in `assets/voice_lines.csv` for recording (33 lines now).
- **Fittings (2026-10-10):** one fitting for the primary in each class: Long Magazine (level 2), Long Barrel (5),
  Light Bolt (8), Muffler (10, shots stay off the minimap). Numbers are in `"fittings"` in `data/mp.json`; they
  have no model on the gun, and bots do not use them. Only the Long Magazine is covered by a test.
- **Bots in Recovery** pick up a marker within 280 units even while fighting (matches on Gull Wharf were running
  out the clock otherwise; they still reach the 10-minute limit there about as often as the score limit).
- **Tests:** suites wait for the local server to answer instead of a fixed delay (this was the likely cause of the
  `test:p2p` first-load failures; not seen since). New tools: `.tools/shot-mp.mjs` (MP screenshots) and
  `.tools/probe.mjs` (run an expression in a bots match). Cinder Yard's warehouse was re-shot after lowering its
  lamps: floor and cover are readable, the upper walls are still dim.

## NOT PUBLISHED (2026-10-10)
Everything from 2026-10-10 (overhaul, lobby, chat and vote, progression, Recovery and Holdout modes, Cinder Yard, Gull Wharf, match feel, class slots, online hardening) is **local only**. `sh tools/publish.sh` was blocked by the session's
permission check, so the live site is still the 2026-10-09 build. To publish, run `sh tools/publish.sh` yourself
(gates were clean at the time: 0 failing licences, 0 mark hits).

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
2. Two more original MP arenas. Online play still needs a real two-machine session across the internet
   (only tested between two browsers on this PC; no TURN relay, so some strict NATs will fail to connect).
3. MP polish: grenades for bots and the player, a death animation camera, spawn protection, footstep audio.

## MP parity backlog (owner asked 2026-10-09; next session)
Done: pre-game lobby (team select, ready-up, host remove, countdown, chat, arena vote), rematch with arena rotation,
host migration, local XP, levels, medals and unlocks, three modes (TDM, Recovery, Holdout), three arenas.
Not built yet: public matchmaking and quick play, parties, ranked and leaderboards, prestige and
more challenges, killcam, friends/stats, zombies co-op, TURN relay.
First decision: backend (stay serverless, a small Cloudflare Worker, or a dedicated authoritative server).

## For the morning
- **Run `sh tools/publish.sh`** (it was blocked for the unattended session), then:
- Play zombies at the link above and TDM at `/mp.html` (also linked from the menu). Please look at feel, weapon balance and the map layout.
- Try online: open `/mp.html`, press HOST A ROOM, and send the join link to a second device.
- Record the announcer: script in `assets/voice_lines.csv` (33 lines).
- Confirm the title "Graveshift" (rename = `data/game.json` title + index.html).
