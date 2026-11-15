import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  AlertTriangle,
  ArrowLeft,
  Info,
  X,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { useGame, money, num, type Page } from "../context";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Badge({
  children,
  tone = "cyan",
}: {
  children: ReactNode;
  tone?: "cyan" | "green" | "amber" | "muted";
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function Metric({
  label,
  value,
  unit,
  children,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  children?: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span className="metric-label">{label}</span>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      {children && <div className="metric-note">{children}</div>}
    </div>
  );
}
export function Progress({
  value,
  tone = "cyan",
}: {
  value: number;
  tone?: string;
}) {
  return (
    <div className={`progress ${tone}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export function BudgetStrip() {
  const { budget, mission } = useGame();
  return (
    <div className="budget-strip">
      <Metric label="Mission budget" value={money(budget.costM)}>
        <Progress
          value={(budget.costM / mission.budgetM) * 100}
          tone={budget.costM > mission.budgetM ? "red" : "cyan"}
        />
        <span>{money(mission.budgetM - budget.costM)} available</span>
      </Metric>
      <Metric label="Launch mass" value={num(budget.totalMassKg)} unit="kg">
        {num(budget.payloadMarginKg)} kg payload margin
      </Metric>
      <Metric
        label="Power balance"
        value={`${budget.generationW >= budget.demandW ? "+" : ""}${num(budget.generationW - budget.demandW)}`}
        unit="W"
        tone={budget.generationW < budget.demandW ? "bad" : "good"}
      >
        {num(budget.generationW)} W generated / {num(budget.demandW)} W used
      </Metric>
      <Metric label="Available Δv" value={num(budget.deltaV)} unit="m/s">
        {num(budget.requiredDeltaV)} m/s required
      </Metric>
    </div>
  );
}
export function Validation({ compact = false }: { compact?: boolean }) {
  const { issues } = useGame();
  const errors = issues.filter((x) => x.severity === "error");
  return (
    <div className={`validation ${compact ? "compact" : ""}`}>
      <div className="panel-heading">
        <span>
          <span className={`status-dot ${errors.length ? "amber" : "green"}`} />
          {errors.length
            ? `${errors.length} issues to resolve`
            : "All critical systems go"}
        </span>
        <span className="micro">ENGINEERING CHECK</span>
      </div>
      {issues
        .filter((x) => x.severity !== "info")
        .map((issue) => (
          <div key={issue.id} className={`validation-row ${issue.severity}`}>
            <AlertTriangle size={15} />
            <div>
              <strong>{issue.message}</strong>
              {!compact && <p>{issue.fix}</p>}
            </div>
          </div>
        ))}
      {!issues.some((x) => x.severity !== "info") && (
        <div className="validation-row">
          <Check size={16} />
          <div>
            <strong>Your configuration meets the mission requirements.</strong>
            {!compact && (
              <p>
                Mass, power, battery, propulsion, communications, and cost are
                within limits.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export function StepFooter({
  back,
  next,
  label,
  disabled = false,
  onNext,
}: {
  back?: Page;
  next?: Page;
  label: string;
  disabled?: boolean;
  onNext?: () => void;
}) {
  const { navigate } = useGame();
  return (
    <div className="step-footer">
      <div>
        {back && (
          <button className="text-button" onClick={() => navigate(back)}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
      </div>
      <div className="footer-action">
        <span className="micro">EVERY DECISION SHAPES THE MISSION.</span>
        <button
          className="button primary"
          disabled={disabled}
          onClick={onNext ?? (() => next && navigate(next))}
        >
          {label}
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function Tutorial() {
  const { tutorial, setTutorial, page } = useGame();
  if (!tutorial) return null;
  const instructions: Record<string, [string, string]> = {
    missions: [
      "01 / Choose your destination",
      "Start with Earth observation. You have an $80M budget and a preconfigured spacecraft you can improve.",
    ],
    design: [
      "02 / Build your spacecraft",
      "The Earth mission starts with an $80M budget. Try a different solar array and compare mass, power, cost, and delta-v. Then continue to launch.",
    ],
    launch: [
      "03 / Book a launch",
      "Compare destination-specific capacity. Your vehicle must fit the spacecraft and the total mission budget.",
    ],
    trajectory: [
      "04 / Plan the orbit",
      "Change the altitude to see orbital speed and period respond. Resolve any readiness issues, then launch.",
    ],
    control: [
      "05 / Take the flight director’s seat",
      "Set simulation speed, watch resources, and resolve anomalies. You can pause at any time.",
    ],
    report: [
      "06 / Learn and fly again",
      "Your score comes from the mission’s recorded outcomes. Export a report or redesign and compare your next attempt.",
    ],
    archive: [
      "Your mission notebook",
      "Load a saved spacecraft or compare resource margins side by side.",
    ],
  };
  const current = instructions[page];
  return (
    <aside className="tutorial">
      <BookOpen size={21} />
      <div>
        <strong>{current[0]}</strong>
        <p>{current[1]}</p>
      </div>
      <button
        aria-label="Skip tutorial"
        className="icon-button"
        onClick={() => setTutorial(false)}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
const handbookTopics = [
  [
    "Delta-v",
    "Delta-v measures how much your spacecraft can change its velocity. More propellant or a more efficient engine increases it. Extra dry mass reduces it. Δv = Isp × 9.80665 × ln(wet mass / dry mass).",
  ],
  [
    "Payload and launch",
    "A rocket has a different payload limit for each destination. Lunar and interplanetary missions need more launch energy than Earth orbit. The fictional launch classes have separate limits for each route.",
  ],
  [
    "Power and energy",
    "Solar arrays supply power in watts. Batteries store energy in watt-hours. Eclipses and damaged arrays can deplete the battery. A larger battery buys more operating time and adds mass.",
  ],
  [
    "Orbit and transfer",
    "Circular speed is √(μ/r) and orbital period is 2π√(r³/μ). The game uses simplified two-body circular orbits and idealized transfers. Here r is the distance from the center of the body.",
  ],
  [
    "Communications",
    "A radio signal travels at the speed of light. The displayed delay is one-way. Downlink rate and communication windows limit how much collected science reaches Earth.",
  ],
  [
    "Score and success",
    "Science contributes 30%, engineering 25%, resource efficiency 20%, operations 15%, and reliability 10%. Critical failures cap the score at 49. Each run records its simulation seed and decisions.",
  ],
  [
    "Simulation time",
    "A mission advances through 180 ticks. Each tick represents a compressed part of the campaign. Power and ground contact use representative operating windows.",
  ],
  [
    "Saving your work",
    "This edition saves your draft, flight, designs, and reports in this browser. Reloading restores an active flight at the same tick and waits for you to resume or resolve its pending anomaly.",
  ],
];

export function HelpPanel() {
  const { help, setHelp } = useGame();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!help || !dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [help]);
  if (!help) return null;
  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      aria-labelledby="help-title"
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        width: "100vw",
        height: "100dvh",
        maxWidth: "none",
        maxHeight: "none",
        color: "inherit",
      }}
      onCancel={(event) => {
        event.preventDefault();
        setHelp(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) setHelp(false);
      }}
    >
      <aside className="help-panel">
        <div className="panel-heading">
          <span>
            <BookOpen size={20} /> FLIGHT HANDBOOK
          </span>
          <button
            className="icon-button"
            aria-label="Close handbook"
            onClick={() => setHelp(false)}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="help-title">Flight handbook</h2>
        <p className="muted">Engineering concepts for your first mission.</p>
        {handbookTopics.map(([title, body], index) => (
          <details key={title} open={index === 0}>
            <summary>
              {title}
              <ChevronRight size={16} />
            </summary>
            <p>{body}</p>
          </details>
        ))}
        <div className="help-source">
          <Info size={16} />
          <span>
            Earth imagery: NASA Blue Marble Next Generation, via NASA WorldWind.
            This is an independent educational project.{" "}
            <a
              href="https://ssd.jpl.nasa.gov/astro_par.html"
              target="_blank"
              rel="noreferrer"
            >
              JPL reference constants ↗
            </a>
          </span>
        </div>
      </aside>
    </dialog>
  );
}
