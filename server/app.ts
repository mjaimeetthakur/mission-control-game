import express from "express";
import type { ErrorRequestHandler } from "express";
import { ZodError, z } from "zod";
import { components, createDesign, missions, vehicles } from "../src/core/data";
import { calculateBudget, validateDesign } from "../src/core/engineering";
import { createSimulation, generateReport } from "../src/core/simulation";
import { buildReportPdf } from "../src/services/report";
import {
  createDesignSchema,
  designPatchSchema,
  simulationRequestSchema,
} from "../src/services/schema";
import {
  applySimulationAction,
  applySimulationAdvance,
} from "../src/services/actions";
import { createStore } from "./store";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
  }
}
function transition<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ZodError) throw error;
    throw new ApiError(
      409,
      "INVALID_TRANSITION",
      error instanceof Error
        ? error.message
        : "This transition is not allowed.",
    );
  }
}
const routeId = (value: unknown) =>
  z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,128}$/)
    .parse(value);
export function createApp(databasePath = ":memory:") {
  const app = express();
  const store = createStore(databasePath);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "64kb", strict: true }));
  const designById = (id: unknown) => {
    const result = store.getDesign(routeId(id));
    if (!result)
      throw new ApiError(
        404,
        "DESIGN_NOT_FOUND",
        "This design does not exist.",
      );
    return result;
  };
  const simulationById = (id: unknown) => {
    const result = store.getSimulation(routeId(id));
    if (!result)
      throw new ApiError(
        404,
        "SIMULATION_NOT_FOUND",
        "This simulation does not exist.",
      );
    return result;
  };
  app.get("/api/v1/health", (_req, res) =>
    res.json({
      status: "ok",
      schemaVersion: 1,
      storage: "sqlite",
      mode: "local-server",
    }),
  );
  app.get("/api/v1/missions", (_req, res) => res.json(missions));
  app.get("/api/v1/missions/:id", (req, res) => {
    const mission = missions.find((m) => m.id === req.params.id);
    if (!mission)
      throw new ApiError(
        404,
        "MISSION_NOT_FOUND",
        "Choose a supported mission.",
      );
    res.json(mission);
  });
  app.get("/api/v1/components", (_req, res) => res.json(components));
  app.get("/api/v1/launch-vehicles", (_req, res) => res.json(vehicles));
  app.post("/api/v1/designs", (req, res) => {
    const input = createDesignSchema.parse(req.body);
    const design = { ...createDesign(input.missionId), ...input };
    store.putDesign(design);
    res.status(201).json(design);
  });
  app.get("/api/v1/designs/:id", (req, res) =>
    res.json(designById(req.params.id)),
  );
  app.patch("/api/v1/designs/:id", (req, res) => {
    const current = designById(req.params.id);
    const patch = designPatchSchema.parse(req.body);
    const design = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    store.putDesign(design);
    res.json(design);
  });
  app.post("/api/v1/designs/:id/validate", (req, res) => {
    const design = designById(req.params.id);
    const issues = validateDesign(design);
    res.json({
      valid: !issues.some((i) => i.severity === "error"),
      issues,
      budget: calculateBudget(design),
    });
  });
  app.post("/api/v1/simulations", (req, res) => {
    const { designId } = simulationRequestSchema.parse(req.body);
    const design = designById(designId);
    const issues = validateDesign(design).filter((i) => i.severity === "error");
    if (issues.length)
      throw new ApiError(
        422,
        "DESIGN_NOT_FLIGHT_READY",
        "Resolve the engineering issues before starting a simulation.",
        issues,
      );
    const simulation = createSimulation(design);
    store.putSimulation(simulation);
    res.status(201).json(simulation);
  });
  app.get("/api/v1/simulations/:id", (req, res) =>
    res.json(simulationById(req.params.id)),
  );
  app.post("/api/v1/simulations/:id/actions", (req, res) => {
    const current = simulationById(req.params.id);
    const state = transition(() => applySimulationAction(current, req.body));
    store.putSimulation(state);
    res.json(state);
  });
  app.post("/api/v1/simulations/:id/advance", (req, res) => {
    const current = simulationById(req.params.id);
    const state = transition(() => applySimulationAdvance(current, req.body));
    store.putSimulation(state);
    res.json(state);
  });
  app.get("/api/v1/simulations/:id/events", (req, res) =>
    res.json(simulationById(req.params.id).events),
  );
  app.get("/api/v1/simulations/:id/report", (req, res) =>
    res.json(generateReport(simulationById(req.params.id))),
  );
  app.get("/api/v1/simulations/:id/report.pdf", (req, res) => {
    const state = simulationById(req.params.id);
    const report = generateReport(state);
    const data = Buffer.from(buildReportPdf(report).output("arraybuffer"));
    res
      .type("application/pdf")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="mission-${state.id}.pdf"`,
      );
    res.send(data);
  });
  app.use((_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "This API route does not exist.")),
  );
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    next,
  ) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          error: {
            code: "INVALID_REQUEST",
            message: "Check the request fields and units.",
            details: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        });
      return;
    }
    if (error instanceof ApiError) {
      res
        .status(error.status)
        .json({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      return;
    }
    if (
      error instanceof Error &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res
        .status(413)
        .json({
          error: {
            code: "REQUEST_TOO_LARGE",
            message: "Request bodies must be smaller than 64 KB.",
          },
        });
      return;
    }
    if (error instanceof SyntaxError) {
      res
        .status(400)
        .json({
          error: {
            code: "INVALID_JSON",
            message: "The request body must contain valid JSON.",
          },
        });
      return;
    }
    res
      .status(500)
      .json({
        error: {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed.",
        },
      });
  };
  app.use(errorHandler);
  return { app, store };
}
