# BUILD REPORT — Fastbreak Five (3D browser basketball)

Agent: Claude Code (Claude Opus 5.5) · Spec: `spec/basketball-game-requirements-v1.md` v1.0

## 1. Executive summary and deployed URL

**Deployed URL:** https://bh-basketball-v1-claude.seemystuff.workers.dev (Cloudflare Workers, static assets, HTTPS)

Fastbreak Five is a playable 3D five-on-five basketball game. A human controls the Harbor City Herons
against the AI Mesa Ridge Coyotes in a four-quarter timed match (default 2:00 quarters). Everything
the success definition asks for works: start from a menu, move, pass, shoot with a timing meter,
score 2s and 3s that are decided by real ball/rim geometry, defend (switch, steal, block) against an
AI that brings the ball up, passes, drives and shoots, see possession change, and finish with a
final score and restart. Beyond the P0/P1 list the game also has fouls, free throws, a team-foul
bonus, overtime, dunks, a tip-off, a follow camera, gamepad support, adaptive graphics quality,
procedural sound, and an end-of-game box score.

Everything visual and audible is generated procedurally in code. No external art, model, audio or
font files ship, so there is no third-party asset licensing exposure.

**Validation:** 48 unit tests (Vitest), including several complete headless AI-vs-AI and
human-input matches, and 11 Playwright browser tests. All pass both locally and against the
production URL (section 6).

**Main caveat:** the build machine has no GPU (WSL, software rendering only), so frame rate on real
graphics hardware has **not** been measured. Software-rendered (SwiftShader) numbers are a lower
bound (section 8).

## 2. Technology stack and architecture

| Layer | Choice | Why |
|---|---|---|
| Language/build | TypeScript 5.6 + Vite 6 | Fast iteration, strict typing, static bundle (~150 KB gzip) |
| Rendering | three.js 0.170 (WebGL 2) | Mature, small, no engine lock-in; everything else is custom |
| Physics | Custom lightweight ball physics (`src/sim/ballPhysics.ts`) | Only the ball needs real physics. A torus rim, box backboard, floor and net damping are cheaper and more controllable than a general engine. 4 sub-steps at 120 Hz (2 cm max travel per sub-step) prevents tunnelling through the 1 cm rim tube |
| Simulation | Fixed-step (1/120 s), deterministic, seeded PRNG, zero DOM/three.js dependencies (`src/sim/`) | The whole game, including AI and rules, runs headless in Node for unit tests and full-match simulations |
| AI | Utility scoring + finite-state behaviors + steering (`src/sim/ai.ts`) | No runtime LLM, no network latency |
| UI | Plain DOM/CSS overlay (`src/ui/`) | Crisp text at any resolution, accessible buttons |
| Audio | Web Audio synthesis (`src/ui/audio.ts`) | No audio assets needed |
| Tests | Vitest (logic) + Playwright (browser, local and production) | |
| Hosting | Cloudflare Workers static assets (`wrangler.jsonc`) | Preferred platform in the spec, HTTPS, no backend needed |

**Data flow:** `main.ts` polls keyboard/gamepad each frame and converts it to a camera-relative world
direction plus edge-triggered buttons in `Game.input`. It then advances `Game.step()` in fixed
1/120 s steps and drains `Game.events` into the HUD, sound and view. `GameView` reads the sim
state, renders it, and never writes back to it. The sim is the single authority for score,
clocks, possession, ball owner and the controlled player (GAME-004).

**Coordinate system:** meters; x runs along the court (±14.33), z across (±7.62), y is up. The Herons attack +x.

### Key decisions (EXP-008)
1. **Make/miss is never rolled.** A shot computes a launch velocity aimed at an aim point near the
   rim. Release timing, distance, defender contest, fatigue and rating perturb that aim point. The
   physics integration then decides the outcome: rim and backboard bounces, rattles in and out, air
   balls. Score is awarded only when the ball's center crosses the rim plane moving downward inside
   the ring, during live play.
2. **Deterministic, headless-testable simulation.** This allowed full-match robustness tests:
   AI-vs-AI, an idle human, and a button-mashing human.
3. **Procedural assets** instead of sourced models. This guarantees license safety and a coherent
   stylized look within the time budget.
