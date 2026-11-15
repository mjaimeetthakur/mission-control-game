import { describe, it, expect } from "vitest";
import { components, missions, vehicles, createDesign } from "../src/core/data";
import {
  circularVelocity,
  orbitalPeriod,
  visViva,
  rocketDeltaV,
  hohmannTransfer,
  calculateBudget,
  validateDesign,
  G0,
} from "../src/core/engineering";
import {
  createSimulation,
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  advanceSimulation,
  resolveAnomaly,
  generateReport,
  getLivePower,
  FLIGHT_MODEL,
} from "../src/core/simulation";
import type {
  MissionId,
  SimulationState,
  SpacecraftDesign,
} from "../src/core/types";
const finish = (input: SimulationState, option = "mitigate") => {
  let state = input;
  for (let i = 0; i < 200; i++) {
    if (state.anomaly) state = resolveAnomaly(state, option);
    if (state.status === "COMPLETED" || state.status === "FAILED") return state;
    state = advanceSimulation(state, 20);
  }
  throw new Error("Run failed to terminate");
};
const launch = (id: MissionId, seed = 2026) => {
  const design = createDesign(id);
  design.seed = seed;
  return startSimulation(createSimulation(design));
};
const replace = (design: SpacecraftDesign, oldId: string, newId: string) => ({
  ...design,
  componentIds: design.componentIds.map((id) => (id === oldId ? newId : id)),
});

