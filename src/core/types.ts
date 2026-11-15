export type MissionId = "earth" | "moon" | "mars" | "asteroid";
export type Category =
  | "bus"
  | "instrument"
  | "solar"
  | "battery"
  | "propulsion"
  | "antenna"
  | "computer"
  | "thermal"
  | "attitude"
  | "structure"
  | "redundancy";
export interface MissionScenario {
  id: MissionId;
  name: string;
  subtitle: string;
  destination: string;
  difficulty: string;
  budgetM: number;
  durationDays: number;
  distanceKm: number;
  solarFactor: number;
  requiredDeltaV: number;
  requiredScience: number;
  requiredDataMb: number;
  minAntenna: number;
  mu: number;
  radiusKm: number;
  defaultAltitudeKm: number;
  minAltitudeKm: number;
  maxAltitudeKm: number;
  window: string;
  objective: string;
  risks: string[];
  goals: string[];
  accent: string;
}
export interface SpacecraftComponent {
  id: string;
  category: Category;
  name: string;
  description: string;
  massKg: number;
  costM: number;
  powerW: number;
  generationW?: number;
  capacityWh?: number;
  isp?: number;
  fuelMaxKg?: number;
  rateMbps?: number;
  science?: number;
  storageMb?: number;
  thermalCapacityW?: number;
  reliability: number;
  compatible: MissionId[];
}
export interface LaunchVehicle {
  id: string;
  name: string;
  subtitle: string;
  costM: number;
  capacityKg: Record<MissionId, number>;
  reliability: number;
  heightM: number;
}
export interface SpacecraftDesign {
  id: string;
  name: string;
  missionId: MissionId;
  componentIds: string[];
  fuelKg: number;
  vehicleId: string;
  altitudeKm: number;
  inclinationDeg: number;
  seed: number;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
}
export interface EngineeringBudget {
  dryMassKg: number;
  totalMassKg: number;
  costM: number;
  generationW: number;
  demandW: number;
  batteryWh: number;
  deltaV: number;
  requiredDeltaV: number;
  commMbps: number;
  commDelaySec: number;
  science: number;
  storageMb: number;
  reliability: number;
  payloadCapacityKg: number;
  payloadMarginKg: number;
  fuelMaxKg: number;
  thermalCapacityW: number;
  orbitalVelocity: number;
  orbitalPeriodSec: number;
  transferDays: number;
}
export interface ValidationIssue {
  id: string;
  severity: "error" | "warning" | "info";
  subsystem: string;
  message: string;
  measured: number;
  required: number;
  fix: string;
}
export type SimulationStatus =
  | "READY_FOR_LAUNCH"
  | "LAUNCHING"
  | "IN_FLIGHT"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED";
export type MissionPhase =
  | "Countdown"
  | "Ascent"
  | "Orbit insertion"
  | "Cruise"
  | "Science operations"
  | "Complete";
export interface MissionEvent {
  id: string;
  tick: number;
  title: string;
  detail: string;
  kind: "info" | "warning" | "success" | "error";
}
export interface AnomalyOption {
  id: string;
  label: string;
  description: string;
}
export interface Anomaly {
  id: string;
  title: string;
  description: string;
  options: AnomalyOption[];
}
export interface PlayerDecision {
  tick: number;
  anomaly: string;
  option: string;
  detail: string;
}
export interface TelemetryPoint {
  tick: number;
  battery: number;
  health: number;
  data: number;
}
export interface SimulationState {
  id: string;
  design: SpacecraftDesign;
  seed: number;
  status: SimulationStatus;
  pausedFrom?: "LAUNCHING" | "IN_FLIGHT";
  phase: MissionPhase;
  tick: number;
  totalTicks: number;
  batteryWh: number;
  fuelKg: number;
  health: number;
  temperatureC: number;
  dataMb: number;
  downlinkedMb: number;
  scienceProgress: number;
  elapsedDays: number;
  solarMultiplier: number;
  scienceMultiplier: number;
  commMultiplier: number;
  batteryMultiplier: number;
  commOnline: boolean;
  anomaly: Anomaly | null;
  events: MissionEvent[];
  decisions: PlayerDecision[];
  telemetry: TelemetryPoint[];
  appliedActionIds: string[];
  failureReason?: string;
}
export interface ScoreBreakdown {
  science: number;
  engineering: number;
  efficiency: number;
  operations: number;
  reliability: number;
}
export interface MissionReport {
  simulationId: string;
  missionName: string;
  status: SimulationStatus;
  score: number;
  breakdown: ScoreBreakdown;
  budget: EngineeringBudget;
  design: SpacecraftDesign;
  sciencePercent: number;
  dataPercent: number;
  fuelUsedKg: number;
  budgetUsedPercent: number;
  events: MissionEvent[];
  decisions: PlayerDecision[];
  recommendations: string[];
  summary: string;
}