4. **Deployment under a new Worker name.** The provided `cloudflare.env` named the Worker
   `ai-video-editor-claude` and the hostname `ai-video-editor-v1-claude.thebuildhypothesis.com`,
   which look like another experiment's resources. To avoid overwriting something unrelated, the
   game is deployed as a new Worker, `bh-basketball-v1-claude`, on `workers.dev`. The custom
   hostname was not attached. This is a one-line change in `wrangler.jsonc` (a `routes` entry) if
   that hostname is intended for this game.

## 3. Implemented features by requirement ID

See the full checklist in section 12. Highlights:

- **Court and visuals (VIS-001..008):** a regulation 94×50 ft court drawn on a canvas texture:
  maple planks, sidelines and baselines, center circle, arc and corner three-point lines, painted
  keys, free-throw lines and circles (dashed inner half), restricted arcs and lane hash marks.
  10-ft rims, glass backboards with shooter's squares, supports and padded bases. Animated diamond
  nets that swish and shake. A 9.4-inch ball with blob shadow and rolling spin. Ten jointed player
  rigs (knees and elbows) in team colors with numbers and names. Directional shadows, an arena with
  instanced crowd that cheers on scores, benches and a scorer's table.
- **Rules (GAME-*):** four quarters (1/2/3/5/12-minute options), overtime, tip-off with the
  possession arrow for Q2–Q4, a 24-second shot clock (reset on change of possession, 14 after an
  offensive rebound off the rim, at least 14 after a non-shooting defensive foul, continuing when the defense knocks the ball out of bounds), shot-clock violations,
  out-of-bounds (ball or ball-handler) with sideline and baseline inbounds, made-basket baseline
  inbounds, steals, interceptions, blocks, rebounds, shooting fouls (2 or 3 FTs, and-ones),
  reach-in fouls, team fouls with a 5-foul bonus, buzzer-beaters (a shot released before 0.0
  counts, anything after the buzzer is rejected).
- **Controls (CTRL-*):** WASD/arrows (camera-relative), Shift sprint with stamina, Space shoot with
  a timing meter beside the player (or jump/block on defense, layup near the rim, dunk when
  sprinting near the rim), E directional pass with a target preview marker, F steal, Tab/Q switch
  to the defender nearest the ball, C camera toggle, Esc pause, and a gamepad mapping.
- **AI (AI-*):** the ball-handler brings the ball up, then re-evaluates every 0.22–0.4 s by
  comparing shot value (distance, openness, rating) against pass options (receiver value minus
  lane risk) and driving lanes. Its shot threshold drops as the shot clock runs down. Off-ball
  players space to role-based spots, rotate spots, cut when tightly guarded, and crash the boards
  (bigs) or get back (PG). Defense plays man-to-man with help sag and a no-press limit. Defenders
  close out and jump to contest, take steal attempts, and box out on shots. Loose balls draw the two
  nearest players of each team. Difficulty (Easy/Normal/Hard) changes AI shot timing, reaction time,
  steal aggression, speed and defensive gap.

## 4. Missing or partially implemented features

| Item | Status / simplification |
|---|---|
| Substitutions, timeouts, foul-outs | Not implemented. Five players per side play the whole game. Stamina drains with sprinting, recovers when not sprinting, and lowers speed and shooting accuracy |
| Traveling, 3-second, 8-second, backcourt, goaltending, lane violations | Not enforced (P2 per spec §5.1). Blocks are not allowed on clearly descending balls (vertical speed below −2.5 m/s) or more than 0.5 s after release, which approximates goaltending |
| Teams switching baskets at halftime | Not done. The Herons always attack the right (+x) basket so the controls stay consistent |
| Pick-and-roll, defensive switching, zone, play-calling | Not implemented (AI-009 partial: cuts, drives, difficulty levels exist) |
| Human control of off-ball offensive players | On offense you always control the ball-handler. Tab works on defense and for loose balls |
| Ball vs. player-body collisions | The ball collides with floor, rim, backboard and net. It does not bounce off player bodies. Loose balls near a player are caught instead |
| Interceptions/steals | Physical proximity gates them, then a probability roll decides (with defensive rating and distance). Hand-ball contact is not simulated for steals. Blocks are hand-ball proximity plus a roll |
| Dribble | The held ball follows a kinematic dribble path (hand to floor to hand) tied to the handler's speed. It is not a free physics body while held, but it is knocked loose on steals |
| Instant replay, shot charts, music, commentary | Not implemented (UI-007 partial: synthesized SFX, crowd reactions, box score with top scorers) |
| Configurable key bindings | Not implemented. Two keys exist for most actions (e.g. Space/J, E/K) plus the gamepad |
| Explicit resets (allowed by VIS-009) | Players are placed into formation at the start of each period and for free throws. The ball is placed in the inbounder's hands when an inbound starts. An inbounder who cannot reach the spot within 4 s is moved there |