describe("SI orbital mechanics", () => {
  it("calculates circular speed and period at 550 km", () => {
    const r = 6921000;
    expect(circularVelocity(3.98600435507e14, r)).toBeCloseTo(7588.998, 2);
    expect(orbitalPeriod(3.98600435507e14, r)).toBeCloseTo(5730.127, 2);
  });
  it("reduces vis-viva to circular velocity when r=a", () =>
    expect(visViva(3.986e14, 7e6, 7e6)).toBeCloseTo(
      circularVelocity(3.986e14, 7e6),
      10,
    ));
  it("calculates ideal delta-v and zero-fuel case", () => {
    expect(rocketDeltaV(300, 1000, 500)).toBeCloseTo(
      300 * G0 * Math.log(2),
      10,
    );
    expect(rocketDeltaV(300, 500, 500)).toBe(0);
  });
  it("rejects invalid physical domains", () => {
    expect(() => circularVelocity(1, 0)).toThrow();
    expect(() => orbitalPeriod(-1, 10)).toThrow();
    expect(() => rocketDeltaV(0, 1, 1)).toThrow();
    expect(() => rocketDeltaV(300, 2, 3)).toThrow();
    expect(() => visViva(10, 30, 10)).toThrow();
  });
  it("estimates an Earth-Mars Hohmann transfer of about 259 days", () =>
    expect(
      hohmannTransfer(1.3271244004127942e20, 149597870700, 1.524 * 149597870700)
        .timeSec / 86400,
    ).toBeCloseTo(258.915, 2));
  it("same-orbit transfer costs no delta-v", () =>
    expect(hohmannTransfer(3.986e14, 7e6, 7e6).deltaV).toBeCloseTo(0, 8));
});
describe("design aggregation and feasibility", () => {
  it.each(missions.map((m) => [m.id]))(
    "%s starter passes all blocking constraints",
    (id) =>
      expect(
        validateDesign(createDesign(id)).filter((i) => i.severity === "error"),
      ).toEqual([]),
  );
  it("sums actual components into mass, cost, load and generation", () => {
    const d = createDesign("earth");
    const b = calculateBudget(d);
    const selected = components.filter((c) => d.componentIds.includes(c.id));
    expect(b.dryMassKg).toBe(selected.reduce((n, c) => n + c.massKg, 0));
    expect(b.totalMassKg).toBe(b.dryMassKg + d.fuelKg);
    expect(b.demandW).toBe(selected.reduce((n, c) => n + c.powerW, 0));
    expect(b.costM).toBeCloseTo(
      selected.reduce((n, c) => n + c.costM, 0) +
        vehicles[0].costM +
        d.fuelKg * 0.001,
    );
    expect(b.generationW).toBe(950);
  });
  it("changes power, mass, cost and delta-v when an instrument is installed", () => {
    const d = createDesign("earth");
    const original = calculateBudget(d);
    d.componentIds.push("spectrometer");
    const updated = calculateBudget(d);
    expect(updated.demandW - original.demandW).toBe(85);
    expect(updated.totalMassKg - original.totalMassKg).toBe(30);
    expect(updated.costM - original.costM).toBeCloseTo(9);
    expect(updated.deltaV).toBeLessThan(original.deltaV);
  });
  it("applies destination sunlight and range losses", () => {
    const mars = calculateBudget(createDesign("mars"));
    expect(mars.generationW).toBe(4500 * 0.43);
    expect(mars.commMbps).toBe(24 * 0.06);
    expect(mars.commDelaySec).toBeCloseTo(750.519, 2);
  });
  it("checks destination capacity instead of maximum LEO payload", () => {
    const d = createDesign("mars");
    d.vehicleId = "swift";
    expect(validateDesign(d).some((i) => i.id === "destination")).toBe(true);
  });
  it("rejects excessive payload mass", () => {
    const d = createDesign("moon");
    d.vehicleId = "swift";
    expect(validateDesign(d).some((i) => i.id === "payload")).toBe(true);
    expect(() => createSimulation(d)).toThrow("Launch blocked");
  });
  it("rejects inadequate deep-space solar power", () => {
    const d = replace(createDesign("mars"), "solar-large", "solar-compact");
    expect(validateDesign(d).some((i) => i.id === "power")).toBe(true);
  });
  it("rejects insufficient fuel and overfilled tanks", () => {
    const d = createDesign("earth");
    d.fuelKg = 1;
    expect(validateDesign(d).some((i) => i.id === "delta-v")).toBe(true);
    d.fuelKg = 181;
    expect(validateDesign(d).some((i) => i.id === "tank")).toBe(true);
  });
  it("rejects missing, duplicate, incompatible and unknown components", () => {
    const d = createDesign("mars");
    d.componentIds = d.componentIds.filter((id) => id !== "antenna-high");
    d.componentIds.push("camera", "bus-light", "nonexistent");
    const ids = validateDesign(d).map((i) => i.id);
    expect(ids).toContain("category-antenna");
    expect(ids).toContain("duplicates");
    expect(ids).toContain("compatible-bus-light");
    expect(ids).toContain("unknown-component");
  });
  it("altitude and inclination choices affect maneuver budgets", () => {
    const d = createDesign("earth");
    const b = calculateBudget(d);
    d.altitudeKm = 1200;
    d.inclinationDeg = 30;
    expect(calculateBudget(d).requiredDeltaV).toBeGreaterThan(
      b.requiredDeltaV + 201,
    );
  });
  it("invalid numbers and impossible altitude fail safely", () => {
    const d = createDesign("earth");
    d.fuelKg = NaN;
    expect(validateDesign(d)[0].severity).toBe("error");
    d.fuelKg = 80;
    d.altitudeKm = -7000;
    expect(validateDesign(d)[0].id).toBe("altitude");
  });
});
describe("deterministic mission state machine", () => {
  it("rejects invalid starts, pauses, resumes and tick input", () => {
    const ready = createSimulation(createDesign("earth"));
    expect(() => pauseSimulation(ready)).toThrow();
    expect(() => resumeSimulation(ready)).toThrow();
    const started = startSimulation(ready);
    expect(() => startSimulation(started)).toThrow();
    expect(() => advanceSimulation(started, 0)).toThrow();
    expect(() => advanceSimulation(started, NaN)).toThrow();
  });
  it("pause, resume and 20x speed do not lose simulation steps", () => {
    const started = launch("earth");
    const paused = pauseSimulation(started);
    expect(advanceSimulation(paused, 20)).toBe(paused);
    expect(resumeSimulation(paused).status).toBe("LAUNCHING");
    let one = started;
    for (let i = 0; i < 20; i++) one = advanceSimulation(one);
    expect(advanceSimulation(started, 20)).toEqual(one);
  });
  it("does not mutate its input states or design", () => {
    const started = launch("earth");
    const copy = structuredClone(started);
    advanceSimulation(started, 40);
    expect(started).toEqual(copy);
  });
  it("stops accelerated time at a pending anomaly", () => {
    const state = advanceSimulation(launch("earth"), 1000);
    expect(state.tick).toBe(65);
    expect(state.status).toBe("PAUSED");
    expect(state.anomaly).not.toBeNull();
    expect(() => resumeSimulation(state)).toThrow();
  });
  it("deduplicates action IDs and rejects unknown responses", () => {
    const state = advanceSimulation(launch("earth"), 100);
    expect(() => resolveAnomaly(state, "invalid")).toThrow();
    const next = resolveAnomaly(state, "mitigate", "command-1");
    expect(next.status).toBe("IN_FLIGHT");
    expect(resolveAnomaly(next, "mitigate", "command-1")).toBe(next);
    expect(next.decisions).toHaveLength(1);
  });
  it("same design and seed reproduce outcomes independent of tick batches", () => {
    const started = launch("moon", 43);
    const a = finish(started);
    let b = started;
    for (let i = 0; i < 500; i++) {
      if (b.anomaly) b = resolveAnomaly(b, "mitigate");
      if (["COMPLETED", "FAILED"].includes(b.status)) break;
      b = advanceSimulation(b);
    }
    expect(a).toEqual(b);
  });
  it.each(missions.map((m) => [m.id]))(
    "%s starter completes with prudent anomaly responses",
    (id) => {
      const final = finish(launch(id));
      expect(final.status).toBe("COMPLETED");
      expect(final.scienceProgress).toBe(100);
      expect(final.decisions).toHaveLength(3);
      expect(final.fuelKg).toBeGreaterThan(0);
      expect(final.health).toBeGreaterThan(10);
    },
  );
  it("uses rocket equation to consume exactly the planned insertion propellant", () => {
    const s = launch("earth");
    const b = calculateBudget(s.design);
    const final = advanceSimulation(s, 60);
    const expected =
      s.design.fuelKg -
      b.totalMassKg * (1 - Math.exp(-b.requiredDeltaV / (225 * G0)));
    expect(final.fuelKg).toBeCloseTo(expected, 8);
  });
  it("exposes all seven distinct seeded anomaly types", () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const state = advanceSimulation(launch("earth", seed), 65);
      found.add(state.anomaly!.id);
    }
    expect(found.size).toBe(7);
  });
  it("anomaly responses alter authoritative resource state", () => {
    let pending: SimulationState | undefined;
    for (let seed = 0; seed < 50; seed++) {
      const state = advanceSimulation(launch("earth", seed), 65);
      if (state.anomaly?.id === "solar") {
        pending = state;
        break;
      }
    }
    expect(pending).toBeDefined();
    const shed = resolveAnomaly(pending!, "mitigate");
    const roll = resolveAnomaly(pending!, "reserve");
    expect(shed.scienceMultiplier).toBe(0.8);
    expect(roll.fuelKg).toBeLessThan(pending!.fuelKg);
    expect(roll.solarMultiplier).toBe(0.9);
  });
  it("can fail from a propellant shortage during a correction", () => {
    let failed = false;
    for (let seed = 0; seed < 60; seed++) {
      const d = createDesign("earth");
      d.fuelKg = 29;
      d.seed = seed;
      if (validateDesign(d).some((i) => i.severity === "error"))
        throw new Error("Test design must be launchable");
      const result = finish(startSimulation(createSimulation(d)));
      if (result.failureReason?.includes("propellant")) {
        expect(result.fuelKg).toBe(0);
        expect(() => resumeSimulation(result)).toThrow();
        failed = true;
        break;
      }
    }
    expect(failed).toBe(true);
  });
  it("can fail when communication recovery is ignored", () => {
    let failure: SimulationState | undefined;
    for (let seed = 0; seed < 70; seed++) {
      const initial = launch("earth", seed);
      const atEvent = advanceSimulation(initial, 65);
      if (atEvent.anomaly?.id === "comms") {
        failure = finish(atEvent, "continue");
        break;
      }
    }
    expect(failure?.status).toBe("FAILED");
    expect(failure?.scienceProgress).toBeLessThan(100);
  });
  it("scores transparent weights and caps failed missions at 49", () => {
    const complete = finish(launch("earth"));
    const report = generateReport(complete);
    const b = report.breakdown;
    expect(report.score).toBe(
      Math.round(
        b.science * 0.3 +
          b.engineering * 0.25 +
          b.efficiency * 0.2 +
          b.operations * 0.15 +
          b.reliability * 0.1,
      ),
    );
    const failed = {
      ...complete,
      status: "FAILED" as const,
      failureReason: "Injected test failure",
    };
    expect(generateReport(failed).score).toBeLessThanOrEqual(49);
    expect(report.fuelUsedKg).toBeCloseTo(
      complete.design.fuelKg - complete.fuelKg,
    );
  });
  it("finished missions do not advance or accidentally resume", () => {
    const complete = finish(launch("earth"));
    expect(advanceSimulation(complete, 20)).toBe(complete);
    expect(() => resumeSimulation(complete)).toThrow();
    expect(() => startSimulation(complete)).toThrow();
  });
});

