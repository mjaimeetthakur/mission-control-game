import { describe, expect, it } from "vitest";
import { preserveDraft, restoreSession, selectModules } from "../src/context";
import { createDesign } from "../src/core/data";
import {
  createSimulation,
  startSimulation,
  advanceSimulation,
  resolveAnomaly,
} from "../src/core/simulation";
import type { WorkspaceData } from "../src/services/persistence";

function workspace(): WorkspaceData {
  return { design: null, simulation: null, savedDesigns: [], reports: [] };
}

describe("saved workspace navigation", () => {
  it("opens a returning running flight paused at its saved tick, keeping the separate draft", () => {
    const flight = advanceSimulation(
      startSimulation(createSimulation(createDesign("earth"))),
      30,
    );
    const marsDraft = createDesign("mars");
    const restored = restoreSession({
      ...workspace(),
      simulation: flight,
      design: marsDraft,
    });
    expect(restored.page).toBe("control");
    expect(restored.simulation?.status).toBe("PAUSED");
    expect(restored.simulation?.tick).toBe(30);
    expect(restored.simulation?.design.missionId).toBe("earth");
    expect(restored.design).toBe(marsDraft);
    expect(flight.status).toBe("IN_FLIGHT");
  });

  it("restores the pending anomaly and only allows its offered response", () => {
    const pending = advanceSimulation(
      startSimulation(createSimulation(createDesign("earth"))),
      180,
    );
    const restored = restoreSession({ ...workspace(), simulation: pending });
    expect(restored.page).toBe("control");
    expect(restored.simulation).toEqual(pending);
    expect(restored.simulation?.anomaly).toBeTruthy();
    expect(() => resolveAnomaly(restored.simulation!, "unknown")).toThrow();
  });

  it("opens the debrief after a finished flight and keeps a later draft editable", () => {
    const design = createDesign("earth");
    let flight = startSimulation(createSimulation(design));
    for (let step = 0; step < 10 && flight.status !== "COMPLETED"; step++) {
      flight = flight.anomaly
        ? resolveAnomaly(flight, flight.anomaly.options[0].id)
        : advanceSimulation(flight, 180);
    }
    expect(flight.status).toBe("COMPLETED");
    expect(
      restoreSession({ ...workspace(), simulation: flight, design }).page,
    ).toBe("report");
    expect(
      restoreSession({
        ...workspace(),
        simulation: flight,
        design: { ...design, fuelKg: design.fuelKg + 10 },
      }).page,
    ).toBe("design");
  });

  it("preserves distinct revisions sharing an ID and deduplicates equivalent configurations", () => {
    const previous = createDesign("earth");
    const draft = { ...previous, fuelKg: previous.fuelKg + 10 };
    const saved = preserveDraft([previous], draft);
    expect(saved).toHaveLength(2);
    expect(saved[0].id).not.toBe(previous.id);
    expect(saved[1]).toBe(previous);
    expect(preserveDraft(saved, draft)).toBe(saved);
  });
});

describe("optional redundancy and mutable payload selection", () => {
  it("replaces the installed backup and permits removing it", () => {
    const design = createDesign("earth");
    const upgraded = selectModules(design.componentIds, "redundancy-full");
    expect(upgraded).toContain("redundancy-full");
    expect(upgraded).not.toContain("redundancy-basic");
    expect(
      selectModules(upgraded, "redundancy-full").some((id) =>
        id.startsWith("redundancy-"),
      ),
    ).toBe(false);
  });
  it("retains the required bus and independently toggles an instrument", () => {
    const installed = createDesign("earth").componentIds;
    expect(selectModules(installed, "bus-light")).toBe(installed);
    const extended = selectModules(installed, "spectrometer");
    expect(extended).toContain("camera");
    expect(selectModules(extended, "spectrometer")).toEqual(installed);
  });
});
