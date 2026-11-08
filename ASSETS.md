# Asset manifest

**Summary: this project ships no external art, model, texture, audio, or font files.** Every visual
and audio asset is generated procedurally at runtime by code in this repository, written for this
project. There is therefore nothing requiring third-party attribution beyond the code libraries below.

## Procedurally generated assets (original, created for this project)

| Asset | How it is made | Source |
|---|---|---|
| Hardwood court floor, all court markings, painted keys, center logo, baseline team names | Drawn on an HTML Canvas at runtime (plank pattern, grain, lines at regulation dimensions) and used as a texture | `src/render/textures.ts` (`makeCourtTexture`) |
| Basketball texture (pebbled orange with seams) | Canvas-drawn | `src/render/textures.ts` (`makeBallTexture`) |
| Jerseys with numbers and names | Canvas-drawn per player | `src/render/textures.ts` (`makeJerseyTexture`) |
| Backboard markings, banners, scorer's table sign | Canvas-drawn | `src/render/textures.ts` |
| Players (10 rigs: legs/knees, arms/elbows, torso, head, hair, shoes) | Three.js primitive geometry (cylinders, spheres, boxes) assembled into a hierarchical rig, animated procedurally | `src/render/players.ts` |
| Hoops: rim (torus), glass backboard, support, padding | Three.js primitives | `src/render/scene.ts` |
| Nets (diamond mesh, swish/rim-shake animation) | Procedural line geometry with per-vertex animation | `src/render/scene.ts` (`buildNet`) |
| Arena: stands, crowd (instanced), benches, scorer's table | Three.js primitives / InstancedMesh | `src/render/scene.ts` |
| Sound effects (dribble, rim, backboard, swish, buzzer, whistle, crowd) | Synthesized with the Web Audio API (oscillators + filtered noise); no audio files | `src/ui/audio.ts` |
| Favicon | Inline SVG data URI | `index.html` |
| Fonts | System font stack only (Segoe UI / system-ui / Arial); no web fonts downloaded | `src/ui/style.css` |

## Names and branding

- Teams **"Harbor City Herons"** and **"Mesa Ridge Coyotes"**, the **"Fastbreak League" / "FB5"** logo,
  the game title **"Fastbreak Five"** and all player names are fictional and were invented for this project.
- No NBA (or other league) branding, real team logos, real player names or likenesses, or assets from
  commercial games are used.

## Third-party code libraries

| Library | Version | License | Purpose | Source |
|---|---|---|---|---|
| three.js | 0.170.0 | MIT | WebGL rendering (bundled into the client) | https://github.com/mrdoob/three.js |
| Vite | 6.0.3 | MIT | Dev server / bundler (build-time only) | https://github.com/vitejs/vite |
| TypeScript | 5.6.3 | Apache-2.0 | Type checking (build-time only) | https://github.com/microsoft/TypeScript |
| Vitest | 2.1.8 | MIT | Unit tests (dev only) | https://github.com/vitest-dev/vitest |
| Playwright | 1.65.0 | Apache-2.0 | Browser tests (dev only) | https://github.com/microsoft/playwright |
| Wrangler | 4.x | MIT OR Apache-2.0 | Cloudflare deployment (dev only) | https://github.com/cloudflare/workers-sdk |

Only three.js ships in the client bundle; its MIT license permits use and redistribution. Its license
notice is preserved in `node_modules/three/LICENSE`, and the bundle keeps three.js's copyright banner.

## External runtime services

None. The deployed game is a static bundle with no network calls after load (no CDNs, analytics,
fonts, or APIs).
