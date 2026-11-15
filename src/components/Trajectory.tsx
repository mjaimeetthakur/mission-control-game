import { lazy, Suspense } from "react";
import { Navigation, Timer, Info } from "lucide-react";
import { useGame, num } from "../context";
import { PageHeading, Metric, StepFooter, Validation, Badge } from "./Common";
const SpaceScene = lazy(() => import("./SpaceScene"));
export default function Trajectory() {
  const {
    design,
    mission,
    budget,
    updateDesign,
    issues,
    launch,
    reducedMotion,
  } = useGame();
  const blocked = issues.some((x) => x.severity === "error");
  return (
    <>
      <PageHeading
        eyebrow={mission.name}
        title="Plan the mission orbit"
        description="Set the target altitude and orbital inclination. Check the maneuver budget before committing to launch."
      >
        <Badge tone={blocked ? "amber" : "green"}>
          {blocked ? "Review required" : "Flight plan ready"}
        </Badge>
      </PageHeading>
      <div className="trajectory-layout">
        <section className="trajectory-visual">
          <div className="panel-heading">
            <span>
              <Navigation size={16} /> ORBIT & TRANSFER VIEW
            </span>
            <span className="micro">SCHEMATIC · NOT TO SCALE</span>
          </div>
          <div className="orbit-canvas">
            <Suspense
              fallback={
                <div className="scene-loading">Computing orbital view…</div>
              }
            >
              <SpaceScene
                mode="trajectory"
                missionId={design.missionId}
                design={design}
                reducedMotion={reducedMotion}
              />
            </Suspense>
            <div className="orbit-label">
              <span className="status-dot" />{" "}
              {mission.destination.toUpperCase()}
              <small>{num(design.altitudeKm)} KM TARGET ALTITUDE</small>
            </div>
          </div>
          <div className="trajectory-metrics">
            <Metric
              label="Circular orbit speed"
              value={num(budget.orbitalVelocity, 1)}
              unit="m/s"
            />
            <Metric
              label="Orbital period"
              value={num(budget.orbitalPeriodSec / 60, 1)}
              unit="min"
            />
            <Metric
              label="One-way light time"
              value={num(budget.commDelaySec, 2)}
              unit="s"
            />
          </div>
        </section>
        <aside className="trajectory-settings">
          <div className="eyebrow">FLIGHT PARAMETERS</div>
          <h3>Target orbit</h3>
          <label className="slider-label" htmlFor="altitude">
            Target altitude
            <strong>
              {num(design.altitudeKm)} <small>km</small>
            </strong>
          </label>
          <input
            id="altitude"
            type="range"
            min={mission.minAltitudeKm}
            max={mission.maxAltitudeKm}
            step={mission.id === "asteroid" ? 1 : 10}
            value={design.altitudeKm}
            onChange={(e) => updateDesign({ altitudeKm: +e.target.value })}
          />
          <div className="range-labels">
            <span>{mission.minAltitudeKm} km</span>
            <span>{num(mission.maxAltitudeKm)} km</span>
          </div>
          <p className="small muted">
            Higher orbits have longer periods. Moving away from the reference
            altitude increases the maneuver budget.
          </p>
          <label className="slider-label" htmlFor="inclination">
            Orbit inclination<strong>{design.inclinationDeg}°</strong>
          </label>
          <input
            id="inclination"
            type="range"
            min={0}
            max={180}
            step={1}
            value={design.inclinationDeg}
            onChange={(e) => updateDesign({ inclinationDeg: +e.target.value })}
          />
          <div className="range-labels">
            <span>Equatorial 0°</span>
            <span>Retrograde 180°</span>
          </div>
          <p className="small muted">
            The launch vehicle delivers you at{" "}
            {mission.id === "earth" ? 97 : 90}°. A change of orbital plane uses
            propellant. Larger changes need more delta-v.
          </p>
          <label className="seed-label" htmlFor="seed">
            Simulation seed
            <input
              id="seed"
              type="number"
              min={0}
              max={2147483647}
              value={design.seed}
              onChange={(e) =>
                updateDesign({
                  seed: Math.max(
                    0,
                    Math.min(2147483647, Math.round(+e.target.value || 0)),
                  ),
                })
              }
            />
          </label>
          <p className="small muted">
            Keep the same seed, design, and decisions to reproduce a flight.
          </p>
          <div className="transfer-note">
            <Timer size={18} />
            <div>
              Estimated transfer
              <strong>
                {budget.transferDays < 1
                  ? `${num(budget.transferDays * 24, 1)} hours`
                  : `${num(budget.transferDays, 1)} days`}
              </strong>
            </div>
          </div>
        </aside>
      </div>
      <div className="flight-plan">
        <div>
          <span className="timeline-dot" />
          <span>01</span>
          <strong>Launch</strong>
          <small>Vehicle ascent</small>
        </div>
        <div>
          <span className="timeline-dot" />
          <span>02</span>
          <strong>
            {mission.id === "earth" ? "Insertion" : "Transfer cruise"}
          </strong>
          <small>{num(budget.requiredDeltaV)} m/s total Δv budget</small>
        </div>
        <div>
          <span className="timeline-dot" />
          <span>03</span>
          <strong>
            {mission.id === "earth" ? "Commissioning" : "Arrival insertion"}
          </strong>
          <small>
            {mission.id === "earth"
              ? "Deploy and check systems"
              : "Enter the destination orbit"}
          </small>
        </div>
        <div>
          <span className="timeline-dot" />
          <span>04</span>
          <strong>Science operations</strong>
          <small>{mission.durationDays} simulated days</small>
        </div>
      </div>
      <div className="model-note">
        <Info size={15} />
        <span>
          This model uses circular orbits and idealized transfers. The launch
          vehicle provides initial injection. Spacecraft propellant covers
          insertion, plane changes, corrections, and operations.
        </span>
      </div>
      <Validation compact />
      <StepFooter
        back="launch"
        label={blocked ? "Resolve readiness issues" : "Commit to launch"}
        disabled={blocked}
        onNext={launch}
      />
    </>
  );
}
