import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  actionSchema,
  advanceSchema,
  createDesignSchema,
  designPatchSchema,
  designSchema,
  simulationRequestSchema,
  simulationSchema,
  reportSchema,
} from "../src/services/schema";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (description: string, schema: object) => ({
  description,
  content: { "application/json": { schema } },
});
const error = response("Structured error", ref("Error"));
const body = (name: string) => ({
  required: true,
  content: { "application/json": { schema: ref(name) } },
});
const idParameter = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,128}$" },
};
const schemas: Record<string, object> = {
  Design: z.toJSONSchema(designSchema),
  CreateDesign: z.toJSONSchema(createDesignSchema),
  DesignPatch: z.toJSONSchema(designPatchSchema),
  Simulation: z.toJSONSchema(simulationSchema),
  SimulationRequest: z.toJSONSchema(simulationRequestSchema),
  SimulationAction: z.toJSONSchema(actionSchema),
  Advance: z.toJSONSchema(advanceSchema),
  Report: z.toJSONSchema(reportSchema),
  Error: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          details: {},
        },
      },
    },
  },
  MissionScenario: z.toJSONSchema(
    z.object({
      id: z.enum(["earth", "moon", "mars", "asteroid"]),
      name: z.string(),
      subtitle: z.string(),
      destination: z.string(),
      difficulty: z.string(),
      budgetM: z.number(),
      durationDays: z.number(),
      distanceKm: z.number(),
      solarFactor: z.number(),
      requiredDeltaV: z.number(),
      requiredScience: z.number(),
      requiredDataMb: z.number(),
      minAntenna: z.number(),
      mu: z.number(),
      radiusKm: z.number(),
      defaultAltitudeKm: z.number(),
      minAltitudeKm: z.number(),
      maxAltitudeKm: z.number(),
      window: z.string(),
      objective: z.string(),
      risks: z.array(z.string()),
      goals: z.array(z.string()),
      accent: z.string(),
    }),
  ),
  SpacecraftComponent: z.toJSONSchema(
    z.object({
      id: z.string(),
      category: z.enum([
        "bus",
        "instrument",
        "solar",
        "battery",
        "propulsion",
        "antenna",
        "computer",
        "thermal",
        "attitude",
        "structure",
        "redundancy",
      ]),
      name: z.string(),
      description: z.string(),
      massKg: z.number(),
      costM: z.number(),
      powerW: z.number(),
      generationW: z.number().optional(),
      capacityWh: z.number().optional(),
      isp: z.number().optional(),
      fuelMaxKg: z.number().optional(),
      rateMbps: z.number().optional(),
      science: z.number().optional(),
      storageMb: z.number().optional(),
      thermalCapacityW: z.number().optional(),
      reliability: z.number(),
      compatible: z.array(z.enum(["earth", "moon", "mars", "asteroid"])),
    }),
  ),
  LaunchVehicle: z.toJSONSchema(
    z.object({
      id: z.string(),
      name: z.string(),
      subtitle: z.string(),
      costM: z.number(),
      capacityKg: z.object({
        earth: z.number(),
        moon: z.number(),
        mars: z.number(),
        asteroid: z.number(),
      }),
      reliability: z.number(),
      heightM: z.number(),
    }),
  ),
  Validation: {
    type: "object",
    required: ["valid", "issues", "budget"],
    properties: {
      valid: { type: "boolean" },
      issues: {
        type: "array",
        items: {
          type: "object",
          required: [
            "id",
            "severity",
            "subsystem",
            "measured",
            "required",
            "message",
            "fix",
          ],
          properties: {
            id: { type: "string" },
            severity: { enum: ["error", "warning", "info"] },
            subsystem: { type: "string" },
            measured: { type: "number" },
            required: { type: "number" },
            message: { type: "string" },
            fix: { type: "string" },
          },
        },
      },
      budget: ref("EngineeringBudget"),
    },
  },
  EngineeringBudget: z.toJSONSchema(reportSchema.shape.budget),
};
const get = (summary: string, schema: object) => ({
  summary,
  responses: { "200": response("Success", schema), "404": error },
});
const paths = {
  "/health": {
    get: get("Server status and storage mode", {
      type: "object",
      properties: {
        status: { const: "ok" },
        schemaVersion: { const: 1 },
        storage: { const: "sqlite" },
        mode: { const: "local-server" },
      },
    }),
  },
  "/missions": {
    get: get("List four educational mission scenarios", {
      type: "array",
      items: ref("MissionScenario"),
    }),
  },
  "/missions/{id}": {
    parameters: [idParameter],
    get: get("Read a mission scenario", ref("MissionScenario")),
  },
  "/components": {
    get: get("List fictional spacecraft components with numeric assumptions", {
      type: "array",
      items: ref("SpacecraftComponent"),
    }),
  },
  "/launch-vehicles": {
    get: get(
      "List fictional launch classes and destination-specific capacities",
      { type: "array", items: ref("LaunchVehicle") },
    ),
  },
  "/designs": {
    post: {
      summary: "Create a starter design and apply validated overrides",
      requestBody: body("CreateDesign"),
      responses: {
        "201": response("Created design", ref("Design")),
        "400": error,
        "413": error,
      },
    },
  },
  "/designs/{id}": {
    parameters: [idParameter],
    get: get("Read a persisted design", ref("Design")),
    patch: {
      summary:
        "Update editable fields; engineering feasibility is checked separately",
      requestBody: body("DesignPatch"),
      responses: {
        "200": response("Updated design", ref("Design")),
        "400": error,
        "404": error,
        "413": error,
      },
    },
  },
  "/designs/{id}/validate": {
    parameters: [idParameter],
    post: {
      summary: "Compute engineering budgets and centralized feasibility checks",
      responses: {
        "200": response("Validation result", ref("Validation")),
        "404": error,
      },
    },
  },
  "/simulations": {
    post: {
      summary: "Create a ready simulation from a flight-ready design",
      requestBody: body("SimulationRequest"),
      responses: {
        "201": response("Created ready simulation", ref("Simulation")),
        "400": error,
        "404": error,
        "422": error,
      },
    },
  },
  "/simulations/{id}": {
    parameters: [idParameter],
    get: get("Read current persisted simulation state", ref("Simulation")),
  },
  "/simulations/{id}/actions": {
    parameters: [idParameter],
    post: {
      summary:
        "Start, pause, resume, resolve an anomaly, or explicitly restart",
      description:
        "actionId provides per-simulation deduplication. Resolving a pending anomaly resumes the simulation. Terminal simulations cannot resume; restart is explicit.",
      requestBody: body("SimulationAction"),
      responses: {
        "200": response("Current state after action", ref("Simulation")),
        "400": error,
        "404": error,
        "409": error,
      },
    },
  },
  "/simulations/{id}/advance": {
    parameters: [idParameter],
    post: {
      summary: "Advance an active simulation by 1-180 ticks",
      description:
        "Stops on the first anomaly or terminal outcome. Seed and design determine event selection. Duplicate actionId returns current state without advancing twice.",
      requestBody: body("Advance"),
      responses: {
        "200": response(
          "Current state after tick advancement",
          ref("Simulation"),
        ),
        "400": error,
        "404": error,
        "409": error,
      },
    },
  },
  "/simulations/{id}/events": {
    parameters: [idParameter],
    get: get(
      "Read chronological mission event history",
      z.toJSONSchema(simulationSchema.shape.events),
    ),
  },
  "/simulations/{id}/report": {
    parameters: [idParameter],
    get: get(
      "Generate an actual-state mission report; in-progress scores remain provisional",
      ref("Report"),
    ),
  },
  "/simulations/{id}/report.pdf": {
    parameters: [idParameter],
    get: {
      summary: "Download the actual-state multi-page PDF report",
      responses: {
        "200": {
          description: "PDF report",
          content: {
            "application/pdf": { schema: { type: "string", format: "binary" } },
          },
        },
        "404": error,
      },
    },
  },
};
writeFileSync(
  "openapi.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "Mission Control local API",
        version: "1.0.0",
        description:
          "Optional loopback-only development API using Express and SQLite. The hosted static game uses browser-local persistence, not this API. Requests are JSON with a 64 KB size limit. Cost is in USD millions, mass kg, power W, energy Wh, delta-v m/s; design altitude is km. No authentication is provided; keep this local API bound to 127.0.0.1.",
      },
      servers: [
        {
          url: "http://127.0.0.1:3001/api/v1",
          description: "Local development only",
        },
      ],
      paths,
      components: { schemas },
    },
    null,
    2,
  ) + "\n",
);
