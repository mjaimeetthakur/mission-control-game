import { components, missions } from "./data";
import { calculateBudget, validateDesign, G0 } from "./engineering";
import type {
  Anomaly,
  EngineeringBudget,
  MissionEvent,
  MissionPhase,
  MissionReport,
  SimulationState,
  SpacecraftDesign,
} from "./types";

export const FLIGHT_MODEL = {
  totalTicks: 180,
  countdownTicks: 10,
  scienceStartTick: 60,
  telemetryIntervalTicks: 3,
  powerSampleMinutes: 10,
  contactMinutes: 60,
  thermalDamageC: 55,
  thermalScienceHoldC: 60,
} as const;

/** Power requested and available at the current tick, including the selected payload duty cycle. */
export function getLivePower(
  state: SimulationState,
  budget: EngineeringBudget,
) {
  const instrumentDemandW = components
    .filter(
      (component) =>
        component.category === "instrument" &&
        state.design.componentIds.includes(component.id),
    )
    .reduce((total, component) => total + component.powerW, 0);
  const shedW = instrumentDemandW * (1 - state.scienceMultiplier);
  const demandW = budget.demandW - shedW;
  const inEclipse =
    state.tick >= FLIGHT_MODEL.scienceStartTick && state.tick % 18 >= 14;
  const generationW = inEclipse
    ? 0
    : budget.generationW * state.solarMultiplier;
  return {
    demandW,
    generationW,
    shedW,
    inEclipse,
    batteryCapacityWh: budget.batteryWh * state.batteryMultiplier,
  };
}
const clamp = (n: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, n));
function clone(state: SimulationState): SimulationState {
  return structuredClone(state);
}
function event(
  state: SimulationState,
  title: string,
  detail: string,
  kind: MissionEvent["kind"] = "info",
) {
  state.events.push({
    id: `event-${state.tick}-${state.events.length}`,
    tick: state.tick,
    title,
    detail,
    kind,
  });
}
function fail(state: SimulationState, reason: string) {
  state.status = "FAILED";
  state.failureReason = reason;
  event(state, "Mission lost", reason, "error");
}
function random(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function scheduledAnomaly(seed: number, index: number) {
  const start = Math.floor(random(seed) * 7);
  const stride = random(seed + 1) > 0.5 ? 2 : 3;
  return (start + index * stride) % 7;
}
const anomalyCatalog: Anomaly[] = [
  {
    id: "solar",
    title: "Solar array degradation",
    description:
      "Micrometeoroid damage has reduced solar output by 28%. Your remaining power margin determines whether full operations can continue.",
    options: [
      {
        id: "mitigate",
        label: "Reduce science load",
        description:
          "Run instruments at 80% duty cycle for the rest of the mission. Lower power demand and science return.",
      },
      {
        id: "reserve",
        label: "Reorient the spacecraft",
        description:
          "Spend 12 m/s of maneuver capability to recover output to 90% of nominal.",
      },
      {
        id: "continue",
        label: "Keep the current plan",
        description:
          "Keep full science operations with the reduced solar output. Batteries cover a deficit until depleted.",
      },
    ],
  },
  {
    id: "comms",
    title: "Ground link interrupted",
    description:
      "The primary link has lost lock. Data will stay onboard until a usable link is restored.",
    options: [
      {
        id: "mitigate",
        label: "Reacquire Earth pointing",
        description:
          "Restore 85% of link capacity. Science duty cycle falls by 5% during repeated pointing checks.",
      },
      {
        id: "reserve",
        label: "Use backup link mode",
        description:
          "Restore 50% of link capacity and preserve the science schedule.",
      },
      {
        id: "continue",
        label: "Continue without downlink",
        description:
          "Keep collecting data, but no new science reaches Earth. Storage may fill.",
      },
    ],
  },
  {
    id: "thruster",
    title: "Thruster feed-system anomaly",
    description:
      "A feed-system leak has cost 10% of remaining propellant. A trim maneuver is needed to restore pointing and trajectory.",
    options: [
      {
        id: "mitigate",
        label: "Perform full trim",
        description: "Spend 45 m/s to restore the planned trajectory.",
      },
      {
        id: "reserve",
        label: "Accept a shorter survey",
        description: "Spend 15 m/s and reduce science duty cycle by 15%.",
      },
      {
        id: "continue",
        label: "Skip the trim",
        description:
          "Preserve fuel, lose 20 health points, and reduce science return by 40%.",
      },
    ],
  },
  {
    id: "battery",
    title: "Battery cell degradation",
    description:
      "A damaged cell string has reduced usable battery capacity to 65%. Hardware capacity cannot be repaired remotely.",
    options: [
      {
        id: "mitigate",
        label: "Reduce instrument duty cycle",
        description:
          "Lower science duty cycle by 15% to reduce eclipse energy use.",
      },
      {
        id: "reserve",
        label: "Enter low-power science mode",
        description:
          "Lower science duty cycle by 25% for additional energy margin.",
      },
      {
        id: "continue",
        label: "Use remaining capacity",
        description:
          "Continue at full load. Safe only if the reduced battery can still cover eclipse operations.",
      },
    ],
  },
  {
    id: "instrument",
    title: "Instrument electronics fault",
    description:
      "A payload electronics fault has reduced science productivity by 35%. The installed redundancy determines the recovery available.",
    options: [
      {
        id: "mitigate",
        label: "Switch electronics path",
        description:
          "Dual-string avionics recover 90% of the prior capability; essential spares recover 75%.",
      },
      {
        id: "reserve",
        label: "Replan around healthy channels",
        description:
          "Recover 80% of prior science capability using surviving channels.",
      },
      {
        id: "continue",
        label: "Keep the reduced payload",
        description: "Proceed at 65% of the previous science productivity.",
      },
    ],
  },
  {
    id: "thermal",
    title: "Unexpected thermal load",
    description:
      "A sustained unfavorable attitude has raised spacecraft temperature by 48°C. Reduce the load or change the attitude to protect the payload.",
    options: [
      {
        id: "mitigate",
        label: "Protect the instruments",
        description:
          "Reduce science duty cycle by 15% and cool the spacecraft by 35°C.",
      },
      {
        id: "reserve",
        label: "Perform a cooling roll",
        description:
          "Spend 10 m/s and cool by 38°C while keeping the science plan.",
      },
      {
        id: "continue",
        label: "Maintain operations",
        description:
          "Accept thermal damage while passive cooling removes the transient load.",
      },
    ],
  },
  {
    id: "trajectory",
    title: "Trajectory correction required",
    description:
      "Navigation measurements show a 90 m/s correction is needed to preserve the full science geometry.",
    options: [
      {
        id: "mitigate",
        label: "Execute the correction",
        description: "Spend 90 m/s to preserve the planned mission.",
      },
      {
        id: "reserve",
        label: "Choose a reduced flyby",
        description:
          "Spend 30 m/s and reduce future science productivity by 35%.",
      },
      {
        id: "continue",
        label: "Skip the maneuver",
        description:
          "Preserve fuel but lose 45 health points and 60% of future science productivity.",
      },
    ],
  },
];

export function createSimulation(design: SpacecraftDesign): SimulationState {
  const issues = validateDesign(design).filter((i) => i.severity === "error");
  if (issues.length)
    throw new Error(
      `Launch blocked: ${issues.map((i) => i.message).join(" ")}`,
    );
  if (!Number.isSafeInteger(design.seed) || design.seed < 0)
    throw new Error("Seed must be a nonnegative safe integer.");
  const budget = calculateBudget(design);
  return {
    id: crypto.randomUUID(),
    design: structuredClone(design),
    seed: design.seed,
    status: "READY_FOR_LAUNCH",
    phase: "Countdown",
    tick: 0,
    totalTicks: FLIGHT_MODEL.totalTicks,
    batteryWh: budget.batteryWh,
    fuelKg: design.fuelKg,
    health: 100,
    temperatureC: 20,
    dataMb: 0,
    downlinkedMb: 0,
    scienceProgress: 0,
    elapsedDays: 0,
    solarMultiplier: 1,
    scienceMultiplier: 1,
    commMultiplier: 1,
    batteryMultiplier: 1,
    commOnline: false,
    anomaly: null,
    events: [
      {
        id: "event-0-0",
        tick: 0,
        title: "Flight plan accepted",
        detail:
          "Engineering constraints passed. Seed and design are locked for this run.",
        kind: "success",
      },
    ],
    decisions: [],
    telemetry: [{ tick: 0, battery: 100, health: 100, data: 0 }],
    appliedActionIds: [],
  };
}
export function startSimulation(state: SimulationState): SimulationState {
  if (state.status !== "READY_FOR_LAUNCH")
    throw new Error("Only a ready mission can start. Restart to fly again.");
  const next = clone(state);
  next.status = "LAUNCHING";
  event(
    next,
    "Countdown started",
    `T−${FLIGHT_MODEL.countdownTicks}. Guidance, power, and communications checks in progress.`,
  );
  return next;
}
export function pauseSimulation(state: SimulationState): SimulationState {
  if (state.status !== "LAUNCHING" && state.status !== "IN_FLIGHT")
    throw new Error("Only an active mission can be paused.");
  const next = clone(state);
  next.pausedFrom = state.status;
  next.status = "PAUSED";
  return next;
}
export function resumeSimulation(state: SimulationState): SimulationState {
  if (state.status !== "PAUSED")
    throw new Error("Only a paused mission can resume.");
  if (state.anomaly)
    throw new Error("Choose a response to the anomaly before resuming.");
  const next = clone(state);
  next.status = next.pausedFrom ?? "IN_FLIGHT";
  delete next.pausedFrom;
  return next;
}
/** Burn consumes propellant according to the inverse ideal rocket equation. */
function burn(state: SimulationState, deltaV: number) {
  const budget = calculateBudget(state.design);
  const isp =
    components.find(
      (c) =>
        state.design.componentIds.includes(c.id) && c.category === "propulsion",
    )?.isp ?? 0;
  const needed =
    (budget.dryMassKg + state.fuelKg) * (1 - Math.exp(-deltaV / (isp * G0)));
  if (needed > state.fuelKg + 1e-8) {
    state.fuelKg = 0;
    fail(
      state,
      `The spacecraft ran out of usable propellant during a ${Math.round(deltaV)} m/s maneuver. Carry more reserve fuel or reduce spacecraft mass.`,
    );
    return false;
  }
  state.fuelKg = Math.max(0, state.fuelKg - needed);
  return true;
}
interface FlightStage {
  tick: number;
  phase: MissionPhase;
  detail: string;
}
const countdown: FlightStage = {
  tick: 0,
  phase: "Countdown",
  detail: "Prelaunch checks in progress.",
};
const ascent: FlightStage = {
  tick: FLIGHT_MODEL.countdownTicks,
  phase: "Ascent",
  detail:
    "Liftoff. The selected launch vehicle supplies ascent and destination injection.",
};
const science: FlightStage = {
  tick: FLIGHT_MODEL.scienceStartTick,
  phase: "Science operations",
  detail: "Payload commissioned. Observation and downlink cycles begin.",
};
const completion: FlightStage = {
  tick: FLIGHT_MODEL.totalTicks,
  phase: "Complete",
  detail: "Final science return evaluated.",
};
const earthStages: readonly FlightStage[] = [
  countdown,
  ascent,
  {
    tick: 23,
    phase: "Orbit insertion",
    detail: "Spacecraft arrival and orbit-trim burn begins.",
  },
  {
    tick: 35,
    phase: "Cruise",
    detail: "Trajectory verified. Cruise systems are online.",
  },
  science,
  completion,
];
const transferStages: readonly FlightStage[] = [
  countdown,
  ascent,
  {
    tick: 23,
    phase: "Cruise",
    detail:
      "Transfer injection complete. The spacecraft uses 20% of its planned maneuver allowance to trim its outbound course.",
  },
  {
    tick: 55,
    phase: "Orbit insertion",
    detail:
      "The spacecraft has reached its destination. The remaining 80% of its planned maneuver allowance supplies the arrival burn.",
  },
  science,
  completion,
];

/** Old saved transfer flights that already paid the larger tick-23 burn retain their original schedule. */
export function getFlightStages(
  state: Pick<SimulationState, "design" | "events">,
): readonly FlightStage[] {
  const usedEarlyInsertion = state.events.some(
    (record) => record.tick === 23 && record.title === "Orbit insertion",
  );
  return state.design.missionId === "earth" || usedEarlyInsertion
    ? earthStages
    : transferStages;
}

export function advanceSimulation(
  state: SimulationState,
  ticks = 1,
): SimulationState {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 1000)
    throw new Error("Advance must be an integer between 1 and 1,000 ticks.");
  if (state.status !== "LAUNCHING" && state.status !== "IN_FLIGHT")
    return state;
  const next = clone(state);
  const budget = calculateBudget(next.design);
  const mission = missions.find((m) => m.id === next.design.missionId)!;
  const stages = getFlightStages(next);
  const isTransfer = stages === transferStages;
  for (let i = 0; i < ticks; i++) {
    if (next.status !== "LAUNCHING" && next.status !== "IN_FLIGHT") break;
    next.tick++;
    const stage = stages.find((item) => item.tick === next.tick);
    if (stage) {
      next.phase = stage.phase;
      event(next, stage.phase, stage.detail, "success");
    }
    if (next.tick === 16)
      event(
        next,
        "Stage separation",
        "Upper stage continues the destination-specific injection sequence.",
      );
    if (next.tick === 23) {
      next.status = "IN_FLIGHT";
      if (!burn(next, budget.requiredDeltaV * (isTransfer ? 0.2 : 0.8))) break;
    }
    if (
      next.tick === 55 &&
      !burn(next, budget.requiredDeltaV * (isTransfer ? 0.8 : 0.2))
    )
      break;
    // Calendar progress is compressed. Each operations tick additionally samples a representative
    // 10-minute power/thermal interval; explicit disclosure in SOURCES.md and the application guide.
    next.elapsedDays =
      (mission.durationDays * next.tick) / FLIGHT_MODEL.totalTicks;
    const { demandW, generationW, batteryCapacityWh } = getLivePower(
      next,
      budget,
    );
    const samplesPerHour = 60 / FLIGHT_MODEL.powerSampleMinutes;
    next.batteryWh = clamp(
      next.batteryWh + (generationW - demandW) / samplesPerHour,
      0,
      batteryCapacityWh,
    );
    const operational = next.tick >= FLIGHT_MODEL.scienceStartTick;
    if (next.batteryWh <= 0) {
      next.health -= 5;
      if (next.tick % 6 === 0)
        event(
          next,
          "Power safe mode",
          "Battery depleted. Science is suspended until generation exceeds demand.",
          "warning",
        );
    }
    const targetTemp =
      20 + Math.max(0, demandW - budget.thermalCapacityW) * 0.1;
    next.temperatureC += clamp(targetTemp - next.temperatureC, -4, 4);
    if (next.temperatureC > FLIGHT_MODEL.thermalDamageC) {
      next.health -= Math.min(
        10,
        (next.temperatureC - FLIGHT_MODEL.thermalDamageC) * 0.4,
      );
      if (next.tick % 5 === 0)
        event(
          next,
          "Thermal limit exceeded",
          "Elevated temperature is damaging spacecraft health.",
          "warning",
        );
    }
    next.commOnline =
      operational && next.tick % 12 < 5 && next.commMultiplier > 0;
    if (
      operational &&
      next.batteryWh > 0 &&
      next.temperatureC < FLIGHT_MODEL.thermalScienceHoldC
    ) {
      const dataPerSample =
        (mission.requiredDataMb / 65) *
        (budget.science / mission.requiredScience) *
        next.scienceMultiplier;
      const freeSpace = Math.max(0, budget.storageMb - next.dataMb);
      const observed = Math.min(dataPerSample, freeSpace);
      next.dataMb += observed;
      if (observed < dataPerSample && next.tick % 12 === 0)
        event(
          next,
          "Recorder full",
          "Observations paused until stored science can be downlinked.",
          "warning",
        );
      // Each compressed contact gets a 60-minute ground-station allocation, all units Mb/s -> MB.
    }
    if (next.commOnline) {
      const transmitted = Math.min(
        next.dataMb,
        (budget.commMbps *
          next.commMultiplier *
          (FLIGHT_MODEL.contactMinutes * 60)) /
          8,
      );
      next.dataMb -= transmitted;
      next.downlinkedMb += transmitted;
    }
    // Success requires usable science delivered to Earth, not data merely stored onboard.
    next.scienceProgress = clamp(
      (next.downlinkedMb / mission.requiredDataMb) * 100,
    );
    next.health = clamp(next.health);
    if (next.health <= 10) {
      fail(
        next,
        "Spacecraft health fell below the safe operating threshold. Review power, thermal margins, and anomaly responses.",
      );
      break;
    }
    if (next.tick % FLIGHT_MODEL.telemetryIntervalTicks === 0)
      next.telemetry.push({
        tick: next.tick,
        battery:
          batteryCapacityWh > 0
            ? (next.batteryWh / batteryCapacityWh) * 100
            : 0,
        health: next.health,
        data: next.scienceProgress,
      });
    const anomalyIndex = [65, 105, 140].indexOf(next.tick);
    if (anomalyIndex >= 0) {
      const anomaly = structuredClone(
        anomalyCatalog[scheduledAnomaly(next.seed, anomalyIndex)],
      );
      if (
        anomaly.id === "instrument" &&
        !next.design.componentIds.some((id) => id.startsWith("redundancy-"))
      ) {
        anomaly.options = anomaly.options.filter(
          (option) => option.id !== "mitigate",
        );
        anomaly.description +=
          " This spacecraft carries no spare electronics path.";
      }
      if (anomaly.id === "solar") next.solarMultiplier *= 0.72;
      if (anomaly.id === "comms") {
        next.commMultiplier = 0;
        next.commOnline = false;
      }
      if (anomaly.id === "thruster") next.fuelKg *= 0.9;
      if (anomaly.id === "battery") {
        next.batteryMultiplier *= 0.65;
        next.batteryWh = Math.min(
          next.batteryWh,
          budget.batteryWh * next.batteryMultiplier,
        );
      }
      if (anomaly.id === "instrument") next.scienceMultiplier *= 0.65;
      if (anomaly.id === "thermal") next.temperatureC += 48;
      next.anomaly = anomaly;
      next.pausedFrom = "IN_FLIGHT";
      next.status = "PAUSED";
      event(next, anomaly.title, anomaly.description, "warning");
      break;
    }
    if (next.tick >= FLIGHT_MODEL.totalTicks) {
      if (next.scienceProgress >= 99.999) {
        next.status = "COMPLETED";
        next.phase = "Complete";
        event(
          next,
          "Mission accomplished",
          `Returned ${Math.round(next.downlinkedMb).toLocaleString()} MB of useful science. All primary objectives achieved.`,
          "success",
        );
      } else
        fail(
          next,
          `Only ${Math.round(next.scienceProgress)}% of the required science reached Earth. Review payload capability, power, recorder capacity, communications, and anomaly choices.`,
        );
      break;
    }
  }
  return next;
}
export function resolveAnomaly(
  state: SimulationState,
  optionId: string,
  actionId?: string,
): SimulationState {
  if (actionId && state.appliedActionIds.includes(actionId)) return state;
  if (state.status !== "PAUSED" || !state.anomaly)
    throw new Error("There is no pending anomaly to resolve.");
  const option = state.anomaly.options.find((o) => o.id === optionId);
  if (!option) throw new Error("Unknown anomaly response.");
  const next = clone(state);
  const id = state.anomaly.id;
  next.status = "IN_FLIGHT";
  delete next.pausedFrom;
  if (id === "solar") {
    if (optionId === "mitigate") next.scienceMultiplier *= 0.8;
    if (optionId === "reserve" && burn(next, 12)) next.solarMultiplier = 0.9;
  }
  if (id === "comms") {
    if (optionId === "mitigate") {
      next.commMultiplier = 0.85;
      next.scienceMultiplier *= 0.95;
    }
    if (optionId === "reserve") next.commMultiplier = 0.5;
  }
  if (id === "thruster") {
    if (optionId === "mitigate") burn(next, 45);
    if (optionId === "reserve") {
      burn(next, 15);
      next.scienceMultiplier *= 0.85;
    }
    if (optionId === "continue") {
      next.health -= 20;
      next.scienceMultiplier *= 0.6;
    }
  }
  if (id === "battery") {
    if (optionId === "mitigate") next.scienceMultiplier *= 0.85;
    if (optionId === "reserve") next.scienceMultiplier *= 0.75;
  }
  if (id === "instrument") {
    if (optionId === "mitigate")
      next.scienceMultiplier =
        (next.scienceMultiplier / 0.65) *
        (next.design.componentIds.includes("redundancy-full") ? 0.9 : 0.75);
    if (optionId === "reserve")
      next.scienceMultiplier = (next.scienceMultiplier / 0.65) * 0.8;
  }
  if (id === "thermal") {
    if (optionId === "mitigate") {
      next.scienceMultiplier *= 0.85;
      next.temperatureC -= 35;
    }
    if (optionId === "reserve" && burn(next, 10)) next.temperatureC -= 38;
  }
  if (id === "trajectory") {
    if (optionId === "mitigate") burn(next, 90);
    if (optionId === "reserve") {
      burn(next, 30);
      next.scienceMultiplier *= 0.65;
    }
    if (optionId === "continue") {
      next.health -= 45;
      next.scienceMultiplier *= 0.4;
    }
  }
  next.decisions.push({
    tick: state.tick,
    anomaly: state.anomaly.title,
    option: option.label,
    detail: option.description,
  });
  next.appliedActionIds.push(
    actionId ?? `${state.anomaly.id}-${state.tick}-${optionId}`,
  );
  event(
    next,
    `Command: ${option.label}`,
    option.description,
    next.failureReason ? "error" : "info",
  );
  next.anomaly = null;
  next.health = clamp(next.health);
  return next;
}
export function generateReport(state: SimulationState): MissionReport {
  const budget = calculateBudget(state.design);
  const mission = missions.find((m) => m.id === state.design.missionId)!;
  const errors = validateDesign(state.design).filter(
    (i) => i.severity === "error",
  );
  const science = clamp(state.scienceProgress);
  const engineering = errors.length ? 0 : 100;
  const fuelFraction =
    state.design.fuelKg > 0 ? state.fuelKg / state.design.fuelKg : 0;
  const costFraction = clamp(
    (mission.budgetM - budget.costM) / mission.budgetM,
    0,
    1,
  );
  const efficiency = clamp(
    (0.6 * costFraction + 0.4 * clamp(fuelFraction, 0, 1)) * 100,
  );
  const operations = clamp(
    state.health * 0.7 + (state.decisions.length / 3) * 30,
  );
  const reliability = clamp(
    (budget.reliability * 0.5 + (state.health / 100) * 0.5) * 100,
  );
  const weighted =
    science * 0.3 +
    engineering * 0.25 +
    efficiency * 0.2 +
    operations * 0.15 +
    reliability * 0.1;
  const score = Math.round(
    state.status === "FAILED" ? Math.min(49, weighted) : weighted,
  );
  const recommendations: string[] = [];
  if (science < 100)
    recommendations.push(
      "Increase useful science return: add a compatible instrument, preserve its duty cycle, and restore interrupted communications.",
    );
  if (state.fuelKg < state.design.fuelKg * 0.15)
    recommendations.push(
      "Increase propellant reserve or reduce dry mass to leave room for correction maneuvers.",
    );
  if (state.solarMultiplier * budget.generationW < budget.demandW * 1.3)
    recommendations.push(
      "Carry more solar power margin so degradation does not force reduced science operations.",
    );
  if (state.health < 85)
    recommendations.push(
      "Respond to thermal and trajectory alerts early to preserve spacecraft health.",
    );
  if (state.commMultiplier < 0.85)
    recommendations.push(
      "Recover the primary communication link to deliver more of the stored observations.",
    );
  if (budget.costM > mission.budgetM * 0.8)
    recommendations.push(
      "Compare lighter components and lower-cost compatible launchers to retain budget reserve.",
    );
  if (!recommendations.length)
    recommendations.push(
      "Your design met its objectives with healthy margins. Try a smaller launcher or lighter hardware to improve resource efficiency.",
    );
  return {
    simulationId: state.id,
    missionName: mission.name,
    status: state.status,
    score,
    breakdown: { science, engineering, efficiency, operations, reliability },
    budget,
    design: structuredClone(state.design),
    sciencePercent: science,
    dataPercent: clamp((state.downlinkedMb / mission.requiredDataMb) * 100),
    fuelUsedKg: state.design.fuelKg - state.fuelKg,
    budgetUsedPercent: (budget.costM / mission.budgetM) * 100,
    events: structuredClone(state.events),
    decisions: structuredClone(state.decisions),
    recommendations,
    summary:
      state.status === "COMPLETED"
        ? `Mission accomplished. ${Math.round(state.downlinkedMb).toLocaleString()} MB of science returned; ${state.health.toFixed(0)}% spacecraft health remains.`
        : (state.failureReason ??
          "Mission is still in progress. This score is provisional."),
  };
}
