import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  Category,
  EngineeringBudget,
  MissionReport,
  SimulationState,
  SpacecraftDesign,
} from "./core/types";
import { components, createDesign, missions } from "./core/data";
import { calculateBudget, validateDesign } from "./core/engineering";
import {
  advanceSimulation,
  createSimulation,
  generateReport,
  pauseSimulation,
  resolveAnomaly,
  resumeSimulation,
  startSimulation,
} from "./core/simulation";
import {
  loadWorkspace,
  saveWorkspace,
  type WorkspaceData,
} from "./services/persistence";

export type Page =
  | "missions"
  | "design"
  | "launch"
  | "trajectory"
  | "control"
  | "report"
  | "archive";
export interface Change {
  name: string;
  mass: number;
  power: number;
  cost: number;
  dv: number;
}

const isRunning = (state: SimulationState) =>
  state.status === "LAUNCHING" || state.status === "IN_FLIGHT";
const isFinished = (state: SimulationState) =>
  state.status === "COMPLETED" || state.status === "FAILED";

/** Restore a flight at its saved tick, waiting for the operator's next input. */
export function restoreSession(workspace: WorkspaceData) {
  const stored = workspace.simulation;
  const simulation =
    stored && isRunning(stored) ? pauseSimulation(stored) : stored;
  const design =
    workspace.design ?? simulation?.design ?? createDesign("earth");
  let page: Page = workspace.design ? "design" : "missions";
  if (simulation) {
    if (!isFinished(simulation)) page = "control";
    else if (sameConfiguration(design, simulation.design)) page = "report";
  }
  return { ...workspace, design, simulation, page };
}

function sameConfiguration(left: SpacecraftDesign, right: SpacecraftDesign) {
  return (
    left.name === right.name &&
    left.missionId === right.missionId &&
    left.vehicleId === right.vehicleId &&
    left.fuelKg === right.fuelKg &&
    left.altitudeKm === right.altitudeKm &&
    left.inclinationDeg === right.inclinationDeg &&
    left.seed === right.seed &&
    left.componentIds.length === right.componentIds.length &&
    left.componentIds.every((id) => right.componentIds.includes(id))
  );
}

/** Keep an editable draft without replacing an older snapshot that shares its ID. */
export function preserveDraft(
  saved: SpacecraftDesign[],
  draft: SpacecraftDesign,
) {
  if (saved.some((snapshot) => sameConfiguration(snapshot, draft)))
    return saved;
  const alreadyUsed = saved.some((snapshot) => snapshot.id === draft.id);
  const snapshot = {
    ...draft,
    id: alreadyUsed ? crypto.randomUUID() : draft.id,
  };
  return [snapshot, ...saved].slice(0, 12);
}

export function selectModules(installed: string[], id: string): string[] {
  const selected = components.find((component) => component.id === id);
  if (!selected) return installed;
  const removable =
    selected.category === "instrument" || selected.category === "redundancy";
  if (installed.includes(id))
    return removable ? installed.filter((other) => other !== id) : installed;
  if (selected.category === "instrument") return [...installed, id];
  const otherCategories = installed.filter(
    (other) =>
      components.find((component) => component.id === other)?.category !==
      selected.category,
  );
  return [...otherCategories, id];
}

