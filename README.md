# Graveshift: round-based zombie survival in the browser

**Play zombies:** https://andrewnakas.github.io/deadops-cleanroom/ · **Team deathmatch vs bots:** https://andrewnakas.github.io/deadops-cleanroom/mp.html

Hold out in the *Starlight Picturehouse*, an abandoned cinema, against endless rounds of the undead.
Board up the windows, buy weapons off the walls, open the theatre, restore the power, drink from the
machines, gamble at the Lucky Crate and refine your gun. Or deploy to *Maple Court*, a three-lane suburban
arena, for team deathmatch with bots: create a class, pick three perks and earn killstreaks. Host a room
and share the link to play with friends (peer-to-peer, the host is the authority).

Everything you see and hear is free to reuse:

- **Models and textures:** CC0 only (Quaternius, Pichuliru via poly.pizza; ambientCG). Every file is listed in
  [`assets/LICENSES.csv`](assets/LICENSES.csv) and on the in-game credits page.
- **Sound and music:** synthesised in code at runtime (`export/web/sfx.js`).
- **Announcer:** placeholder Piper TTS lines (`tools/make_voices.py`), to be replaced by our own recordings
  (script: [`assets/voice_lines.csv`](assets/voice_lines.csv)).
- **Map, props, posters, film reel:** original procedural work (`export/web/maps/cinema.js`, `props.js`).
- No names, logos or assets from any commercial game.

## Online services

Multiplayer is still peer-to-peer: the hosting player's browser runs the match. A small Cloudflare Worker
(`worker/`, D1 database) adds the parts a static page cannot do: a room list, matchmaking (quick play and a
ranked playlist), match results with leaderboards and stats, friends, parties, chat reports and optional relay
credentials. The game keeps working without it (rooms by code, solo and bots).

- **What is stored:** an anonymous account made on first online use (a random id and key kept in your browser,
  no email or password), the name you typed, your rating, friends list and online match totals.
  Lobby chat is not stored unless someone reports it (the reported lines are kept with the report).
- **Ranked is peer-hosted.** A result counts when the players in the match report the same score, so it is a
  friendly ladder, not a tamper-proof one.
- Run it locally with `npm run test:api` / `npm run test:backend` (no Cloudflare login needed); deploy with
  `npx wrangler deploy` from `worker/`. A page served from localhost ignores the live service unless opened
  with `?api=live`.

## Credits

The engine (player controller, collision, navmesh AI, round rules, touch controls) is adapted from the
MIT-licensed code of [luckeyfaraday/kino-der-toten](https://github.com/luckeyfaraday/kino-der-toten) by
**@luckeyfaraday**. Only code was used: none of that project's art, audio, maps, animations or history.
Its licence is kept in [`LICENSE-kino`](LICENSE-kino). three.js, three-mesh-bvh, recast-navigation-js and PeerJS are MIT.

## Controls

| | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / look | WASD / mouse | left / right stick |
| Fire / aim | left / right mouse | RT / LT |
| Use, buy, rebuild (hold) | F | X (hold) |
| Reload | R | X (tap) |
| Knife | V | R3 |
| Frag / drummer / tripmine | G / X / 4 | RB / LB / D-pad down |
| Sprint / jump / crouch | Shift / Space / C | L3 / A / B |
| Swap weapon | Q, 1, 2, wheel | Y |

Touch controls appear automatically on phones and tablets.

## Develop

```sh
npm install
npm start                    # http://127.0.0.1:5173
npm test                     # rules, touch input, binary loader
npm run test:routes          # walk every route through the map with the real player physics
npm run test:weapons         # every weapon loads, fires and reloads (add -- --upgraded)
npm run test:mobile          # touch layout and controls
npm run test:waves           # headless survival run to round 10
npm run test:tdm             # bots-only team deathmatch to completion
npm run test:p2p             # two browsers, one hosts and one joins over WebRTC (needs internet)
npm run test:api             # backend API against a local Worker
npm run test:backend         # two browsers matched through the local Worker, match reported, panels checked
npm run bake                 # rebake collision + navmesh after editing maps/cinema.js
npm run check:licences       # every shipped asset has a CC0 / own-work licence row
npm run check:marks          # no third-party game names anywhere in the build
```

Map layouts are plain JavaScript (`MapKit` boxes, ramps and walls); the same description is rendered,
collided against and baked into the navmesh, so geometry, collision and AI always agree.
