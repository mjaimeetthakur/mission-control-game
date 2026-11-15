import { useState } from "react";
import {
  Archive as ArchiveIcon,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  GitCompareArrows,
  FileText,
} from "lucide-react";
import { useGame, money, num } from "../context";
import { calculateBudget } from "../core/engineering";
import { missions } from "../core/data";
import { PageHeading, Badge } from "./Common";
export default function Archive() {
  const {
    savedDesigns,
    setSavedDesigns,
    saveDesign,
    loadDesign,
    reports,
    openArchivedReport,
  } = useGame();
  const [compared, setCompared] = useState<string[]>([]);
  const comparison = savedDesigns.filter((x) => compared.includes(x.id));
  return (
    <>
      <PageHeading
        eyebrow="MISSION ARCHIVE"
        title="Mission archive"
        description="Compare saved spacecraft and review the results of previous flights."
      >
        <button className="button primary" onClick={saveDesign}>
          <Plus size={17} />
          Save current design
        </button>
      </PageHeading>
      <div className="section-heading">
        <h2>
          Saved spacecraft{" "}
          <span className="count-tag">{savedDesigns.length}</span>
        </h2>
        <span className="small muted">Select up to 3 designs to compare</span>
      </div>
      {!savedDesigns.length ? (
        <div className="empty-state compact-empty">
          <ArchiveIcon size={35} />
          <h3>Your first design belongs here.</h3>
          <p>Save the spacecraft you are working on to start a comparison.</p>
          <button className="button outline" onClick={saveDesign}>
            Save current design
            <Plus size={16} />
          </button>
        </div>
      ) : (
        <div className="saved-grid">
          {savedDesigns.map((d) => {
            const b = calculateBudget(d);
            const selected = compared.includes(d.id);
            return (
              <article
                className={`saved-card ${selected ? "selected" : ""}`}
                key={d.id}
              >
                <div className="panel-heading">
                  <span className="eyebrow">
                    {missions.find((x) => x.id === d.missionId)?.subtitle}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${d.name}`}
                    onClick={() => {
                      if (
                        !window.confirm(`Delete the saved design “${d.name}”?`)
                      )
                        return;
                      setSavedDesigns(
                        savedDesigns.filter((x) => x.id !== d.id),
                      );
                      setCompared(compared.filter((x) => x !== d.id));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <h3>{d.name}</h3>
                <p className="small muted">
                  {new Date(d.updatedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  · {d.componentIds.length} modules
                </p>
                <div className="saved-metrics">
                  <div>
                    <span>Mass</span>
                    <strong>{num(b.totalMassKg)} kg</strong>
                  </div>
                  <div>
                    <span>Cost</span>
                    <strong>{money(b.costM)}</strong>
                  </div>
                  <div>
                    <span>Δv</span>
                    <strong>{num(b.deltaV)} m/s</strong>
                  </div>
                </div>
                <div className="saved-actions">
                  <button className="text-button" onClick={() => loadDesign(d)}>
                    Load design
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className={`button small-button ${selected ? "active" : ""}`}
                    disabled={!selected && compared.length >= 3}
                    onClick={() =>
                      setCompared(
                        selected
                          ? compared.filter((x) => x !== d.id)
                          : [...compared, d.id],
                      )
                    }
                  >
                    {selected ? (
                      <Check size={14} />
                    ) : (
                      <GitCompareArrows size={14} />
                    )}
                    Compare
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {comparison.length > 0 && (
        <section className="comparison">
          <div className="panel-heading">
            <h3>Engineering comparison</h3>
            <span className="micro">SAVED DESIGNS</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  {comparison.map((d) => (
                    <th key={d.id}>{d.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "Mission cost",
                  "Wet mass",
                  "Power margin",
                  "Available delta-v",
                  "Required delta-v",
                  "Payload margin",
                  "Science capability",
                  "Reliability",
                ].map((label, i) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {comparison.map((d) => {
                      const b = calculateBudget(d);
                      return (
                        <td key={d.id}>
                          {
                            [
                              money(b.costM),
                              `${num(b.totalMassKg)} kg`,
                              `${num(b.generationW - b.demandW)} W`,
                              `${num(b.deltaV)} m/s`,
                              `${num(b.requiredDeltaV)} m/s`,
                              `${num(b.payloadMarginKg)} kg`,
                              b.science,
                              `${num(b.reliability * 100, 1)}%`,
                            ][i]
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="section-heading">
        <h2>
          Flight history <span className="count-tag">{reports.length}</span>
        </h2>
      </div>
      {reports.length ? (
        <div className="flight-history">
          {reports.map((r) => (
            <button key={r.simulationId} onClick={() => openArchivedReport(r)}>
              <FileText size={22} />
              <div>
                <strong>{r.design.name}</strong>
                <span>
                  {r.missionName} · Seed {r.design.seed}
                </span>
              </div>
              <Badge tone={r.status === "COMPLETED" ? "green" : "amber"}>
                {r.status === "COMPLETED" ? "Complete" : "Failed"}
              </Badge>
              <strong className="history-score">
                {num(r.score)}
                <small>/100</small>
              </strong>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <p className="muted archive-empty">
          Your completed missions will appear here automatically.
        </p>
      )}
    </>
  );
}
