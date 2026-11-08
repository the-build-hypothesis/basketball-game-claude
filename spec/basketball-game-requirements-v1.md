# The Build Hypothesis — Browser Basketball Game
## Requirements Specification v1.0

**Experiment:** Claude Code vs. Cursor CLI vs. Codex  
**Time budget:** Eight hours per agent  
**Deliverable:** A playable, browser-based, 3D basketball game  
**Status:** Experiment-ready specification  

---

## 1. Objective

Build a self-contained, playable **3D, five-on-five basketball game** that runs in a modern desktop browser. The game must feature a full basketball court, two baskets, ten players, an interactive ball, basketball rules, an AI-controlled opposing team, and a complete match loop. The goal is an actual playable game, not a static scene, scripted animation, or non-interactive prototype.

The eight-hour limit is a hard experiment constraint, **not a guarantee that all requirements are feasible**. Agents must prioritize a working core game, document omissions, and avoid claiming unimplemented features work.

### 1.1 Success definition

A human player can open the deployed URL, start a game, control a basketball team, move and pass the ball, attempt shots, score baskets, defend against an AI opponent, see possession change, and finish a timed game with a final score.

### 1.2 Priority definitions

- **P0 — Critical:** Necessary for a valid playable submission. Implement first.
- **P1 — Required target:** Expected functionality after P0. Incomplete P1 items reduce evaluation score.
- **P2 — Stretch:** Nice-to-have functionality; never prioritize over a broken P0 or P1.

No requirement may be silently simulated or represented by a nonfunctional control.

---

## 2. Experiment rules and agent autonomy

**EXP-001 [P0]** Work autonomously for a maximum of eight hours of elapsed development time.  
**EXP-002 [P0]** No human coding, asset preparation, debugging, or manual intervention beyond initial setup, required credentials, and unavoidable permission approvals.  
**EXP-003 [P0]** Create all game code, scenes, assets, tests, configuration, and documentation needed for the submission.  
**EXP-004 [P0]** Use the same requirements, time limit, resource access, and provided credentials as competing agents.  
**EXP-005 [P0]** Track meaningful assumptions, known limitations, unfinished requirements, and external dependencies.  
**EXP-006 [P0]** Do not hardcode a successful demonstration or substitute a video, canned sequence, or scripted score changes for real gameplay.  
**EXP-007 [P1]** Run the application and validate important flows before completion.  
**EXP-008 [P1]** Keep a concise record of major implementation choices and their rationale.

The agent may choose any browser-compatible framework, engine, rendering stack, physics library, animation system, and build tooling. Avoid requiring a particular engine merely to make the solutions look alike.

---

## 3. Platform, rendering, and deployment

**PLAT-001 [P0]** Game must run in a current desktop version of Chrome or Edge without browser plugins.  
**PLAT-002 [P0]** Gameplay must be rendered as a navigable real-time **3D** scene; a flat 2D representation does not meet the requirement.  
**PLAT-003 [P0]** The game must accept keyboard input; mouse input may supplement it.  
**PLAT-004 [P0]** Provide a start menu and a clear way to begin a match.  
**PLAT-005 [P0]** Build and serve the game through reproducible commands.  
**PLAT-006 [P1]** Deploy the game to a publicly reachable HTTPS URL. Cloudflare Workers/Pages is preferred where compatible with the chosen architecture.  
**PLAT-007 [P1]** Provide loading, error, pause, resume, and restart states.  
**PLAT-008 [P1]** Support 1920×1080 and 1366×768 desktop viewports without clipping critical UI.  
**PLAT-009 [P1]** Aim for a stable 30 FPS or better on a typical desktop with hardware acceleration; measure actual performance rather than asserting it.  
**PLAT-010 [P2]** Offer adjustable graphics quality and gamepad support.

A client-only implementation is acceptable. Backend services, user accounts, persistent online profiles, and multiplayer servers are not required.