describe("live cockpit readings and optional redundancy", () => {
  it("charges the displayed eclipse power deficit against battery energy", () => {
    const pending = advanceSimulation(launch("earth"), 65);
    const resumed = resolveAnomaly(pending, "mitigate");
    const before = advanceSimulation(resumed, 2);
    const eclipse = advanceSimulation(before);
    const budget = calculateBudget(eclipse.design);
    const power = getLivePower(eclipse, budget);
    expect(eclipse.tick).toBe(68);
    expect(power.inEclipse).toBe(true);
    expect(power.generationW).toBe(0);
    expect(power.demandW).toBeLessThan(budget.demandW);
    expect(power.shedW).toBeCloseTo(6);
    expect(before.batteryWh - eclipse.batteryWh).toBeCloseTo(
      (power.demandW * FLIGHT_MODEL.powerSampleMinutes) / 60,
    );
    expect(
      eclipse.telemetry.every(
        (sample) => sample.tick % FLIGHT_MODEL.telemetryIntervalTicks === 0,
      ),
    ).toBe(true);
    expect(
      advanceSimulation(launch("earth"), FLIGHT_MODEL.countdownTicks - 1).phase,
    ).toBe("Countdown");
    expect(
      advanceSimulation(launch("earth"), FLIGHT_MODEL.countdownTicks).phase,
    ).toBe("Ascent");
  });

  it("accepts a spacecraft with no spares, and refuses two redundancy packages", () => {
    const starter = createDesign("earth");
    const unprotected = {
      ...starter,
      componentIds: starter.componentIds.filter(
        (id) => id !== "redundancy-basic",
      ),
    };
    expect(
      validateDesign(unprotected).filter((issue) => issue.severity === "error"),
    ).toEqual([]);
    expect(calculateBudget(unprotected).reliability).toBeLessThan(
      calculateBudget(starter).reliability,
    );
    const duplicate = {
      ...starter,
      componentIds: [...starter.componentIds, "redundancy-full"],
    };
    expect(
      validateDesign(duplicate).some(
        (issue) => issue.id === "category-redundancy",
      ),
    ).toBe(true);
  });

  it("offers instrument crossover recovery only if a spare path exists", () => {
    const design = createDesign("earth");
    design.componentIds = design.componentIds.filter(
      (id) => id !== "redundancy-basic",
    );
    let found = false;
    for (let seed = 0; seed < 60; seed++) {
      const pending = advanceSimulation(
        startSimulation(createSimulation({ ...design, seed })),
        65,
      );
      if (pending.anomaly?.id !== "instrument") continue;
      expect(pending.anomaly.options.map((option) => option.id)).toEqual([
        "reserve",
        "continue",
      ]);
      expect(() => resolveAnomaly(pending, "mitigate")).toThrow(
        "Unknown anomaly response",
      );
      found = true;
      break;
    }
    expect(found).toBe(true);
  });
});

