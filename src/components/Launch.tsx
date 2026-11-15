import { Check, ArrowUpRight, ShieldCheck, Info } from "lucide-react";
import { vehicles } from "../core/data";
import { useGame, money, num } from "../context";
import {
  PageHeading,
  BudgetStrip,
  StepFooter,
  Validation,
  Progress,
} from "./Common";
export default function Launch() {
  const { design, updateDesign, budget, mission } = useGame();
  return (
    <>
      <PageHeading
        eyebrow={mission.name}
        title="Select a launch vehicle"
        description={`Compare cost and payload capacity for ${mission.destination.toLowerCase()}. Your spacecraft weighs ${num(budget.totalMassKg)} kg with fuel.`}
      />
      <BudgetStrip />
      <div className="vehicle-grid">
        {vehicles.map((v, i) => {
          const capacity = v.capacityKg[design.missionId];
          const margin = capacity - budget.totalMassKg;
          const active = design.vehicleId === v.id;
          return (
            <button
              className={`vehicle-card ${active ? "selected" : ""}`}
              key={v.id}
              onClick={() =>
                updateDesign(
                  { vehicleId: v.id },
                  `Selected ${v.name} launch vehicle`,
                )
              }
              aria-pressed={active}
            >
              <div className="vehicle-top">
                <span className="eyebrow">{v.subtitle}</span>
                {active ? (
                  <span className="check-circle">
                    <Check size={14} />
                  </span>
                ) : (
                  <ArrowUpRight size={18} />
                )}
              </div>
              <div className="vehicle-art">
                <div className={`rocket-art rocket-${i}`}>
                  <div className="rocket-nose" />
                  <div className="rocket-body">
                    <span>MC</span>
                    <div className="rocket-stripe" />
                    <small>{v.name.toUpperCase()}</small>
                  </div>
                  <div className="rocket-engine" />
                  {i > 0 && (
                    <>
                      <div className="booster left" />
                      <div className="booster right" />
                    </>
                  )}
                </div>
                <div className="height-line">
                  <span>{v.heightM} m</span>
                </div>
              </div>
              <div className="vehicle-title">
                <h2>{v.name}</h2>
                <strong>
                  {money(v.costM)}
                  <small>launch cost</small>
                </strong>
              </div>
              <div className="vehicle-spec">
                <span>Capacity to {mission.destination.toLowerCase()}</span>
                <strong>
                  {capacity ? `${num(capacity)} kg` : "Not supported"}
                </strong>
              </div>
              <div className="vehicle-spec">
                <span>Modeled launch reliability</span>
                <strong>{v.reliability * 100}%</strong>
              </div>
              <div className="payload-fit">
                <div>
                  <span>
                    {margin >= 0 ? "Payload margin" : "Capacity shortfall"}
                  </span>
                  <strong className={margin >= 0 ? "good" : "bad"}>
                    {num(Math.abs(margin))} kg{" "}
                    {margin >= 0 ? "available" : "over"}
                  </strong>
                </div>
                <Progress
                  value={capacity ? (budget.totalMassKg / capacity) * 100 : 100}
                  tone={margin >= 0 ? "cyan" : "red"}
                />
              </div>
            </button>
          );
        })}
      </div>
      <div className="model-note vehicle-note">
        <Info size={15} />
        <span>
          Illustrative vehicle classes, model 1.0. Each capacity is the mass the
          vehicle can send to the selected destination.
        </span>
      </div>
      <div className="launch-checks">
        <section>
          <div className="eyebrow">
            <ShieldCheck size={15} /> PRELAUNCH CHECKS
          </div>
          <h2>Launch readiness</h2>
          <p className="muted">
            Your launch review includes the complete mission cost, payload fit,
            fuel, power, and subsystem compatibility.
          </p>
        </section>
        <Validation />
      </div>
      <StepFooter back="design" next="trajectory" label="Plan trajectory" />
    </>
  );
}