---

## 4. Court, arena, and visual assets

**VIS-001 [P0]** Render a full court with two correctly positioned baskets.  
**VIS-002 [P0]** Include a visible basketball, backboards, rims, floor, sidelines, baselines, center circle, and three-point lines.  
**VIS-003 [P0]** Render ten distinct player entities, five per team, clearly differentiated by uniform colors.  
**VIS-004 [P0]** Make the court, hoops, ball, and players visible and correctly scaled relative to one another.  
**VIS-005 [P1]** Include free-throw lanes, free-throw lines, and reasonable court markings.  
**VIS-006 [P1]** Use plausible basketball dimensions as a reference: 94×50-foot court, 10-foot rim height, approximately 9.4-inch ball diameter. Other court markings should be internally consistent.  
**VIS-007 [P1]** Include shadows, materials, lighting, and enough depth cues to judge player and ball positions.  
**VIS-008 [P1]** Animate movement, dribbling, passing, shooting, jumping, and basic defensive actions.  
**VIS-009 [P1]** Avoid visual teleportation of players or ball except during explicit possession resets or inbound transitions.  
**VIS-010 [P2]** Add crowd, arena environment, benches, audio, jersey numbers, and improved visual effects.

### 4.1 Asset acquisition and licensing

**ASSET-001 [P0]** The agent is responsible for creating or sourcing all assets. No game-ready artwork is supplied.  
**ASSET-002 [P0]** Procedural meshes, authored SVG/Canvas textures, generated art, and externally sourced models/animations are permitted.  
**ASSET-003 [P0]** Any externally sourced assets must have licenses permitting their use and redistribution in the submitted project; preserve attribution and license notices where required.  
**ASSET-004 [P0]** Do not use unauthorized NBA branding, real player likenesses, copyrighted team logos, or ripped commercial game assets. Use fictional teams and original or appropriately licensed materials.  
**ASSET-005 [P1]** Record each external asset's source URL, license, and purpose in `ASSETS.md`.  
**ASSET-006 [P1]** Prefer coherent stylized art over a mixture of visually incompatible assets.  
**ASSET-007 [P2]** Generate improved player models, rigging, and animation blends if time permits.

The agent may use Blender scripts, modeling tools, public asset libraries, and available image/3D-generation APIs **only when those tools and credentials are actually accessible**. Do not assume external AI asset generation is available.

---

## 5. Match structure and game state

**GAME-001 [P0]** A match contains two teams of five active players.  
**GAME-002 [P0]** One team is human-controlled and the opposing team is AI-controlled.  
**GAME-003 [P0]** Start a new game with both teams in appropriate court positions and the score at 0–0.  
**GAME-004 [P0]** Maintain authoritative game state for score, clock, team possession, ball owner, and active controlled player.  
**GAME-005 [P0]** Award two or three points based on the shooter's position when a valid field goal is made.  
**GAME-006 [P0]** After a made basket, give the opposing team possession and restart play appropriately.  
**GAME-007 [P0]** End the game when the configured match clock expires and display the final score.  
**GAME-008 [P1]** Implement four configurable quarters, with a default shortened duration suitable for testing (e.g., two minutes each).  
**GAME-009 [P1]** Implement a shot clock and reset it on relevant possession changes.  
**GAME-010 [P1]** Handle out-of-bounds and basic inbound resets.  
**GAME-011 [P1]** Support steals, blocked shots, missed shots, and rebounds.  
**GAME-012 [P1]** Provide a clear possession indicator and game clock.  
**GAME-013 [P2]** Add fouls, free throws, substitutions, fatigue, timeouts, overtime, and deeper basketball rules.

### 5.1 Simplifications

The target is an arcade/simulation hybrid, not full professional-league rules fidelity. Advanced violations (three seconds, backcourt, illegal defense, traveling, detailed foul adjudication) are P2 unless explicitly included above. Simplifications must be disclosed in the build report. The game must not silently award points on shot-button presses without checking whether a valid basket occurred.

