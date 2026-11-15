import {
  Download,
  ArrowRight,
  RotateCcw,
  FileText,
  Check,
  Lightbulb,
} from "lucide-react";
import { useGame, money, num } from "../context";
import { components, missions, vehicles } from "../core/data";
import { PageHeading, Badge, Metric, Progress } from "./Common";
import type { ScoreBreakdown } from "../core/types";
const weights: { key: keyof ScoreBreakdown; name: string; weight: number }[] = [
  { key: "science", name: "Scientific objectives", weight: 30 },
  { key: "engineering", name: "Engineering feasibility", weight: 25 },
  { key: "efficiency", name: "Resource efficiency", weight: 20 },
  { key: "operations", name: "Operational decisions", weight: 15 },
  { key: "reliability", name: "Mission reliability", weight: 10 },
];
export default function Report() {
  const { report, navigate, restart, loadDesign, notify } = useGame();
  if (!report)
    return (
      <div className="empty-state">
        <FileText size={48} />
        <h1>No mission report yet</h1>
        <p>
          Complete a mission to receive an engineering debrief and downloadable
          report.
        </p>
        <button className="button primary" onClick={() => navigate("control")}>
          Return to mission control
          <ArrowRight size={17} />
        </button>
      </div>
    );
  const r = report;
  const m = missions.find((x) => x.id === r.design.missionId)!;
  return (
    <>
      <PageHeading
        eyebrow="FLIGHT RESULTS"
        title="Mission debrief"
        description={`${r.design.name} · ${m.destination} · Seed ${r.design.seed}`}
      >
        <button
          className="button primary"
          onClick={async () => {
            try {
              const { exportReportPdf } = await import("../services/report");
              exportReportPdf(r);
              notify("Mission report downloaded as a PDF.");
            } catch {
              notify("PDF export failed. Please try again.");
            }
          }}
        >
          <Download size={17} />
          Export PDF report
        </button>
      </PageHeading>
      <div className="report-overview">
        <div
          className={`score-orbit ${r.status === "FAILED" ? "failed" : ""}`}
          style={
            { "--score-angle": `${r.score * 3.6}deg` } as React.CSSProperties
          }
        >
          <div>
            <span className="eyebrow">MISSION SCORE</span>
            <strong>
              {num(r.score)}
              <small>/100</small>
            </strong>
            <span>
              {r.status === "COMPLETED" ? "CAMPAIGN COMPLETE" : "MISSION LOST"}
            </span>
          </div>
        </div>
        <div className="report-summary">
          <Badge tone={r.status === "COMPLETED" ? "green" : "amber"}>
            {r.status === "COMPLETED" ? "Mission completed" : "Mission failed"}
          </Badge>
          <h2>{m.name}</h2>
          <p>{r.summary}</p>
          <div className="report-metrics">
            <Metric
              label="Science objectives"
              value={num(r.sciencePercent)}
              unit="%"
            />
            <Metric label="Data returned" value={num(r.dataPercent)} unit="%" />
            <Metric label="Mission cost" value={money(r.budget.costM)} />
          </div>
        </div>
      </div>
      <div className="report-columns">
        <section className="score-panel">
          <div className="panel-heading">
            <h3>How your score adds up</h3>
            <span className="micro">WEIGHTED / 100</span>
          </div>
          {weights.map((w) => (
            <div className="score-row" key={w.key}>
              <div>
                <span>
                  {w.name}
                  <small>{w.weight}% weight</small>
                </span>
                <strong>
                  {num(r.breakdown[w.key], 1)}
                  <small> / 100</small>
                </strong>
              </div>
              <Progress value={r.breakdown[w.key]} />
            </div>
          ))}
          <p className="model-note">
            Score = science × .30 + engineering × .25 + efficiency × .20 +
            operations × .15 + reliability × .10. Critical failure caps the
            result.
          </p>
        </section>
        <section className="report-resource">
          <div className="panel-heading">
            <h3>Engineering ledger</h3>
            <span className="micro">MISSION MODEL</span>
          </div>
          {[
            [
              "Budget utilization",
              `${num(r.budgetUsedPercent, 1)}% of ${money(m.budgetM)}`,
            ],
            [
              "Propellant used",
              `${num(r.fuelUsedKg, 1)} / ${num(r.design.fuelKg)} kg`,
            ],
            ["Launch mass", `${num(r.budget.totalMassKg)} kg`],
            [
              "Launch vehicle",
              vehicles.find((v) => v.id === r.design.vehicleId)?.name ??
                "Unknown",
            ],
            [
              "Available / required Δv",
              `${num(r.budget.deltaV)} / ${num(r.budget.requiredDeltaV)} m/s`,
            ],
            [
              "Generation / demand",
              `${num(r.budget.generationW)} / ${num(r.budget.demandW)} W`,
            ],
            ["Downlink capacity", `${num(r.budget.commMbps, 2)} Mbps`],
            ["Operator decisions", `${r.decisions.length} recorded`],
          ].map(([key, value]) => (
            <div className="ledger-row" key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>
      </div>
      <section className="recommendations">
        <div className="eyebrow">
          <Lightbulb size={15} /> FLIGHT ANALYSIS
        </div>
        <h2>Changes for your next flight</h2>
        {r.recommendations.map((recommendation, i) => (
          <div key={i}>
            <span className="mono">0{i + 1}</span>
            <p>{recommendation}</p>
          </div>
        ))}
      </section>
      <details className="report-details">
        <summary>
          Spacecraft manifest{" "}
          <span>{r.design.componentIds.length} modules</span>
        </summary>
        <div className="manifest-grid">
          {r.design.componentIds.map((id) => {
            const c = components.find((x) => x.id === id);
            return c ? (
              <div key={id}>
                <Check size={14} />
                <span>
                  {c.name}
                  <small>
                    {num(c.massKg)} kg · {money(c.costM)}
                  </small>
                </span>
              </div>
            ) : null;
          })}
        </div>
      </details>
      <details className="report-details">
        <summary>
          Flight events & operator decisions{" "}
          <span>{r.events.length} events</span>
        </summary>
        {r.events.map((e) => (
          <div className="report-event" key={e.id}>
            <span className="mono">T+{e.tick}</span>
            <div>
              <strong>{e.title}</strong>
              <p>{e.detail}</p>
            </div>
          </div>
        ))}
        {r.decisions.map((d, i) => (
          <div className="report-event" key={`d-${i}`}>
            <span className="mono">T+{d.tick}</span>
            <div>
              <strong>{d.option}</strong>
              <p>{d.detail}</p>
            </div>
          </div>
        ))}
      </details>
      <div className="step-footer">
        <button className="button outline" onClick={() => navigate("archive")}>
          Compare missions
          <ArrowRight size={16} />
        </button>
        <div className="heading-actions">
          <button className="button outline" onClick={restart}>
            <RotateCcw size={16} />
            Replay same seed
          </button>
          <button
            className="button primary"
            onClick={() => loadDesign(r.design)}
          >
            Redesign spacecraft
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
