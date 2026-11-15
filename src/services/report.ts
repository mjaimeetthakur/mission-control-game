import { jsPDF } from "jspdf";
import { components, missions, vehicles } from "../core/data";
import type { MissionReport } from "../core/types";

const clean = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
const n = (value: number, digits = 0): string =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });

/** Real PDF generation shared by the browser download and optional REST API. */
export function buildReportPdf(report: MissionReport): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: `Mission Control - ${clean(report.design.name)}`,
    subject: "Educational space mission debrief",
    author: "Mission Control",
    creator: "Mission Control",
  });
  const width = 210,
    margin = 18,
    bottom = 274;
  let y = 35;
  const header = () => {
    pdf.setFillColor(9, 18, 29);
    pdf.rect(0, 0, width, 22, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("MISSION CONTROL", margin, 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(135, 204, 211);
    pdf.text("FLIGHT REVIEW / EDUCATIONAL SIMULATION", width - margin, 13, {
      align: "right",
    });
    pdf.setTextColor(30, 43, 57);
  };
  const page = () => {
    pdf.addPage();
    header();
    y = 35;
  };
  const room = (height: number) => {
    if (y + height > bottom) page();
  };
  const title = (value: string) => {
    room(18);
    pdf.setFontSize(17);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(14, 31, 46);
    pdf.text(clean(value), margin, y);
    y += 10;
  };
  const paragraph = (value: string, small = false) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(small ? 8.5 : 10);
    pdf.setTextColor(67, 80, 95);
    const lines = pdf.splitTextToSize(
      clean(value),
      width - margin * 2,
    ) as string[];
    for (const line of lines) {
      room(6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(small ? 8.5 : 10);
      pdf.setTextColor(67, 80, 95);
      pdf.text(line, margin, y);
      y += small ? 4.3 : 5.2;
    }
    y += 3;
  };
  const row = (label: string, value: string) => {
    room(10);
    pdf.setDrawColor(221, 229, 235);
    pdf.line(margin, y + 3, width - margin, y + 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(85, 99, 112);
    pdf.text(clean(label), margin, y);
    pdf.setTextColor(24, 43, 58);
    pdf.setFont("helvetica", "bold");
    pdf.text(clean(value), width - margin, y, { align: "right" });
    y += 9;
  };
  header();
  title(report.design.name);
  paragraph(
    `${report.missionName}  |  ${report.status.replaceAll("_", " ")}  |  Seed ${report.design.seed}`,
  );
  pdf.setFillColor(234, 246, 247);
  pdf.roundedRect(margin, y, width - margin * 2, 31, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(21, 100, 110);
  pdf.setFontSize(29);
  pdf.text(`${n(report.score)} / 100`, margin + 8, y + 16);
  pdf.setFontSize(9);
  pdf.text("MISSION SCORE", margin + 8, y + 24);
  pdf.setTextColor(40, 69, 82);
  pdf.setFontSize(11);
  pdf.text(`${n(report.sciencePercent)}% science objectives`, 111, y + 13);
  pdf.text(`${n(report.dataPercent)}% required data returned`, 111, y + 22);
  y += 43;
  paragraph(report.summary);
  title("Objectives & outcome");
  const mission = missions.find((item) => item.id === report.design.missionId);
  if (mission) paragraph(mission.objective);
  row(
    "Launch outcome",
    report.events.some((e) => e.title === "Ascent")
      ? "Liftoff achieved"
      : "Launch not reached",
  );
  row(
    "Trajectory outcome",
    report.events.some((e) => e.title === "Cruise")
      ? "Insertion completed; cruise verified"
      : report.events.some((e) => e.title === "Orbit insertion")
        ? "Insertion attempted - see event log"
        : "Insertion not reached",
  );
  row(
    "Budget spent",
    `$${n(report.budget.costM, 2)}M / $${n(mission?.budgetM ?? 0)}M (${n(report.budgetUsedPercent)}%)`,
  );
  row(
    "Propellant used",
    `${n(report.fuelUsedKg, 1)} kg / ${n(report.design.fuelKg, 1)} kg`,
  );
  row("Scientific objective completion", `${n(report.sciencePercent, 1)}%`);
  row("Data return against requirement", `${n(report.dataPercent, 1)}%`);
  y += 4;
  title("Transparent scoring");
  const weights = [
    ["science", "Scientific objectives", 30],
    ["engineering", "Engineering feasibility", 25],
    ["efficiency", "Resource efficiency", 20],
    ["operations", "Operational decisions", 15],
    ["reliability", "Mission reliability", 10],
  ] as const;
  for (const [key, label, weight] of weights)
    row(
      `${label} (weight ${weight}%)`,
      `${n(report.breakdown[key], 1)} / 100 = ${n((report.breakdown[key] * weight) / 100, 1)} points`,
    );
  paragraph(
    "Score = science x 0.30 + engineering x 0.25 + efficiency x 0.20 + operations x 0.15 + reliability x 0.10, rounded to an integer. Failed missions are capped at 49/100. Component figures are documented in SOURCES.md.",
    true,
  );
  page();
  title("Spacecraft configuration");
  paragraph(
    `Design ${report.design.id} | Schema ${report.design.schemaVersion} | Created ${report.design.createdAt.slice(0, 10)} UTC | Updated ${report.design.updatedAt.slice(0, 10)} UTC`,
    true,
  );
  const installed = report.design.componentIds
    .map((id) => components.find((item) => item.id === id))
    .filter((c) => c !== undefined);
  for (let index = 0; index < installed.length; index += 2) {
    room(16);
    for (let column = 0; column < 2; column++) {
      const c = installed[index + column];
      if (!c) continue;
      const x = margin + column * 89;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(27, 56, 74);
      const lines = pdf.splitTextToSize(
        clean(`${c.category.toUpperCase()} / ${c.name}`),
        82,
      ) as string[];
      pdf.text(lines, x, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(67, 80, 95);
      pdf.text(
        clean(
          `${n(c.massKg, 1)} kg | $${n(c.costM, 2)}M | ${n(c.powerW)} W demand`,
        ),
        x,
        y + 4.2 * lines.length,
      );
    }
    y += 14;
  }
  y += 3;
  title("Engineering & trajectory");
  const b = report.budget;
  const launcher = vehicles.find((v) => v.id === report.design.vehicleId);
  const metrics: [string, string][] = [
    ["Launch vehicle", launcher?.name ?? report.design.vehicleId],
    ["Wet / dry mass", `${n(b.totalMassKg, 1)} / ${n(b.dryMassKg, 1)} kg`],
    ["Destination-specific launch margin", `${n(b.payloadMarginKg, 1)} kg`],
    ["Power generation / demand", `${n(b.generationW)} / ${n(b.demandW)} W`],
    ["Battery storage", `${n(b.batteryWh)} Wh`],
    [
      "Delta-v available / required",
      `${n(b.deltaV)} / ${n(b.requiredDeltaV)} m/s`,
    ],
    ["Downlink capability", `${n(b.commMbps, 3)} Mbps`],
    [
      "One-way communications delay",
      `${n(b.commDelaySec, b.commDelaySec < 1 ? 4 : 2)} s`,
    ],
    [
      "Target altitude / inclination",
      `${n(report.design.altitudeKm)} km / ${n(report.design.inclinationDeg)} deg`,
    ],
    ["Circular orbital velocity", `${n(b.orbitalVelocity)} m/s`],
    ["Orbital period", `${n(b.orbitalPeriodSec / 60, 1)} minutes`],
    ["Modeled transfer duration", `${n(b.transferDays, 1)} days`],
    ["Estimated design reliability", `${n(b.reliability * 100, 1)}%`],
  ];
  for (const [label, value] of metrics) row(label, value);
  page();
  title("Flight history & decisions");
  paragraph(
    "Ticks are deterministic simulation steps. Calendar mission time is compressed; operational resource calculations use the modeled timestep described in SOURCES.md.",
    true,
  );
  for (const event of report.events) {
    room(18);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(
      event.kind === "error" ? 160 : 27,
      event.kind === "error" ? 42 : 56,
      event.kind === "error" ? 35 : 74,
    );
    pdf.text(clean(`T+${event.tick}  /  ${event.title}`), margin, y);
    y += 5;
    paragraph(event.detail, true);
  }
  if (report.decisions.length) {
    room(55);
    title("Operator decisions");
    for (const decision of report.decisions) {
      paragraph(
        `T+${decision.tick}: ${decision.anomaly} - ${decision.option}. ${decision.detail}`,
      );
    }
  }
  title("Next flight recommendations");
  for (const recommendation of report.recommendations)
    paragraph(`- ${recommendation}`);
  if (!report.recommendations.length)
    paragraph(
      "Review the engineering margins and compare another saved design.",
    );
  title("Model boundaries");
  paragraph(
    "This is an educational simulation, not a flight-planning tool. Component and launch-vehicle specifications are fictional, versioned teaching assumptions. Orbital quantities use SI-based two-body equations; launch injection and interplanetary geometry are simplified. No NASA endorsement is implied. The core game works offline without external APIs.",
    true,
  );
  paragraph(
    "Primary references: JPL Solar System Dynamics (https://ssd.jpl.nasa.gov/astro_par.html); NASA Glenn Ideal Rocket Equation (https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/); NASA Trajectories (https://science.nasa.gov/learn/basics-of-space-flight/chapter4-1/). See SOURCES.md for the complete model and assumptions.",
    true,
  );
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(218, 226, 232);
    pdf.line(margin, 282, width - margin, 282);
    pdf.setTextColor(106, 119, 130);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text(`MISSION CONTROL / ${clean(report.simulationId)}`, margin, 288);
    pdf.text(`${i} / ${pages}`, width - margin, 288, { align: "right" });
  }
  return pdf;
}
export function exportReportPdf(report: MissionReport): void {
  const filename =
    report.design.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mission";
  buildReportPdf(report).save(`${filename}-flight-report.pdf`);
}
