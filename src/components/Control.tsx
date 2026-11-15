import { lazy, Suspense, useEffect, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  ExternalLink,
  Fuel,
  Pause,
  PencilRuler,
  Play,
  Radio,
  RotateCcw,
  Satellite,
  Sun,
  Thermometer,
} from "lucide-react";
import { money, num, useGame } from "../context";
import { missions } from "../core/data";
import { calculateBudget } from "../core/engineering";
import {
  FLIGHT_MODEL,
  getFlightStages,
  getLivePower,
} from "../core/simulation";
import type { Anomaly, SimulationState, TelemetryPoint } from "../core/types";
import { Badge, Metric, PageHeading, Progress } from "./Common";

const SpaceScene = lazy(() => import("./SpaceScene"));

function TelemetryChart({ points }: { points: TelemetryPoint[] }) {
  const samples = points.slice(-60);
  const path = (channel: "battery" | "health") =>
    samples
      .map((point, index) => {
        const x = (index / Math.max(1, samples.length - 1)) * 600;
        const y = 90 - Math.max(0, Math.min(100, point[channel])) * 0.7;
        return `${index === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");

  return (
    <div className="telemetry-chart">
      <div className="chart-legend">
        <span>
          <i />
          Battery %
        </span>
        <span>
          <i />
          Health %
        </span>
        <span className="mono">LAST {samples.length} SAMPLES</span>
      </div>
      <svg
        viewBox="0 0 600 110"
        role="img"
        aria-label="Battery charge and spacecraft health percentages over recent flight ticks"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7bc9c0" stopOpacity=".15" />
            <stop offset="100%" stopColor="#7bc9c0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 55, 90].map((y) => (
          <line
            key={y}
            x1="0"
            x2="600"
            y1={y}
            y2={y}
            stroke="#26303b"
            strokeDasharray="3 5"
          />
        ))}
        {samples.length > 1 && (
          <>
            <path
              d={`${path("battery")} L600,110 L0,110 Z`}
              fill="url(#chart-fill)"
            />
            <path
              d={path("battery")}
              fill="none"
              stroke="#7bc9c0"
              strokeWidth="2"
            />
            <path
              d={path("health")}
              fill="none"
              stroke="#cfb987"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </>
        )}
      </svg>
      <div className="range-labels">
        <span>T+{samples[0]?.tick ?? 0}</span>
        <span>T+{samples.at(-1)?.tick ?? 0}</span>
      </div>
    </div>
  );
}

function ResourceWatch({ state }: { state: SimulationState }) {
  const budget = calculateBudget(state.design);
  const mission = missions.find((item) => item.id === state.design.missionId)!;
  const power = getLivePower(state, budget);
  const batteryPct = (state.batteryWh / power.batteryCapacityWh) * 100;
  const dischargeW = Math.max(0, power.demandW - power.generationW);
  const hot = state.temperatureC > FLIGHT_MODEL.thermalDamageC;
  let thermalFeedback = "Within the operating range.";
  if (hot)
    thermalFeedback = "Elevated temperature is damaging spacecraft health.";
  if (state.temperatureC >= FLIGHT_MODEL.thermalScienceHoldC)
    thermalFeedback =
      "Instruments on thermal hold. Science resumes below 60°C.";

  return (
    <aside className="resources-panel" aria-label="Live spacecraft resources">
      <div className="panel-heading">
        <span>RESOURCE WATCH</span>
        <span className="micro">
          {power.inEclipse ? "IN ECLIPSE" : "SUNLIT"}
        </span>
      </div>
      <div className="resource">
        <div>
          <span>
            <Activity size={14} />
            Spacecraft health
          </span>
          <strong className={state.health < 50 ? "bad" : ""}>
            {num(state.health)}%
          </strong>
        </div>
        <Progress
          value={state.health}
          tone={state.health < 50 ? "red" : "cyan"}
        />
      </div>
      <div className="resource">
        <div>
          <span>
            <Sun size={14} />
            Battery charge
          </span>
          <strong className={batteryPct < 25 ? "bad" : ""}>
            {num(batteryPct)}%
          </strong>
        </div>
        <Progress value={batteryPct} tone={batteryPct < 25 ? "red" : "cyan"} />
        <small>
          {num(state.batteryWh)} / {num(power.batteryCapacityWh)} Wh
          {dischargeW > 0 && ` · ${num(dischargeW)} W deficit`}
        </small>
        {state.batteryWh <= 0 && (
          <small>
            Power safe mode. Observations resume when the battery recovers.
          </small>
        )}
      </div>
      <div className="resource">
        <div>
          <span>
            <Fuel size={14} />
            Propellant remaining
          </span>
          <strong>{num(state.fuelKg, 1)} kg</strong>
        </div>
        <Progress
          value={(state.fuelKg / Math.max(1, state.design.fuelKg)) * 100}
        />
        <small>{num(budget.dryMassKg)} kg dry spacecraft mass</small>
      </div>
      <div className="resource">
        <div>
          <span>
            <Database size={14} />
            Onboard data
          </span>
          <strong>{num(state.dataMb)} MB</strong>
        </div>
        <Progress value={(state.dataMb / budget.storageMb) * 100} />
        <small>{num(budget.storageMb)} MB storage capacity</small>
      </div>
      <div className="resource">
        <div>
          <span>
            <Thermometer size={14} />
            Thermal state
          </span>
          <strong className={hot ? "bad" : ""}>
            {num(state.temperatureC, 1)} °C
          </strong>
        </div>
        <small>{thermalFeedback}</small>
      </div>
      <div className="resource-pair">
        <Metric label="Solar output" value={num(power.generationW)} unit="W">
          {power.inEclipse
            ? "Eclipse"
            : `${num(state.solarMultiplier * 100)}% array output`}
        </Metric>
        <Metric label="Current demand" value={num(power.demandW)} unit="W">
          {power.shedW > 0
            ? `${num(power.shedW, 1)} W shed by payload`
            : "Full payload duty cycle"}
        </Metric>
      </div>
      <div className="resource">
        <div>
          <span>Budget remaining</span>
          <strong>{money(mission.budgetM - budget.costM)}</strong>
        </div>
        <small>
          {money(budget.costM)} committed from {money(mission.budgetM)}
        </small>
      </div>
      <div className="science-achievement">
        <span className="eyebrow">SCIENCE RETURNED</span>
        <strong>
          {num(state.scienceProgress)}
          <small>%</small>
        </strong>
        <Progress value={state.scienceProgress} />
        <p className="small muted">
          {num(state.downlinkedMb)} / {num(mission.requiredDataMb)} MB delivered
        </p>
      </div>
    </aside>
  );
}

function AnomalyPanel({
  anomaly,
  decide,
}: {
  anomaly: Anomaly;
  decide: (id: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [anomaly.id]);

  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="anomaly-panel"
      role="alertdialog"
      aria-labelledby="anomaly-title"
      aria-describedby="anomaly-description"
    >
      <div className="anomaly-heading">
        <AlertTriangle size={23} />
        <div>
          <span className="eyebrow">
            FLIGHT DIRECTOR INPUT REQUIRED · SIMULATION PAUSED
          </span>
          <h2 id="anomaly-title">{anomaly.title}</h2>
        </div>
      </div>
      <p id="anomaly-description">{anomaly.description}</p>
      <div className="anomaly-options">
        {anomaly.options.map((option, index) => (
          <button key={option.id} onClick={() => decide(option.id)}>
            <span className="option-letter">
              {String.fromCharCode(65 + index)}
            </span>
            <div>
              <strong>{option.label}</strong>
              <p>{option.description}</p>
            </div>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
    </section>
  );
}

function flightTitle(state: SimulationState) {
  if (state.status === "FAILED") return "Signal lost";
  if (state.status === "COMPLETED") return "Mission complete";
  if (state.phase === "Countdown")
    return `T−${FLIGHT_MODEL.countdownTicks - state.tick}`;
  return "Telemetry acquired";
}

export default function Control() {
  const {
    simulation,
    speed,
    setSpeed,
    togglePause,
    restart,
    decide,
    navigate,
    redesignFlight,
    reducedMotion,
    setArchivedReport,
  } = useGame();
  if (!simulation)
    return (
      <div className="empty-state">
        <Satellite size={48} />
        <div className="eyebrow">AWAITING FLIGHT PLAN</div>
        <h1>Your console is ready.</h1>
        <p>
          Design a spacecraft and complete the launch review to begin your first
          mission.
        </p>
        <button className="button primary" onClick={() => navigate("design")}>
          Open design lab
          <ArrowRight size={17} />
        </button>
      </div>
    );

  const state = simulation;
  const mission = missions.find((item) => item.id === state.design.missionId)!;
  const failed = state.status === "FAILED";
  const ended = state.status === "COMPLETED" || failed;
  const paused = state.status === "PAUSED";
  const phaseNames = getFlightStages(state).map((stage) => stage.phase);
  const activePhase = phaseNames.indexOf(state.phase);
  let linkStatus = state.commOnline
    ? "Ground link active"
    : "Between contact windows";
  if (state.commMultiplier === 0) linkStatus = "Ground link interrupted";
  return (
    <>
      <PageHeading
        eyebrow="05 / LIVE MISSION OPERATIONS"
        title={state.design.name}
        description={`${mission.destination} · Seed ${state.seed} · Flight ${state.id.slice(0, 8).toUpperCase()}`}
      >
        <Badge tone={failed || paused ? "amber" : "green"}>
          {state.anomaly
            ? "Decision required"
            : state.status.replaceAll("_", " ").toLowerCase()}
        </Badge>
      </PageHeading>
      <div className="mission-controls">
        <div className="flight-clock">
          <span className="eyebrow">MISSION ELAPSED</span>
          <strong>
            {num(state.elapsedDays, 1)} <small>days</small>
          </strong>
          <span className="mono muted">
            T+{String(state.tick).padStart(3, "0")} / {state.totalTicks} TICKS
          </span>
        </div>
        <div className="playback-controls">
          <button
            className="button primary"
            disabled={ended || !!state.anomaly}
            onClick={togglePause}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}{" "}
            {paused ? "Resume" : "Pause"}
          </button>
          <div className="speed-control" aria-label="Simulation speed">
            {[1, 5, 20].map((value) => (
              <button
                aria-pressed={speed === value}
                key={value}
                className={speed === value ? "active" : ""}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            onClick={restart}
            aria-label="Restart this mission"
          >
            <RotateCcw size={18} />
          </button>
          <button className="button outline" onClick={redesignFlight}>
            <PencilRuler size={16} />
            Redesign
          </button>
        </div>
      </div>
      {state.anomaly && (
        <AnomalyPanel
          key={`${state.id}-${state.tick}`}
          anomaly={state.anomaly}
          decide={decide}
        />
      )}
      <div className="control-layout">
        <div className="flight-main">
          <section className="flight-visual">
            <div className="panel-heading">
              <span>
                <Activity size={16} />
                FLIGHT DYNAMICS
              </span>
              <span className="micro">{state.phase.toUpperCase()}</span>
            </div>
            <div className="flight-canvas">
              <Suspense
                fallback={
                  <div className="scene-loading">Acquiring spacecraft…</div>
                }
              >
                <SpaceScene
                  mode="flight"
                  missionId={state.design.missionId}
                  design={state.design}
                  progress={state.tick / state.totalTicks}
                  reducedMotion={reducedMotion || paused || ended}
                />
              </Suspense>
              <div className="flight-overlay">
                <div className="eyebrow">{state.phase}</div>
                <strong>{flightTitle(state)}</strong>
              </div>
              <div className="signal-status">
                <Radio size={15} />
                {linkStatus}
              </div>
            </div>
            <div className="phase-tracker">
              {phaseNames.map((phase, index) => (
                <div
                  key={phase}
                  className={`${index < activePhase ? "done" : ""} ${index === activePhase ? "active" : ""}`}
                >
                  <span>
                    {index < activePhase
                      ? "✓"
                      : String(index + 1).padStart(2, "0")}
                  </span>
                  <small>{phase}</small>
                </div>
              ))}
            </div>
          </section>
          <div className="telemetry-panel">
            <div className="panel-heading">
              <span>
                <Activity size={16} />
                SPACECRAFT TELEMETRY
              </span>
              <span className="micro">
                ONE SAMPLE EVERY {FLIGHT_MODEL.telemetryIntervalTicks} TICKS
              </span>
            </div>
            <TelemetryChart points={state.telemetry} />
          </div>
        </div>
        <ResourceWatch state={state} />
      </div>
      {ended && (
        <section className={`completion-panel ${failed ? "failed" : ""}`}>
          <div>
            <div className="eyebrow">FLIGHT REVIEW IS READY</div>
            <h2>
              {failed
                ? "Mission objectives unmet."
                : "Mission objectives achieved."}
            </h2>
            <p>
              {state.failureReason ??
                "Review the science returned, resources used, and decisions recorded during the mission."}
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setArchivedReport(null);
              navigate("report");
            }}
          >
            View mission report
            <ArrowRight size={17} />
          </button>
        </section>
      )}
      <section className="event-log">
        <div className="panel-heading">
          <span>MISSION EVENT LOG</span>
          <span className="micro">{state.events.length} RECORDED EVENTS</span>
        </div>
        <div className="event-table">
          {state.events
            .slice()
            .reverse()
            .map((record) => (
              <div key={record.id} className={`event-row ${record.kind}`}>
                <span className="mono">
                  T+{String(record.tick).padStart(3, "0")}
                </span>
                <span className="status-dot" />
                <strong>{record.title}</strong>
                <span>{record.detail}</span>
              </div>
            ))}
        </div>
      </section>
      <div className="operation-note">
        <ExternalLink size={13} />
        The campaign calendar is compressed. Each tick samples{" "}
        {FLIGHT_MODEL.powerSampleMinutes} minutes of power and thermal activity.
        Each modeled contact samples {FLIGHT_MODEL.contactMinutes} minutes of
        downlink.
      </div>
    </>
  );
}
