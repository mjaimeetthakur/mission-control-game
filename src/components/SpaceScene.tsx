import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import earthSurface from "../assets/earth-blue-marble.jpg";
import { components, missions } from "../core/data";
import { FLIGHT_MODEL } from "../core/simulation";
import type { Category, MissionId, SpacecraftDesign } from "../core/types";

export interface SpaceSceneProps {
  mode: "overview" | "spacecraft" | "trajectory" | "flight";
  missionId: MissionId;
  design?: SpacecraftDesign;
  progress?: number;
  onSelectComponent?: (id: string) => void;
  reducedMotion?: boolean;
}

const palette: Record<MissionId, string> = {
  earth: "#8ccdd7",
  moon: "#bdc9d8",
  mars: "#dc9477",
  asteroid: "#b9afce",
};
const orbitPoints = (
  a: number,
  b: number,
  offset = 0,
): [number, number, number][] =>
  Array.from({ length: 181 }, (_, i) => {
    const angle = (i / 180) * Math.PI * 2;
    return [Math.cos(angle) * a + offset, 0, Math.sin(angle) * b];
  });

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function planetTexture(kind: Exclude<MissionId, "earth">): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 768;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width,
    h = canvas.height;
  ctx.fillStyle =
    kind === "mars" ? "#a65c40" : kind === "moon" ? "#9b9b96" : "#77717a";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const x = hash(i * 11) * w,
      y = hash(i * 17) * h,
      radius = 1 + hash(i * 9) * 14;
    ctx.fillStyle = `rgba(${kind === "mars" ? "59,30,23" : "43,41,40"},${hash(i * 7) * 0.11})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.6, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    if (i < 250) {
      ctx.strokeStyle = "rgba(233,220,202,.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  if (kind === "mars") {
    ctx.fillStyle = "#c1b6a1";
    ctx.fillRect(0, 0, w, 21);
    ctx.fillRect(0, h - 15, w, 15);
    ctx.strokeStyle = "rgba(62,31,22,.3)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.56);
    ctx.bezierCurveTo(w * 0.25, h * 0.6, w * 0.3, h * 0.54, w * 0.39, h * 0.57);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// NASA Blue Marble Next Generation, May 2004. This local texture also ships in the offline edition.
function EarthMaterial() {
  const texture = useLoader(THREE.TextureLoader, earthSurface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return <meshStandardMaterial map={texture} roughness={0.92} metalness={0} />;
}

function RockyMaterial({ kind }: { kind: Exclude<MissionId, "earth"> }) {
  const texture = useMemo(() => planetTexture(kind), [kind]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <meshStandardMaterial map={texture} roughness={0.95} metalness={0.02} />
  );
}

function Planet({
  kind,
  radius = 1.65,
  position = [0, 0, 0],
  rotate = true,
}: {
  kind: MissionId;
  radius?: number;
  position?: [number, number, number];
  rotate?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current && rotate) ref.current.rotation.y += delta * 0.025;
  });
  const geometry = useMemo(() => {
    if (kind !== "asteroid") return new THREE.SphereGeometry(radius, 96, 64);
    const geo = new THREE.IcosahedronGeometry(radius, 5);
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const f = 1 + Math.sin(x * 5) * Math.cos(y * 7) * Math.sin(z * 5) * 0.08;
      positions.setXYZ(i, x * f * 1.15, y * f * 0.82, z * f);
    }
    geo.computeVertexNormals();
    return geo;
  }, [kind, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group
      position={position}
      ref={ref}
      rotation={[0, kind === "earth" ? 4.28 : 0.5, kind === "earth" ? 0.15 : 0]}
    >
      <mesh geometry={geometry}>
        {kind === "earth" ? <EarthMaterial /> : <RockyMaterial kind={kind} />}
      </mesh>
      {kind === "earth" && (
        <mesh scale={1.025}>
          <sphereGeometry args={[radius, 64, 40]} />
          <shaderMaterial
            transparent
            side={THREE.BackSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uniforms={{ glowColor: { value: new THREE.Color("#4d9dce") } }}
            vertexShader={
              "varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*p;}"
            }
            fragmentShader={
              "uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vPosition; void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(-vPosition))),3.0);gl_FragColor=vec4(glowColor,rim*0.55);}"
            }
          />
        </mesh>
      )}
    </group>
  );
}

function StarField() {
  const geometry = useMemo(() => {
    const points = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const theta = hash(i * 7) * Math.PI * 2,
        phi = Math.acos(2 * hash(i * 9 + 2) - 1),
        radius = 28 + hash(i * 13) * 20;
      points[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      points[i * 3 + 1] = radius * Math.cos(phi);
      points[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#c2d6e6"
        size={0.035}
        transparent
        opacity={0.64}
        sizeAttenuation
      />
    </points>
  );
}

function Panel({
  side,
  scale = 1,
  selected = false,
  onClick,
}: {
  side: number;
  scale?: number;
  selected?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <group position={[side * (1.5 * scale + 0.6), 0, 0]} onClick={onClick}>
      <mesh position={[-side * 1.12 * scale, 0, 0]}>
        <boxGeometry args={[0.75, 0.06, 0.06]} />
        <meshStandardMaterial
          color="#a1adb1"
          metalness={0.7}
          roughness={0.35}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[2.2 * scale, 0.055, 1.25]} />
        <meshStandardMaterial
          color={selected ? "#87d9d5" : "#445765"}
          metalness={0.5}
          roughness={0.45}
        />
      </mesh>
      {Array.from({ length: 6 }, (_, x) =>
        Array.from({ length: 3 }, (_, z) => (
          <mesh
            key={`${x}-${z}`}
            position={[(x - 2.5) * 0.35 * scale, 0.035, (z - 1) * 0.39]}
          >
            <boxGeometry args={[0.326 * scale, 0.012, 0.365]} />
            <meshStandardMaterial
              color={(x + z) % 3 === 0 ? "#1d4169" : "#163450"}
              roughness={0.3}
              metalness={0.55}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, -0.036, 0]}>
        <boxGeometry args={[2.1 * scale, 0.01, 1.2]} />
        <meshStandardMaterial color="#3b4350" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Satellite({
  design,
  onSelect,
  small = false,
}: {
  design?: SpacecraftDesign;
  onSelect?: (id: string) => void;
  small?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const installed = useMemo(
    () => components.filter((c) => design?.componentIds.includes(c.id)),
    [design],
  );
  const find = (category: Category) =>
    installed.find((c) => c.category === category);
  const select = (category: Category) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const item = find(category);
    if (item) {
      setSelected(item.id);
      onSelect?.(item.id);
    }
  };
  const highlight = (category: Category) =>
    selected !== null && find(category)?.id === selected;
  const solar = find("solar");
  const wingScale =
    solar?.generationW && solar.generationW > 1500 ? 1.35 : 0.95;
  const hasSolar = !design || !!solar;
  const bigBus = (find("bus")?.massKg ?? 150) > 200;
  const foil = "#b29a54";
  return (
    <group scale={small ? 0.12 : 0.88} rotation={[0.25, -0.5, 0.08]}>
      <mesh onClick={select("bus")}>
        <boxGeometry args={[bigBus ? 1.3 : 1.1, 1.15, 0.95]} />
        <meshStandardMaterial
          color={highlight("bus") ? "#d6ca81" : foil}
          emissive={highlight("bus") ? "#318b88" : "#000000"}
          emissiveIntensity={0.2}
          metalness={0.78}
          roughness={0.47}
        />
      </mesh>
      <mesh position={[0, 0.59, 0]} onClick={select("thermal")}>
        <boxGeometry args={[1.13, 0.035, 0.99]} />
        <meshStandardMaterial
          color={highlight("thermal") ? "#83d8d5" : "#d3d8d6"}
          metalness={0.2}
          roughness={0.75}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * 0.56, 0, 0.491]}
            onClick={select("structure")}
          >
            <boxGeometry args={[0.035, 1.18, 0.02]} />
            <meshStandardMaterial
              color="#c5ced1"
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
          {hasSolar && (
            <Panel
              side={side}
              scale={wingScale}
              selected={highlight("solar")}
              onClick={select("solar")}
            />
          )}
          <mesh
            position={[side * 0.35, -0.66, 0]}
            rotation={[Math.PI, 0, 0]}
            onClick={select("propulsion")}
          >
            <cylinderGeometry args={[0.09, 0.17, 0.24, 20, 1, true]} />
            <meshStandardMaterial
              color="#9caaa8"
              metalness={0.8}
              roughness={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {!design || (find("antenna")?.rateMbps ?? 0) > 10 ? (
        <group
          position={[0.08, 0.9, 0.08]}
          rotation={[0.25, 0, -0.22]}
          onClick={select("antenna")}
        >
          <mesh position={[0, -0.15, 0]}>
            <cylinderGeometry args={[0.035, 0.045, 0.4, 12]} />
            <meshStandardMaterial
              color="#a1aab2"
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <sphereGeometry args={[0.58, 32, 16, 0, Math.PI * 2, 0, 0.85]} />
            <meshStandardMaterial
              color={highlight("antenna") ? "#83d8d5" : "#d5dbd9"}
              metalness={0.45}
              roughness={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.012, 0.018, 0.36, 10]} />
            <meshStandardMaterial
              color="#b5bcc3"
              metalness={0.8}
              roughness={0.3}
            />
          </mesh>
        </group>
      ) : (
        find("antenna") && (
          <mesh
            position={[0.15, 0.67, 0.1]}
            rotation={[-0.15, 0, 0.1]}
            onClick={select("antenna")}
          >
            <boxGeometry args={[0.42, 0.06, 0.42]} />
            <meshStandardMaterial
              color={highlight("antenna") ? "#83d8d5" : "#e1e3da"}
              roughness={0.65}
            />
          </mesh>
        )
      )}
      {installed
        .filter((c) => c.category === "instrument")
        .map((c, i) => (
          <group
            key={c.id}
            position={[(i - 0.5) * 0.42, 0.1, 0.64]}
            rotation={[Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(c.id);
              onSelect?.(c.id);
            }}
          >
            <mesh>
              <cylinderGeometry args={[0.17, 0.17, 0.35, 20]} />
              <meshStandardMaterial
                color={selected === c.id ? "#83d8d5" : "#c5c9cb"}
                metalness={0.7}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[0, -0.183, 0]}>
              <cylinderGeometry args={[0.135, 0.135, 0.01, 24]} />
              <meshStandardMaterial
                color="#0f2639"
                metalness={0.8}
                roughness={0.05}
              />
            </mesh>
          </group>
        ))}
      {(!design || find("computer")) && (
        <mesh position={[0, -0.12, -0.49]} onClick={select("computer")}>
          <boxGeometry args={[0.65, 0.45, 0.08]} />
          <meshStandardMaterial
            color="#c4cbc9"
            metalness={0.55}
            roughness={0.55}
          />
        </mesh>
      )}
      {find("battery") && (
        <mesh position={[-0.36, -0.28, 0.5]} onClick={select("battery")}>
          <boxGeometry args={[0.25, 0.45, 0.12]} />
          <meshStandardMaterial
            color="#4a535a"
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
      )}
      {find("attitude") && (
        <mesh position={[0.58, 0.34, -0.15]} onClick={select("attitude")}>
          <boxGeometry args={[0.13, 0.15, 0.28]} />
          <meshStandardMaterial
            color="#b8bcc3"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
      )}
      {find("redundancy") && (
        <mesh position={[0.4, -0.25, -0.5]} onClick={select("redundancy")}>
          <boxGeometry args={[0.22, 0.4, 0.12]} />
          <meshStandardMaterial
            color="#657f8b"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
      )}
      {design && design.fuelKg > 180 && (
        <mesh position={[0, 0, -0.7]} onClick={select("propulsion")}>
          <sphereGeometry
            args={[Math.min(0.5, 0.2 + design.fuelKg / 4000), 24, 18]}
          />
          <meshStandardMaterial
            color="#b6a367"
            metalness={0.7}
            roughness={0.4}
          />
        </mesh>
      )}
    </group>
  );
}

function Rocket({ progress }: { progress: number }) {
  return (
    <group
      position={[progress * 0.45, 1.66 + progress * 1.22, 0.3]}
      scale={0.22}
    >
      <mesh>
        <cylinderGeometry args={[0.22, 0.22, 2.6, 24]} />
        <meshStandardMaterial
          color="#d6dddf"
          roughness={0.55}
          metalness={0.2}
        />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <coneGeometry args={[0.22, 0.65, 24]} />
        <meshStandardMaterial color="#e4e7e7" roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.225, 0.225, 0.22, 24]} />
        <meshStandardMaterial color="#263944" roughness={0.6} />
      </mesh>
      {progress > 0 && (
        <mesh position={[0, -1.9, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.16, 1.25, 16]} />
          <meshBasicMaterial color="#e9b97d" transparent opacity={0.9} />
        </mesh>
      )}
      <pointLight
        position={[0, -1.4, 0]}
        color="#f6bb78"
        intensity={3}
        distance={2}
      />
    </group>
  );
}

function Scene({
  mode,
  missionId,
  design,
  progress = 0,
  onSelectComponent,
  reducedMotion,
}: SpaceSceneProps) {
  const satellite = useRef<THREE.Group>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const isTrajectory = mode === "trajectory";
  const isFlight = mode === "flight";
  const isWorkshop = mode === "spacecraft";
  // Display distances are schematic, but altitude and inclination follow the design.
  const target = missions.find((m) => m.id === missionId)!;
  const orbitA = design
    ? 2.35 +
      (0.65 * (design.altitudeKm - target.minAltitudeKm)) /
        (target.maxAltitudeKm - target.minAltitudeKm)
    : 2.7;
  const flightTick = Math.round(progress * FLIGHT_MODEL.totalTicks);
  const isLaunch = isFlight && flightTick < 23;
  const onTransfer =
    isFlight && missionId !== "earth" && flightTick >= 23 && flightTick < 55;
  const wideView = (isTrajectory && missionId !== "earth") || onTransfer;
  const transferProgress = onTransfer ? (flightTick - 23) / 32 : 0.5;
  const orbitB = orbitA * 0.815;
  const inclination = design ? (design.inclinationDeg * Math.PI) / 180 : 0.24;
  const orbit = useMemo(
    () => orbitPoints(wideView ? 3.1 : orbitA, wideView ? 2 : orbitB),
    [wideView, orbitA, orbitB],
  );
  const innerOrbit = useMemo(() => orbitPoints(2.25, 2.25), []);
  const route = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i): [number, number, number] => {
        const t = i / 89;
        return [-2.15 + 4.4 * t, 0.03, Math.sin(t * Math.PI) * -2.0];
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (satellite.current) {
      const angle = isFlight
        ? progress * Math.PI * 5
        : reducedMotion
          ? 0.7
          : clock.getElapsedTime() * 0.06 + 0.7;
      satellite.current.position.set(
        Math.cos(angle) * orbitA,
        0,
        Math.sin(angle) * orbitB,
      );
      satellite.current.rotation.y = -angle;
    }
    if (orbitRef.current && !reducedMotion && mode === "overview")
      orbitRef.current.rotation.y =
        Math.sin(clock.getElapsedTime() * 0.025) * 0.04;
  });
  return (
    <>
      <ambientLight intensity={isWorkshop ? 1.1 : 0.3} />
      <directionalLight
        position={[-4, 4, 5]}
        intensity={isWorkshop ? 3.5 : 3.3}
        color="#effaff"
      />
      <directionalLight
        position={[3, -1, -3]}
        intensity={isWorkshop ? 1.3 : 0.18}
        color="#6a98cb"
      />
      <StarField />
      {isWorkshop ? (
        <>
          <Satellite design={design} onSelect={onSelectComponent} />
          <gridHelper
            args={[12, 24, "#18343e", "#10202a"]}
            position={[0, -1.8, 0]}
          />
          <Line
            points={[
              [-4, -1.79, 0],
              [4, -1.79, 0],
            ]}
            color="#28545c"
            lineWidth={1}
          />
        </>
      ) : (
        <group rotation={[0.22, 0, -0.18]} ref={orbitRef}>
          {wideView ? (
            <>
              <Planet
                kind="earth"
                radius={0.65}
                position={[-2.15, 0, 0]}
                rotate={!reducedMotion}
              />
              <Planet
                kind={missionId}
                radius={missionId === "moon" ? 0.32 : 0.52}
                position={[2.25, 0, 0]}
                rotate={!reducedMotion}
              />
              <Line points={route} color={palette[missionId]} lineWidth={1.3} />
              <Line
                points={orbit}
                color="#36505e"
                lineWidth={0.6}
                dashed
                dashSize={0.035}
                gapSize={0.06}
              />
              {missionId !== "moon" && (
                <mesh position={[0, 0, 3.4]}>
                  <sphereGeometry args={[0.19, 32, 20]} />
                  <meshBasicMaterial color="#d7bd85" />
                </mesh>
              )}
              <group
                position={[
                  -2.15 + 4.4 * transferProgress,
                  0.04,
                  -2 * Math.sin(transferProgress * Math.PI),
                ]}
              >
                <Satellite design={design} small />
              </group>
            </>
          ) : (
            <>
              <Planet
                kind={isLaunch ? "earth" : missionId}
                radius={isLaunch ? 1.45 : 1.65}
                rotate={!reducedMotion}
              />
              <group rotation={[inclination, 0, 0.1]}>
                <Line
                  points={orbit}
                  color={palette[missionId]}
                  lineWidth={1}
                  transparent
                  opacity={0.55}
                />
                {!isLaunch && (
                  <group ref={satellite}>
                    <Satellite design={design} small />
                  </group>
                )}
              </group>
              <group rotation={[0.55, 0, 0.6]}>
                <Line
                  points={innerOrbit}
                  color="#48606d"
                  lineWidth={0.6}
                  dashed
                  dashSize={0.025}
                  gapSize={0.045}
                />
              </group>
              {isLaunch && (
                <Rocket progress={Math.max(0, (flightTick - 10) / 13)} />
              )}
              <mesh position={[-2.36, 0, -1.07]}>
                <sphereGeometry args={[0.025, 12, 8]} />
                <meshBasicMaterial color="#b9e4e7" />
              </mesh>
            </>
          )}
        </group>
      )}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={isWorkshop ? 3 : 3.6}
        maxDistance={14}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

function FallbackScene({
  mode,
  missionId,
  design,
  onSelectComponent,
}: SpaceSceneProps) {
  const installed = components.filter((c) =>
    design?.componentIds.includes(c.id),
  );
  const isWorkshop = mode === "spacecraft";
  const select = (category: Category) => {
    const c = installed.find((item) => item.category === category);
    if (c) onSelectComponent?.(c.id);
  };
  return (
    <div
      style={{
        height: "100%",
        minHeight: 240,
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(ellipse at 50% 50%,#101e2b 0%,#080e17 65%)",
      }}
    >
      <svg
        viewBox="0 0 700 440"
        role="img"
        aria-label={
          isWorkshop
            ? "Spacecraft schematic showing the selected bus, arrays, antenna and payload."
            : `${missionId} orbital schematic. Distances are illustrative.`
        }
        style={{ width: "100%", height: "100%", maxHeight: "100%" }}
      >
        <defs>
          <radialGradient id="mc-planet">
            <stop offset="0" stopColor={palette[missionId]} />
            <stop
              offset=".55"
              stopColor={missionId === "earth" ? "#305b72" : "#796253"}
            />
            <stop offset="1" stopColor="#0a1320" />
          </radialGradient>
          <pattern
            id="mc-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="#142634"
              strokeWidth=".5"
            />
          </pattern>
        </defs>
        <rect width="700" height="440" fill="url(#mc-grid)" />
        {Array.from({ length: 40 }, (_, i) => (
          <circle
            key={i}
            cx={hash(i * 3) * 700}
            cy={hash(i * 7) * 440}
            r={hash(i * 5) * 0.9 + 0.3}
            fill="#91a7bc"
            opacity=".5"
          />
        ))}
        {isWorkshop ? (
          <g transform="translate(350,220) rotate(-14)">
            <g
              role="button"
              tabIndex={0}
              aria-label="Select solar arrays"
              onClick={() => select("solar")}
              onKeyDown={(e) => {
                if (e.key === "Enter") select("solar");
              }}
              style={{ cursor: "pointer" }}
            >
              <path
                d="M-230 -55 H-66 V55 H-230Z M66 -55 H230 V55 H66Z"
                fill="#153449"
                stroke="#73909d"
              />
              <path
                d="M-188 -55 V55 M-146 -55 V55 M-104 -55 V55 M104 -55 V55 M146 -55 V55 M188 -55 V55 M-230 -18 H-66 M-230 18 H-66 M66 -18 H230 M66 18 H230"
                stroke="#55718b"
                strokeWidth="1"
              />
            </g>
            <g
              role="button"
              tabIndex={0}
              aria-label="Select spacecraft bus"
              onClick={() => select("bus")}
              onKeyDown={(e) => {
                if (e.key === "Enter") select("bus");
              }}
              style={{ cursor: "pointer" }}
            >
              <rect
                x="-44"
                y="-60"
                width="88"
                height="120"
                rx="2"
                fill="#a59458"
                stroke="#d4c291"
              />
              <path
                d="M-44 -35 H44 M-44 35 H44 M-22 -60 V60 M22 -60 V60"
                stroke="#d2bb70"
                opacity=".5"
              />
            </g>
            <g
              role="button"
              tabIndex={0}
              aria-label="Select antenna"
              onClick={() => select("antenna")}
              onKeyDown={(e) => {
                if (e.key === "Enter") select("antenna");
              }}
              style={{ cursor: "pointer" }}
            >
              <path
                d="M0 -60 V-86 M-34 -100 Q0 -63 34 -100"
                fill="#cbd3d4"
                stroke="#dce1e0"
                strokeWidth="2"
              />
              <path d="M0 -89 V-119" stroke="#dce1e0" strokeWidth="2" />
            </g>
            <path
              d="M-30 60 L-38 86 H-9 L-15 60 M15 60 L9 86 H38 L30 60"
              fill="#526776"
              stroke="#bdc6c9"
            />
          </g>
        ) : (
          <g transform="translate(350,215)">
            <ellipse
              rx="225"
              ry="80"
              fill="none"
              stroke="#436171"
              strokeDasharray="2 5"
              transform="rotate(-24)"
            />
            <circle
              r="120"
              fill="url(#mc-planet)"
              stroke="#4b7388"
              strokeWidth="1"
            />
            <ellipse
              rx="242"
              ry="87"
              fill="none"
              stroke={palette[missionId]}
              opacity=".65"
              transform="rotate(24)"
            />
            <circle cx="202" cy="91" r="4" fill="#d8e8e9" />
            {missionId === "earth" && (
              <path
                d="M-55 -90 L-90 -48 -76 -24 -40 -15 -35 20 -11 47 8 90 28 65 30 38 48 3 26 -15 41 -35 12 -57 -20 -50Z"
                fill="#8ca18d"
                opacity=".35"
              />
            )}
          </g>
        )}
        <text
          x="22"
          y="414"
          fontFamily="monospace"
          fontSize="10"
          fill="#748b9d"
        >
          2D SCHEMATIC · WEBGL UNAVAILABLE
        </text>
      </svg>
    </div>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function canRenderWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export default function SpaceScene(props: SpaceSceneProps) {
  const [webgl] = useState(canRenderWebGL);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setSystemReducedMotion(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  const reducedMotion = props.reducedMotion ?? systemReducedMotion;
  const fallback = <FallbackScene {...props} />;
  if (!webgl) return fallback;
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        minHeight: 240,
      }}
    >
      <SceneBoundary fallback={fallback}>
        <Canvas
          camera={{
            position:
              props.mode === "spacecraft" ? [3.7, 3.1, 6.2] : [0, 2.3, 7.5],
            fov: 42,
            near: 0.1,
            far: 90,
          }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          fallback={fallback}
          style={{ background: "transparent", touchAction: "none" }}
          aria-label={
            props.mode === "spacecraft"
              ? "Interactive spacecraft digital twin. Drag to rotate, scroll to zoom, right-drag to pan, and click a module to inspect it."
              : `Interactive ${props.missionId} orbital scene. Drag to rotate and scroll to zoom.`
          }
        >
          <Suspense fallback={null}>
            <Scene {...props} reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </SceneBoundary>
      <div
        aria-hidden="true"
        style={{
          pointerEvents: "none",
          position: "absolute",
          bottom: 17,
          left: 20,
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: ".07em",
          color: "#6f8394",
        }}
      >
        DRAG TO ROTATE <span style={{ padding: "0 7px", opacity: 0.5 }}>·</span>{" "}
        SCROLL TO ZOOM{" "}
        {props.mode === "spacecraft" && (
          <>
            <span style={{ padding: "0 7px", opacity: 0.5 }}>·</span> SELECT A
            MODULE
          </>
        )}
      </div>
    </div>
  );
}
