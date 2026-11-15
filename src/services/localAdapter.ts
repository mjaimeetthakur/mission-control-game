import { components, createDesign, missions, vehicles } from "../core/data";
import { calculateBudget, validateDesign } from "../core/engineering";
import { createSimulation, generateReport } from "../core/simulation";
import { applySimulationAction, applySimulationAdvance } from "./actions";
import { createDesignSchema, designPatchSchema } from "./schema";
import { loadWorkspace, saveWorkspace } from "./persistence";
import type { SpacecraftDesign } from "../core/types";

/** Offline application adapter. These are local method calls, not deployed HTTP endpoints. */
export const localMissionApi = {
  health: () => ({ status: "ok", mode: "offline", schemaVersion: 1 }),
  missions: () => missions,
  components: () => components,
  launchVehicles: () => vehicles,
  createDesign(input: unknown) {
    const parsed = createDesignSchema.parse(input);
    const design = { ...createDesign(parsed.missionId), ...parsed };
    const workspace = loadWorkspace();
    if (
      !saveWorkspace({
        ...workspace,
        design,
        savedDesigns: [...workspace.savedDesigns, design],
      })
    )
      throw new Error("Your browser could not save this design.");
    return design;
  },
  design(id: string): SpacecraftDesign {
    const workspace = loadWorkspace();
    const design =
      workspace.design?.id === id
        ? workspace.design
        : workspace.savedDesigns.find((d) => d.id === id);
    if (!design) throw new Error("Design not found.");
    return design;
  },
  updateDesign(id: string, input: unknown) {
    const patch = designPatchSchema.parse(input),
      workspace = loadWorkspace();
    const design = {
      ...this.design(id),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (
      !saveWorkspace({
        ...workspace,
        design,
        savedDesigns: workspace.savedDesigns.map((d) =>
          d.id === id ? design : d,
        ),
      })
    )
      throw new Error("Your browser could not save this design.");
    return design;
  },
  validate(id: string) {
    const design = this.design(id),
      issues = validateDesign(design);
    return {
      valid: !issues.some((i) => i.severity === "error"),
      issues,
      budget: calculateBudget(design),
    };
  },
  createSimulation(designId: string) {
    const workspace = loadWorkspace(),
      simulation = createSimulation(this.design(designId));
    if (!saveWorkspace({ ...workspace, simulation }))
      throw new Error("Your browser could not save the simulation.");
    return simulation;
  },
  simulation(id: string) {
    const state = loadWorkspace().simulation;
    if (!state || state.id !== id) throw new Error("Simulation not found.");
    return state;
  },
  action(id: string, input: unknown) {
    const simulation = applySimulationAction(this.simulation(id), input);
    if (!saveWorkspace({ ...loadWorkspace(), simulation }))
      throw new Error("Your browser could not save the action.");
    return simulation;
  },
  advance(id: string, input: unknown) {
    const simulation = applySimulationAdvance(this.simulation(id), input);
    if (!saveWorkspace({ ...loadWorkspace(), simulation }))
      throw new Error("Your browser could not save the simulation.");
    return simulation;
  },
  events(id: string) {
    return this.simulation(id).events;
  },
  report(id: string) {
    return generateReport(this.simulation(id));
  },
};
