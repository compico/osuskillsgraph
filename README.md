# osu!skills graph

A [tosu](https://github.com/tosuapp/tosu) overlay that draws the difficulty of every skill over the course of the beatmap you are playing, with the current moment marked. The skills are the ones [go-osu](https://github.com/compico/go-osu) calculates: stamina, tenacity, agility, precision, reading, memory (with FL), accuracy and reaction.

- **Each line is normalised to its own peak**, so all of them use the full height whatever the skill's scale. (go-osu's own beatmap card shows the absolute values.) The exception: a skill whose peak is under 100 points (reading is 0–11 on most maps) is divided by 100 instead, so it stays a low line and does not look as hard as the rest.
- **One point per 5 seconds**: the curves are made of the hardest moment of each 5 s window (`window` in `config.js`), because per-note values are far too noisy to read. Tenacity is on or off, so it is drawn as steps.
- **Lines fade with distance from their peak**: a skill that is at its hardest right now is bright, one that is easy at this moment fades, so the lines do not blur into each other. Memory is cumulative (it adds up over the map), so it is dashed with a constant opacity; tenacity shows the streams.
- Mods follow the game (DT/NC, HR, HD, FL…); mods that do not change difficulty are ignored.

## Install

1. Run go-osu (it must have synced your library) and note its port (`http.port` in its `config.yml`, 3000 by default).
2. Put this folder into tosu's `static` folder, e.g. `static/osuskillsgraph/`, and add it as an overlay in tosu's dashboard.
3. If go-osu is not on `http://127.0.0.1:3000`, edit `config.js` (or add `?goosu=http://127.0.0.1:PORT` to the overlay's URL).

The overlay talks to tosu's websocket (`/websocket/v2`) and to go-osu's `GET /api/osu/songs/{beatmap_id}/strains` (needs a go-osu with the 5 s windows, compico/go-osu#48); nothing else, no build step.

## Develop

`npm test` runs the tests of the drawing-independent logic (`js/graph.js`) with Node's built-in test runner (Node 22+).

## Notes

The time axis is the beatmap's own time. The overlay assumes tosu's `beatmap.time.live` is also on that timeline (the position in the audio, as osu! reports it, which does not change with DT/HT). If the cursor runs ahead of the music with DT, that assumption is wrong: please open an issue.

MIT licensed.
