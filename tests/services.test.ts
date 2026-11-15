import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createDesign } from "../src/core/data";
import { createSimulation, generateReport } from "../src/core/simulation";
import type { SimulationState, SpacecraftDesign } from "../src/core/types";
import {
  loadWorkspace,
  saveWorkspace,
  STORAGE_KEY,
} from "../src/services/persistence";
import { actionSchema, designSchema } from "../src/services/schema";
import {
  applySimulationAction,
  applySimulationAdvance,
} from "../src/services/actions";
import { buildReportPdf } from "../src/services/report";
import { createApp } from "../server/app";

let memory: Map<string, string>;
beforeEach(() => {
  memory = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
});
describe("defensive offline persistence", () => {
  it("restores designs and simulation snapshots exactly", () => {
    const design = createDesign("earth"),
      simulation = createSimulation(design);
    const data = {
      design,
      simulation,
      savedDesigns: [design],
      reports: [generateReport(simulation)],
    };
    expect(saveWorkspace(data)).toBe(true);
    expect(loadWorkspace()).toEqual(data);
  });
  it("recovers from invalid JSON and invalid shapes without crashing", () => {
    memory.set(STORAGE_KEY, "{broken");
    expect(loadWorkspace().design).toBeNull();
    memory.set(STORAGE_KEY, JSON.stringify({ design: { name: "broken" } }));
    expect(loadWorkspace().savedDesigns).toEqual([]);
  });
  it("reports storage failure instead of claiming success", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error("Quota exceeded");
        },
      },
    });
    expect(
      saveWorkspace({
        design: null,
        simulation: null,
        savedDesigns: [],
        reports: [],
      }),
    ).toBe(false);
  });
  it("rejects non-finite values and duplicate components", () => {
    const design = createDesign("earth");
    expect(designSchema.safeParse({ ...design, fuelKg: NaN }).success).toBe(
      false,
    );
    expect(
      designSchema.safeParse({
        ...design,
        componentIds: [...design.componentIds, design.componentIds[0]],
      }).success,
    ).toBe(false);
  });
});
describe("action contract and real PDF", () => {
  it("validates actions and prevents duplicate mutations", () => {
    const initial = createSimulation(createDesign("earth"));
    expect(
      actionSchema.safeParse({ type: "resolve", actionId: "x" }).success,
    ).toBe(false);
    const started = applySimulationAction(initial, {
      type: "start",
      actionId: "start-one",
    });
    expect(
      applySimulationAction(started, { type: "start", actionId: "start-one" }),
    ).toEqual(started);
    const advanced = applySimulationAdvance(started, {
      ticks: 4,
      actionId: "advance-one",
    });
    expect(
      applySimulationAdvance(advanced, { ticks: 4, actionId: "advance-one" })
        .tick,
    ).toBe(advanced.tick);
  });
  it("prevents advance while paused and explicit restart returns a fresh state", () => {
    const initial = createSimulation(createDesign("earth"));
    const started = applySimulationAction(initial, {
      type: "start",
      actionId: "start",
    });
    const paused = applySimulationAction(started, {
      type: "pause",
      actionId: "pause",
    });
    expect(() =>
      applySimulationAdvance(paused, { ticks: 1, actionId: "advance" }),
    ).toThrow();
    const restarted = applySimulationAction(paused, {
      type: "restart",
      actionId: "restart",
    });
    expect(restarted.tick).toBe(0);
    expect(restarted.status).toBe("READY_FOR_LAUNCH");
    expect(restarted.id).toBe(initial.id);
  });
  it("generates a real multipage PDF with the mission text", () => {
    const report = generateReport(createSimulation(createDesign("earth")));
    const pdf = buildReportPdf(report);
    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(bytes.length).toBeGreaterThan(3000);
  });
});

