# Music Triad

A browser-based musical card game with Simple and Advanced rules, computer matches, classroom multiplayer, and tournaments.

## Local development

The game is static HTML/CSS/JavaScript and needs no package installation or build step. Serve this checkout with:

```sh
python3 -m http.server 8004 --bind 127.0.0.1
```

Single-player games and their arcade reward reports need no credentials. Classroom multiplayer and tournaments retain their existing Firebase configuration; this update does not change Firebase projects, rules, or stored data.

## Arcade rewards

The arcade cabinet embeds this game from `cwoodmusic.github.io/musictriad/`. `arcade-bridge.js` reports completed matches through the existing origin-checked, token-bound bridge. Reports include the result, score, captures, comeback, Simple/Advanced rules, and the computer difficulty actually used.

Advanced computer games still report `mode: "computer"` with `rules: "advanced"`, preserving compatibility with the original arcade. A Hard Advanced win can unlock the Triad champion crown. Tutorials, unfinished matches, duplicate reports, completed snapshots merely loaded from multiplayer, and late difficulty upgrades do not earn that mastery reward.

The source can stay in this repository while the arcade lives in `cwoodmusic/coda-arcade`. No repository migration or Firebase change is required for this connection.

In Advanced mode, a tied board is cleared and both players receive fresh opening hands. The same match continues until one player wins; tied rounds do not award arcade rewards or play an end cue.

## Learning pace

Each card comparison gives 1.8 seconds to read the highlighted rhythms, 0.8 seconds for the clash, and 1 second to read the result. Every comparison keeps this pace, including follow-up captures. Board capture effects follow the explanations; victory music and arcade rewards wait until the entire turn finishes. Reduced motion keeps the reading and result time while removing card movement. New Game and Home cancel pending explanations immediately.

## Checks

The browser checks use Python Playwright and Chromium. The arcade integration test expects the sibling `../coda-arcade` checkout; it serves both current sources under their production browser origin in an isolated test context, with external services blocked.

```sh
node --test tests/*.test.cjs
python3 tests/arcade-integration-browser.py
python3 tests/animation-audio-browser.py
```

## Publishing

GitHub Pages serves the `main` branch at `https://cwoodmusic.github.io/musictriad/`. Publish `index.html` and its companion JavaScript files together so the cabinet loads the same version of the game, result bridge, and audio controller.

## Classroom privacy

Launch with `?classroom=1` (or embed in Coda with classroom privacy on) to use private parent-profile progress only. Firebase SDKs are not loaded and classmate/tournament services are unavailable in this mode. Same-origin classroom frames inherit their parent's scoped progress store before the game reads local progress. Single-player Simple and Advanced games, tied-board continuation, audio, and the arcade result bridge remain available. Standalone play without the flag retains its existing online features.
