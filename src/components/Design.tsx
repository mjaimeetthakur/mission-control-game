import { useState, lazy, Suspense } from "react";
import {
  Check,
  Plus,
  Box,
  Cpu,
  Radio,
  Battery,
  Sun,
  Flame,
  Scan,
  Thermometer,
  Compass,
  Shield,
  Layers,
  Save,
  RotateCcw,
  ArrowUpRight,
  Info,
} from "lucide-react";
import type { Category } from "../core/types";
import { components, createDesign } from "../core/data";
import { useGame, categoryNames, money, num } from "../context";
import {
  PageHeading,
  BudgetStrip,
  StepFooter,
  Validation,
  Badge,
} from "./Common";
const SpaceScene = lazy(() => import("./SpaceScene"));
const categories = Object.keys(categoryNames) as Category[];
const categoryIcons = {
  bus: Box,
  instrument: Scan,
  solar: Sun,
  battery: Battery,
  propulsion: Flame,
  antenna: Radio,
  computer: Cpu,
  thermal: Thermometer,
  attitude: Compass,
  structure: Layers,
  redundancy: Shield,
};
export default function Design() {
  const {
    design,
    budget,
    chooseComponent,
    updateDesign,
    saveDesign,
    change,
    reducedMotion,
    mission,
  } = useGame();
  const [category, setCategory] = useState<Category>("instrument");
  const [resetting, setResetting] = useState(false);
  const selected = components.filter((c) => design.componentIds.includes(c.id));
  return (
    <>
      <PageHeading
        eyebrow={mission.name}
        title="Configure your spacecraft"
        description="Choose instruments and subsystems. Watch the power, mass, and budget margins as you build."
      >
        <div className="heading-actions">
          <button className="button outline" onClick={saveDesign}>
            <Save size={16} />
            Save design
          </button>
          <button
            className="button outline"
            aria-label="Restore starter spacecraft"
            onClick={() => setResetting(!resetting)}
          >
            <RotateCcw size={16} />
            Restore starter
          </button>
        </div>
      </PageHeading>
      {resetting && (
        <div className="inline-confirm">
          Replace the current draft with the recommended spacecraft for this
          mission?
          <button
            className="button small-button"
            onClick={() => {
              updateDesign(
                createDesign(design.missionId),
                "Restored recommended design",
              );
              setResetting(false);
            }}
          >
            Restore design
          </button>
          <button className="text-button" onClick={() => setResetting(false)}>
            Cancel
          </button>
        </div>
      )}
      <BudgetStrip />
      <div className="design-workspace">
        <nav className="category-nav" aria-label="Spacecraft subsystems">
          <div className="eyebrow">
            SUBSYSTEMS <span>{categories.length}</span>
          </div>
          {categories.map((cat) => {
            const Icon = categoryIcons[cat];
            return (
              <button
                key={cat}
                aria-pressed={category === cat}
                className={category === cat ? "active" : ""}
                onClick={() => setCategory(cat)}
              >
                <Icon size={17} />
                <span>{categoryNames[cat]}</span>
                <span className="module-count">
                  {selected.filter((x) => x.category === cat).length}
                </span>
              </button>
            );
          })}
        </nav>
        <section className="component-catalog">
          <div className="panel-heading">
            <h3>{categoryNames[category]}</h3>
            <span className="micro">
              {category === "instrument"
                ? "Select one or more"
                : category === "redundancy"
                  ? "Optional"
                  : "Select one"}
            </span>
          </div>
          <p className="muted small">
            {category === "instrument"
              ? "Select an instrument to install it. Select it again to remove it."
              : category === "redundancy"
                ? "Choose a backup module or leave it off. Select an installed backup to remove it."
                : "Choosing a module replaces the current one."}
          </p>
          <div className="component-list">
            {components
              .filter((c) => c.category === category)
              .map((c) => {
                const installed = design.componentIds.includes(c.id);
                const compatible = c.compatible.includes(design.missionId);
                return (
                  <button
                    key={c.id}
                    className={`component-card ${installed ? "installed" : ""}`}
                    onClick={() => chooseComponent(c.id)}
                    aria-pressed={installed}
                  >
                    <div className="component-title">
                      <h4>{c.name}</h4>
                      {installed ? <Check size={17} /> : <Plus size={17} />}
                    </div>
                    <p>{c.description}</p>
                    <div className="component-specs">
                      <span>
                        {c.massKg} <small>kg</small>
                      </span>
                      <span>{money(c.costM)}</span>
                      <span>
                        {c.generationW
                          ? `${num(c.generationW * mission.solarFactor)} W output`
                          : `${c.powerW} W draw`}
                      </span>
                    </div>
                    <span
                      className={`component-status ${!compatible ? "bad" : ""}`}
                    >
                      {!compatible
                        ? "⚠ Not rated for this destination"
                        : installed
                          ? "INSTALLED"
                          : "AVAILABLE"}
                      <span>
                        {(c.reliability * 100).toFixed(1)}% est. reliability
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
          {category === "propulsion" && (
            <div className="fuel-control">
              <label htmlFor="fuel">
                Propellant load <strong>{design.fuelKg} kg</strong>
              </label>
              <input
                id="fuel"
                type="range"
                min={0}
                max={budget.fuelMaxKg}
                step={5}
                value={Math.min(design.fuelKg, budget.fuelMaxKg)}
                onChange={(e) =>
                  updateDesign(
                    { fuelKg: Number(e.target.value) },
                    "Adjusted propellant",
                  )
                }
              />
              <div className="range-labels">
                <span>0 kg</span>
                <span>{num(budget.fuelMaxKg)} kg tank capacity</span>
              </div>
              {design.fuelKg > budget.fuelMaxKg && (
                <p className="bad">
                  Reduce fuel to fit this propulsion system.
                </p>
              )}
            </div>
          )}
          <div className="model-note">
            <Info size={14} />
            <span>
              Illustrative hardware · specification model 1.0
              <br />
              Power output adjusted for destination.
            </span>
          </div>
        </section>
        <section className="digital-twin">
          <div className="panel-heading">
            <span>
              <span className="status-dot green" /> Spacecraft digital twin
            </span>
            <Badge tone="muted">{design.componentIds.length} modules</Badge>
          </div>
          <div className="twin-scene">
            <Suspense
              fallback={
                <div className="scene-loading">Assembling spacecraft…</div>
              }
            >
              <SpaceScene
                mode="spacecraft"
                missionId={design.missionId}
                design={design}
                reducedMotion={reducedMotion}
                onSelectComponent={(id) => {
                  const c = components.find((x) => x.id === id);
                  if (c) setCategory(c.category);
                }}
              />
            </Suspense>
          </div>
          <div className="twin-stats">
            <div>
              <span>Science capability</span>
              <strong>
                {budget.science}
                <small> / {mission.requiredScience} required</small>
              </strong>
            </div>
            <div>
              <span>Battery capacity</span>
              <strong>
                {num(budget.batteryWh / 1000, 1)}
                <small> kWh</small>
              </strong>
            </div>
            <div>
              <span>Est. reliability</span>
              <strong>
                {(budget.reliability * 100).toFixed(1)}
                <small>%</small>
              </strong>
            </div>
            <div>
              <span>Downlink rate</span>
              <strong>
                {num(budget.commMbps, 2)}
                <small> Mbps</small>
              </strong>
            </div>
          </div>
        </section>
      </div>
      {change && (
        <div className="decision-explainer">
          <span className="explain-icon">
            <ArrowUpRight size={20} />
          </span>
          <div>
            <div className="eyebrow">Design change</div>
            <strong>{change.name}</strong>
            <p>
              Mass {change.mass >= 0 ? "+" : ""}
              {num(change.mass, 1)} kg <span>·</span> Power margin{" "}
              {change.power >= 0 ? "+" : ""}
              {num(change.power, 1)} W <span>·</span> Cost{" "}
              {change.cost >= 0 ? "+" : "−"}
              {money(Math.abs(change.cost))} <span>·</span> Δv{" "}
              {change.dv >= 0 ? "+" : ""}
              {num(change.dv)} m/s
            </p>
          </div>
        </div>
      )}
      <Validation compact />
      <StepFooter back="missions" next="launch" label="Select launch vehicle" />
    </>
  );
}