function useGameState() {
  const [initial] = useState(() => restoreSession(loadWorkspace()));
  const [design, setDesign] = useState(initial.design);
  const [simulation, setSimulation] = useState(initial.simulation);
  const [savedDesigns, setSavedDesigns] = useState(initial.savedDesigns);
  const [reports, setReports] = useState(initial.reports);
  const [archivedReport, setArchivedReport] = useState<MissionReport | null>(
    null,
  );
  const [page, setPage] = useState<Page>(initial.page);
  const [speed, setSpeed] = useState(1);
  const [toast, setToast] = useState("");
  const [change, setChange] = useState<Change | null>(null);
  const [help, setHelp] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const currentReport =
    simulation && isFinished(simulation) ? generateReport(simulation) : null;
  const report = archivedReport ?? currentReport;
  const displayedDesign =
    page === "control" && simulation
      ? simulation.design
      : page === "report" && report
        ? report.design
        : design;
  const mission = missions.find(
    (item) => item.id === displayedDesign.missionId,
  )!;
  const budget = calculateBudget(design);
  const issues = validateDesign(design);
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    setStorageOk(saveWorkspace({ design, simulation, savedDesigns, reports }));
  }, [design, simulation, savedDesigns, reports]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const running =
    simulation !== null && isRunning(simulation) && !simulation.anomaly;
  useEffect(() => {
    if (!running || page !== "control") return;
    const timer = setInterval(
      () =>
        setSimulation((state) =>
          state ? advanceSimulation(state, speed) : state,
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [running, page, speed]);
  useEffect(() => {
    if (!simulation || !isFinished(simulation)) return;
    const finishedReport = generateReport(simulation);
    setReports((previous) =>
      previous.some((item) => item.simulationId === finishedReport.simulationId)
        ? previous
        : [finishedReport, ...previous].slice(0, 20),
    );
  }, [simulation]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "instant" });
  const leaveConsole = () =>
    setSimulation((current) =>
      current && isRunning(current) ? pauseSimulation(current) : current,
    );
  const navigate = (next: Page) => {
    if (next !== "control") leaveConsole();
    // Archive's explicit report opener supplies its own report. All other paths show the current flight.
    if (!(page === "archive" && next === "report")) setArchivedReport(null);
    setPage(next);
    scrollToTop();
  };
  const openArchivedReport = (selected: MissionReport) => {
    leaveConsole();
    setArchivedReport(selected);
    setPage("report");
    scrollToTop();
  };
  const stashModifiedDraft = () => {
    const baseline = createDesign(design.missionId);
    if (!sameConfiguration(design, baseline))
      setSavedDesigns((previous) => preserveDraft(previous, design));
  };
  const updateDesign = (patch: Partial<SpacecraftDesign>, label?: string) => {
    const next = { ...design, ...patch, updatedAt: new Date().toISOString() };
    if (label) {
      const after = calculateBudget(next);
      setChange({
        name: label,
        mass: after.totalMassKg - budget.totalMassKg,
        power: powerMargin(after) - powerMargin(budget),
        cost: after.costM - budget.costM,
        dv: after.deltaV - budget.deltaV,
      });
    }
    setDesign(next);
  };
  const chooseComponent = (id: string) => {
    const component = components.find((item) => item.id === id);
    if (!component) return;
    const ids = selectModules(design.componentIds, id);
    if (ids === design.componentIds) return;
    updateDesign(
      { componentIds: ids },
      `${ids.includes(id) ? "Installed" : "Removed"} ${component.name}`,
    );
  };
  const selectMission = (id: SpacecraftDesign["missionId"]) => {
    if (id === design.missionId) return;
    stashModifiedDraft();
    setDesign(createDesign(id));
    setChange(null);
    setTutorial(false);
  };
  const startTutorial = () => {
    stashModifiedDraft();
    setDesign(createDesign("earth"));
    setChange(null);
    setTutorial(true);
    navigate("design");
  };
  const saveDesign = () => {
    const suffix = ` · ${savedDesigns.length + 1}`;
    const snapshot = {
      ...design,
      id: crypto.randomUUID(),
      name: `${design.name.slice(0, 80 - suffix.length)}${suffix}`,
      updatedAt: new Date().toISOString(),
    };
    setSavedDesigns((previous) => [snapshot, ...previous].slice(0, 12));
    notify("Design saved to your mission archive.");
  };
  const loadDesign = (selected: SpacecraftDesign) => {
    if (!sameConfiguration(design, selected)) stashModifiedDraft();
    setDesign({
      ...selected,
      componentIds: [...selected.componentIds],
      updatedAt: new Date().toISOString(),
    });
    setChange(null);
    setTutorial(false);
    navigate("design");
    notify("Spacecraft restored in the design lab.");
  };
  const beginFlight = (selected: SpacecraftDesign) => {
    try {
      const flight = startSimulation(createSimulation(selected));
      if (simulation && !isFinished(simulation)) {
        const replace = window.confirm(
          `Replace the unfinished flight of ${simulation.design.name} at tick ${simulation.tick}? Starting a new run resets its flight progress. Cancel to keep the current flight.`,
        );
        if (!replace) return;
      }
      setSimulation(flight);
      setArchivedReport(null);
      setSpeed(1);
      setPage("control");
      scrollToTop();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Review mission readiness before launch.",
      );
    }
  };
  const launch = () => beginFlight(design);
  const restart = () =>
    beginFlight(archivedReport?.design ?? simulation?.design ?? design);
  const redesignFlight = () => {
    if (simulation) loadDesign(simulation.design);
    else navigate("design");
  };
  const togglePause = () => {
    if (!simulation) return;
    try {
      if (simulation.status === "READY_FOR_LAUNCH")
        setSimulation(startSimulation(simulation));
      else
        setSimulation(
          simulation.status === "PAUSED"
            ? resumeSimulation(simulation)
            : pauseSimulation(simulation),
        );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Resolve the active event first.",
      );
    }
  };
  const decide = (option: string) => {
    if (!simulation) return;
    try {
      setSimulation(resolveAnomaly(simulation, option, crypto.randomUUID()));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to apply action.",
      );
    }
  };
  return {
    design,
    updateDesign,
    simulation,
    setSimulation,
    savedDesigns,
    setSavedDesigns,
    reports,
    archivedReport,
    setArchivedReport,
    page,
    navigate,
    speed,
    setSpeed,
    toast,
    notify,
    change,
    help,
    setHelp,
    tutorial,
    setTutorial,
    startTutorial,
    storageOk,
    reducedMotion,
    mission,
    budget,
    issues,
    report,
    chooseComponent,
    selectMission,
    saveDesign,
    launch,
    restart,
    togglePause,
    decide,
    loadDesign,
    openArchivedReport,
    redesignFlight,
  };
}

type Game = ReturnType<typeof useGameState>;
const GameContext = createContext<Game | null>(null);
export function GameProvider({ children }: { children: ReactNode }) {
  const value = useGameState();
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error("Game provider unavailable");
  return value;
}
export const categoryNames: Record<Category, string> = {
  bus: "Spacecraft bus",
  instrument: "Science payload",
  solar: "Solar arrays",
  battery: "Energy storage",
  propulsion: "Propulsion",
  antenna: "Communications",
  computer: "Flight computer",
  thermal: "Thermal control",
  attitude: "Attitude control",
  structure: "Structure",
  redundancy: "Redundancy",
};
export const money = (amount: number) => `$${amount.toFixed(1)}M`;
export const num = (value: number, digits = 0) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });
export const powerMargin = (budget: EngineeringBudget) =>
  budget.generationW - budget.demandW;