describe("SQLite REST API integration", () => {
  let server: Server;
  let base: string;
  const { app, store } = createApp(":memory:");
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error) =>
        error ? reject(error) : resolve(),
      );
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test address.");
    base = `http://127.0.0.1:${address.port}/api/v1`;
  });
  afterAll(async () => {
    if (server?.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    store.close();
  });
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  it("serves catalog and health", async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).storage).toBe("sqlite");
    expect((await (await fetch(`${base}/missions`)).json()).length).toBe(4);
  });
  it("returns structured request, missing route and invalid JSON errors", async () => {
    const bad = await post("/designs", { missionId: "pluto" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("INVALID_REQUEST");
    expect((await fetch(`${base}/designs/not-present`)).status).toBe(404);
    const malformed = await fetch(`${base}/designs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    });
    expect(malformed.status).toBe(400);
    const huge = await post("/designs", {
      missionId: "earth",
      name: "a".repeat(70000),
    });
    expect(huge.status).toBe(413);
  });
  it("validates and persists design patches", async () => {
    const created = await post("/designs", { missionId: "moon" }),
      design = (await created.json()) as SpacecraftDesign;
    const update = await fetch(`${base}/designs/${design.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Revised lunar survey", fuelKg: 500 }),
    });
    expect(update.status).toBe(200);
    expect((await update.json()).fuelKg).toBe(500);
    const restored = await (await fetch(`${base}/designs/${design.id}`)).json();
    expect(restored.name).toBe("Revised lunar survey");
    const invalid = await fetch(`${base}/designs/${design.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "overwrite-attempt", fuelKg: -4 }),
    });
    expect(invalid.status).toBe(400);
    expect(
      (await (await fetch(`${base}/designs/${design.id}`)).json()).fuelKg,
    ).toBe(500);
  });
  it("blocks a fuel-short design from starting", async () => {
    const created = await post("/designs", { missionId: "earth", fuelKg: 0 });
    const design = (await created.json()) as SpacecraftDesign;
    const validation = await post(`/designs/${design.id}/validate`, {});
    expect((await validation.json()).valid).toBe(false);
    const simulation = await post("/simulations", { designId: design.id });
    expect(simulation.status).toBe(422);
    expect((await simulation.json()).error.code).toBe(
      "DESIGN_NOT_FLIGHT_READY",
    );
  });
  it("runs, saves, restores, completes and exports an Earth mission", async () => {
    const response = await post("/designs", {
      missionId: "earth",
      name: "API integration flight",
    });
    expect(response.status).toBe(201);
    const design = (await response.json()) as SpacecraftDesign;
    expect(
      (await (await fetch(`${base}/designs/${design.id}`)).json()).name,
    ).toBe(design.name);
    let state = (await (
      await post("/simulations", { designId: design.id })
    ).json()) as SimulationState;
    state = (await (
      await post(`/simulations/${state.id}/actions`, {
        type: "start",
        actionId: "start-e2e",
      })
    ).json()) as SimulationState;
    let iteration = 0;
    while (!["COMPLETED", "FAILED"].includes(state.status) && iteration < 30) {
      iteration++;
      if (state.anomaly) {
        state = (await (
          await post(`/simulations/${state.id}/actions`, {
            type: "resolve",
            optionId: state.anomaly.options[0].id,
            actionId: `resolve-${iteration}`,
          })
        ).json()) as SimulationState;
      } else {
        const res = await post(`/simulations/${state.id}/advance`, {
          ticks: 30,
          actionId: `advance-${iteration}`,
        });
        expect(res.status).toBe(200);
        state = (await res.json()) as SimulationState;
      }
    }
    expect(state.status).toBe("COMPLETED");
    const restored = await (
      await fetch(`${base}/simulations/${state.id}`)
    ).json();
    expect(restored).toEqual(state);
    const report = await (
      await fetch(`${base}/simulations/${state.id}/report`)
    ).json();
    expect(report.design.name).toBe(design.name);
    expect(report.score).toBeGreaterThan(50);
    const pdf = await fetch(`${base}/simulations/${state.id}/report.pdf`);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(
      new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5)),
    ).toBe("%PDF-");
    const invalidResume = await post(`/simulations/${state.id}/actions`, {
      type: "resume",
      actionId: "invalid-resume",
    });
    expect(invalidResume.status).toBe(409);
  });
});
