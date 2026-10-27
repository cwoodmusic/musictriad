# Music Triad

A browser-based musical card game with Simple and Advanced rules, computer matches, optional online multiplayer, and two-to-four-player tournaments.

## Local development

The game is static HTML/CSS/JavaScript and needs no package installation or build step. Serve this checkout with:

```sh
python3 -m http.server 8004 --bind 127.0.0.1
```

Single-player games and their arcade reward reports need no credentials. Multiplayer and tournaments reuse the existing Firebase project and room paths. New Advanced records add their rules, round number and last move; Simple and older records keep their existing format.

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
python3 tests/advanced-tiebreak-browser.py
python3 tests/audit-browser.py
python3 tests/classroom-multiplayer-browser.py
python3 tests/advanced-online-browser.py
```

## Publishing

GitHub Pages serves the `main` branch at `https://cwoodmusic.github.io/musictriad/`. Publish `index.html` and its companion JavaScript files together so the cabinet loads the same version of the game, result bridge, and audio controller.

## Classroom privacy

Launch with `?classroom=1` (or embed in Coda with classroom privacy on) to keep progress in the private parent profile. Same-origin classroom frames inherit their parent's scoped progress store before reading local progress. Solo play and browsing the multiplayer/tournament panels do not load Firebase or create a game account. Choosing **Create** or **Join** connects to the existing room service with an anonymous, memory-only game session; no name, email, or Profile Pass is sent. Room codes and tournament colors identify players. Both Simple and Advanced modes offer classmate games and 2–4-player tournaments. Single-player games, tied-board continuation, audio, and arcade rewards remain available. Standalone play retains its existing online behavior.

Choose Simple or Advanced before creating a game or tournament. Classmate games
use a four-character code; tournaments use a five-character code. Joining players
automatically use the creator's rules. Advanced matches use the 4×4 board, musical
meter values, draw-on-turn hands and special cards. A tied Advanced board starts
a fresh round in the same match, alternating the starting player, until there is
a winner. Tournament rounds inherit the same rules through the championship.
Rules cannot be switched while an online session is open; return Home to start
another session. Developer unlock-test mode still uses local play only.

Tournament lobbies support 2–4 players, matching the existing first-round and
championship database paths. Full lobbies cannot claim a fifth color slot;
older oversized lobbies must be replaced before starting. Leaving an online
session detaches its listeners and cancels pending returns, so delayed snapshots,
startup requests, or tutorial completion timers cannot replace a later match.
Tournament labels are rendered as text, including values received from Firebase.


## Advanced learning tools

The Advanced tutorial has 20 short lessons using the real move engine. It covers
touching sides, ties, notes/rests, dots, beamed groups, game meter powers, all six
special cards, drawing, tied matches and online rules. The lesson picker allows
replay, and Back, Home and Exit remain available during animations. Tutorials
do not earn scores, achievements or arcade rewards.

The rebuilt Cheat Sheet opens in the selected game mode. Its guide-only mode
switch never changes the match. Sections show exact values, meter calculations,
special targets and worked touching-card examples using the game’s notation.
Advanced Rules opens this same guide. The meter multipliers are game powers;
6/8 does not universally double written note durations in real music.

```sh
node --test tests/advanced-reference.test.cjs
PYTHONDONTWRITEBYTECODE=1 python3 tests/advanced-reference-browser.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_advanced_course.py'
```