---

## 6. Player controls and camera

**CTRL-001 [P0]** Allow the user to move the currently controlled player in two dimensions on the court.  
**CTRL-002 [P0]** Allow the user to attempt a shot when their team possesses the ball.  
**CTRL-003 [P0]** Allow the user to pass to a teammate.  
**CTRL-004 [P0]** Allow the user to switch the controlled player, including on defense.  
**CTRL-005 [P0]** Keep the ball and relevant play visible through a usable camera system.  
**CTRL-006 [P1]** Support a shot timing, aim, or power mechanic that meaningfully affects success.  
**CTRL-007 [P1]** Implement a sprint action with sensible movement limits.  
**CTRL-008 [P1]** Provide a defensive action such as contesting, blocking, or attempting a steal.  
**CTRL-009 [P1]** Show an on-screen controls reference and distinguish the controlled player visually.  
**CTRL-010 [P1]** Ensure camera transitions and controls remain understandable when possession changes.  
**CTRL-011 [P2]** Add alternative camera modes, controller support, advanced moves, and configurable bindings.

Suggested controls, subject to agent choice: WASD move; Space shoot; E pass; Tab switch player; Shift sprint; F defend/steal; Esc pause. Document the actual bindings.

---

## 7. Ball movement, collisions, and shooting

**BALL-001 [P0]** Represent the ball as an object with an independently updated position in 3D space.  
**BALL-002 [P0]** On a shot, move the ball through a visible trajectory toward the basket.  
**BALL-003 [P0]** Determine made baskets using ball/basket geometry and game-state conditions, not a pre-scripted score event.  
**BALL-004 [P0]** Support missed shots and ball recovery.  
**BALL-005 [P0]** Passes must visibly move the ball from one player to another.  
**BALL-006 [P1]** Model gravity, floor bounces, and plausible ball velocity.  
**BALL-007 [P1]** Detect interactions with rim and backboard and respond with visible ball motion.  
**BALL-008 [P1]** Implement possession attachment/dribbling so the ball tracks the ballhandler without becoming permanently glued to the player.  
**BALL-009 [P1]** Allow loose-ball recovery and defensive interceptions or steals.  
**BALL-010 [P1]** Prevent duplicate scoring on a single shot and reject scoring when play is stopped.  
**BALL-011 [P2]** Add spin, advanced collision resolution, realistic net motion, and bank shots.

A custom lightweight physics implementation or an established physics engine is acceptable. Physical fidelity is scored separately from basic functionality.

---

## 8. AI opponent and teammate behavior

**AI-001 [P0]** AI-controlled players move around the court rather than standing motionless.  
**AI-002 [P0]** The AI opponent can gain possession, advance the ball, and attempt to score.  
**AI-003 [P0]** AI players respect court boundaries and avoid grossly invalid positioning.  
**AI-004 [P1]** AI offense includes passing, spacing, and choosing when to shoot.  
**AI-005 [P1]** AI defense attempts to guard players and contest shots.  
**AI-006 [P1]** AI teammates support the human ballhandler by moving into useful positions.  
**AI-007 [P1]** AI players react to rebounds, loose balls, and changes of possession.  
**AI-008 [P1]** AI decisions should depend on game state rather than fixed timers alone.  
**AI-009 [P2]** Add pick-and-rolls, cuts, defensive switching, playcalling, difficulty settings, and team strategies.

**Runtime LLMs are not required.** Traditional finite-state machines, utility scoring, steering behaviors, pathfinding, and heuristics are all acceptable. Avoid external inference latency in frame-critical gameplay.

---

## 9. Interface and game presentation