## 5. Asset generation and sourcing approach

All assets are procedural and original (see `ASSETS.md`): canvas-drawn textures (court, ball,
jerseys, backboard, banners), three.js primitive geometry for players, hoops, nets and arena, and
Web Audio synthesis for sound. No image or 3D generation APIs were used, and none were assumed
available. Teams, league, logo, title and player names are fictional. Only three.js (MIT) ships in
the bundle, with its license banner preserved.

## 6. Automated tests and their results

Commands: `npm test` (unit), `npm run test:e2e` (browser, local preview),
`BASE_URL=<prod url> npm run test:e2e` (production).

**Unit tests (Vitest): 48 passed / 0 failed** (`tests/unit/`, ~45 s)

| Suite | Covers |
|---|---|
| `scoring.test.ts` (21) | 3-pt geometry (arc, corner, both baskets). Made 2 adds exactly 2 and gives the opponent the ball. Made 3 and corner 3 add exactly 3. AI team scores into its own basket. Early release misses. Late half-court heave misses. No double counting over 10 s. Ball through the rim while play is stopped is rejected. Ball dropped through the hoop scores by geometry. Ball beside the rim does not. Defensive/offensive rebound possession and shot clock (24/14). Steal, interception, completed pass (ball travels and control follows). Loose ball out of bounds and inbound. Shot-clock violation. Made basket leads to opponent inbound and back to live. Lost-ball-mid-gather guard. Human sprint dunk = 2. AI center dunk |
| `match.test.ts` (18) | Q4 clock expiry leads to `final` with the correct score and no scoring afterwards. Tie leads to overtime. Q1 to Q2 transition. Buzzer-beater counts. Movement. Sprint is faster and drains stamina. Shoot press/release. Directional pass. Switch picks the defender nearest the ball. Auto-switch on possession change. Defensive jump. Restart is clean (0-0, Q1, full clock, tip-off). Same seed gives an identical match (determinism). **Five full AI-vs-AI matches** finish, with no NaN or out-of-arena positions, loose ball < 10.5 s, and no non-live phase > 10 s |
| `fouls.test.ts` (5) | FTs worth exactly 1, last FT live. Shooting foul on a missed 2 gives 2 FTs. Reach-in before the bonus gives a side inbound, in the bonus 2 FTs. Team fouls reset per quarter. No fouls on open shots |
| `human.test.ts` (4) | A full match with an idle human, and three full matches with a random button-mashing human, all through the real human-input path. Each reaches `final` with no stalls and a valid controlled player |

**Browser tests (Playwright, Chromium 1254, software GL): 11 passed / 0 failed**, run against
local `vite preview` **and against the production URL**:
smoke (menu, start, 10 players, clock runs, canvas actually renders, no console errors or failed
requests), keyboard controls (move, pass with visible flight, shoot), 2-pointer and 3-pointer
through the UI (scoreboard shows exactly 2/3, no double count, possession flips), clock expiry
shows the final screen and Play again gives a clean 0-0 Q1 state, pause/resume/restart and Tab
switch on defense, browser reload, AI offense shoots on its own, human free throws with the
meter, focus loss auto-pauses, runtime error shows the error screen.

An earlier run had one intermittent failure in the controls test. The cause was a legitimately
intercepted pass (the AI stole it). The test assumed every pass would be completed and now
accepts either outcome.

## 7. Manual validation performed

No human played the game; the agent worked autonomously. "Manual" validation was scripted-browser
play with real keyboard events and visual inspection of screenshots (`docs/screenshots/`):
- Menu, tip-off, live play, jump shot with meter, ball flight, follow camera, free-throw formation
  and the final box score were inspected visually at 1600×900, plus **1366×768 and 1920×1080**
  (HUD, scoreboard, menus and final screen fit without clipping).
