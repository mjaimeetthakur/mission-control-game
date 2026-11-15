# Scientific references and model assumptions

Reference model version: **1.0.0**, bundled with the application. No NASA API key or online ephemeris is needed for gameplay. Hardware specifications, launch performance, mission budgets, anomaly probabilities, and target science volumes below are **fictional educational assumptions**, not NASA mission specifications or flight design advice. NASA does not endorse this game.

## Primary references

- [JPL Solar System Dynamics — Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html). Source for rounded gravitational parameters: Earth μ = 3.98600435507 × 10¹⁴ m³/s², Moon μ = 4.902800118 × 10¹² m³/s², Mars-system μ = 4.2828375816 × 10¹³ m³/s², Sun μ = 1.3271244004127942 × 10²⁰ m³/s²; astronomical unit = 149,597,870,700 m. The Mars-system parameter is used as a Mars point-mass approximation.
- [JPL — Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html) and [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/). Rounded mean radii used here: Earth 6,371 km, Moon 1,737.4 km, Mars 3,389.5 km. Actual planets are not perfect spheres.
- [NASA Glenn — Ideal Rocket Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/). Ideal exhaust-momentum model: Δv = Isp × g₀ × ln(m₀/mf). Standard gravity g₀ = 9.80665 m/s². Inverting the equation gives consumed propellant: m₀ × (1 − exp(−Δv/(Isp × g₀))). The application uses this inverse for every insertion or correction burn. It neglects finite-burn, steering, and gravity losses in spacecraft maneuvers.
- [NASA — Gravity & Mechanics](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/) and [Orbits and Kepler’s Laws](https://science.nasa.gov/solar-system/orbits-and-keplers-laws/). Two-body orbital model: circular speed √(μ/r), period 2π√(a³/μ), and vis-viva speed √(μ(2/r − 1/a)). Radii are measured from the central body’s center, not its surface; the UI converts altitude from km to SI meters before evaluation.
- [NASA — Trajectories](https://science.nasa.gov/learn/basics-of-space-flight/chapter4-1/). Coplanar, circular starting and target orbits allow a two-impulse Hohmann estimate. Transfer semi-major axis a = (r₁+r₂)/2, flight time π√(a³/μ), departure and arrival speed changes from vis-viva minus circular speeds. This educational estimate ignores eccentricity, inclination alignment, launch-date phasing, perturbations, and full patched-conic matching.

Sources were consulted during implementation on November 7, 2026. The application bundles rounded constants; it does not query real-time launch opportunities or ephemerides.

## Destination scenarios

| Scenario | Budget | Campaign duration | Spacecraft maneuver allowance | Data objective | Sunlight factor |
|---|---:|---:|---:|---:|---:|
| Low Earth orbit | $80M | 30 days | 160 m/s | 6,000 MB | 1.00 |
| Lunar orbiter | $180M | 90 days | 1,000 m/s | 9,000 MB | 1.00 |
| Mars orbiter | $420M | 540 days | 1,500 m/s | 14,000 MB | 0.43 |
| Asteroid reconnaissance | $550M | 780 days | 1,900 m/s | 18,000 MB | 0.25 |

These maneuver allowances are scenario design assumptions, not complete Earth-surface-to-destination delta-v requirements. The selected launch vehicle supplies ascent and destination injection. Spacecraft propellant pays arrival/trim burns and anomaly corrections. For Earth observation, tick 23 spends 80% of the planned maneuver allowance on orbit insertion. Tick 35 begins commissioning, and the final 20% is spent at tick 55 on orbit trim. Lunar, Mars, and asteroid missions launch from Earth at tick 10, separate stages at tick 16, enter transfer cruise at tick 23, and arrive at tick 55. The launcher supplies destination injection. The spacecraft spends 20% on outbound trim at tick 23 and the remaining 80% on destination orbit insertion at tick 55. All scenarios begin science at tick 60 and finish at tick 180. A saved flight that already executed an early insertion under the earlier schedule retains that schedule and its remaining fuel obligations. Raising or lowering the target circular orbit adds a calculated Hohmann maneuver; inclination changes add a separate ideal impulsive plane change, 2v × sin(Δi/2), at the target circular-orbit speed. This assumes the launch class delivers a reference inclination of 97° for LEO or 90° elsewhere; the spacecraft pays deviations from that reference. Altitude and plane-change costs are added as separate maneuvers instead of optimizing a combined burn.

The asteroid is fictional: radius 250 m, μ = 40 m³/s², heliocentric target radius 2 AU, fixed illustrative Earth distance 330 million km. It is not Bennu or another real asteroid. Mars transfer assumes a 1.524 AU circular orbit. Lunar flight-time estimate uses a 300 km Earth parking orbit and a 384,400 km target radius about Earth; it is not a capture solution. LEO transfer time is a 0.05-day scenario allowance.

Launch windows are recurrence hints, **not actual dated launch opportunities**. Calendar duration is a scenario narrative and scoring target; no real-time launch scheduling service is integrated.

## Fictional launch classes

| Launcher | Cost | LEO payload | Lunar injection | Mars injection | Asteroid injection | Reliability estimate |
|---|---:|---:|---:|---:|---:|---:|
| Swift | $12M | 900 kg | 250 kg | Unsupported | Unsupported | 95% |
| Atlas | $35M | 5,000 kg | 1,800 kg | 1,600 kg | 1,100 kg | 98% |
| Titan | $85M | 16,000 kg | 6,500 kg | 4,500 kg | 3,200 kg | 99% |

Names denote fictional educational classes; they do not describe similarly named historical rockets. Launch feasibility checks the destination-specific capacity, never the generic LEO maximum. A feasible launch is not subjected to an unrelated random loss. Reliability is an estimated score input, not a calibrated probability of flight success.

## Hardware and engineering budgets

The catalog in `src/core/data.ts` is the versioned source of truth. Every installed component contributes mass, cost, electrical load, reliability, compatibility and its specific capability. Choose one of each required subsystem, one or more distinct instruments, and up to one optional redundancy package. Fuel costs an assumed $1,000/kg. Two propulsion choices use assumed Isp of 225 s and 340 s. Tank, structural mass-envelope, battery capacity, thermal load and computer storage limits are enforced. Costs include launcher, all selected components and propellant; operations staffing is included implicitly in the scenario budget rather than a separate spending simulation.

Solar output at destination = rated 1 AU output × scenario sunlight factor. The sunlight factors are rounded inverse-square illustrations. Communication rate = antenna nominal rate × range factor: 1.0 Earth, 0.4 Moon, 0.06 Mars, 0.045 asteroid. This is a gameplay link-budget surrogate, **not an RF link equation**. The one-way delay is distance / 299,792,458 m/s at each scenario’s fixed illustrative distance; it does not model changing geometry or ground-station processing delay.

The model multiplies the selected component and launch reliability estimates. A spacecraft without a spare command path receives a 0.93 availability factor. Dual-string avionics add an illustrative 0.07 reliability allowance, capped at 0.999. After an instrument electronics fault, essential spares can restore 75% of prior capability and dual-string electronics can restore 90%. A spacecraft without spares must replan observations or continue with the surviving channels.

## Time, resources, and deterministic events

Each run has 180 strategic ticks. Campaign elapsed days = scenario duration × tick / 180; this is a compressed calendar. **It is not a continuous full-campaign propagation.** To make interactive resource trade-offs observable, each tick samples a representative 10-minute power and thermal interval. Power energy change is `(generation W − demand W) / 6` Wh, bounded by usable battery capacity. During operations, the last four ticks of each 18-tick cycle are representative eclipse samples (40 minutes total). Empty batteries suspend science and reduce health. Scientific duty-cycle reductions also reduce instrument power demand.

A communication window is available for five ticks of every 12 during operations. Each window tick is a representative **60-minute ground-station allocation**. Delivered data = rate Mbps × link multiplier × 3,600 seconds / 8, bounded by onboard stored MB. These contact samples and power samples are separate subsystem abstractions and are not one synchronized physical timeline. Data production is a calibrated mission sample: required MB / 65 × science capability / requirement × current instrument productivity. Storage saturation prevents new observations. Science completion is calculated from useful data actually downlinked, never data only collected or stored.

Thermal state moves toward a load-dependent equilibrium at at most 4°C per sample. Temperature above 55°C damages health, above 60°C suspends science. This is a lumped educational risk model, not radiative thermal analysis.

Anomalies occur at ticks 65, 105 and 140. A deterministic integer hash of the stored seed picks three distinct types from solar degradation, communications loss, thruster feed fault, battery degradation, instrument failure, thermal load and trajectory correction. Each choice changes authoritative resource state; no outcome is rerolled by frame rate or simulation speed. Battery damage cannot be repaired remotely; redundancy cannot create missing fuel. Given the same design, seed and decisions, numeric outcomes and event history reproduce exactly. Run UUIDs and creation timestamps are identifiers, not simulation inputs.

## Completion and scoring

A mission completes only if at least 100% of its required useful data reaches Earth while spacecraft health stays above 10%. It fails on exhausted maneuver propellant, health at/below 10%, or insufficient returned science at tick 180. Launch is blocked by hard engineering errors. Unresolved anomalies pause the mission; a failed/completed mission must be explicitly restarted.

All subscores are 0–100 before weighting:

- **Science, 30%:** min(100, returned MB / required MB × 100).
- **Engineering, 25%:** 100 if the design passes all hard constraints, otherwise 0.
- **Resource efficiency, 20%:** 100 × (0.6 × unused budget fraction + 0.4 × unused fuel fraction), each fraction clamped to 0–1.
- **Operations, 15%:** 0.7 × final health + 30 × resolved anomaly count / 3, clamped to 0–100. Responses are judged by their resulting resource/health/science effects; a conservative choice is not automatically more valuable.
- **Reliability, 10%:** mean of the modeled design reliability percentage and final health.

Round the weighted sum to an integer. Failed runs are capped at 49/100 regardless of any other favorable score. Reports generated before termination are explicitly provisional. The game prioritizes engineering consequences; it does not claim scientific fidelity comparable to mission-analysis software.
