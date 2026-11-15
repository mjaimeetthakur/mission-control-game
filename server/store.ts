import { DatabaseSync } from "node:sqlite";
import type { SimulationState, SpacecraftDesign } from "../src/core/types";
import { designSchema, simulationSchema } from "../src/services/schema";

export function createStore(filename: string) {
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS designs (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS simulations (id TEXT PRIMARY KEY, data TEXT NOT NULL);",
  );
  return {
    getDesign(id: string): SpacecraftDesign | undefined {
      const row = db.prepare("SELECT data FROM designs WHERE id = ?").get(id);
      return row ? designSchema.parse(JSON.parse(String(row.data))) : undefined;
    },
    putDesign(design: SpacecraftDesign) {
      db.prepare(
        "INSERT INTO designs(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      ).run(design.id, JSON.stringify(design));
    },
    getSimulation(id: string): SimulationState | undefined {
      const row = db
        .prepare("SELECT data FROM simulations WHERE id = ?")
        .get(id);
      return row
        ? simulationSchema.parse(JSON.parse(String(row.data)))
        : undefined;
    },
    putSimulation(simulation: SimulationState) {
      db.prepare(
        "INSERT INTO simulations(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      ).run(simulation.id, JSON.stringify(simulation));
    },
    close: () => db.close(),
  };
}