- Real key presses: D moved the player screen-right about 5 m in 1.2 s, W moved screen-up, E
  passed with control following the receiver, Space hold and release shot the ball, Esc paused.
- Headless match statistics were reviewed for basketball plausibility while tuning. A typical
  2-minute-quarter match ends around 15–30 points per team, with 35–45% FG, 70–80% FT, 3–6 fouls,
  5–10 turnovers, a few blocks and dunks per team, and occasional overtime.
- Issues found this way and fixed: rolling friction that stopped loose balls dead; a timing bias
  too weak to make late releases miss; block and steal rates far too high (blocks were about a third
  of shots); AI over-passing; a shooter who lost the ball mid-gather could still release it; a
  human-controlled inbounder not walking to the spot; AI bigs never finishing drives.

## 8. Performance measurements and limitations

The build environment (WSL2, no GPU) can only render with **SwiftShader (CPU software
rasterizer)**, so the numbers below are a pessimistic lower bound, not typical-desktop performance.

| Metric (production URL, 1920×1080) | Low | Medium | High |
|---|---|---|---|
| FPS under SwiftShader (CPU rendering) | 24.6 | 29.4 | 31.0 |
| Draw calls / frame | 277 | 292 | 292 |
| Triangles / frame | 227k | 392k | 392k |
| Sim cost per 1/120 s step | 0.012 ms | 0.025 ms | 0.025 ms |
| JS heap | 14 MB | 14 MB | 20 MB |

- **Load:** 2.5 KB HTML, plus JS of 567 KB raw / 151 KB gzip, plus CSS of 6 KB. Menu interactive in
  0.7–1.7 s from a cold load over the network (court texture is generated at startup).
- **Memory (QUAL-005):** 20 consecutive match restarts showed a flat 276 geometries, 17 textures,
  9.5 MB heap and flat DOM size.
