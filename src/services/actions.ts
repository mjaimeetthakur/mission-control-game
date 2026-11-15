import {
  createSimulation,
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  resolveAnomaly,
  advanceSimulation,
} from "../core/simulation";
import type { SimulationState } from "../core/types";
import { actionSchema, advanceSchema } from "./schema";

export function applySimulationAction(
  state: SimulationState,
  input: unknown,
): SimulationState {
  const action = actionSchema.parse(input);
  if (state.appliedActionIds.includes(action.actionId)) return state;
  let result: SimulationState;
  switch (action.type) {
    case "start":
      result = startSimulation(state);
      break;
    case "pause":
      result = pauseSimulation(state);
      break;
    case "resume":
      result = resumeSimulation(state);
      break;
    case "resolve":
      result = resolveAnomaly(state, action.optionId, action.actionId);
      break;
    case "restart":
      result = {
        ...createSimulation(state.design),
        id: state.id,
        appliedActionIds: state.appliedActionIds,
      };
      break;
  }
  return {
    ...result,
    appliedActionIds: [
      ...new Set([...result.appliedActionIds, action.actionId]),
    ],
  };
}
export function applySimulationAdvance(
  state: SimulationState,
  input: unknown,
): SimulationState {
  const { ticks, actionId } = advanceSchema.parse(input);
  if (state.appliedActionIds.includes(actionId)) return state;
  if (!["LAUNCHING", "IN_FLIGHT"].includes(state.status))
    throw new Error("Only an active, unpaused simulation can advance.");
  const result = advanceSimulation(state, ticks);
  return {
    ...result,
    appliedActionIds: [...new Set([...result.appliedActionIds, actionId])],
  };
}
