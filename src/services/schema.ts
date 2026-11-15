import { z } from "zod";
import { components, vehicles } from "../core/data";

const finite = z.number().finite();
const nonnegative = finite.min(0);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, hyphens or underscores.");
const text = z.string().max(6000);
const date = z.string().datetime();
export const missionIdSchema = z.enum(["earth", "moon", "mars", "asteroid"]);
export const designSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(80),
    missionId: missionIdSchema,
    componentIds: z
      .array(
        id.refine(
          (value) => components.some((c) => c.id === value),
          "Unknown component.",
        ),
      )
      .min(1)
      .max(40)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate components are not allowed.",
      ),
    fuelKg: nonnegative.max(100000),
    vehicleId: id.refine(
      (value) => vehicles.some((v) => v.id === value),
      "Unknown launch vehicle.",
    ),
    altitudeKm: finite.min(1).max(10000000),
    inclinationDeg: finite.min(0).max(180),
    seed: z.number().int().min(0).max(4294967295),
    schemaVersion: z.literal(1),
    createdAt: date,
    updatedAt: date,
  })
  .strict();
export const designPatchSchema = designSchema
  .omit({ id: true, schemaVersion: true, createdAt: true, updatedAt: true })
  .partial()
  .strict();
export const createDesignSchema = designPatchSchema
  .extend({ missionId: missionIdSchema })
  .strict();
const eventSchema = z.object({
  id,
  tick: nonnegative,
  title: text,
  detail: text,
  kind: z.enum(["info", "warning", "success", "error"]),
});
const decisionSchema = z.object({
  tick: nonnegative,
  anomaly: text,
  option: text,
  detail: text,
});
export const simulationSchema = z.object({
  id,
  design: designSchema,
  seed: z.number().int().min(0).max(4294967295),
  status: z.enum([
    "READY_FOR_LAUNCH",
    "LAUNCHING",
    "IN_FLIGHT",
    "PAUSED",
    "COMPLETED",
    "FAILED",
  ]),
  pausedFrom: z.enum(["LAUNCHING", "IN_FLIGHT"]).optional(),
  phase: z.enum([
    "Countdown",
    "Ascent",
    "Orbit insertion",
    "Cruise",
    "Science operations",
    "Complete",
  ]),
  tick: nonnegative,
  totalTicks: finite.positive(),
  batteryWh: nonnegative,
  fuelKg: nonnegative,
  health: finite.min(0).max(100),
  temperatureC: finite,
  dataMb: nonnegative,
  downlinkedMb: nonnegative,
  scienceProgress: nonnegative,
  elapsedDays: nonnegative,
  solarMultiplier: nonnegative,
  scienceMultiplier: nonnegative,
  commMultiplier: nonnegative,
  batteryMultiplier: nonnegative,
  commOnline: z.boolean(),
  anomaly: z
    .object({
      id,
      title: text,
      description: text,
      options: z
        .array(z.object({ id, label: text, description: text }))
        .min(1)
        .max(10),
    })
    .nullable(),
  events: z.array(eventSchema).max(2000),
  decisions: z.array(decisionSchema).max(200),
  telemetry: z
    .array(
      z.object({
        tick: nonnegative,
        battery: finite,
        health: finite,
        data: finite,
      }),
    )
    .max(2000),
  appliedActionIds: z.array(id).max(2000),
  failureReason: text.optional(),
});
const budgetSchema = z.object({
  dryMassKg: nonnegative,
  totalMassKg: nonnegative,
  costM: nonnegative,
  generationW: nonnegative,
  demandW: nonnegative,
  batteryWh: nonnegative,
  deltaV: nonnegative,
  requiredDeltaV: nonnegative,
  commMbps: nonnegative,
  commDelaySec: nonnegative,
  science: nonnegative,
  storageMb: nonnegative,
  reliability: nonnegative,
  payloadCapacityKg: nonnegative,
  payloadMarginKg: finite,
  fuelMaxKg: nonnegative,
  thermalCapacityW: nonnegative,
  orbitalVelocity: nonnegative,
  orbitalPeriodSec: nonnegative,
  transferDays: nonnegative,
});
export const reportSchema = z.object({
  simulationId: id,
  missionName: text,
  status: simulationSchema.shape.status,
  score: finite.min(0).max(100),
  breakdown: z.object({
    science: nonnegative,
    engineering: nonnegative,
    efficiency: nonnegative,
    operations: nonnegative,
    reliability: nonnegative,
  }),
  budget: budgetSchema,
  design: designSchema,
  sciencePercent: nonnegative,
  dataPercent: nonnegative,
  fuelUsedKg: nonnegative,
  budgetUsedPercent: nonnegative,
  events: z.array(eventSchema).max(2000),
  decisions: z.array(decisionSchema).max(200),
  recommendations: z.array(text).max(100),
  summary: text,
});
export const workspaceSchema = z.object({
  design: designSchema.nullable(),
  simulation: simulationSchema.nullable(),
  savedDesigns: z.array(designSchema).max(30),
  reports: z.array(reportSchema).max(30),
});
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ actionId: id, type: z.literal("start") }).strict(),
  z.object({ actionId: id, type: z.literal("pause") }).strict(),
  z.object({ actionId: id, type: z.literal("resume") }).strict(),
  z.object({ actionId: id, type: z.literal("restart") }).strict(),
  z.object({ actionId: id, type: z.literal("resolve"), optionId: id }).strict(),
]);
export const advanceSchema = z
  .object({ ticks: z.number().int().min(1).max(180), actionId: id })
  .strict();
export const simulationRequestSchema = z.object({ designId: id }).strict();
