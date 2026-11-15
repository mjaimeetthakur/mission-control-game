import type {
  MissionReport,
  SimulationState,
  SpacecraftDesign,
} from "../core/types";
import { workspaceSchema } from "./schema";

export interface WorkspaceData {
  design: SpacecraftDesign | null;
  simulation: SimulationState | null;
  savedDesigns: SpacecraftDesign[];
  reports: MissionReport[];
}
export const STORAGE_KEY = "mission-control.workspace.v1";
const emptyWorkspace = (): WorkspaceData => ({
  design: null,
  simulation: null,
  savedDesigns: [],
  reports: [],
});
export function loadWorkspace(): WorkspaceData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 5_000_000) return emptyWorkspace();
    const result = workspaceSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}
export function saveWorkspace(data: WorkspaceData): boolean {
  try {
    const parsed = workspaceSchema.safeParse({
      ...data,
      savedDesigns: data.savedDesigns.slice(-30),
      reports: data.reports.slice(-30),
    });
    if (!parsed.success) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}
