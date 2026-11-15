import { lazy, Suspense, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Target,
  Wallet,
} from "lucide-react";
import { missions } from "../core/data";
import { useGame, money } from "../context";
import { StepFooter } from "./Common";

const SpaceScene = lazy(() => import("./SpaceScene"));

export default function Missions() {
  const { design, mission, selectMission, startTutorial, reducedMotion } =
    useGame();

  return (
    <>
      <section className="mission-hero" aria-labelledby="welcome-title">
        <div className="hero-scene">
          <Suspense fallback={<div className="planet-loading" />}>
            <SpaceScene
              mode="overview"
              missionId={design.missionId}
              reducedMotion={reducedMotion}
            />
          </Suspense>
        </div>
        <div className="hero-content">
          <div className="hero-kicker">
            <span /> SPACE MISSION SIMULATOR
          </div>
          <h1 id="welcome-title">
            Design a mission.
            <br />
            <em>Fly it.</em>
          </h1>
          <p>Every decision shapes the mission.</p>
          <div className="hero-actions">
            <a className="button primary" href="#scenarios">
              Choose a mission <ArrowDown size={16} />
            </a>
            <button className="button outline" onClick={startTutorial}>
              <BookOpen size={16} /> First mission guide
            </button>
          </div>
        </div>
        <div className="hero-annotation">
          <span className="crosshair" />
          <div>
            {mission.destination.toUpperCase()}
            <small>
              REFERENCE ALTITUDE · {mission.defaultAltitudeKm.toLocaleString()}{" "}
              KM
            </small>
          </div>
        </div>
      </section>

      <div className="section-heading" id="scenarios">
        <h2>Select your destination</h2>
      </div>
      <div className="mission-grid">
        {missions.map((scenario) => {
          const active = scenario.id === design.missionId;
          return (
            <button
              className={`mission-card destination-${scenario.id} ${active ? "selected" : ""}`}
              key={scenario.id}
              aria-pressed={active}
              onClick={() => selectMission(scenario.id)}
              style={{ "--mission-accent": scenario.accent } as CSSProperties}
            >
              <div className="mission-card-top">
                <span className={`difficulty ${scenario.id}`}>
                  {scenario.difficulty}
                  {scenario.id === "earth" && (
                    <span className="recommended"> · Recommended</span>
                  )}
                </span>
                {active && (
                  <span className="check-circle" aria-label="Selected">
                    <Check size={13} />
                  </span>
                )}
              </div>
              <div
                className={`mini-planet ${scenario.id}`}
                aria-hidden="true"
              />
              <span className="eyebrow">{scenario.subtitle}</span>
              <h3>{scenario.name}</h3>
              <div className="mission-card-footer">
                <span>{money(scenario.budgetM)} budget</span>
                <span>{scenario.durationDays} days</span>
              </div>
            </button>
          );
        })}
      </div>
      <section
        className="mission-brief"
        aria-live="polite"
        aria-label="Selected mission briefing"
      >
        <div className="brief-objective">
          <div className="eyebrow">
            <Target size={15} /> {mission.name} objective
          </div>
          <p>{mission.objective}</p>
        </div>
        <div className="brief-facts">
          <div>
            <Clock3 size={18} />
            <span>
              Launch opportunity
              <strong>{mission.window.split(" · ")[0]}</strong>
            </span>
          </div>
          <div>
            <Wallet size={18} />
            <span>
              Budget limit<strong>{money(mission.budgetM)}</strong>
            </span>
          </div>
        </div>
      </section>
      <details className="scenario-detail">
        <summary>
          Scientific goals and engineering risks <ArrowRight size={14} />
        </summary>
        <div>
          <section>
            <h4>Success conditions</h4>
            {mission.goals.map((goal) => (
              <p key={goal}>
                <Check size={14} />
                {goal}
              </p>
            ))}
          </section>
          <section>
            <h4>Primary risks</h4>
            {mission.risks.map((risk) => (
              <p key={risk}>{risk}</p>
            ))}
            <p>
              Meet the mass, power, propellant, communications, and budget
              limits.
            </p>
          </section>
        </div>
      </details>
      <StepFooter next="design" label="Design spacecraft" />
    </>
  );
}
