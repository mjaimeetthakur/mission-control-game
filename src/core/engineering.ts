import { components, missions, vehicles } from "./data";
import type {
  EngineeringBudget,
  SpacecraftDesign,
  ValidationIssue,
  Category,
} from "./types";
export const G0 = 9.80665;
export const LIGHT_SPEED = 299792458;
export const AU = 149597870700;
export const SUN_MU = 1.3271244004127942e20;
const positive = (...numbers: number[]) => {
  if (numbers.some((n) => !Number.isFinite(n) || n <= 0))
    throw new Error("Physics inputs must be finite positive numbers.");
};
export function circularVelocity(mu: number, rMeters: number) {
  positive(mu, rMeters);
  return Math.sqrt(mu / rMeters);
}
export function orbitalPeriod(mu: number, aMeters: number) {
  positive(mu, aMeters);
  return 2 * Math.PI * Math.sqrt(aMeters ** 3 / mu);
}
export function visViva(mu: number, r: number, a: number) {
  positive(mu, r, a);
  const energy = mu * (2 / r - 1 / a);
  if (energy < 0) throw new Error("Radius is outside this orbit.");
  return Math.sqrt(energy);
}
export function rocketDeltaV(isp: number, m0: number, mf: number) {
  positive(isp, m0, mf);
  if (m0 < mf) throw new Error("Wet mass cannot be lower than dry mass.");
  return isp * G0 * Math.log(m0 / mf);
}
export function hohmannTransfer(mu: number, r1: number, r2: number) {
  positive(mu, r1, r2);
  const a = (r1 + r2) / 2;
  const departureDeltaV = Math.abs(
    visViva(mu, r1, a) - circularVelocity(mu, r1),
  );
  const arrivalDeltaV = Math.abs(circularVelocity(mu, r2) - visViva(mu, r2, a));
  return {
    departureDeltaV,
    arrivalDeltaV,
    deltaV: departureDeltaV + arrivalDeltaV,
    timeSec: Math.PI * Math.sqrt(a ** 3 / mu),
    semiMajorAxis: a,
  };
}
export function calculateBudget(design: SpacecraftDesign): EngineeringBudget {
  const mission = missions.find((m) => m.id === design.missionId);
  const vehicle = vehicles.find((v) => v.id === design.vehicleId);
  if (!mission || !vehicle)
    throw new Error("Unknown mission or launch vehicle.");
  const selected = design.componentIds
    .map((id) => components.find((c) => c.id === id))
    .filter((c) => c !== undefined);
  const sum = (key: keyof (typeof selected)[number]) =>
    selected.reduce(
      (total, c) => total + (typeof c[key] === "number" ? Number(c[key]) : 0),
      0,
    );
  const dryMassKg = sum("massKg");
  const totalMassKg = dryMassKg + design.fuelKg;
  const propulsion = selected.find((c) => c.category === "propulsion");
  const rangePenalty =
    design.missionId === "earth"
      ? 1
      : design.missionId === "moon"
        ? 0.4
        : design.missionId === "mars"
          ? 0.06
          : 0.045;
  const altitudeTransfer = hohmannTransfer(
    mission.mu,
    (mission.radiusKm + mission.defaultAltitudeKm) * 1000,
    (mission.radiusKm + design.altitudeKm) * 1000,
  );
  // Launcher supplies Earth escape / transfer injection. Spacecraft pays arrival, trim, and inclination changes.
  const referenceInclination = design.missionId === "earth" ? 97 : 90;
  const angleRad =
    (Math.abs(design.inclinationDeg - referenceInclination) * Math.PI) / 180;
  const inclinationPenalty =
    2 *
    circularVelocity(
      mission.mu,
      (mission.radiusKm + design.altitudeKm) * 1000,
    ) *
    Math.sin(angleRad / 2);
  const requiredDeltaV =
    mission.requiredDeltaV + altitudeTransfer.deltaV + inclinationPenalty;
  const transferDays =
    design.missionId === "earth"
      ? 0.05
      : design.missionId === "moon"
        ? hohmannTransfer(missions[0].mu, 6671000, 384400000).timeSec / 86400
        : hohmannTransfer(
            SUN_MU,
            AU,
            (design.missionId === "mars" ? 1.524 : 2) * AU,
          ).timeSec / 86400;
  const redundancy = selected.some((c) => c.id === "redundancy-full")
    ? 0.07
    : 0;
  // An unprotected command path has a 0.93 illustrative availability factor.
  const commandPathAvailability = selected.some(
    (c) => c.category === "redundancy",
  )
    ? 1
    : 0.93;
  return {
    dryMassKg,
    totalMassKg,
    costM: sum("costM") + vehicle.costM + design.fuelKg * 0.001,
    generationW: sum("generationW") * mission.solarFactor,
    demandW: sum("powerW"),
    batteryWh: sum("capacityWh"),
    deltaV:
      propulsion?.isp && dryMassKg > 0 && design.fuelKg >= 0
        ? rocketDeltaV(propulsion.isp, totalMassKg, dryMassKg)
        : 0,
    requiredDeltaV,
    commMbps: sum("rateMbps") * rangePenalty,
    commDelaySec: (mission.distanceKm * 1000) / LIGHT_SPEED,
    science: sum("science"),
    storageMb: sum("storageMb"),
    reliability: Math.min(
      0.999,
      selected.reduce((p, c) => p * c.reliability, vehicle.reliability) *
        commandPathAvailability +
        redundancy,
    ),
    payloadCapacityKg: vehicle.capacityKg[design.missionId],
    payloadMarginKg: vehicle.capacityKg[design.missionId] - totalMassKg,
    fuelMaxKg: sum("fuelMaxKg"),
    thermalCapacityW: sum("thermalCapacityW"),
    orbitalVelocity: circularVelocity(
      mission.mu,
      (mission.radiusKm + design.altitudeKm) * 1000,
    ),
    orbitalPeriodSec: orbitalPeriod(
      mission.mu,
      (mission.radiusKm + design.altitudeKm) * 1000,
    ),
    transferDays,
  };
}
export function validateDesign(design: SpacecraftDesign): ValidationIssue[] {
  const mission = missions.find((m) => m.id === design.missionId);
  const vehicle = vehicles.find((v) => v.id === design.vehicleId);
  const issues: ValidationIssue[] = [];
  const add = (
    id: string,
    subsystem: string,
    measured: number,
    required: number,
    message: string,
    fix: string,
    severity: "error" | "warning" | "info" = "error",
  ) =>
    issues.push({ id, severity, subsystem, measured, required, message, fix });
  if (!mission || !vehicle) {
    add(
      "unknown",
      "Configuration",
      0,
      1,
      "Unknown mission or launcher.",
      "Choose a supported mission and launcher.",
    );
    return issues;
  }
  if (
    !Number.isFinite(design.fuelKg) ||
    design.fuelKg < 0 ||
    !Number.isFinite(design.altitudeKm) ||
    !Number.isFinite(design.inclinationDeg)
  ) {
    add(
      "numbers",
      "Configuration",
      0,
      1,
      "Configuration contains invalid numeric values.",
      "Restore a saved design or reset to the recommended configuration.",
    );
    return issues;
  }
  if (
    design.altitudeKm < mission.minAltitudeKm ||
    design.altitudeKm > mission.maxAltitudeKm
  ) {
    add(
      "altitude",
      "Trajectory",
      design.altitudeKm,
      mission.maxAltitudeKm,
      `Altitude must be between ${mission.minAltitudeKm} and ${mission.maxAltitudeKm} km.`,
      `Set an altitude inside the scenario range.`,
    );
    return issues;
  }
  if (design.inclinationDeg < 0 || design.inclinationDeg > 180)
    add(
      "inclination",
      "Trajectory",
      design.inclinationDeg,
      180,
      "Inclination must be between 0° and 180°.",
      "Select a valid inclination.",
    );
  if (new Set(design.componentIds).size !== design.componentIds.length)
    add(
      "duplicates",
      "Configuration",
      design.componentIds.length,
      new Set(design.componentIds).size,
      "The same component cannot be installed twice.",
      "Remove duplicate components.",
    );
  const selected = design.componentIds.map((id) =>
    components.find((c) => c.id === id),
  );
  if (selected.some((c) => !c))
    add(
      "unknown-component",
      "Configuration",
      0,
      1,
      "One or more components are not recognized.",
      "Use the bundled component catalog.",
    );
  const categories: Category[] = [
    "bus",
    "solar",
    "battery",
    "propulsion",
    "antenna",
    "computer",
    "thermal",
    "attitude",
    "structure",
  ];
  for (const category of categories) {
    const count = selected.filter((c) => c?.category === category).length;
    if (count !== 1)
      add(
        `category-${category}`,
        category,
        count,
        1,
        `Install exactly one ${category} subsystem.`,
        `Choose one option in ${category}.`,
      );
  }
  const spareCount = selected.filter(
    (component) => component?.category === "redundancy",
  ).length;
  if (spareCount > 1)
    add(
      "category-redundancy",
      "Redundancy",
      spareCount,
      1,
      "Only one redundancy package can be installed.",
      "Choose essential spares or dual-string avionics.",
    );
  for (const component of selected) {
    if (component && !component.compatible.includes(design.missionId))
      add(
        `compatible-${component.id}`,
        component.category,
        0,
        1,
        `${component.name} does not support this destination.`,
        `Choose a ${component.category} rated for ${mission.destination}.`,
      );
  }
  const budget = calculateBudget(design);
  if (!budget.payloadCapacityKg)
    add(
      "destination",
      "Launch",
      0,
      budget.totalMassKg,
      `${vehicle.name} cannot inject a payload toward this destination.`,
      "Choose a larger launch class.",
    );
  else if (budget.payloadMarginKg < 0)
    add(
      "payload",
      "Mass",
      budget.totalMassKg,
      budget.payloadCapacityKg,
      `Your spacecraft is ${Math.ceil(-budget.payloadMarginKg)} kg over the launch limit.`,
      "Remove mass or choose a larger launcher.",
    );
  if (budget.costM > mission.budgetM)
    add(
      "budget",
      "Budget",
      budget.costM,
      mission.budgetM,
      `Mission cost exceeds your budget by $${(budget.costM - mission.budgetM).toFixed(1)}M.`,
      "Choose less expensive hardware or a cheaper compatible launcher.",
    );
  if (budget.generationW < budget.demandW)
    add(
      "power",
      "Power",
      budget.generationW,
      budget.demandW,
      `Solar output is ${Math.ceil(budget.demandW - budget.generationW)} W below demand.`,
      "Upgrade arrays or remove a power-intensive instrument.",
    );
  else if (budget.generationW < budget.demandW * 1.3)
    add(
      "power-margin",
      "Power",
      budget.generationW,
      budget.demandW * 1.3,
      "Solar reserve is below the recommended 30% margin.",
      "Larger arrays help recover from degradation.",
      "warning",
    );
  // Four representative 10-minute eclipse ticks are modeled per operation cycle.
  const eclipseWh = (budget.demandW * 2) / 3;
  if (budget.batteryWh < eclipseWh)
    add(
      "battery",
      "Energy storage",
      budget.batteryWh,
      eclipseWh,
      "Battery cannot sustain a 40-minute eclipse.",
      "Install a larger battery or reduce demand.",
    );
  if (design.fuelKg > budget.fuelMaxKg)
    add(
      "tank",
      "Propellant",
      design.fuelKg,
      budget.fuelMaxKg,
      `Fuel exceeds the tank capacity by ${Math.ceil(design.fuelKg - budget.fuelMaxKg)} kg.`,
      "Reduce fuel or select the larger engine and tank.",
    );
  if (budget.deltaV < budget.requiredDeltaV)
    add(
      "delta-v",
      "Propulsion",
      budget.deltaV,
      budget.requiredDeltaV,
      `You need ${Math.ceil(budget.requiredDeltaV - budget.deltaV)} m/s more delta-v.`,
      "Add fuel, reduce dry mass, or select the more efficient engine.",
    );
  else if (budget.deltaV < budget.requiredDeltaV * 1.2)
    add(
      "delta-v-margin",
      "Propulsion",
      budget.deltaV,
      budget.requiredDeltaV * 1.2,
      "Delta-v reserve is below the recommended 20%.",
      "Carry additional fuel for correction maneuvers.",
      "warning",
    );
  if (budget.commMbps < mission.minAntenna)
    add(
      "comms",
      "Communications",
      budget.commMbps,
      mission.minAntenna,
      `The estimated ${budget.commMbps.toFixed(2)} Mbps link is below this mission’s ${mission.minAntenna} Mbps minimum.`,
      "Use a high-gain dish.",
    );
  if (budget.science < mission.requiredScience)
    add(
      "science",
      "Payload",
      budget.science,
      mission.requiredScience,
      `Science capability is ${mission.requiredScience - budget.science} points below the objective.`,
      "Install another compatible scientific instrument.",
    );
  if (budget.storageMb < mission.requiredDataMb * 0.25)
    add(
      "storage",
      "Computer",
      budget.storageMb,
      mission.requiredDataMb * 0.25,
      "Onboard storage cannot buffer the planned observations.",
      "Upgrade the flight computer.",
    );
  if (budget.thermalCapacityW < budget.demandW)
    add(
      "thermal",
      "Thermal",
      budget.demandW,
      budget.thermalCapacityW,
      "Heat load exceeds the selected thermal-control capacity.",
      "Upgrade thermal control or reduce power demand.",
    );
  const structuralLimit = design.componentIds.includes("structure-heavy")
    ? 3500
    : 1000;
  if (budget.totalMassKg > structuralLimit)
    add(
      "structure",
      "Structure",
      budget.totalMassKg,
      structuralLimit,
      `Wet mass exceeds the frame’s ${structuralLimit} kg modeled envelope.`,
      "Use the composite support frame or reduce mass.",
    );
  if (mission.durationDays > 180 && !design.componentIds.includes("bus-deep"))
    add(
      "duration",
      "Lifetime",
      mission.durationDays,
      180,
      "The light bus is rated for campaigns up to 180 days.",
      "Use the Voyager bus for this long mission.",
    );
  if (budget.reliability < 0.85)
    add(
      "reliability",
      "Reliability",
      budget.reliability,
      0.85,
      "Estimated system reliability is below 85%.",
      "Improve component reliability or install dual-string avionics.",
      "warning",
    );
  return issues;
}