**UI-001 [P0]** Display scores for both teams and a readable game clock.  
**UI-002 [P0]** Show a start/restart path and a final result screen.  
**UI-003 [P0]** Show which team currently has possession.  
**UI-004 [P1]** Display quarter, shot clock, and active player indicator.  
**UI-005 [P1]** Show brief feedback for baskets, misses, turnovers, and possession changes.  
**UI-006 [P1]** Include an accessible controls overlay and pause menu.  
**UI-007 [P2]** Add instant replay, shot charts, player statistics, sound effects, music, and commentary.

---

## 10. Reliability, performance, and security

**QUAL-001 [P0]** No blocking runtime errors during a normal start-to-finish match.  
**QUAL-002 [P0]** A match must not become permanently stuck because of an unreachable ball, invalid possession, or broken state transition.  
**QUAL-003 [P0]** All shipped assets must load successfully from the deployed environment.  
**QUAL-004 [P1]** Handle lost browser focus and pause/restart gracefully.  
**QUAL-005 [P1]** Avoid unbounded entity creation and obvious memory leaks during repeated matches.  
**QUAL-006 [P1]** Keep any credentials out of client bundles and source control.  
**QUAL-007 [P1]** Document any external runtime service or network dependency.  
**QUAL-008 [P2]** Provide automated performance telemetry or debug overlays.

---

## 11. Testing requirements

**TEST-001 [P0]** Provide at least one automated smoke test or scripted verification that the application builds and launches.  
**TEST-002 [P1]** Test shot scoring: made two-pointer, made three-pointer, miss, and no double-counting.  
**TEST-003 [P1]** Test possession changes after made baskets, turnovers, and rebounds.  
**TEST-004 [P1]** Test match clock expiration and final-score display.  
**TEST-005 [P1]** Test player switching and basic controls.  
**TEST-006 [P1]** Test the game after a browser reload and after a full restart.  
**TEST-007 [P1]** Validate the production deployment, not just the local development server.  
**TEST-008 [P2]** Add deterministic game-state tests using fixed seeds and headless simulations.

Automated tests should validate game logic where possible; visual and human-play tests remain necessary.

---

## 12. Deliverables

**DEL-001 [P0]** Complete source code in the assigned repository.  
**DEL-002 [P0]** A `README.md` with prerequisites, install, run, build, and test commands.  
**DEL-003 [P0]** A `BUILD_REPORT.md` honestly documenting what was built, what works, what does not, and any deviations from the requirements.  
**DEL-004 [P0]** A working local build and reproducible startup procedure.  
**DEL-005 [P1]** A publicly accessible deployed URL and deployment instructions.  
**DEL-006 [P1]** An `ASSETS.md` manifest with source, attribution, and license information for external assets.  
**DEL-007 [P1]** A requirement checklist mapping each numbered requirement to `PASS`, `PARTIAL`, `FAIL`, or `NOT TESTED`, with evidence or explanation.  
**DEL-008 [P1]** Test results, known bugs, and performance observations.  
**DEL-009 [P2]** Short gameplay capture or screenshots showing major features.

### 12.1 Required build report outline

1. Executive summary and deployed URL
2. Technology stack and architecture
3. Implemented features by requirement ID
4. Missing or partially implemented features
5. Asset generation and sourcing approach
6. Automated tests and their results
7. Manual validation performed
8. Performance measurements and limitations
9. Known defects and reproduction steps
10. How to run and play the game
11. What the agent would build next with more time

---

## 13. Standardized post-build evaluation

The evaluator, not the building agent, conducts the final assessment. Do not provide hidden test cases to the building agents. Use the same hardware, browser, test duration, and scoring rubric for each submission.

### 13.1 Scoring rubric (100 points)

| Category | Points | Evaluation focus |
|---|---:|---|
| Gameplay and controls | 30 | Playability, responsiveness, passing, shooting, switching, match completion |
| Basketball rules and AI | 25 | Scoring, possession, clocks, offensive and defensive behavior |
| Physics and ball interactions | 20 | Real ball trajectories, collisions, rebounds, believable outcomes |
| Graphics and animation | 15 | Court and player quality, clarity, animation, presentation |
| Completeness and stability | 10 | Reliability, deployability, documented functionality, repeatable tests |
| **Total** | **100** | |