it("cruises to remote destinations before consuming the arrival propellant", () => {
  for (const missionId of ["moon", "mars", "asteroid"] as const) {
    const start = launch(missionId);
    const budget = calculateBudget(start.design);
    const cruise = advanceSimulation(start, 23);
    expect(cruise.phase).toBe("Cruise");
    expect(
      cruise.events.some((record) => record.title === "Orbit insertion"),
    ).toBe(false);
    const afterDeparture =
      budget.totalMassKg *
      Math.exp((-budget.requiredDeltaV * 0.2) / (340 * G0));
    expect(cruise.fuelKg).toBeCloseTo(afterDeparture - budget.dryMassKg, 8);
    const beforeArrival = advanceSimulation(cruise, 31);
    expect(beforeArrival.tick).toBe(54);
    expect(beforeArrival.phase).toBe("Cruise");
    expect(beforeArrival.fuelKg).toBe(cruise.fuelKg);
    const arrival = advanceSimulation(beforeArrival, 1);
    expect(arrival.phase).toBe("Orbit insertion");
    const afterArrival =
      budget.totalMassKg * Math.exp(-budget.requiredDeltaV / (340 * G0));
    expect(arrival.fuelKg).toBeCloseTo(afterArrival - budget.dryMassKg, 8);
    expect(advanceSimulation(arrival, 5).phase).toBe("Science operations");
    // An existing flight which already paid 80% follows the original final 20% maneuver.
    const oldFlight = structuredClone(cruise);
    oldFlight.phase = "Orbit insertion";
    oldFlight.events[oldFlight.events.length - 1].title = "Orbit insertion";
    oldFlight.fuelKg =
      budget.totalMassKg *
        Math.exp((-budget.requiredDeltaV * 0.8) / (340 * G0)) -
      budget.dryMassKg;
    expect(advanceSimulation(oldFlight, 32).fuelKg).toBeCloseTo(
      afterArrival - budget.dryMassKg,
      8,
    );
  }
});
