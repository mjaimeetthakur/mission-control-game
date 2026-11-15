import { useEffect, Component, type ReactNode } from "react";
import {
  Orbit,
  BookOpen,
  ChevronRight,
  Check,
  CloudOff,
  CheckCircle2,
  Radio,
} from "lucide-react";
import { useGame, type Page } from "./context";
import { HelpPanel, Tutorial } from "./components/Common";
import Missions from "./components/Missions";
import Design from "./components/Design";
import Launch from "./components/Launch";
import Trajectory from "./components/Trajectory";
import Control from "./components/Control";
import Report from "./components/Report";
import Archive from "./components/Archive";
const steps: { id: Page; label: string }[] = [
  { id: "missions", label: "Mission briefing" },
  { id: "design", label: "Spacecraft design" },
  { id: "launch", label: "Launch vehicle" },
  { id: "trajectory", label: "Flight plan" },
  { id: "control", label: "Mission control" },
  { id: "report", label: "Debrief" },
];
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty-state">
        <h1>Console interrupted.</h1>
        <p>
          Your last saved design is still in this browser. Reload the console to
          restore it.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reload console
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const {
    page,
    navigate,
    toast,
    setHelp,
    help,
    storageOk,
    mission,
    simulation,
  } = useGame();
  const index = steps.findIndex((s) => s.id === page);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [setHelp]);
  return (
    <ErrorBoundary>
      <a href="#main" className="skip-link">
        Skip to mission workspace
      </a>
      <header className="app-header">
        <button
          className="brand"
          onClick={() => navigate("missions")}
          aria-label="Mission Control home"
        >
          <span className="brand-mark">
            <Orbit size={29} />
          </span>
          <span>
            MISSION<span className="brand-light">CONTROL</span>
            <small>SPACE MISSION DESIGN SIMULATOR</small>
          </span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={page === "missions" ? "active" : ""}
            onClick={() => navigate("missions")}
          >
            Missions
          </button>
          <button
            className={
              ["design", "launch", "trajectory"].includes(page) ? "active" : ""
            }
            onClick={() => navigate("design")}
          >
            Design lab
          </button>
          <button
            className={page === "control" ? "active" : ""}
            onClick={() => navigate("control")}
          >
            Mission control
            {simulation &&
              ["LAUNCHING", "IN_FLIGHT"].includes(simulation.status) && (
                <span className="status-dot green" />
              )}
          </button>
          <button
            className={page === "archive" ? "active" : ""}
            onClick={() => navigate("archive")}
          >
            Archive
          </button>
        </nav>
        <div className="header-utilities">
          <span className={`save-status ${!storageOk ? "bad" : ""}`}>
            {storageOk ? <CheckCircle2 size={13} /> : <CloudOff size={14} />}
            <span>{storageOk ? "LOCAL SAVE ACTIVE" : "SAVE UNAVAILABLE"}</span>
          </span>
          <button
            className="icon-button handbook-button"
            aria-label="Open flight handbook"
            onClick={() => setHelp(!help)}
          >
            <BookOpen size={19} />
          </button>
          <span className="avatar">FD</span>
        </div>
      </header>
      <div className="workflow-wrap">
        <nav className="workflow" aria-label="Mission phases">
          {steps.map((step, i) => (
            <button
              key={step.id}
              className={`${page === step.id ? "active" : ""} ${i < index ? "complete" : ""}`}
              onClick={() => navigate(step.id)}
              aria-current={page === step.id ? "step" : undefined}
            >
              <span>
                {i < index ? (
                  <Check size={12} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              {step.label}
              {i < steps.length - 1 && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <span className="workspace-tag">
          <span className="status-dot" /> {mission.subtitle}
        </span>
      </div>
      <main id="main" className={`main-content page-${page}`}>
        <Tutorial />
        {page === "missions" ? (
          <Missions />
        ) : page === "design" ? (
          <Design />
        ) : page === "launch" ? (
          <Launch />
        ) : page === "trajectory" ? (
          <Trajectory />
        ) : page === "control" ? (
          <Control />
        ) : page === "report" ? (
          <Report />
        ) : (
          <Archive />
        )}
      </main>
      <footer className="app-footer">
        <span>
          <Orbit size={13} /> MISSION CONTROL{" "}
          <span className="footer-divider">/</span> Every decision shapes the
          mission.
        </span>
        <span>
          <Radio size={12} /> EDUCATIONAL SIMULATION{" "}
          <span className="footer-divider">·</span> MODEL 1.0{" "}
          <span className="footer-divider">·</span> BROWSER STORAGE
        </span>
      </footer>
      {!storageOk && (
        <div className="storage-warning" role="alert">
          Browser storage is unavailable. Keep this tab open; your changes
          cannot be restored after reload.
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      <HelpPanel />
    </ErrorBoundary>
  );
}