- **Safeguards:** an FPS overlay (`` ` `` or F3) shows FPS, draw calls and triangles. **Adaptive
  quality** drops High to Medium to Low automatically if a match runs below 32 FPS for 5 s.
  Low disables shadows and antialiasing and halves texture resolution.
- **Not measured:** FPS on real GPU hardware. Given ~290 draw calls and ~0.4M triangles, a 30+ FPS
  target should be easily met on hardware-accelerated desktops, but this is an expectation, not a
  measurement.

## 9. Known defects and reproduction steps

1. **A loose ball can come to rest on top of the rim or backboard.** It cannot be reached, and after
   10 s the watchdog awards it to the team that did not touch it last ("Ball reset"). Repro: rare;
   happens after a soft, high rim bounce.
2. **Near-sideline players can sit under the HUD panels** at the bottom of the broadcast view.
   Workaround: `H` hides the controls panel; `C` switches to the follow camera.
3. **Follow camera plus camera-relative controls:** "D/right" points toward the near sideline, so
   it is easy to step out of bounds (which is a turnover). This is intended rules behavior, but can
   surprise players.
4. **Players can briefly interpenetrate** when several converge on a loose ball. Separation resolves
   it within a few frames.
5. Auto-quality downgrade rebuilds the renderer, which causes a brief (~0.2–0.5 s) hitch.
6. Gamepad support is implemented against the standard mapping but **not tested with physical
   hardware**. Edge was not tested (the Chromium engine was).

## 10. How to run and play the game

See `README.md`. In short: `npm install && npm run dev` (or open the deployed URL), click
**START GAME**, and press Space at the top of the toss to win the tip. Move with WASD. Hold Space
and release in the green band of the meter to shoot. Press E to pass toward the direction you are
holding, F to steal, Tab to switch defenders, Shift to sprint (Shift+Space at the rim dunks), and
Esc to pause.

## 11. What I would build next with more time

1. Ball and player-body collisions, plus physically simulated hand contact for steals and
   deflections.
2. Pick-and-roll and screens, help-and-recover rotations, and switching on defense.
3. Substitutions with a bench, timeouts, and foul-outs.
4. Instant replay of made baskets from recorded sim snapshots (the deterministic sim makes this cheap).
5. Skinned, rigged player models with authored animation clips and blending.
6. Halftime side switch, plus traveling, backcourt and 3-second violations behind a "simulation rules" toggle.
7. Performance validation on a range of real GPUs, and instancing for the player rigs.

## 12. Requirement checklist

Legend: **PASS** implemented and verified · **PARTIAL** partly implemented or verified ·
**FAIL** not implemented · **NOT TESTED** implemented but not verified.

### Experiment rules
| ID | Status | Evidence / explanation |
|---|---|---|
| EXP-001 | PASS | Built in one autonomous session well within 8 hours (see timeline below) |
| EXP-002 | PASS | No human coding or intervention. Only the provided credentials were used |
| EXP-003 | PASS | All code, procedural assets, tests, config and docs created in this repo |
| EXP-004 | PASS | Only the provided spec, tools and credentials were used |
| EXP-005 | PASS | Assumptions and limitations in §2, §4, §9. External dependencies in `ASSETS.md` |
| EXP-006 | PASS | No canned sequences. Scores come only from ball/rim geometry (§2 decision 1, tests) |
| EXP-007 | PASS | Unit, E2E (local and production) and scripted visual validation (§6, §7) |
| EXP-008 | PASS | §2 "Key decisions" |

### Platform
| ID | Status | Evidence / explanation |
|---|---|---|
| PLAT-001 | PARTIAL | Runs in Chromium (Playwright Chromium 1254, the Chrome engine) without plugins. Branded Chrome/Edge on a real desktop not tested |
| PLAT-002 | PASS | three.js real-time 3D scene with perspective broadcast and follow cameras |
| PLAT-003 | PASS | Full keyboard control (gamepad optional) |
| PLAT-004 | PASS | Start menu with options and a START GAME button |
| PLAT-005 | PASS | `npm install`, `npm run build`, `npm run preview` / `npm run deploy` |
| PLAT-006 | PASS | https://bh-basketball-v1-claude.seemystuff.workers.dev (Cloudflare Workers). Not on the custom hostname, see §2 decision 4 |
| PLAT-007 | PASS | Loading spinner, error screen (E2E-tested), pause/resume (Esc, E2E-tested), restart (pause menu and final screen, E2E-tested) |
| PLAT-008 | PASS | Screenshots at 1366×768 and 1920×1080; compact CSS for heights ≤ 800 px |
| PLAT-009 | PARTIAL | Measured only under software rendering (25–31 FPS at 1080p). GPU FPS not measured. Adaptive quality and FPS overlay provided |
| PLAT-010 | PARTIAL | Low/Medium/High graphics option works. Gamepad implemented but not tested on hardware |

### Visuals and assets
| ID | Status | Evidence / explanation |
|---|---|---|
| VIS-001 | PASS | Full court with baskets 1.60 m in from each baseline |
| VIS-002 | PASS | Ball, backboards, rims, floor, sidelines, baselines, center circle, three-point lines visible (screenshots) |
| VIS-003 | PASS | 10 players: blue/white Herons vs red/gold Coyotes, numbers and names on jerseys |
| VIS-004 | PASS | Players ~1.95–2.1 m, rim 3.05 m, ball 0.239 m, all in one metric world |
| VIS-005 | PASS | Lanes, FT lines, FT circles, restricted arcs, hash marks, coaching-box ticks |
| VIS-006 | PASS | 28.65×15.24 m court, 3.048 m rim, 0.457 m rim, 0.239 m ball, 7.24 m arc / 6.71 m corner, 4.88 m lane, 5.79 m FT line (`src/sim/constants.ts`) |
| VIS-007 | PASS | PCF soft shadows (Med/High), PBR materials, hemisphere/directional lighting, ball blob shadow, floor rings |
| VIS-008 | PASS | Procedural run cycle, dribble arm tracking the ball, pass, jump-shot, layup/dunk, jump/block, steal swipe, defensive stance |
| VIS-009 | PASS | Only explicit resets teleport (period start, FT formation, ball into the inbounder's hands, inbounder after 4 s). §4 |
| VIS-010 | PARTIAL | Crowd (instanced, cheering), arena stands, benches, scorer's table, banners, synthesized audio, jersey numbers. No advanced VFX |
| ASSET-001 | PASS | All assets created by the agent |
| ASSET-002 | PASS | Procedural meshes and canvas textures |
| ASSET-003 | PASS | No external assets. three.js MIT license preserved |
| ASSET-004 | PASS | Fictional teams, league, names and logo. No NBA or commercial assets |
| ASSET-005 | PASS | `ASSETS.md` (no external assets, libraries listed) |
| ASSET-006 | PASS | Single coherent stylized look |
| ASSET-007 | PARTIAL | Jointed procedural rigs with smoothed pose blending. No skinned models |

### Match structure and game state
| ID | Status | Evidence / explanation |
|---|---|---|
| GAME-001 | PASS | 5 vs 5 |
| GAME-002 | PASS | Herons human, Coyotes AI |
| GAME-003 | PASS | 0-0, tip-off formation (unit and E2E restart tests) |
| GAME-004 | PASS | `Game` holds score, clock, possession, ball owner, controlled player |
| GAME-005 | PASS | 2/3 from release position (unit and E2E tests) |
| GAME-006 | PASS | Opponent baseline inbound after a make (tests) |
| GAME-007 | PASS | Final screen with score and box score (E2E) |
| GAME-008 | PASS | Four quarters, 1/2/3/5/12-minute options, default 2:00 |
| GAME-009 | PASS | 24 s, reset on possession change, 14 on offensive rebound off the rim, violation turnover (tests) |
| GAME-010 | PASS | Ball and ball-handler out of bounds, sideline and baseline inbounds (tests) |
| GAME-011 | PASS | Steals, blocks, misses, rebounds (tests) |
| GAME-012 | PASS | Possession arrows and label, game clock, shot clock |
| GAME-013 | PARTIAL | Fouls, free throws, bonus, overtime and stamina fatigue done. No substitutions or timeouts |

### Controls and camera
| ID | Status | Evidence / explanation |
|---|---|---|
| CTRL-001 | PASS | WASD/arrows, camera-relative (E2E) |
| CTRL-002 | PASS | Space hold/release (E2E) |
| CTRL-003 | PASS | E with direction-based target and preview marker (E2E) |
| CTRL-004 | PASS | Tab/Q on defense and loose balls, auto-switch on possession change (tests) |
| CTRL-005 | PASS | Smoothed broadcast camera tracks ball and controlled player. Follow camera optional |
| CTRL-006 | PASS | Timing meter. Early is short, late is long, error widens off the green band (tests show early/late misses) |
| CTRL-007 | PASS | Shift sprint, +38% speed, stamina drain and recovery (test) |
| CTRL-008 | PASS | Steal (F), jump/block (Space), contest effect on shot accuracy |
| CTRL-009 | PASS | Controls panel (H), menu reference, yellow ring and arrow on the controlled player |
| CTRL-010 | PASS | Auto-switch to the ball-handler or nearest defender, smoothed camera, "OFFENSE/DEFENSE" label and toasts |
| CTRL-011 | PARTIAL | Follow camera, gamepad and dunks. No rebinding |

### Ball, collisions and shooting
| ID | Status | Evidence / explanation |
|---|---|---|
| BALL-001 | PASS | Ball has its own position and velocity, integrated every sub-step |
| BALL-002 | PASS | Ballistic flight with gravity (screenshots, tests) |
| BALL-003 | PASS | Rim-plane crossing inside the ring while live (geometry tests) |
| BALL-004 | PASS | Misses become loose balls and rebounds (tests) |
| BALL-005 | PASS | Passes are ballistic flights with receiver lead (test asserts ball travel) |
| BALL-006 | PASS | Gravity, floor restitution 0.78, friction, rolling |
| BALL-007 | PASS | Torus rim and box backboard collisions with restitution and net shake |
| BALL-008 | PASS | Speed-dependent dribble, knocked loose on steals |
| BALL-009 | PASS | Loose-ball recovery, interceptions, steals (tests) |
| BALL-010 | PASS | One score per shot, rejected when play is stopped or after the buzzer (tests) |
| BALL-011 | PARTIAL | Visual backspin and roll, animated net. Bank shots happen physically but are not deliberately aimed. Spin does not affect bounces |

### AI
| ID | Status | Evidence / explanation |
|---|---|---|
| AI-001 | PASS | All AI players continuously steer |
| AI-002 | PASS | AI gains possession, advances and scores (E2E and headless matches) |
| AI-003 | PASS | AI clamped 0.3 m inside the lines. Headless tests assert positions stay in the arena |
| AI-004 | PASS | Utility-based pass, shoot and drive. Role spots, spacing, cuts |
| AI-005 | PASS | Man-to-man, help sag, close-outs, contest jumps, steals, box-outs |
| AI-006 | PASS | Teammates space, cut and crash boards around the human ball-handler |
| AI-007 | PASS | Two nearest per team chase loose balls (predicted landing point), rebound jumps, defensive re-matching on possession change |
| AI-008 | PASS | Decisions use shot clock, game clock, openness, lane risk, positions |
| AI-009 | PARTIAL | Cuts, drives, difficulty levels. No pick-and-roll or play-calling |

### UI
| ID | Status | Evidence / explanation |
|---|---|---|
| UI-001 | PASS | Scoreboard and clock |
| UI-002 | PASS | Menu, pause-menu restart, final screen with Play again / Main menu |
| UI-003 | PASS | Possession arrows and label |
| UI-004 | PASS | Quarter, shot clock (red under 5 s), player panel with stamina |
| UI-005 | PASS | Toasts for scores, misses, air balls, blocks, steals, interceptions, turnovers, rebounds, fouls |
| UI-006 | PASS | Controls overlay (H) and pause menu |
| UI-007 | PARTIAL | Sound effects, box score and top scorers. No replay, music or commentary |

### Quality
| ID | Status | Evidence / explanation |
|---|---|---|
| QUAL-001 | PASS | No console errors in E2E runs. Full headless matches complete |
| QUAL-002 | PASS | Watchdogs (loose ball > 10 s, stuck inbounds or dead balls), human-robustness tests |
| QUAL-003 | PASS | Production E2E smoke asserts no failed requests. No external assets |
| QUAL-004 | PASS | Blur/visibility auto-pause (E2E), audio suspended while paused |
| QUAL-005 | PASS | 20-restart check: flat geometry, texture and heap counts. Old renderer disposed with context released |
| QUAL-006 | PASS | No secrets in client or repo (`cloudflare.env` and `.dev.vars` git-ignored) |
| QUAL-007 | PASS | No runtime network dependencies (`ASSETS.md`) |
| QUAL-008 | PASS | FPS, draw-call and triangle overlay, adaptive-quality telemetry |

### Testing
| ID | Status | Evidence / explanation |
|---|---|---|
| TEST-001 | PASS | Build plus Playwright smoke test |
| TEST-002 | PASS | Made 2, made 3, corner 3, misses, no double count |
| TEST-003 | PASS | Made basket, steal, interception, OOB, shot clock, rebounds |
| TEST-004 | PASS | Clock expiry to final (unit and E2E), overtime, quarter transition |
| TEST-005 | PASS | Switching, move, sprint, pass, shoot, jump (unit and E2E) |
| TEST-006 | PASS | Reload and full restart (E2E) |
| TEST-007 | PASS | Full E2E suite run against the production URL |
| TEST-008 | PASS | Seeded determinism test and headless full matches |

### Deliverables
| ID | Status | Evidence / explanation |
|---|---|---|
| DEL-001 | PASS | This repository |
| DEL-002 | PASS | `README.md` |
| DEL-003 | PASS | This report |
| DEL-004 | PASS | `npm install && npm run build && npm run preview` |
| DEL-005 | PASS | URL above. Deploy instructions in the README |
| DEL-006 | PASS | `ASSETS.md` |
| DEL-007 | PASS | This checklist |
| DEL-008 | PASS | §6, §8, §9 |
| DEL-009 | PASS | `docs/screenshots/` (8 images) |

## Timeline / evidence capture (spec §13.4)

Session start 01:04 (local time, 2026-11-08). Times are from commits and logs.

| Milestone | Time |
|---|---|
| Simulation core: first headless match with AI scoring and a complete 4-quarter match | ~01:13 |
| First successful 3D render (court, 10 players, hoops, HUD) | ~01:24 |
| First controllable player and first pass via real keyboard input | ~01:26 |
| First successful basket via the UI and first full match in the browser (E2E) | ~01:33 |
| First production deployment | 01:31 |
| Fouls and free throws | 01:43 |
| Dunks, docs | ~02:00 |