**Eligibility gate:** A submission that cannot launch or cannot demonstrate interactive ball movement and scoring is classified as an incomplete game, even if its graphics are impressive. Report both numeric score and eligibility status; do not automatically assign a fabricated zero for all other categories.

### 13.2 Manual test script

1. Open the deployed URL in a fresh browser session.
2. Start a match and confirm ten players, two hoops, ball, scoreboard, and court are visible.
3. Move a controlled player around the court and attempt to cross the half-court line.
4. Pass the ball to a teammate and confirm visible ball travel.
5. Attempt a short-range shot, a three-point shot, and a deliberately poor shot.
6. Verify scoring occurs only for valid baskets and correct point values are awarded.
7. Observe AI offense for at least two possessions; record whether it advances, passes, and shoots.
8. Switch controlled players and attempt to defend an AI possession.
9. Observe a missed shot and confirm a rebound or recoverable loose ball.
10. Trigger or observe a possession change and verify UI/game state update.
11. Allow the match to end and confirm final score and restart capability.
12. Restart the game and verify it begins in a clean state.
13. Inspect console errors, network failures, and gameplay stability.
14. Review asset licenses, README, build report, and requirement checklist.
15. Record frame rate, load time, and any critical failures on the test machine.

### 13.3 Objective checks

- **Two-pointer:** A valid made shot from inside the arc adds exactly two points.
- **Three-pointer:** A valid made shot from beyond the arc adds exactly three points.
- **Miss:** A ball that does not pass through the basket does not score.
- **No duplicates:** A single basket cannot score twice.
- **Clock:** The game stops at the end of the configured match duration.
- **Possession:** A made basket gives the other team possession.
- **Restart:** A new game resets score, clock, and possession state.
- **Asset integrity:** No missing models, broken textures, or license violations.

### 13.4 Evidence capture for the episode

Record first successful render, first controllable player, first pass, first successful basket, first AI score, first complete match, and any significant failures or autonomy interruptions. These timestamps help compare the agents' progress and produce the episode edit.

---

## 14. Implementation priorities for the eight-hour limit

This is **recommended prioritization**, not an instruction to use identical architectures:

1. Get a 3D court, hoops, ball, and ten visible players rendering.
2. Implement a controllable player, camera, basic ball possession, and shot attempts.
3. Implement genuine scoring, game state, clock, and match restart.
4. Add passing, player switching, and AI offense.
5. Add rebounds, AI defense, ball collisions, and rules.
6. Improve animations, visual quality, UX, tests, and deployment.

At all times, preserve a runnable build. A smaller complete game is preferable to an elaborate scene that cannot be played.

---

## 15. Explicit non-goals

The following are not required for v1.0: real NBA teams or players; photorealistic characters; online multiplayer; user registration; microtransactions; full franchise or career modes; detailed league rule enforcement; voice commentary; motion capture; a backend database; mobile touch controls; real-money transactions; production-grade anti-cheat.

---

## 16. Submission checklist

- [ ] Game builds and runs locally
- [ ] Public HTTPS deployment verified (or documented blocker)
- [ ] Full 3D court and two hoops render
- [ ] Ten players and ball visible
- [ ] Human movement and player switching work
- [ ] Passes and shots work
- [ ] Ball follows a real trajectory
- [ ] Two- and three-point scoring works
- [ ] AI team can move and attempt to score
- [ ] Possession and clock update correctly
- [ ] Match can end and restart
- [ ] No blocking runtime errors in core match flow
- [ ] Automated tests run with results recorded
- [ ] Asset sources and licenses documented
- [ ] README and BUILD_REPORT completed
- [ ] Requirement-by-requirement status included

---

**End of specification v1.0**
