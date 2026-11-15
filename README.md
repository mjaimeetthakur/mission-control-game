# Mission Control

**Every decision shapes the mission.** An interactive space mission engineering game built for a hackathon demonstration. Design a spacecraft, balance mass, cost and power, choose a destination-capable launcher, plan a simplified trajectory, manage anomalies, and review the flight.

## Open the game

Open `offline/Mission Control.html` in Chrome or Edge to play the self-contained edition. The standalone build embeds its scripts, textures and styles. To regenerate it from source, run `npm run build:offline`.

The orbital interface takes inspiration from [NASA’s Eyes](https://science.nasa.gov/eyes/). Visual credits are in [ASSETS.md](ASSETS.md).

## Run locally

Use **Node.js 26**, the version used to build and verify this project. The optional API uses built-in `node:sqlite`.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.

```sh
npm test       # Physics, simulation, persistence, PDF and REST integration tests
npm run lint  # ESLint / TypeScript source rules
npm run build # Strict TypeScript validation and Vite production build
npm run preview
```

No API key, paid service, external scientific data request, or backend is required for gameplay. Scientific references and all fictional component assumptions are bundled. `SOURCES.md` documents the model and authoritative reference links.

## Play

1. Choose **Pale Blue Dot**, the recommended Earth-orbit mission, or a Moon, Mars or asteroid scenario.
2. Review the mission objective, budget, constraints and simplified opportunity window.
3. Configure the bus, instruments, arrays, battery, engine, antenna, computer, thermal control, attitude system, frame and redundancy. Fuel is specified separately in kilograms.
4. Watch the engineering budget and read blocking issues before approving a design.
5. Choose a launcher using its **destination-specific** payload capacity. Adjust altitude and inclination, which alter the delta-v requirement.
6. Start the flight. Pause or change speed while the deterministic engine tracks fuel, battery, data, temperature and health.
7. Resolve anomalies. The choices change real resources and can affect the outcome.
8. Review the report, export a real PDF, compare saved designs, and redesign or replay.

## Storage and offline mode

The default browser application uses validated `localStorage`, under `mission-control.workspace.v1`. It retains the active design, simulation, up to 12 saved designs and up to 20 reports on the current browser/device. It is **not cloud sync**. Clearing browser storage removes these records. Corrupt or incompatible saved content falls back to an empty workspace; failed writes return `false` so the interface can report that saving did not succeed.

The same deterministic engine is available through `src/services/localAdapter.ts`. These methods are local function calls, not fake HTTP endpoints. The static hosted site uses this offline storage model. An optional separate REST API is included for local development; the frontend does not claim to connect to it automatically.

## Optional REST API

```sh
npm run server
```

The server listens only on `127.0.0.1:3001` by default. It stores parameterized SQLite records in `.data/mission-control.sqlite`. Set `PORT` or `DATABASE_PATH` to override these defaults; `.env.example` lists the settings. Export environment variables in your shell; this server does not load `.env` automatically.

This is a local, single-user API without authentication. Keep its loopback binding. A network-hosted backend would require authentication, ownership controls, rate limiting and a deployment-specific database service.

Base URL: `http://127.0.0.1:3001/api/v1`. OpenAPI 3.1 documentation: `openapi.json`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Version and SQLite health |
| GET | `/missions`, `/missions/:id` | Scenario reference data |
| GET | `/components`, `/launch-vehicles` | Versioned teaching catalog |
| POST | `/designs` | Create from a scenario and optional overrides |
| GET / PATCH | `/designs/:id` | Read or update a stored design |
| POST | `/designs/:id/validate` | Central engineering checks and budget |
| POST | `/simulations` | Create from a validated stored design |
| GET | `/simulations/:id` | Current authoritative state |
| POST | `/simulations/:id/actions` | Start, pause, resume, resolve, or restart |
| POST | `/simulations/:id/advance` | Advance 1-180 deterministic ticks |
| GET | `/simulations/:id/events` | Event history |
| GET | `/simulations/:id/report` | Current JSON report |
| GET | `/simulations/:id/report.pdf` | Real PDF report |

Example requests:

```sh
curl -X POST http://127.0.0.1:3001/api/v1/designs \
  -H 'Content-Type: application/json' \
  -d '{"missionId":"earth","name":"First light"}'
```

Then create a simulation with `{"designId":"<returned-design-id>"}`. Start it with `{"type":"start","actionId":"start-001"}` at its `/actions` route. Advance using `{"ticks":20,"actionId":"advance-001"}` at `/advance`. Every mutating simulation request needs a distinct action ID; repeating an already applied ID does not repeat the mutation. An anomaly pauses progression. Resolve using `{"type":"resolve","actionId":"resolve-001","optionId":"<option-from-state>"}`; the engine resumes after a valid resolution. A failed mission can only be restarted, not resumed.

Requests are validated with Zod, unknown request properties rejected, bodies capped at 64 KB, and database queries parameterized. Errors use `{ "error": { "code", "message", "details" } }` with 400 (request), 404 (missing resource), 409 (invalid transition), 413 (size limit), or 422 (engineering infeasibility). The report endpoints also support an in-progress snapshot; its status remains explicit.

## Architecture

- `src/core/types.ts`: shared typed mission, component, design, budget, state and report models.
- `src/core/data.ts`: four scenario definitions, modular hardware and launcher catalog, starter configurations.
- `src/core/engineering.ts`: SI-based physics, engineering budgets and centralized validation.
- `src/core/simulation.ts`: immutable seeded state machine, anomalies, operational resources and scoring.
- `src/components/`: interactive 3D scenes and resilient visual fallbacks.
- `src/services/`: runtime validation, offline persistence, action adapter and PDF generation.
- `server/`: optional Express 5 REST API and SQLite storage.
- `tests/`: independent engineering and service tests.

The numerical engine is independent of the rendering loop. The 3D view and budgets use the same selected design. A seed and exact initial design reproduce numerical events and resource outcomes. IDs and creation timestamps identify records and are not part of the physical model.

## Modeling limits

This game teaches system trade-offs; it is not a flight-qualified simulator. Launch vehicles and components are fictional teaching assumptions. Generic launch names are not claims about actual historical vehicles. Payload limits depend on the selected destination. The launcher supplies injection energy, while the spacecraft pays the modeled arrival, trim and correction maneuvers.

Two-body circular orbits, vis-viva, Hohmann estimates and the rocket equation use consistent SI units. Interplanetary geometry, inclination penalties, contact windows, radiation effects, reliability and thermal behavior are simplified. Mission days are compressed across a finite number of ticks; operational battery/data calculations use a representative timestep rather than integrating every second of the full calendar mission. The score weights are science 30%, engineering 25%, efficiency 20%, decisions 15% and reliability 10%; critical failure limits the final score. See `SOURCES.md` for exact assumptions.

The 3D scene is illustrative; rendered distances and spacecraft sizes are not to scale. WebGL availability depends on the device; essential controls and numerical information remain accessible independently of the scene. No NASA affiliation or endorsement is claimed.

## Deployment

`npm run build` creates the static application in `dist/`. It can be served from a static host. Sites publishing uses the project identity in `.openai/hosting.json`; the identity and audience should be preserved on subsequent updates. This build does not deploy the optional SQLite server, and browser records remain local to the visitor's device. Never bundle `.data/`, secrets or local environment files in deployment archives.

For a standalone static host, publish the contents of `dist/`; all interactive state resides in the client and there is no client-side API key to configure.
