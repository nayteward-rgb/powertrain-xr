"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

type BreakerKey = "mainA" | "tie" | "mainB";
type FeederBreakerId =
  | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8"
  | "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "B8";
type GearBreakerId = BreakerKey | FeederBreakerId;
type RackPosition = "CONNECTED" | "TEST" | "DISCONNECTED";
type GearBreakerState = {
  closed: boolean;
  position: RackPosition;
  locked: boolean;
  tagged: boolean;
  racking: boolean;
};
type GearBreakerDefinition = {
  id: GearBreakerId;
  label: string;
  bus: "1" | "2" | "CENTER";
  deck: "UPPER" | "LOWER" | "FULL";
  duty: string;
};
type SourceKey = "sourceA" | "sourceB";
type MotorKey = "low" | "high";
type MotorStatus = "STOPPED" | "STARTING" | "RUNNING" | "TRIPPED";
type TransferPosition = "BUS1" | "NORMAL" | "BUS2";
type ControlAuthority = "OVATION" | "FIELD" | "STARTER";
type ControlOrigin = "ovation" | "field" | "starter" | "control board";
type RelayPage = "home" | "metering" | "thermal" | "inputs" | "targets" | "events";
type LotoTarget = GearBreakerId;
type BearingKey = "mob" | "mib" | "pib" | "pob" | "thrust";
type FaultCode =
  | "none"
  | "bus-loss"
  | "dc-loss"
  | "52a-fail"
  | "far-fail"
  | "41-coil-open"
  | "pickup-bypass-open"
  | "mechanical-interlock"
  | "loss-field"
  | "valve-closed-proof"
  | "sealin-fail"
  | "valve-fail-open"
  | "valve-fail-close"
  | "ground-fault"
  | "overload";
type SoundKind = "breaker" | "selector" | "valve" | "motorStart" | "motorStop" | "trip";

type AudioEngine = {
  context: AudioContext;
  master: GainNode;
  motorGain?: GainNode;
  motorOscillators?: OscillatorNode[];
};

type PlantState = {
  sourceA: boolean;
  sourceB: boolean;
  mainA: boolean;
  tie: boolean;
  mainB: boolean;
  busy: boolean;
  overlap: boolean;
  syncCheck: boolean;
  sequence: string;
  event: string;
  transferPosition: TransferPosition;
  controlAuthority: ControlAuthority;
  selectedMotor: MotorKey;
  motorStatus: MotorStatus;
  motorEvent: string;
  starterLowClosed: boolean;
  starterHighClosed: boolean;
  mainContactorClosed: boolean;
  mgRunning: boolean;
  farPicked: boolean;
  fieldOn: boolean;
  k45Seal: boolean;
  eStopLatched: boolean;
  tripCause: string | null;
  valvePosition: number;
  faultSelection: FaultCode;
  activeFault: FaultCode;
  selectedBearing: BearingKey;
  bearingTemps: Record<BearingKey, number>;
  motorVibration: number;
  pumpVibration: number;
  lotoActive: boolean;
  lotoStep: number;
  lotoTarget: LotoTarget;
  lotoNotified: boolean;
  lotoIsolationLocked: boolean;
  lotoTagApplied: boolean;
  lotoMasterApplied: boolean;
  lotoPersonalLocks: number;
  lotoTryAttempted: boolean;
  lotoZeroVerified: boolean;
  lotoStoredEnergySafe: boolean;
  lotoAreaClear: boolean;
  lotoWorkersAccounted: boolean;
  gearBreakers: Record<GearBreakerId, GearBreakerState>;
};

const BUS_1_UPPER: FeederBreakerId[] = ["A1", "A2", "A3", "A4"];
const BUS_1_LOWER: FeederBreakerId[] = ["A5", "A6", "A7", "A8"];
const BUS_2_UPPER: FeederBreakerId[] = ["B1", "B2", "B3", "B4"];
const BUS_2_LOWER: FeederBreakerId[] = ["B5", "B6", "B7", "B8"];

const GEAR_BREAKER_DEFS: GearBreakerDefinition[] = [
  ...BUS_1_UPPER.map((id, index) => ({ id, label: `52-${id}`, bus: "1" as const, deck: "UPPER" as const, duty: index === 0 ? "SYNCHRONOUS MOTOR FEEDER" : `BUS 1 FEEDER ${index + 1}` })),
  ...BUS_1_LOWER.map((id, index) => ({ id, label: `52-${id}`, bus: "1" as const, deck: "LOWER" as const, duty: `BUS 1 FEEDER ${index + 5}` })),
  { id: "mainA", label: "52-M1", bus: "CENTER", deck: "FULL", duty: "SOURCE 1 MAIN" },
  { id: "tie", label: "52-T", bus: "CENTER", deck: "FULL", duty: "BUS TIE" },
  { id: "mainB", label: "52-M2", bus: "CENTER", deck: "FULL", duty: "SOURCE 2 MAIN" },
  ...BUS_2_UPPER.map((id, index) => ({ id, label: `52-${id}`, bus: "2" as const, deck: "UPPER" as const, duty: `BUS 2 FEEDER ${index + 1}` })),
  ...BUS_2_LOWER.map((id, index) => ({ id, label: `52-${id}`, bus: "2" as const, deck: "LOWER" as const, duty: `BUS 2 FEEDER ${index + 5}` })),
];

const GEAR_BREAKER_BY_ID = Object.fromEntries(GEAR_BREAKER_DEFS.map((definition) => [definition.id, definition])) as Record<GearBreakerId, GearBreakerDefinition>;

const INITIAL_GEAR_BREAKERS = Object.fromEntries(
  GEAR_BREAKER_DEFS.map(({ id }) => [id, {
    closed: id === "mainA" || id === "mainB" || id === "A1" || id === "A2" || id === "B1" || id === "B2",
    position: "CONNECTED" as RackPosition,
    locked: false,
    tagged: false,
    racking: false,
  }]),
) as Record<GearBreakerId, GearBreakerState>;

type Inspection = {
  title: string;
  eyebrow: string;
  description: string;
  rows: Array<[string, string]>;
  note?: string;
};

const INITIAL_STATE: PlantState = {
  sourceA: true,
  sourceB: true,
  mainA: true,
  tie: false,
  mainB: true,
  busy: false,
  overlap: false,
  syncCheck: true,
  sequence: "NORMAL — SPLIT BUS",
  event: "Normal: Main 1 closed · tie open · Main 2 closed",
  transferPosition: "NORMAL",
  controlAuthority: "OVATION",
  selectedMotor: "low",
  motorStatus: "STOPPED",
  motorEvent: "Single-speed 2,500 hp motor · DCS remote control enabled",
  starterLowClosed: true,
  starterHighClosed: true,
  mainContactorClosed: false,
  mgRunning: false,
  farPicked: false,
  fieldOn: false,
  k45Seal: false,
  eStopLatched: false,
  tripCause: null,
  valvePosition: 0,
  faultSelection: "none",
  activeFault: "none",
  selectedBearing: "mob",
  bearingTemps: {
    mob: 52,
    mib: 54,
    pib: 56,
    pob: 55,
    thrust: 58,
  },
  motorVibration: 0.12,
  pumpVibration: 0.15,
  lotoActive: false,
  lotoStep: 0,
  lotoTarget: "A1",
  lotoNotified: false,
  lotoIsolationLocked: false,
  lotoTagApplied: false,
  lotoMasterApplied: false,
  lotoPersonalLocks: 0,
  lotoTryAttempted: false,
  lotoZeroVerified: false,
  lotoStoredEnergySafe: false,
  lotoAreaClear: false,
  lotoWorkersAccounted: false,
  gearBreakers: INITIAL_GEAR_BREAKERS,
};

const BEARING_LABELS: Record<BearingKey, string> = {
  mob: "Motor outboard",
  mib: "Motor inboard",
  pib: "Pump inboard",
  pob: "Pump outboard",
  thrust: "Thrust bearing",
};

const BEARING_KEYS = Object.keys(BEARING_LABELS) as BearingKey[];
const NORMAL_BEARING_TEMPS: Record<BearingKey, number> = { mob: 52, mib: 54, pib: 56, pob: 55, thrust: 58 };
const VIBRATION_TRIP = 0.2;

const FAULT_OPTIONS: Array<{ value: FaultCode; label: string; target: string }> = [
  { value: "none", label: "No fault", target: "CLEAR" },
  { value: "bus-loss", label: "Selected 4.8 kV bus undervoltage", target: "27" },
  { value: "dc-loss", label: "125 VDC unavailable", target: "DC" },
  { value: "52a-fail", label: "52a auxiliary fails to make", target: "52a" },
  { value: "far-fail", label: "FAR fails to pick up", target: "56" },
  { value: "41-coil-open", label: "41 field-contactor coil open", target: "41" },
  { value: "pickup-bypass-open", label: "41 pickup bypass contact open", target: "41-PB" },
  { value: "mechanical-interlock", label: "Mechanical interlock blocked", target: "41-MI" },
  { value: "loss-field", label: "Loss of field after synchronizing", target: "40" },
  { value: "valve-closed-proof", label: "Valve closed proof missing", target: "VLV-CLS" },
  { value: "sealin-fail", label: "45-second seal-in relay fails", target: "48-K45" },
  { value: "valve-fail-open", label: "Valve fails below 30% run position", target: "48-VLV" },
  { value: "valve-fail-close", label: "Valve fails to reach closed limit", target: "VLV-CLS" },
  { value: "ground-fault", label: "Ground-fault trip", target: "50G/51G" },
  { value: "overload", label: "Motor overload trip", target: "49" },
];

const FAULT_LABELS = Object.fromEntries(FAULT_OPTIONS.map(({ value, label }) => [value, label])) as Record<FaultCode, string>;
const FAULT_TARGETS = Object.fromEntries(FAULT_OPTIONS.map(({ value, target }) => [value, target])) as Record<FaultCode, string>;

function bearingLevel(temperature: number) {
  if (temperature >= 85) return "trip";
  if (temperature >= 75) return "alarm";
  return "normal";
}

function activeProtectionInput(state: PlantState) {
  const hotBearing = BEARING_KEYS.find((key) => state.bearingTemps[key] >= 85);
  if (hotBearing) return `${BEARING_LABELS[hotBearing]} remains at ${state.bearingTemps[hotBearing]}°C`;
  if (state.motorVibration >= VIBRATION_TRIP) return `Motor vibration remains at ${state.motorVibration.toFixed(2)} in/s RMS`;
  if (state.pumpVibration >= VIBRATION_TRIP) return `Pump vibration remains at ${state.pumpVibration.toFixed(2)} in/s RMS`;
  if (state.activeFault !== "none") return `${FAULT_LABELS[state.activeFault]} remains injected`;
  return null;
}

const LOTO_STEPS = [
  "Ready — choose the energy-isolating breaker.",
  "Prepare and notify: identify every energy source and notify affected employees before shutdown.",
  "Orderly shutdown: stop the motor, close the valve, remove field excitation, and place controls in a safe position.",
  "Isolate: OPEN the selected breaker, rack it to disconnected, isolate the M-G / 125 VDC circuit, and control hydraulic or rotating energy.",
  "Apply isolation devices: install the hasp, yellow isolation lock and danger tag; put the controlled isolation key in the group lockbox.",
  "Secure group control: apply the master control lock and each authorized employee's personal lock/tag to the group lockbox.",
  "Verify zero energy: perform a try-start from DCS and local control, verify absence of voltage with the approved test method, and verify stored energy is safe.",
  "Release and restore: inspect the area, account for every person, remove each employee's own lock, remove the master/isolation devices, notify affected employees, then re-energize.",
] as const;

const RELAY_PAGES: Array<{ id: RelayPage; label: string }> = [
  { id: "home", label: "HOME" },
  { id: "metering", label: "METERING" },
  { id: "thermal", label: "THERMAL / VIB" },
  { id: "inputs", label: "I/O STATUS" },
  { id: "targets", label: "ACTIVE TARGETS" },
  { id: "events", label: "EVENTS" },
];

const INSPECTIONS: Record<string, Inspection> = {
  overview: {
    eyebrow: "MOTOR FLOOR",
    title: "Single-speed brushed synchronous pump drive",
    description:
      "A representative single-speed synchronous motor train with visible slip rings and brushes, an actuated discharge valve, field equipment, and a double-ended medium-voltage lineup.",
    rows: [
      ["Motor", "2,500 hp · 4.8 kV · single speed"],
      ["Rotor field", "Two slip rings · carbon brushes"],
      ["Discharge valve", "36 in · 30% minimum run position"],
      ["Protection", "Digital motor relay · five RTDs · vibration"],
    ],
    note: "Representative training concept only — equipment identifiers, ratings, settings, and timing are illustrative.",
  },
  mainA: {
    eyebrow: "MAIN–TIE–MAIN SWITCHGEAR",
    title: "52-M1 · Main 1",
    description: "Representative incoming medium-voltage breaker for Source 1 and Bus 1, with local and switchboard open/close control.",
    rows: [
      ["Continuous rating", "2,000 A illustrative basis"],
      ["Breaker", "Drawout vacuum breaker"],
      ["Control", "Local / switchboard · 3-position selector"],
      ["Permissives", "27/59 · 81 · 25 sync check"],
      ["Transition", "Closed when both sources qualify"],
    ],
    note: "Representative metal-clad main section arranged as a 2,000 A training lineup.",
  },
  tie: {
    eyebrow: "MAIN–TIE–MAIN SWITCHGEAR",
    title: "52-T · Bus Tie",
    description: "Vacuum tie breaker joining Bus 1 and Bus 2, with local and switchboard open/close control.",
    rows: [
      ["Normal state", "OPEN"],
      ["Breaker", "Drawout vacuum breaker"],
      ["Live-bus close", "Sync-check required"],
      ["Parallel overlap", "180 ms simulated"],
      ["Watchdog", "Trips sequence if overlap persists"],
    ],
    note: "The 180 ms value demonstrates the sequence; it is not a recommended field setting.",
  },
  mainB: {
    eyebrow: "MAIN–TIE–MAIN SWITCHGEAR",
    title: "52-M2 · Main 2",
    description: "Representative incoming medium-voltage breaker for Source 2 and Bus 2, with local and switchboard open/close control.",
    rows: [
      ["Continuous rating", "2,000 A illustrative basis"],
      ["Breaker", "Drawout vacuum breaker"],
      ["Control", "Local / switchboard · 3-position selector"],
      ["Permissives", "27/59 · 81 · 25 sync check"],
      ["Transition", "Closed when both sources qualify"],
    ],
    note: "Representative metal-clad main section arranged as a 2,000 A training lineup.",
  },
  field: {
    eyebrow: "EXCITER / FIELD CONTROL",
    title: "Schematic-based synchronous field cabinet",
    description:
      "A digital motor relay, local/remote controls, field relays, overloads, contactors, terminal blocks, and 125 VDC excitation logic are grouped in this operable cabinet.",
    rows: [
      ["Protection", "One digital motor relay · interactive pages / targets"],
      ["Local control", "Authority select · start · stop · reset · E-stop"],
      ["Print relays", "M · 5R · AR · 42a · 56/FAR · 41"],
      ["Overload", "49 supervision through motor relay"],
      ["Excitation", "M-G set · 125 VDC · 56/FAR pickup"],
      ["Discharge", "Field-discharge resistor mounted on cabinet top"],
      ["Inputs", "CT/GF · five RTDs · motor/pump vibration"],
      ["Valve logic", "Closed limit → K45 45 s seal-in"],
    ],
    note: "The field cabinet, starter stations, and DCS station share one interlocked simulated control circuit.",
  },
  ovation: {
    eyebrow: "REMOTE DCS CONTROL",
    title: "DCS motor operator station",
    description: "A remote operator station connected through the LOCAL / REMOTE control-authority circuit, with motor, valve, protection, breaker, and permissive indication.",
    rows: [
      ["Authority", "Commands accepted only in DCS / REMOTE"],
      ["Motor", "Low / high select · start · normal stop · trip reset"],
      ["Valve", "Open / close command · position · 30% minimum"],
      ["Protection", "Motor-relay health, trip target, RTD and vibration summary"],
      ["Permissives", "Bus · starter · VLV-CLS · M-G DC · 56/FAR · 41"],
    ],
    note: "Stop and emergency-trip paths remain available independently of a remote START permissive.",
  },
  mgSet: {
    eyebrow: "FIELD POWER",
    title: "Motor-generator excitation set",
    description: "The M-G set supplies the simulated 125 VDC excitation system and starts automatically with a motor start command.",
    rows: [
      ["AC machine", "M-G drive motor"],
      ["DC machine", "125 VDC field generator"],
      ["Control", "Automatic from exciter cabinet"],
      ["Interlock", "Field contactor blocked until M-G set is ready"],
    ],
  },
  controlBoard: {
    eyebrow: "UNIFIED OPERATOR STATION",
    title: "Motor and MTM control board",
    description: "A normally scaled operator board with motor and valve control, individual main/tie breaker controls, a three-position transfer selector, and an attached training-input bay. The motor relay is located at the exciter cabinet.",
    rows: [
      ["Motor", "Single-speed start · stop · reset · E-stop"],
      ["Valve", "Position indication · open / close · 30% run minimum"],
      ["Excitation", "M-G · field · K45 status"],
      ["Power", "All on Bus 1 · Normal · All on Bus 2"],
      ["Training", "Fault injector · five RTDs · motor/pump vibration"],
    ],
  },
  loto: {
    eyebrow: "CONTROL OF HAZARDOUS ENERGY",
    title: "Group LOTO station",
    description: "A training representation of a group lockout system, isolation lock, master control lock, individual keys, tags, group lockbox, and multi-lock hasps.",
    rows: [
      ["Isolation locks", "Yellow · individually keyed"],
      ["Group control", "Master control lock · group lockbox"],
      ["Accessories", "Danger tags · multi-lock hasps"],
      ["Release rule", "Account for every person and lock before release"],
    ],
    note: "Simulation only — the approved equipment-specific facility procedure and authorized-person rules control the real job.",
  },
  motorLow: {
    eyebrow: "COMMON-SHAFT MOTOR TRAIN",
    title: "Brushed synchronous motor",
    description: "A compact single-speed 2,500 hp, 4.8 kV synchronous machine with visible rotor-field slip rings and carbon brushes.",
    rows: [
      ["Protection", "Exciter-cabinet motor relay"],
      ["Field", "41 · 56/FAR · discharge resistor"],
      ["Rotor connection", "Two copper slip rings · brush holders"],
      ["Bearings", "Motor outboard and inboard"],
      ["Temperature", "75 °C alarm · 85 °C latched trip"],
    ],
  },
  pump: {
    eyebrow: "HYDRAULIC TRAIN",
    title: "Pump and 36-inch discharge",
    description: "Common-shaft pump, thrust bearing, Venturi valve, and discharge piping.",
    rows: [
      ["Run permissive", "Valve command ≥ 30%"],
      ["Seal-in", "Closed limit starts K45 for 45 s"],
      ["Bearings", "Pump IB · pump OB · thrust"],
      ["Vibration trip", "0.20 in/s RMS"],
    ],
  },
};

function gearBreakerInspection(definition: GearBreakerDefinition): Inspection {
  return {
    eyebrow: "EATON VCP-W TRAINING LINEUP",
    title: `${definition.label} · ${definition.duty}`,
    description: "An operable drawout vacuum-breaker compartment in the double-ended bus. Open its breaker workstation for local controls, ArcSafe-style remote racking, lockout hardware, and its equipment-specific training SOP.",
    rows: [
      ["Location", definition.bus === "CENTER" ? "Main–tie–main center" : `Bus ${definition.bus} · ${definition.deck.toLowerCase()} compartment`],
      ["Breaker", "VCP-W-style drawout vacuum breaker"],
      ["Position", "Connected · test · disconnected"],
      ["Metering", "Protection relay · IQ analyzer"],
      ["Racking", "CBS ArcSafe RRS-1-style remote console"],
      ["LOTO", "Yellow isolation lock · hasp · danger tag"],
    ],
    note: "Training representation only. The installed equipment manuals, arc-flash study, and approved site procedure control field work.",
  };
}

function statusWord(closed: boolean) {
  return closed ? "CLOSED" : "OPEN";
}

function authorityDisplay(authority: ControlAuthority) {
  return authority === "OVATION" ? "DCS" : authority;
}

function originDisplay(origin: ControlOrigin) {
  return origin === "ovation" ? "DCS" : origin.toUpperCase();
}

function starterClosed(state: Pick<PlantState, "starterLowClosed" | "starterHighClosed">, motor: MotorKey) {
  return motor === "low" ? state.starterLowClosed : state.starterHighClosed;
}

function starterPatch(motor: MotorKey, closed: boolean) {
  return motor === "low" ? { starterLowClosed: closed } : { starterHighClosed: closed };
}

function lotoTargetOpen(state: PlantState) {
  return !gearBreakerClosed(state, state.lotoTarget);
}

function gearBreakerClosed(state: PlantState, id: GearBreakerId) {
  if (id === "mainA" || id === "tie" || id === "mainB") return state[id];
  if (id === "A1") return state.starterLowClosed;
  return state.gearBreakers[id].closed;
}

function busEnergized(state: PlantState, bus: "1" | "2") {
  return bus === "1"
    ? (state.sourceA && state.mainA) || (state.sourceB && state.mainB && state.tie)
    : (state.sourceB && state.mainB) || (state.sourceA && state.mainA && state.tie);
}

function lineupDescription(state: Pick<PlantState, "mainA" | "tie" | "mainB">) {
  if (state.mainA && !state.tie && state.mainB) return "NORMAL — SPLIT BUS";
  if (state.mainA && state.tie && !state.mainB) return "ALL LOADS ON BUS 1";
  if (!state.mainA && state.tie && state.mainB) return "ALL LOADS ON BUS 2";
  if (state.mainA && state.tie && state.mainB) return "MANUAL PARALLEL — OPEN ONE DEVICE";
  if (!state.mainA && !state.tie && !state.mainB) return "ALL THREE BREAKERS OPEN";
  return "MANUAL BREAKER LINEUP";
}

const LOTO_TARGET_LABELS = Object.fromEntries(
  GEAR_BREAKER_DEFS.map((definition) => [definition.id, `${definition.label} · ${definition.duty}`]),
) as Record<LotoTarget, string>;

export default function MotorFloorVRPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<PlantState>(INITIAL_STATE);
  const timersRef = useRef<number[]>([]);
  const motorSequenceRef = useRef(0);
  const actionRef = useRef<Record<string, () => void>>({});
  const audioRef = useRef<AudioEngine | null>(null);
  const soundEnabledRef = useRef(true);
  const visualRef = useRef<{
    indicators: Partial<Record<BreakerKey, THREE.MeshStandardMaterial>>;
    sourceIndicators: Partial<Record<SourceKey, THREE.MeshStandardMaterial>>;
    boardTexture?: THREE.CanvasTexture;
    boardCanvas?: HTMLCanvasElement;
    trainingTexture?: THREE.CanvasTexture;
    trainingCanvas?: HTMLCanvasElement;
    relayTexture?: THREE.CanvasTexture;
    relayCanvas?: HTMLCanvasElement;
    ovationTexture?: THREE.CanvasTexture;
    ovationCanvas?: HTMLCanvasElement;
    valveTexture?: THREE.CanvasTexture;
    valveCanvas?: HTMLCanvasElement;
    busA?: THREE.MeshStandardMaterial;
    busB?: THREE.MeshStandardMaterial;
    motorRun?: THREE.MeshStandardMaterial;
    mgRun?: THREE.MeshStandardMaterial;
    fieldOn?: THREE.MeshStandardMaterial;
    k45?: THREE.MeshStandardMaterial;
    eStop?: THREE.MeshStandardMaterial;
    selectorKnob?: THREE.Group;
    lotoLocks?: Partial<Record<LotoTarget, THREE.Group>>;
    starterIndicators?: Partial<Record<MotorKey, THREE.MeshStandardMaterial>>;
    gearIndicators?: Partial<Record<GearBreakerId, THREE.MeshStandardMaterial>>;
    gearCarriages?: Partial<Record<GearBreakerId, THREE.Group>>;
    fieldSequence?: Partial<Record<"m" | "mg" | "far" | "field" | "resistor" | "k45", THREE.MeshStandardMaterial>>;
    bearingIndicators?: Partial<Record<BearingKey, THREE.MeshStandardMaterial>>;
  }>({ indicators: {}, sourceIndicators: {} });

  const [plant, setPlant] = useState<PlantState>(INITIAL_STATE);
  const [selectedId, setSelectedId] = useState("overview");
  const [helpOpen, setHelpOpen] = useState(false);
  const [lotoOpen, setLotoOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [relayOpen, setRelayOpen] = useState(false);
  const [relayPage, setRelayPage] = useState<RelayPage>("home");
  const [relayAcknowledged, setRelayAcknowledged] = useState(false);
  const [ovationOpen, setOvationOpen] = useState(false);
  const [gearDialogOpen, setGearDialogOpen] = useState(false);
  const [selectedGearId, setSelectedGearId] = useState<GearBreakerId>("A1");
  const [gearTab, setGearTab] = useState<"controls" | "racking" | "sop">("controls");
  const [rackChecks, setRackChecks] = useState({ identity: false, coupled: false, floorLock: false, areaClear: false });
  const [lockRemovalAuthorized, setLockRemovalAuthorized] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const selected = useMemo(() => {
    if (INSPECTIONS[selectedId]) return INSPECTIONS[selectedId];
    if (selectedId in GEAR_BREAKER_BY_ID) return gearBreakerInspection(GEAR_BREAKER_BY_ID[selectedId as GearBreakerId]);
    return INSPECTIONS.overview;
  }, [selectedId]);

  const openGearStation = useCallback((id: GearBreakerId, tab: "controls" | "racking" | "sop" = "controls") => {
    setSelectedGearId(id);
    setSelectedId(id);
    setGearTab(tab);
    setRackChecks({ identity: false, coupled: false, floorLock: false, areaClear: false });
    setLockRemovalAuthorized(false);
    setGearDialogOpen(true);
  }, []);

  useEffect(() => {
    stateRef.current = plant;
  }, [plant]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const later = useCallback((delay: number, task: () => void) => {
    const timer = window.setTimeout(task, delay);
    timersRef.current.push(timer);
  }, []);

  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
      audioRef.current = { context, master };
    }
    if (audioRef.current.context.state === "suspended") void audioRef.current.context.resume();
    return audioRef.current;
  }, []);

  const playEquipmentSound = useCallback((kind: SoundKind) => {
    if (!soundEnabledRef.current) return;
    const engine = ensureAudio();
    if (!engine) return;
    const { context, master } = engine;
    const makeTone = (frequency: number, duration: number, type: OscillatorType, level: number, endFrequency = frequency) => {
      const toneNow = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, toneNow);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), toneNow + duration);
      gain.gain.setValueAtTime(0.0001, toneNow);
      gain.gain.exponentialRampToValueAtTime(level, toneNow + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneNow + duration);
      oscillator.connect(gain).connect(master);
      oscillator.start(toneNow);
      oscillator.stop(toneNow + duration + 0.02);
    };
    if (kind === "breaker") {
      makeTone(115, 0.13, "square", 0.46, 54);
      makeTone(62, 0.18, "sine", 0.5, 38);
    } else if (kind === "selector") {
      makeTone(720, 0.055, "square", 0.18, 420);
    } else if (kind === "valve") {
      makeTone(310, 0.34, "sawtooth", 0.11, 230);
      makeTone(72, 0.28, "sine", 0.08, 58);
    } else if (kind === "motorStart") {
      makeTone(42, 1.75, "sawtooth", 0.18, 118);
      makeTone(84, 1.65, "sine", 0.12, 236);
    } else if (kind === "motorStop") {
      makeTone(118, 0.8, "sawtooth", 0.12, 38);
    } else {
      makeTone(190, 0.16, "square", 0.22, 95);
      window.setTimeout(() => makeTone(190, 0.16, "square", 0.22, 95), 190);
    }
  }, [ensureAudio]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      soundEnabledRef.current = next;
      if (next) ensureAudio();
      return next;
    });
  }, [ensureAudio]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    const engine = audioRef.current;
    if (!engine) return;
    const shouldHum = soundEnabled && plant.motorStatus === "RUNNING";
    if (shouldHum && !engine.motorGain) {
      const gain = engine.context.createGain();
      gain.gain.value = 0.055;
      gain.connect(engine.master);
      const fundamental = engine.context.createOscillator();
      fundamental.type = "sine";
      fundamental.frequency.value = 60;
      const harmonic = engine.context.createOscillator();
      harmonic.type = "triangle";
      harmonic.frequency.value = 120;
      fundamental.connect(gain);
      harmonic.connect(gain);
      fundamental.start();
      harmonic.start();
      engine.motorGain = gain;
      engine.motorOscillators = [fundamental, harmonic];
    } else if (!shouldHum && engine.motorGain) {
      engine.motorOscillators?.forEach((oscillator) => oscillator.stop());
      engine.motorGain.disconnect();
      engine.motorGain = undefined;
      engine.motorOscillators = undefined;
    }
  }, [plant.motorStatus, plant.selectedMotor, soundEnabled]);

  useEffect(() => () => {
    const engine = audioRef.current;
    if (!engine) return;
    engine.motorOscillators?.forEach((oscillator) => oscillator.stop());
    void engine.context.close();
    audioRef.current = null;
  }, []);

  const reportBlocked = useCallback((message: string) => {
    setPlant((current) => ({ ...current, event: `BLOCKED — ${message}` }));
  }, []);

  const latchTrainingTrip = useCallback((cause: string) => {
    motorSequenceRef.current += 1;
    setRelayAcknowledged(false);
    playEquipmentSound("trip");
    setPlant((state) => ({
      ...state,
      ...starterPatch(state.selectedMotor, false),
      motorStatus: "TRIPPED",
      motorEvent: `MOTOR RELAY LATCHED TRIP — ${cause} · clear the input, then press Trip reset`,
      mainContactorClosed: false,
      mgRunning: false,
      farPicked: false,
      fieldOn: false,
      k45Seal: false,
      eStopLatched: true,
      tripCause: cause,
      valvePosition: 0,
    }));
  }, [playEquipmentSound]);

  const setBearingTemperature = useCallback((key: BearingKey, temperature: number) => {
    const next = Math.max(35, Math.min(100, Math.round(temperature)));
    const previous = stateRef.current.bearingTemps[key];
    const level = bearingLevel(next);
    if (level === "trip" && previous < 85) {
      motorSequenceRef.current += 1;
      setRelayAcknowledged(false);
      playEquipmentSound("trip");
    }
    setPlant((state) => ({
      ...state,
      bearingTemps: { ...state.bearingTemps, [key]: next },
      ...(level === "trip"
        ? {
            ...starterPatch(state.selectedMotor, false),
            motorStatus: "TRIPPED" as MotorStatus,
            motorEvent: `RELAY 38-${key.toUpperCase()} LATCHED TRIP — ${BEARING_LABELS[key]} ${next}°C · clear below 85°C, then reset`,
            mainContactorClosed: false,
            mgRunning: false,
            farPicked: false,
            fieldOn: false,
            k45Seal: false,
            eStopLatched: true,
            tripCause: `${BEARING_LABELS[key]} RTD ${next}°C`,
            valvePosition: 0,
          }
        : state.motorStatus === "TRIPPED"
          ? {}
          : {
              motorEvent: level === "alarm"
                ? `MOTOR-RELAY BEARING ALARM — ${BEARING_LABELS[key]} ${next}°C · trip at 85°C`
                : `${BEARING_LABELS[key]} RTD ${next}°C · normal`,
            }),
    }));
  }, [playEquipmentSound]);

  const adjustSelectedBearing = useCallback((amount: number) => {
    const current = stateRef.current;
    setBearingTemperature(current.selectedBearing, current.bearingTemps[current.selectedBearing] + amount);
  }, [setBearingTemperature]);

  const cycleBearing = useCallback(() => {
    setPlant((state) => {
      const currentIndex = BEARING_KEYS.indexOf(state.selectedBearing);
      const selectedBearing = BEARING_KEYS[(currentIndex + 1) % BEARING_KEYS.length];
      return {
        ...state,
        selectedBearing,
        motorEvent: `RTD test channel selected · ${BEARING_LABELS[selectedBearing]} ${state.bearingTemps[selectedBearing]}°C`,
      };
    });
  }, []);

  const setVibration = useCallback((channel: "motor" | "pump", value: number) => {
    const next = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
    const previous = channel === "motor" ? stateRef.current.motorVibration : stateRef.current.pumpVibration;
    const isTrip = next >= VIBRATION_TRIP;
    if (isTrip && previous < VIBRATION_TRIP) {
      motorSequenceRef.current += 1;
      setRelayAcknowledged(false);
      playEquipmentSound("trip");
    }
    const label = channel === "motor" ? "Motor vibration" : "Pump vibration";
    const code = channel === "motor" ? "VIB-M" : "VIB-P";
    setPlant((state) => ({
      ...state,
      ...(channel === "motor" ? { motorVibration: next } : { pumpVibration: next }),
      ...(isTrip
        ? {
            ...starterPatch(state.selectedMotor, false),
            motorStatus: "TRIPPED" as MotorStatus,
            motorEvent: `MOTOR RELAY ${code} LATCHED TRIP — ${label} ${next.toFixed(2)} in/s RMS · clear below 0.20, then reset`,
            mainContactorClosed: false,
            mgRunning: false,
            farPicked: false,
            fieldOn: false,
            k45Seal: false,
            eStopLatched: true,
            tripCause: `${label} ${next.toFixed(2)} in/s RMS`,
            valvePosition: 0,
          }
        : state.motorStatus === "TRIPPED"
          ? {}
          : { motorEvent: `${label} ${next.toFixed(2)} in/s RMS · trip at 0.20` }),
    }));
  }, [playEquipmentSound]);

  const normalizeSensors = useCallback(() => {
    setPlant((state) => ({
      ...state,
      bearingTemps: { ...NORMAL_BEARING_TEMPS },
      motorVibration: 0.12,
      pumpVibration: 0.15,
      motorEvent: state.motorStatus === "TRIPPED"
        ? "RTD and vibration inputs normalized · the motor-relay trip remains latched until Trip reset"
        : "RTD and vibration inputs normalized",
    }));
  }, []);

  const operateBreaker = useCallback((key: BreakerKey, close: boolean, location = "switchboard") => {
    const current = stateRef.current;
    if (current.busy) return reportBlocked("selector sequence active");
    const drawout = current.gearBreakers[key];
    if (close && drawout.position !== "CONNECTED") return reportBlocked(`${GEAR_BREAKER_BY_ID[key].label} is in ${drawout.position}`);
    if (close && (drawout.locked || drawout.tagged)) return reportBlocked(`${GEAR_BREAKER_BY_ID[key].label} is locked / tagged`);
    if (drawout.racking) return reportBlocked(`${GEAR_BREAKER_BY_ID[key].label} is being racked`);
    if (close && current.lotoActive && current.lotoStep >= 3 && current.lotoTarget === key) {
      return reportBlocked("LOTO prevents breaker closing");
    }
    if (close && key === "mainA" && !current.sourceA) return reportBlocked("Source 1 is not available");
    if (close && key === "mainB" && !current.sourceB) return reportBlocked("Source 2 is not available");
    if (close && key === "tie" && !busEnergized(current, "1") && !busEnergized(current, "2")) {
      return reportBlocked("neither bus is energized");
    }
    if (close && key === "tie" && busEnergized(current, "1") && busEnergized(current, "2") && !current.syncCheck) {
      return reportBlocked("25 sync-check permissive is not satisfied");
    }
    const breakerName: Record<BreakerKey, string> = { mainA: "52-M1", tie: "52-T", mainB: "52-M2" };
    const next = { ...current, [key]: close } as PlantState;
    const requiredBus = "1";
    const motorLosesPower = !close && (current.motorStatus === "RUNNING" || current.motorStatus === "STARTING") && !busEnergized(next, requiredBus);
    if (motorLosesPower) {
      motorSequenceRef.current += 1;
      setRelayAcknowledged(false);
    }
    playEquipmentSound("breaker");
    setPlant((state) => ({
      ...state,
      [key]: close,
      gearBreakers: {
        ...state.gearBreakers,
        [key]: { ...state.gearBreakers[key], closed: close },
      },
      busy: false,
      overlap: close && (
        (key === "tie" && state.mainA && state.mainB) ||
        (key === "mainA" && state.tie && state.mainB) ||
        (key === "mainB" && state.tie && state.mainA)
      ),
      sequence: lineupDescription(next),
      event: `${breakerName[key]} ${close ? "CLOSED" : "OPEN"} from ${location} control`,
      ...(motorLosesPower
        ? {
            ...starterPatch(state.selectedMotor, false),
            motorStatus: "TRIPPED" as MotorStatus,
            motorEvent: `MOTOR RELAY LATCHED TRIP — Bus ${requiredBus} de-energized`,
            mainContactorClosed: false,
            mgRunning: false,
            farPicked: false,
            fieldOn: false,
            k45Seal: false,
            eStopLatched: true,
            tripCause: `Bus ${requiredBus} de-energized`,
            valvePosition: 0,
          }
        : {}),
    }));
  }, [playEquipmentSound, reportBlocked]);

  const selectTransferPosition = useCallback((position: TransferPosition) => {
    const current = stateRef.current;
    if (current.busy) return reportBlocked("selector sequence already active");
    if (current.lotoActive && current.lotoStep >= 3) return reportBlocked("LOTO blocks automatic breaker operation");
    const requiredToClose: GearBreakerId[] = position === "BUS1" ? ["mainA", "tie"] : position === "BUS2" ? ["mainB", "tie"] : ["mainA", "mainB"];
    const unavailable = requiredToClose.find((id) => {
      const breaker = current.gearBreakers[id];
      return breaker.position !== "CONNECTED" || breaker.locked || breaker.tagged || breaker.racking;
    });
    if (unavailable) return reportBlocked(`${GEAR_BREAKER_BY_ID[unavailable].label} is not available for automatic close`);
    if ((position === "BUS1" || position === "NORMAL") && !current.sourceA) return reportBlocked("Source 1 is not available");
    if ((position === "BUS2" || position === "NORMAL") && !current.sourceB) return reportBlocked("Source 2 is not available");
    clearTimers();
    playEquipmentSound("selector");
    setPlant((state) => ({
      ...state,
      busy: true,
      transferPosition: position,
      event: position === "NORMAL" ? "Selector moved to NORMAL" : `Selector moved to ALL ON BUS ${position === "BUS1" ? "1" : "2"}`,
    }));

    if (position === "BUS1") {
      later(220, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, mainA: true, event: "52-M1 CLOSED · Source 1 established" }));
      });
      later(620, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, tie: true, overlap: state.mainB, event: "52-T CLOSED · buses paralleled through sync check" }));
      });
      later(800, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, mainB: false, overlap: false, busy: false, sequence: "ALL LOADS ON BUS 1", event: "52-M2 OPEN · all loads now on Bus 1" }));
      });
    } else if (position === "BUS2") {
      later(220, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, mainB: true, event: "52-M2 CLOSED · Source 2 established" }));
      });
      later(620, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, tie: true, overlap: state.mainA, event: "52-T CLOSED · buses paralleled through sync check" }));
      });
      later(800, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, mainA: false, overlap: false, busy: false, sequence: "ALL LOADS ON BUS 2", event: "52-M1 OPEN · all loads now on Bus 2" }));
      });
    } else {
      later(240, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, mainA: true, mainB: true, overlap: state.tie, event: "Both mains CLOSED · controlled parallel" }));
      });
      later(430, () => {
        playEquipmentSound("breaker");
        setPlant((state) => ({ ...state, tie: false, overlap: false, busy: false, sequence: "NORMAL — SPLIT BUS", event: "52-T OPEN · normal split-bus lineup restored" }));
      });
    }
  }, [clearTimers, later, playEquipmentSound, reportBlocked]);

  const failSource = useCallback(
    (source: "A" | "B") => {
      const current = stateRef.current;
      if (current.busy) return reportBlocked("sequence already active");
      clearTimers();
      const afterLoss = source === "A"
        ? { ...current, sourceA: false, mainA: false }
        : { ...current, sourceB: false, mainB: false };
      const requiredBus = "1";
      const tripMotor = (current.motorStatus === "RUNNING" || current.motorStatus === "STARTING") && !busEnergized(afterLoss, requiredBus);
      if (tripMotor) {
        motorSequenceRef.current += 1;
        setRelayAcknowledged(false);
      }
      playEquipmentSound(tripMotor ? "trip" : "breaker");
      const tripPatch: Partial<PlantState> = tripMotor
        ? {
            ...starterPatch(current.selectedMotor, false),
            motorStatus: "TRIPPED",
            motorEvent: "MOTOR RELAY LATCHED TRIP — motor feeder bus lost",
            mainContactorClosed: false,
            mgRunning: false,
            farPicked: false,
            fieldOn: false,
            k45Seal: false,
            eStopLatched: true,
            tripCause: "Motor feeder bus lost",
            valvePosition: 0,
          }
        : {};
      if (source === "A") {
        setPlant((s) => ({ ...s, ...tripPatch, sourceA: false, mainA: false, busy: true, overlap: false, sequence: "SOURCE 1 LOSS", event: "27-1 asserted · 52-M1 tripped" }));
        later(850, () =>
          setPlant((s) =>
            s.sourceB && s.mainB && (!s.lotoActive || s.lotoStep < 3) && s.gearBreakers.tie.position === "CONNECTED" && !s.gearBreakers.tie.locked && !s.gearBreakers.tie.tagged
              ? { ...s, tie: true, busy: false, transferPosition: "BUS2", sequence: "ALL LOADS ON BUS 2", event: "52-T CLOSED after Bus 1 dead-bus check" }
              : { ...s, busy: false, event: "Bus 1 remains de-energized — Source 2 unavailable" },
          ),
        );
      } else {
        setPlant((s) => ({ ...s, ...tripPatch, sourceB: false, mainB: false, busy: true, overlap: false, sequence: "SOURCE 2 LOSS", event: "27-2 asserted · 52-M2 tripped" }));
        later(850, () =>
          setPlant((s) =>
            s.sourceA && s.mainA && (!s.lotoActive || s.lotoStep < 3) && s.gearBreakers.tie.position === "CONNECTED" && !s.gearBreakers.tie.locked && !s.gearBreakers.tie.tagged
              ? { ...s, tie: true, busy: false, transferPosition: "BUS1", sequence: "ALL LOADS ON BUS 1", event: "52-T CLOSED after Bus 2 dead-bus check" }
              : { ...s, busy: false, event: "Bus 2 remains de-energized — Source 1 unavailable" },
          ),
        );
      }
    },
    [clearTimers, later, playEquipmentSound, reportBlocked],
  );

  const restoreSource = useCallback((source: "A" | "B") => {
    if (stateRef.current.busy) return reportBlocked("sequence already active");
    setPlant((s) => ({
      ...s,
      ...(source === "A" ? { sourceA: true } : { sourceB: true }),
      event: `Source ${source === "A" ? "1" : "2"} restored and qualifying · use selector or breaker CLOSE control`,
    }));
  }, [reportBlocked]);

  const cycleFault = useCallback(() => {
    setPlant((state) => {
      const currentIndex = FAULT_OPTIONS.findIndex(({ value }) => value === state.faultSelection);
      const faultSelection = FAULT_OPTIONS[(currentIndex + 1) % FAULT_OPTIONS.length].value;
      return {
        ...state,
        faultSelection,
        motorEvent: `Fault injector selected · ${FAULT_LABELS[faultSelection]}`,
      };
    });
  }, []);

  const clearFault = useCallback(() => {
    setPlant((state) => ({
      ...state,
      sourceA: state.activeFault === "bus-loss" ? true : state.sourceA,
      sourceB: state.activeFault === "bus-loss" ? true : state.sourceB,
      faultSelection: "none",
      activeFault: "none",
      event: state.activeFault === "bus-loss"
        ? "Injected bus undervoltage cleared · source restored · breaker positions unchanged"
        : "Injected condition cleared",
      motorEvent: state.motorStatus === "TRIPPED"
        ? "Injected condition cleared · the motor-relay target remains latched until Trip reset"
        : "Fault injector clear · no guided condition active",
    }));
  }, []);

  const injectFault = useCallback((requested?: FaultCode) => {
    const current = stateRef.current;
    const code = requested ?? current.faultSelection;
    if (code === "none") return clearFault();
    setPlant((state) => ({
      ...state,
      faultSelection: code,
      activeFault: code,
      event: `FAULT INJECTOR ACTIVE · ${FAULT_TARGETS[code]}`,
      motorEvent: `${FAULT_LABELS[code]} injected · condition armed`,
    }));
    if (code === "bus-loss") {
      failSource("A");
      return;
    }
    if (code === "ground-fault" || code === "overload") {
      latchTrainingTrip(`${FAULT_TARGETS[code]} · ${FAULT_LABELS[code]}`);
      return;
    }
    const tripWhileOperating = !["valve-closed-proof", "valve-fail-close"].includes(code)
      && (current.motorStatus === "RUNNING" || current.motorStatus === "STARTING");
    if (tripWhileOperating) latchTrainingTrip(`${FAULT_TARGETS[code]} · ${FAULT_LABELS[code]}`);
  }, [clearFault, failSource, latchTrainingTrip]);

  const resetNormal = useCallback(() => {
    const current = stateRef.current;
    if (current.lotoActive || GEAR_BREAKER_DEFS.some(({ id }) => current.gearBreakers[id].locked || current.gearBreakers[id].tagged)) {
      return reportBlocked("remove LOTO devices through the authorized release sequence before resetting the lineup");
    }
    clearTimers();
    motorSequenceRef.current += 1;
    playEquipmentSound("selector");
    setPlant({ ...INITIAL_STATE, event: "Training model reset to normal split-bus lineup" });
  }, [clearTimers, playEquipmentSound, reportBlocked]);

  const setControlAuthority = useCallback((authority: ControlAuthority) => {
    playEquipmentSound("selector");
    setPlant((state) => ({
      ...state,
      controlAuthority: authority,
      motorEvent: `Control authority transferred to ${authority === "OVATION" ? "DCS / REMOTE" : authority === "FIELD" ? "FIELD CABINET LOCAL" : "STARTER LOCAL"}`,
    }));
  }, [playEquipmentSound]);

  const originHasAuthority = useCallback((origin: ControlOrigin, current: PlantState) => {
    if (origin === "field") return current.controlAuthority === "FIELD";
    if (origin === "starter") return current.controlAuthority === "STARTER";
    return current.controlAuthority === "OVATION";
  }, []);

  const selectMotor = useCallback((_motor: MotorKey, origin: ControlOrigin = "ovation") => {
    const current = stateRef.current;
    if (!originHasAuthority(origin, current)) {
      return setPlant((state) => ({ ...state, motorEvent: `SELECT BLOCKED — ${authorityDisplay(state.controlAuthority)} has control authority` }));
    }
    if (current.motorStatus === "RUNNING" || current.motorStatus === "STARTING") {
      return setPlant((state) => ({ ...state, motorEvent: "BLOCKED — stop the running motor before changing speed selection" }));
    }
    if (current.eStopLatched || current.motorStatus === "TRIPPED") {
      return setPlant((state) => ({ ...state, motorEvent: "BLOCKED — reset the motor-relay trip latch before selecting a motor" }));
    }
    setPlant((state) => ({
      ...state,
      selectedMotor: "low",
      motorEvent: "Single-speed · 2,500 hp · Bus 1 selected",
    }));
  }, [originHasAuthority]);

  const operateStarter = useCallback((motor: MotorKey, close: boolean, location: string) => {
    const current = stateRef.current;
    const target: LotoTarget = motor === "low" ? "A1" : "B1";
    const label = motor === "low" ? "52-A1 · MOTOR FEEDER" : "52-B1 · AUXILIARY FEEDER";
    const drawout = current.gearBreakers[target];
    if (close && drawout.position !== "CONNECTED") return reportBlocked(`${label} is in ${drawout.position}`);
    if (close && (drawout.locked || drawout.tagged)) return reportBlocked(`${label} is locked / tagged`);
    if (drawout.racking) return reportBlocked(`${label} is being racked`);
    if (close && current.lotoActive && current.lotoStep >= 3 && current.lotoTarget === target) {
      return reportBlocked(`${label} is racked out and locked`);
    }
    if (close && (current.motorStatus === "TRIPPED" || current.eStopLatched)) {
      return reportBlocked("reset the motor-relay trip target before closing the starter breaker");
    }
    const requiredBus = motor === "low" ? "1" : "2";
    if (close && !busEnergized(current, requiredBus)) return reportBlocked(`Bus ${requiredBus} is not energized`);
    if (!close && current.selectedMotor === motor && (current.motorStatus === "RUNNING" || current.motorStatus === "STARTING")) {
      latchTrainingTrip(`${label} opened from ${location}`);
      return;
    }
    playEquipmentSound("breaker");
    setPlant((state) => ({
      ...state,
      ...starterPatch(motor, close),
      gearBreakers: {
        ...state.gearBreakers,
        [target]: { ...state.gearBreakers[target], closed: close },
      },
      event: `${label} ${close ? "CLOSED" : "OPEN"} from ${location}`,
      motorEvent: `${label} ${close ? "closed and available" : "open · motor start circuit isolated"}`,
    }));
  }, [latchTrainingTrip, playEquipmentSound, reportBlocked]);

  const operateGearBreaker = useCallback((id: GearBreakerId, close: boolean, location = "breaker workstation") => {
    const current = stateRef.current;
    const definition = GEAR_BREAKER_BY_ID[id];
    const drawout = current.gearBreakers[id];
    if (drawout.racking) return reportBlocked(`${definition.label} is being racked`);
    if (close && drawout.position !== "CONNECTED") return reportBlocked(`${definition.label} cannot close in ${drawout.position}`);
    if (close && (drawout.locked || drawout.tagged)) return reportBlocked(`${definition.label} is locked / tagged`);
    if (id === "mainA" || id === "tie" || id === "mainB") {
      operateBreaker(id, close, location);
      return;
    }
    if (id === "A1") {
      operateStarter("low", close, location);
      return;
    }
    if (close && !busEnergized(current, definition.bus as "1" | "2")) {
      return reportBlocked(`Bus ${definition.bus} is not energized`);
    }
    playEquipmentSound("breaker");
    setPlant((state) => ({
      ...state,
      gearBreakers: {
        ...state.gearBreakers,
        [id]: { ...state.gearBreakers[id], closed: close },
      },
      event: `${definition.label} ${close ? "CLOSED" : "OPEN"} from ${location}`,
    }));
  }, [operateBreaker, operateStarter, playEquipmentSound, reportBlocked]);

  const rackGearBreaker = useCallback((direction: "in" | "out") => {
    const id = selectedGearId;
    const current = stateRef.current;
    const definition = GEAR_BREAKER_BY_ID[id];
    const drawout = current.gearBreakers[id];
    if (drawout.racking) return reportBlocked(`${definition.label} racking command already active`);
    if (gearBreakerClosed(current, id)) return reportBlocked(`${definition.label} must be OPEN before racking`);
    if (!rackChecks.identity || !rackChecks.coupled || !rackChecks.floorLock || !rackChecks.areaClear) {
      return reportBlocked("complete all RRS-1 setup and clear-area checks");
    }
    if (direction === "in" && (drawout.locked || drawout.tagged)) return reportBlocked("remove the isolation lock and danger tag under the release procedure before racking in");
    const sequence: RackPosition[] = ["DISCONNECTED", "TEST", "CONNECTED"];
    const currentIndex = sequence.indexOf(drawout.position);
    const nextIndex = currentIndex + (direction === "in" ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= sequence.length) {
      return reportBlocked(`RRS-1 over-racking protection stopped at ${drawout.position}`);
    }
    const nextPosition = sequence[nextIndex];
    playEquipmentSound("motorStart");
    setPlant((state) => ({
      ...state,
      gearBreakers: {
        ...state.gearBreakers,
        [id]: { ...state.gearBreakers[id], racking: true },
      },
      event: `RRS-1 remote rack ${direction.toUpperCase()} active · ${definition.label} ${drawout.position} → ${nextPosition}`,
    }));
    later(950, () => {
      playEquipmentSound("breaker");
      setPlant((state) => ({
        ...state,
        gearBreakers: {
          ...state.gearBreakers,
          [id]: { ...state.gearBreakers[id], position: nextPosition, racking: false },
        },
        event: `${definition.label} verified in ${nextPosition} · RRS-1 drive stopped`,
      }));
    });
  }, [later, playEquipmentSound, rackChecks, reportBlocked, selectedGearId]);

  const applyGearLockout = useCallback(() => {
    const id = selectedGearId;
    const current = stateRef.current;
    const definition = GEAR_BREAKER_BY_ID[id];
    if (gearBreakerClosed(current, id)) return reportBlocked(`${definition.label} must be OPEN`);
    if (current.gearBreakers[id].position !== "DISCONNECTED") return reportBlocked(`${definition.label} must be verified DISCONNECTED`);
    if (current.gearBreakers[id].racking) return reportBlocked("racking must be stopped before applying a lock");
    playEquipmentSound("selector");
    setPlant((state) => ({
      ...state,
      lotoTarget: id,
      gearBreakers: {
        ...state.gearBreakers,
        [id]: { ...state.gearBreakers[id], locked: true, tagged: true },
      },
      event: `${definition.label} · yellow isolation lock, hasp, and danger tag applied`,
    }));
  }, [playEquipmentSound, reportBlocked, selectedGearId]);

  const removeGearLockout = useCallback(() => {
    const id = selectedGearId;
    const current = stateRef.current;
    const definition = GEAR_BREAKER_BY_ID[id];
    if (current.lotoActive) return reportBlocked("complete the group LOTO release sequence first");
    if (!lockRemovalAuthorized) return reportBlocked("confirm authorized removal and restoration clearance");
    playEquipmentSound("selector");
    setPlant((state) => ({
      ...state,
      gearBreakers: {
        ...state.gearBreakers,
        [id]: { ...state.gearBreakers[id], locked: false, tagged: false },
      },
      event: `${definition.label} isolation lock / tag removed after simulated release clearance`,
    }));
    setLockRemovalAuthorized(false);
  }, [lockRemovalAuthorized, playEquipmentSound, reportBlocked, selectedGearId]);

  const startLotoForGear = useCallback(() => {
    const id = selectedGearId;
    setPlant((state) => state.lotoActive && state.lotoTarget !== id
      ? { ...state, event: `LOTO already active on ${LOTO_TARGET_LABELS[state.lotoTarget]}` }
      : { ...state, lotoTarget: id });
    setGearDialogOpen(false);
    setLotoOpen(true);
  }, [selectedGearId]);

  const startMotor = useCallback((origin: ControlOrigin = "ovation", requestedMotor?: MotorKey) => {
    const current = stateRef.current;
    const motor = requestedMotor ?? current.selectedMotor;
    if (!originHasAuthority(origin, current)) {
      return setPlant((state) => ({ ...state, motorEvent: `START BLOCKED — ${authorityDisplay(state.controlAuthority)} has control authority; ${originDisplay(origin)} command rejected` }));
    }
    if (current.lotoActive) {
      return setPlant((state) => ({ ...state, motorEvent: "BLOCKED — LOTO is active; the start circuit remains inhibited" }));
    }
    if (current.eStopLatched || current.motorStatus === "TRIPPED") {
      return setPlant((state) => ({ ...state, motorEvent: "BLOCKED — reset the motor relay / E-stop latch before starting" }));
    }
    if (current.motorStatus !== "STOPPED") {
      return setPlant((state) => ({ ...state, motorEvent: "BLOCKED — motor is already starting or running" }));
    }
    if (current.activeFault === "valve-closed-proof") {
      return setPlant((state) => ({ ...state, motorEvent: "START BLOCKED — VLV-CLS closed-limit proof is missing" }));
    }
    if (current.activeFault === "bus-loss") {
      return setPlant((state) => ({ ...state, motorEvent: "START BLOCKED — injected 27 bus-undervoltage condition remains active" }));
    }
    const requiredBus = motor === "low" ? "1" : "2";
    if (!busEnergized(current, requiredBus)) {
      return setPlant((state) => ({ ...state, motorEvent: `BLOCKED — Bus ${requiredBus} is not energized` }));
    }
    if (!starterClosed(current, motor)) {
      return setPlant((state) => ({ ...state, motorEvent: "START BLOCKED — 52-A1 motor-feeder breaker is OPEN" }));
    }
    const sequence = motorSequenceRef.current + 1;
    motorSequenceRef.current = sequence;
    playEquipmentSound("motorStart");
    setPlant((state) => ({
      ...state,
      selectedMotor: motor,
      motorStatus: "STARTING",
      motorEvent: `${originDisplay(origin)} START accepted · M contactor closed · VLV-CLS picked K45 45 s seal-in`,
      mainContactorClosed: true,
      mgRunning: false,
      farPicked: false,
      fieldOn: false,
      k45Seal: true,
      valvePosition: 0,
    }));
    later(520, () => {
      if (motorSequenceRef.current !== sequence) return;
      const fault = stateRef.current.activeFault;
      if (fault === "dc-loss" || fault === "52a-fail") {
        latchTrainingTrip(`${FAULT_TARGETS[fault]} · ${FAULT_LABELS[fault]}`);
        return;
      }
      setPlant((state) => ({ ...state, mgRunning: true, motorEvent: "52a proved · M-G set at speed · 125 VDC excitation available" }));
    });
    later(1050, () => {
      if (motorSequenceRef.current !== sequence) return;
      const fault = stateRef.current.activeFault;
      if (fault === "sealin-fail" || fault === "valve-fail-open") {
        latchTrainingTrip(`${FAULT_TARGETS[fault]} · ${FAULT_LABELS[fault]}`);
        return;
      }
      setPlant((state) => ({ ...state, valvePosition: 30, motorEvent: "K45 carried the close-limit circuit · 36 in valve reached 30% run permissive" }));
    });
    later(1500, () => {
      if (motorSequenceRef.current !== sequence) return;
      const fault = stateRef.current.activeFault;
      if (fault === "far-fail") {
        latchTrainingTrip(`${FAULT_TARGETS[fault]} · ${FAULT_LABELS[fault]}`);
        return;
      }
      setPlant((state) => ({ ...state, farPicked: true, motorEvent: `${motor === "low" ? "56-L" : "56-H"} field-application relay picked up near synchronous speed` }));
    });
    later(2050, () => {
      if (motorSequenceRef.current !== sequence) return;
      const fault = stateRef.current.activeFault;
      if (["far-fail", "41-coil-open", "pickup-bypass-open", "mechanical-interlock", "loss-field"].includes(fault)) {
        latchTrainingTrip(`${FAULT_TARGETS[fault]} · ${FAULT_LABELS[fault]}`);
        return;
      }
      setPlant((state) => ({
        ...state,
        motorStatus: "RUNNING",
        fieldOn: true,
        k45Seal: false,
        motorEvent: "41 closed · discharge resistor bypassed · 2,500 hp synchronous motor synchronized and RUNNING",
      }));
    });
  }, [latchTrainingTrip, later, originHasAuthority, playEquipmentSound]);

  const stopMotor = useCallback((origin: ControlOrigin = "ovation") => {
    const current = stateRef.current;
    if (current.motorStatus === "STOPPED") {
      return setPlant((state) => ({ ...state, motorEvent: "Motor already stopped" }));
    }
    if (current.activeFault === "valve-fail-close") {
      playEquipmentSound("valve");
      return setPlant((state) => ({
        ...state,
        motorEvent: "NORMAL STOP INCOMPLETE — 36 in valve failed to reach VLV-CLS · motor remains energized · E-STOP available",
        valvePosition: Math.max(30, state.valvePosition),
      }));
    }
    motorSequenceRef.current += 1;
    playEquipmentSound("motorStop");
    setPlant((state) => ({
      ...state,
      motorStatus: "STOPPED",
      motorEvent: `${originDisplay(origin)} normal stop complete · 41 open · field discharged through resistor · valve at VLV-CLS`,
      mainContactorClosed: false,
      mgRunning: false,
      farPicked: false,
      fieldOn: false,
      k45Seal: false,
      valvePosition: 0,
    }));
  }, [playEquipmentSound]);

  const emergencyStop = useCallback(() => {
    motorSequenceRef.current += 1;
    setRelayAcknowledged(false);
    playEquipmentSound("trip");
    setPlant((state) => ({
      ...state,
      ...starterPatch(state.selectedMotor, false),
      motorStatus: "TRIPPED",
      motorEvent: "E-STOP — motor-relay latch trip · reset required",
      mainContactorClosed: false,
      mgRunning: false,
      farPicked: false,
      fieldOn: false,
      k45Seal: false,
      eStopLatched: true,
      tripCause: "E-STOP",
      valvePosition: 0,
    }));
  }, [playEquipmentSound]);

  const resetMotor = useCallback(() => {
    const current = stateRef.current;
    if (current.motorStatus === "RUNNING" || current.motorStatus === "STARTING") {
      return setPlant((state) => ({ ...state, motorEvent: "BLOCKED — stop the motor before resetting protection" }));
    }
    const activeInput = activeProtectionInput(current);
    if (current.motorStatus === "TRIPPED" && activeInput) {
      return setPlant((state) => ({ ...state, motorEvent: `RESET BLOCKED — ${activeInput}` }));
    }
    motorSequenceRef.current += 1;
    setPlant((state) => ({
      ...state,
      motorStatus: "STOPPED",
      motorEvent: "Motor-relay targets and E-stop latch reset · reclose 52-A1 if it tripped",
      mainContactorClosed: false,
      mgRunning: false,
      farPicked: false,
      fieldOn: false,
      k45Seal: false,
      eStopLatched: false,
      tripCause: null,
      valvePosition: 0,
    }));
    setRelayAcknowledged(false);
  }, []);

  const adjustValve = useCallback((amount: number) => {
    playEquipmentSound("valve");
    setPlant((state) => {
      const minimum = state.motorStatus === "RUNNING" ? 30 : 0;
      const next = Math.min(100, Math.max(minimum, state.valvePosition + amount));
      return {
        ...state,
        valvePosition: next,
        motorEvent: next === minimum && amount < 0 && minimum === 30
          ? "Valve close stopped at 30% minimum while motor is running"
          : `Venturi valve command ${next}%`,
      };
    });
  }, [playEquipmentSound]);

  const chooseLotoTarget = useCallback((target: LotoTarget) => {
    setPlant((state) => state.lotoActive && state.lotoStep >= 3
      ? { ...state, event: "LOTO target locked after isolation began · reset the training protocol to change it" }
      : { ...state, lotoTarget: target, event: `LOTO target selected · ${target.toUpperCase()}` });
  }, []);

  const beginLoto = useCallback(() => {
    setPlant((state) => ({
      ...state,
      lotoActive: true,
      lotoStep: 1,
      lotoNotified: false,
      lotoIsolationLocked: false,
      lotoTagApplied: false,
      lotoMasterApplied: false,
      lotoPersonalLocks: 0,
      lotoTryAttempted: false,
      lotoZeroVerified: false,
      lotoStoredEnergySafe: false,
      lotoAreaClear: false,
      lotoWorkersAccounted: false,
      event: `LOTO preparation started for ${state.lotoTarget.toUpperCase()}`,
    }));
  }, []);

  const isolateLotoTarget = useCallback(() => {
    const current = stateRef.current;
    if (!current.lotoActive || current.lotoStep !== 3) return;
    operateGearBreaker(current.lotoTarget, false, "LOTO isolation");
    setPlant((state) => ({
      ...state,
      gearBreakers: {
        ...state.gearBreakers,
        [state.lotoTarget]: {
          ...state.gearBreakers[state.lotoTarget],
          closed: false,
          position: "DISCONNECTED",
        },
      },
      mainContactorClosed: false,
      mgRunning: false,
      farPicked: false,
      fieldOn: false,
      k45Seal: false,
      valvePosition: 0,
      event: `${LOTO_TARGET_LABELS[state.lotoTarget]} OPEN · simulated rack-out position ready for lock`,
    }));
  }, [operateGearBreaker]);

  const performLotoTryStart = useCallback(() => {
    const current = stateRef.current;
    if (!current.lotoActive || current.lotoStep !== 6) return;
    playEquipmentSound("selector");
    setPlant((state) => ({
      ...state,
      lotoTryAttempted: true,
      event: "LOTO TRY TEST — DCS and local START commands blocked; starter did not close",
      motorEvent: "TRY START VERIFIED BLOCKED by open, racked and locked energy-isolating device",
    }));
  }, [playEquipmentSound]);

  const advanceLoto = useCallback(() => {
    const current = stateRef.current;
    if (!current.lotoActive || current.lotoStep >= LOTO_STEPS.length - 1) return;
    const block = (message: string) => setPlant((state) => ({ ...state, event: `LOTO HOLD — ${message}` }));
    if (current.lotoStep === 1 && !current.lotoNotified) return block("confirm affected employees were notified and hazards identified");
    if (current.lotoStep === 2 && (current.motorStatus !== "STOPPED" || current.mainContactorClosed || current.mgRunning || current.fieldOn || current.valvePosition !== 0)) {
      return block("motor must be stopped, valve at 0%, M contactor open, M-G stopped, and field discharged");
    }
    if (current.lotoStep === 3 && (!lotoTargetOpen(current) || current.gearBreakers[current.lotoTarget].position !== "DISCONNECTED" || current.mgRunning || current.fieldOn)) {
      return block("OPEN / rack out the selected breaker and verify the M-G / field circuit is de-energized");
    }
    if (current.lotoStep === 4 && (!current.lotoIsolationLocked || !current.lotoTagApplied)) {
      return block("apply the yellow isolation lock, hasp, controlled-key lockbox, and completed danger tag");
    }
    if (current.lotoStep === 5 && (!current.lotoMasterApplied || current.lotoPersonalLocks < 1)) {
      return block("apply the master control lock and at least one authorized employee personal lock/tag");
    }
    if (current.lotoStep === 6 && (!current.lotoTryAttempted || !current.lotoZeroVerified || !current.lotoStoredEnergySafe)) {
      return block("complete try-start, approved absence-of-voltage verification, and stored-energy verification");
    }
    const nextStep = current.lotoStep + 1;
    setPlant((state) => ({
      ...state,
      lotoStep: nextStep,
      event: `LOTO step ${nextStep} of ${LOTO_STEPS.length - 1} · ${state.lotoTarget.toUpperCase()}`,
    }));
  }, []);

  const completeLoto = useCallback(() => {
    const current = stateRef.current;
    if (!current.lotoActive) return;
    if (current.lotoStep < LOTO_STEPS.length - 1) {
      return setPlant((state) => ({ ...state, event: "BLOCKED — complete the simulated release-and-restore step first" }));
    }
    if (!current.lotoAreaClear || !current.lotoWorkersAccounted) {
      return setPlant((state) => ({ ...state, event: "LOTO HOLD — inspect the area and account for every authorized employee" }));
    }
    if (current.lotoPersonalLocks !== 0 || current.lotoMasterApplied || current.lotoIsolationLocked) {
      return setPlant((state) => ({ ...state, event: "LOTO HOLD — each employee lock, master lock, and isolation lock must be removed under the approved procedure" }));
    }
    setPlant((state) => ({
      ...state,
      lotoActive: false,
      lotoStep: 0,
      event: "LOTO training cycle released · motor remains stopped",
      motorEvent: "LOTO released · perform normal pre-start checks before starting",
    }));
  }, []);

  useEffect(() => {
    actionRef.current = {
      ...actionRef.current,
      mainAOpen: () => operateBreaker("mainA", false, "local breaker"),
      mainAClose: () => operateBreaker("mainA", true, "local breaker"),
      tieOpen: () => operateBreaker("tie", false, "local breaker"),
      tieClose: () => operateBreaker("tie", true, "local breaker"),
      mainBOpen: () => operateBreaker("mainB", false, "local breaker"),
      mainBClose: () => operateBreaker("mainB", true, "local breaker"),
      mainAOpenRemote: () => operateBreaker("mainA", false, "switchboard"),
      mainACloseRemote: () => operateBreaker("mainA", true, "switchboard"),
      tieOpenRemote: () => operateBreaker("tie", false, "switchboard"),
      tieCloseRemote: () => operateBreaker("tie", true, "switchboard"),
      mainBOpenRemote: () => operateBreaker("mainB", false, "switchboard"),
      mainBCloseRemote: () => operateBreaker("mainB", true, "switchboard"),
      selectBus1: () => selectTransferPosition("BUS1"),
      selectNormal: () => selectTransferPosition("NORMAL"),
      selectBus2: () => selectTransferPosition("BUS2"),
      cycleSelector: () => selectTransferPosition(stateRef.current.transferPosition === "BUS1" ? "NORMAL" : stateRef.current.transferPosition === "NORMAL" ? "BUS2" : "BUS1"),
      failA: () => failSource("A"),
      failB: () => failSource("B"),
      restoreA: () => restoreSource("A"),
      restoreB: () => restoreSource("B"),
      selectLow: () => selectMotor("low", "ovation"),
      fieldSelectLow: () => selectMotor("low", "field"),
      motorStart: () => startMotor("ovation"),
      motorStop: () => stopMotor("ovation"),
      fieldStart: () => startMotor("field"),
      fieldStop: () => stopMotor("field"),
      starterLowClose: () => operateStarter("low", true, "52-A1 local breaker control"),
      starterLowOpen: () => operateStarter("low", false, "52-A1 local breaker control"),
      starterLowStart: () => startMotor("starter", "low"),
      starterLowStop: () => stopMotor("starter"),
      authorityOvation: () => setControlAuthority("OVATION"),
      authorityField: () => setControlAuthority("FIELD"),
      authorityStarter: () => setControlAuthority("STARTER"),
      openRelay: () => setRelayOpen(true),
      openOvation: () => setOvationOpen(true),
      motorReset: resetMotor,
      eStop: emergencyStop,
      valveOpen: () => adjustValve(10),
      valveClose: () => adjustValve(-10),
      faultNext: cycleFault,
      faultInject: () => injectFault(),
      faultClear: clearFault,
      bearingNext: cycleBearing,
      bearingTempUp: () => adjustSelectedBearing(5),
      bearingTempDown: () => adjustSelectedBearing(-5),
      motorVibUp: () => setVibration("motor", stateRef.current.motorVibration + 0.05),
      pumpVibUp: () => setVibration("pump", stateRef.current.pumpVibration + 0.05),
      sensorNormalize: normalizeSensors,
      openTraining: () => setTrainingOpen(true),
      openLoto: () => setLotoOpen(true),
      reset: resetNormal,
    };
    GEAR_BREAKER_DEFS.forEach(({ id }) => {
      actionRef.current[`gear-${id}`] = () => openGearStation(id);
      actionRef.current[`gear-open-${id}`] = () => operateGearBreaker(id, false, "local compartment control");
      actionRef.current[`gear-close-${id}`] = () => operateGearBreaker(id, true, "local compartment control");
    });
    actionRef.current.openRackCart = () => openGearStation(selectedGearId, "racking");
  }, [adjustSelectedBearing, adjustValve, clearFault, cycleBearing, cycleFault, emergencyStop, failSource, injectFault, normalizeSensors, openGearStation, operateBreaker, operateGearBreaker, operateStarter, resetMotor, resetNormal, restoreSource, selectMotor, selectedGearId, selectTransferPosition, setControlAuthority, setVibration, startMotor, stopMotor]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07131c);
    scene.fog = new THREE.Fog(0x07131c, 28, 58);

    const camera = new THREE.PerspectiveCamera(68, mount.clientWidth / mount.clientHeight, 0.05, 120);
    camera.position.set(3.5, 1.68, 11.0);
    camera.rotation.order = "YXZ";
    camera.rotation.x = -0.08;

    const rig = new THREE.Group();
    rig.add(camera);
    scene.add(rig);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      const fallbackTimer = window.setTimeout(() => setWebglUnavailable(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    mount.appendChild(renderer.domElement);

    const vrButton = VRButton.createButton(renderer, { optionalFeatures: ["local-floor", "bounded-floor"] });
    vrButton.id = "enter-vr-button";
    vrButton.setAttribute("aria-label", "Enter virtual reality motor floor");
    mount.appendChild(vrButton);

    scene.add(new THREE.HemisphereLight(0xcceeff, 0x172029, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(8, 14, 8);
    scene.add(keyLight);
    const gearLight = new THREE.PointLight(0x64c8ff, 28, 22, 2);
    gearLight.position.set(-7, 5, -5);
    scene.add(gearLight);
    const motorLight = new THREE.PointLight(0xffa14f, 22, 18, 2);
    motorLight.position.set(2, 5, 4);
    scene.add(motorLight);

    const interactive: THREE.Object3D[] = [];
    const hoverMaterials = new Map<THREE.Object3D, THREE.MeshStandardMaterial>();
    const breakerDoorPivots: THREE.Group[] = [];
    visualRef.current.lotoLocks = {};
    visualRef.current.starterIndicators = {};
    visualRef.current.fieldSequence = {};

    function material(color: number, metalness = 0.25, roughness = 0.65) {
      return new THREE.MeshStandardMaterial({ color, metalness, roughness });
    }

    function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, mat?: THREE.MeshStandardMaterial) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat ?? material(color));
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    }

    function labelTexture(lines: string[], options?: { bg?: string; fg?: string; accent?: string; width?: number; height?: number; align?: CanvasTextAlign }) {
      const canvas = document.createElement("canvas");
      canvas.width = options?.width ?? 1024;
      canvas.height = options?.height ?? 384;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = options?.bg ?? "#10212b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = options?.accent ?? "#29c7ff";
      ctx.fillRect(0, 0, canvas.width, 22);
      ctx.textAlign = options?.align ?? "center";
      ctx.textBaseline = "middle";
      const x = ctx.textAlign === "left" ? 44 : canvas.width / 2;
      lines.forEach((line, index) => {
        ctx.fillStyle = index === 0 ? options?.fg ?? "#f2fbff" : "#a7c1cf";
        ctx.font = index === 0 ? "800 74px Arial" : "700 48px Arial";
        const y = lines.length === 1 ? canvas.height / 2 + 10 : 105 + index * 93;
        ctx.fillText(line, x, y, canvas.width - 80);
      });
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return texture;
    }

    function labelPlane(lines: string[], w: number, h: number, x: number, y: number, z: number, options?: Parameters<typeof labelTexture>[1]) {
      const texture = labelTexture(lines, options);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, transparent: false, side: THREE.DoubleSide }),
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    }

    function addInteraction(mesh: THREE.Object3D, id: string, actionKey?: string) {
      mesh.userData.inspectId = id;
      if (actionKey) mesh.userData.actionKey = actionKey;
      interactive.push(mesh);
    }

    function padlockModel(color = 0xffd21f, scale = 1) {
      const lock = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.3 * scale, 0.1 * scale), material(color, 0.42, 0.34));
      lock.add(body);
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.1 * scale, 0.026 * scale, 8, 18, Math.PI), material(0xc7d0d4, 0.88, 0.2));
      shackle.position.y = 0.15 * scale;
      lock.add(shackle);
      const keyway = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * scale, 0.025 * scale, 0.012 * scale, 12), material(0x1a1f22, 0.3, 0.5));
      keyway.rotation.x = Math.PI / 2;
      keyway.position.set(0, -0.04 * scale, 0.058 * scale);
      lock.add(keyway);
      return lock;
    }

    // Room shell and floor markings.
    box(40, 0.18, 29, 0x1b2931, 0, -0.1, 0, material(0x1b2931, 0.05, 0.9));
    const grid = new THREE.GridHelper(40, 40, 0x356274, 0x263c46);
    grid.position.y = 0.005;
    scene.add(grid);
    box(40, 8, 0.22, 0x17252d, 0, 4, -14.5, material(0x17252d, 0.1, 0.9));
    box(0.22, 8, 29, 0x13232c, -20, 4, 0, material(0x13232c, 0.1, 0.9));
    box(0.22, 8, 29, 0x13232c, 20, 4, 0, material(0x13232c, 0.1, 0.9));

    for (let x = -16; x <= 16; x += 8) {
      const light = box(5.2, 0.12, 0.55, 0xeaf8ff, x, 6.2, -1.5, material(0xeaf8ff, 0, 0.25));
      const glow = new THREE.PointLight(0xcbeeff, 7, 10, 2);
      glow.position.copy(light.position).add(new THREE.Vector3(0, -0.3, 0));
      scene.add(glow);
    }

    // Complete Eaton-style double-ended lineup: four two-high feeder sections on
    // each bus with Main 1, Tie and Main 2 in the center.
    const busAMat = material(0x1ba7e1, 0.55, 0.38);
    const busBMat = material(0x1ba7e1, 0.55, 0.38);
    visualRef.current.busA = busAMat;
    visualRef.current.busB = busBMat;
    visualRef.current.gearIndicators = {};
    visualRef.current.gearCarriages = {};
    box(4.65, 0.16, 0.2, 0x1ba7e1, -3.15, 3.78, -9.76, busAMat);
    box(4.65, 0.16, 0.2, 0x1ba7e1, 3.15, 3.78, -9.76, busBMat);
    labelPlane(["BUS 1", "8 VCP-W FEEDERS · 4 UPPER / 4 LOWER"], 4.05, 0.5, -3.65, 4.08, -10.0, { bg: "#071923", accent: "#29c7ff" });
    labelPlane(["MAIN 1 · TIE · MAIN 2", "DOUBLE-ENDED BUS"], 2.85, 0.5, 0, 4.08, -10.0, { bg: "#171507", accent: "#ffb82e" });
    labelPlane(["BUS 2", "8 VCP-W FEEDERS · 4 UPPER / 4 LOWER"], 4.05, 0.5, 3.65, 4.08, -10.0, { bg: "#071923", accent: "#29c7ff" });
    labelPlane(["EATON VCP-W · 4.8 kV DOUBLE-ENDED LINEUP", "19 OPERABLE DRAWOUT BREAKERS · MAIN–TIE–MAIN"], 10.4, 0.78, 0, 5.0, -14.33, { bg: "#091923", accent: "#29c7ff" });

    function createVcpSection(x: number, ids: GearBreakerId[]) {
      const section = new THREE.Group();
      section.position.set(x, 0, -10.3);
      scene.add(section);
      const bodyMat = material(0x778084, 0.68, 0.33);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.55, 1.12), bodyMat);
      body.position.y = 1.78;
      section.add(body);
      const topCap = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.09, 1.15), material(0x24363f, 0.7, 0.32));
      topCap.position.y = 3.57;
      section.add(topCap);

      const sectionTag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.86, 0.24),
        new THREE.MeshBasicMaterial({ map: labelTexture([ids.length === 1 ? GEAR_BREAKER_BY_ID[ids[0]].label : `${GEAR_BREAKER_BY_ID[ids[0]].label} / ${GEAR_BREAKER_BY_ID[ids[1]].label}`], { bg: "#e7eaeb", fg: "#112832", accent: ids.includes("tie") ? "#ffb82e" : "#1687bd", width: 1100, height: 260 }) }),
      );
      sectionTag.position.set(0, 3.39, 0.59);
      section.add(sectionTag);

      ids.forEach((id, index) => {
        const definition = GEAR_BREAKER_BY_ID[id];
        const isFull = ids.length === 1;
        const compartmentY = isFull ? 1.7 : index === 0 ? 2.45 : 0.92;
        const compartmentHeight = isFull ? 2.9 : 1.34;
        const recess = new THREE.Mesh(new THREE.BoxGeometry(0.86, compartmentHeight - 0.1, 0.1), material(0x081015, 0.25, 0.78));
        recess.position.set(0, compartmentY, 0.59);
        section.add(recess);

        const carriage = new THREE.Group();
        carriage.position.set(0, compartmentY - (isFull ? 0.2 : 0.11), 0.68);
        carriage.userData.targetZ = 0.68;
        section.add(carriage);
        visualRef.current.gearCarriages![id] = carriage;
        const breakerMat = material(0x182229, 0.74, 0.3);
        const breaker = new THREE.Mesh(new THREE.BoxGeometry(0.68, isFull ? 0.86 : 0.48, 0.23), breakerMat);
        carriage.add(breaker);
        addInteraction(breaker, id, `gear-${id}`);
        hoverMaterials.set(breaker, breakerMat);
        [-0.2, 0, 0.2].forEach((poleX) => {
          const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, isFull ? 0.42 : 0.25, 12), material(0x8f3c2a, 0.45, 0.48));
          bottle.position.set(poleX, isFull ? 0.2 : 0.11, 0.13);
          carriage.add(bottle);
        });
        const breakerPlate = new THREE.Mesh(
          new THREE.PlaneGeometry(0.5, 0.16),
          new THREE.MeshBasicMaterial({ map: labelTexture(["VCP-W", definition.label], { bg: "#11171b", accent: "#29c7ff", width: 760, height: 310 }) }),
        );
        breakerPlate.position.set(0, 0, 0.125);
        carriage.add(breakerPlate);
        addInteraction(breakerPlate, id, `gear-${id}`);

        const doorPivot = new THREE.Group();
        doorPivot.position.set(-0.45, 0, 0.72);
        doorPivot.userData.targetRotation = 0;
        section.add(doorPivot);
        breakerDoorPivots.push(doorPivot);
        const doorMat = material(0x59666a, 0.62, 0.34);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, compartmentHeight - 0.08, 0.07), doorMat);
        door.position.set(0.45, compartmentY, 0);
        doorPivot.add(door);
        addInteraction(door, id, `door-${id}`);
        hoverMaterials.set(door, doorMat);
        actionRef.current[`door-${id}`] = () => {
          doorPivot.userData.targetRotation = Math.abs(Number(doorPivot.userData.targetRotation)) < 0.2 ? -1.72 : 0;
          setSelectedId(id);
        };

        const namePlate = new THREE.Mesh(
          new THREE.PlaneGeometry(0.66, isFull ? 0.38 : 0.25),
          new THREE.MeshBasicMaterial({ map: labelTexture([definition.label, definition.duty], { bg: id === "A1" ? "#20132d" : "#10212b", accent: id === "A1" ? "#a278ff" : id === "tie" ? "#ffb82e" : "#29c7ff", width: 1000, height: 360 }) }),
        );
        namePlate.position.set(0.45, compartmentY + (isFull ? 0.83 : 0.42), 0.045);
        doorPivot.add(namePlate);

        const relayFace = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.08), material(0x071116, 0.2, 0.28));
        relayFace.position.set(0.27, compartmentY + (isFull ? 0.32 : 0.08), 0.055);
        doorPivot.add(relayFace);
        const relayScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), new THREE.MeshBasicMaterial({ color: 0xa278ff }));
        relayScreen.position.set(0.27, compartmentY + (isFull ? 0.35 : 0.11), 0.1);
        doorPivot.add(relayScreen);
        const iqFace = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.08), material(0x071116, 0.2, 0.28));
        iqFace.position.set(0.59, compartmentY + (isFull ? 0.32 : 0.08), 0.055);
        doorPivot.add(iqFace);
        const iqScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), new THREE.MeshBasicMaterial({ color: 0x4fe0ff }));
        iqScreen.position.set(0.59, compartmentY + (isFull ? 0.35 : 0.11), 0.1);
        doorPivot.add(iqScreen);

        const indicatorMat = material(gearBreakerClosed(INITIAL_STATE, id) ? 0xe63f3f : 0x39d77c, 0.18, 0.24);
        indicatorMat.emissive.setHex(gearBreakerClosed(INITIAL_STATE, id) ? 0x6b0808 : 0x07552a);
        const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), indicatorMat);
        indicator.position.set(0.73, compartmentY - (isFull ? 0.12 : 0.25), 0.08);
        doorPivot.add(indicator);
        visualRef.current.gearIndicators![id] = indicatorMat;
        if (id === "mainA" || id === "tie" || id === "mainB") visualRef.current.indicators[id] = indicatorMat;
        if (id === "A1") visualRef.current.starterIndicators!.low = indicatorMat;

        const closeMat = material(0xd83b3b, 0.24, 0.3);
        const closeButton = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.13, 0.09), closeMat);
        closeButton.position.set(0.27, compartmentY - (isFull ? 0.45 : 0.34), 0.075);
        doorPivot.add(closeButton);
        addInteraction(closeButton, id, `gear-close-${id}`);
        hoverMaterials.set(closeButton, closeMat);
        const openMat = material(0x34d17b, 0.24, 0.3);
        const openButton = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.13, 0.09), openMat);
        openButton.position.set(0.59, compartmentY - (isFull ? 0.45 : 0.34), 0.075);
        doorPivot.add(openButton);
        addInteraction(openButton, id, `gear-open-${id}`);
        hoverMaterials.set(openButton, openMat);

        const rackPort = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 18), material(0xb4bec2, 0.9, 0.2));
        rackPort.rotation.x = Math.PI / 2;
        rackPort.position.set(0.73, compartmentY - (isFull ? 0.7 : 0.51), 0.08);
        doorPivot.add(rackPort);
        addInteraction(rackPort, id, `gear-${id}`);

        const lotoLock = padlockModel(0xffd21f, 0.68);
        lotoLock.position.set(0.75, compartmentY + (isFull ? 0.68 : 0.34), 0.12);
        lotoLock.visible = false;
        doorPivot.add(lotoLock);
        visualRef.current.lotoLocks![id] = lotoLock;
      });
    }

    const sectionLayout: Array<[number, GearBreakerId[]]> = [
      [-5.25, ["A1", "A5"]], [-4.2, ["A2", "A6"]], [-3.15, ["A3", "A7"]], [-2.1, ["A4", "A8"]],
      [-1.05, ["mainA"]], [0, ["tie"]], [1.05, ["mainB"]],
      [2.1, ["B1", "B5"]], [3.15, ["B2", "B6"]], [4.2, ["B3", "B7"]], [5.25, ["B4", "B8"]],
    ];
    sectionLayout.forEach(([x, ids]) => createVcpSection(x, ids));

    // Source towers make availability obvious from across the room.
    function sourceTower(x: number, label: string, key: SourceKey) {
      const lampMat = material(0x34d17b, 0.1, 0.25);
      lampMat.emissive.setHex(0x0c5a31);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), lampMat);
      lamp.position.set(x, 4.55, -10.28);
      scene.add(lamp);
      visualRef.current.sourceIndicators[key] = lampMat;
      labelPlane([label], 0.9, 0.25, x, 4.55, -10.08, { bg: "#10212b", accent: "#34d17b", height: 250 });
    }
    sourceTower(-1.05, "SOURCE 1", "sourceA");
    sourceTower(1.05, "SOURCE 2", "sourceB");

    // Portable ArcSafe-style RRS-1 cart, quick-release coupling and local control module.
    const rackCart = new THREE.Group();
    rackCart.position.set(7.05, 0, -8.65);
    rackCart.scale.setScalar(0.78);
    scene.add(rackCart);
    const cartBaseMat = material(0xf2b400, 0.52, 0.34);
    const cartBase = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.22, 1.0), cartBaseMat);
    cartBase.position.y = 0.42;
    rackCart.add(cartBase);
    addInteraction(cartBase, "A1", "openRackCart");
    hoverMaterials.set(cartBase, cartBaseMat);
    [-0.57, 0.57].forEach((x) => [-0.36, 0.36].forEach((z) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 18), material(0x15191b, 0.4, 0.62));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.18, z);
      rackCart.add(wheel);
    }));
    const cartPost = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 0.16), material(0x2f3b40, 0.75, 0.3));
    cartPost.position.set(0.48, 1.18, -0.12);
    rackCart.add(cartPost);
    const drive = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.64, 0.62), cartBaseMat.clone());
    drive.position.set(-0.12, 1.35, 0);
    rackCart.add(drive);
    addInteraction(drive, "A1", "openRackCart");
    const rrsShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.25, 14), material(0xb8c2c6, 0.9, 0.18));
    rrsShaft.rotation.z = Math.PI / 2;
    rrsShaft.position.set(-0.98, 1.35, 0);
    rackCart.add(rrsShaft);
    const controlModule = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.22), material(0x202b30, 0.48, 0.35));
    controlModule.position.set(0.5, 2.0, 0.08);
    rackCart.add(controlModule);
    addInteraction(controlModule, "A1", "openRackCart");
    const cartLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.58),
      new THREE.MeshBasicMaterial({ map: labelTexture(["CBS ARCSAFE RRS-1", "REMOTE RACKING · OPEN CONSOLE"], { bg: "#211b05", fg: "#fff6bc", accent: "#f2b400", width: 1100, height: 380 }) }),
    );
    cartLabel.position.set(0, 2.75, 0.2);
    rackCart.add(cartLabel);
    addInteraction(cartLabel, "A1", "openRackCart");

    // Field cabinet is now beside the switchgear front aisle. Both doors open to
    // reveal the print devices; the 869 and local controls ride on the left door.
    const fieldGroup = new THREE.Group();
    fieldGroup.position.set(9.35, 0, -8.0);
    fieldGroup.scale.setScalar(0.74);
    scene.add(fieldGroup);
    const fieldBodyMat = material(0x263840, 0.62, 0.38);
    const fieldBody = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.65, 1.5), fieldBodyMat);
    fieldBody.position.y = 2.33;
    fieldGroup.add(fieldBody);
    addInteraction(fieldBody, "field");
    hoverMaterials.set(fieldBody, fieldBodyMat);
    const backplate = new THREE.Mesh(new THREE.BoxGeometry(3.18, 4.25, 0.08), material(0xd7d2bd, 0.25, 0.65));
    backplate.position.set(0, 2.26, 0.78);
    fieldGroup.add(backplate);
    const fieldName = labelTexture(["SYNCHRONOUS FIELD CABINET", "SCHEMATIC DEVICES · MOTOR RELAY · LOCAL CONTROL"], { bg: "#101b24", accent: "#a278ff", width: 1400, height: 400 });
    const fieldLabel = new THREE.Mesh(new THREE.PlaneGeometry(3.18, 0.52), new THREE.MeshBasicMaterial({ map: fieldName }));
    fieldLabel.position.set(0, 4.42, 0.84);
    fieldGroup.add(fieldLabel);

    const fieldDoorMat = material(0x41545c, 0.54, 0.36);
    const leftFieldDoor = new THREE.Group();
    leftFieldDoor.position.set(-1.68, 0, 0.84);
    leftFieldDoor.userData.targetRotation = -0.8;
    leftFieldDoor.rotation.y = -0.8;
    fieldGroup.add(leftFieldDoor);
    breakerDoorPivots.push(leftFieldDoor);
    const leftDoorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.64, 4.35, 0.09), fieldDoorMat);
    leftDoorPanel.position.set(0.82, 2.3, 0);
    leftFieldDoor.add(leftDoorPanel);
    addInteraction(leftDoorPanel, "field", "door-field-left");
    hoverMaterials.set(leftDoorPanel, fieldDoorMat);
    actionRef.current["door-field-left"] = () => {
      leftFieldDoor.userData.targetRotation = Math.abs(Number(leftFieldDoor.userData.targetRotation)) < 0.2 ? -0.8 : 0;
      setSelectedId("field");
    };

    const rightFieldDoor = new THREE.Group();
    rightFieldDoor.position.set(1.68, 0, 0.84);
    rightFieldDoor.userData.targetRotation = 0.8;
    rightFieldDoor.rotation.y = 0.8;
    fieldGroup.add(rightFieldDoor);
    breakerDoorPivots.push(rightFieldDoor);
    const rightDoorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.64, 4.35, 0.09), fieldDoorMat.clone());
    rightDoorPanel.position.set(-0.82, 2.3, 0);
    rightFieldDoor.add(rightDoorPanel);
    addInteraction(rightDoorPanel, "field", "door-field-right");
    actionRef.current["door-field-right"] = () => {
      rightFieldDoor.userData.targetRotation = Math.abs(Number(rightFieldDoor.userData.targetRotation)) < 0.2 ? 0.8 : 0;
      setSelectedId("field");
    };
    const rightDoorMimic = new THREE.Mesh(
      new THREE.PlaneGeometry(1.38, 2.75),
      new THREE.MeshBasicMaterial({ map: labelTexture(["FIELD SEQUENCE", "52a → M-G → 56/FAR", "41 → ROTOR FIELD", "RFD CONNECTED UNTIL 41"], { bg: "#0b1921", accent: "#ffb82e", width: 900, height: 1280 }) }),
    );
    rightDoorMimic.position.set(-0.82, 2.45, 0.055);
    rightFieldDoor.add(rightDoorMimic);

    // A detailed 869 faceplate: color display, target LEDs and membrane keys.
    const relayCanvas = document.createElement("canvas");
    relayCanvas.width = 920;
    relayCanvas.height = 520;
    const relayTexture = new THREE.CanvasTexture(relayCanvas);
    relayTexture.colorSpace = THREE.SRGBColorSpace;
    visualRef.current.relayCanvas = relayCanvas;
    visualRef.current.relayTexture = relayTexture;
    const relayFrame = new THREE.Mesh(new THREE.BoxGeometry(1.26, 1.48, 0.16), material(0x111417, 0.45, 0.25));
    relayFrame.position.set(0.82, 3.37, 0.12);
    leftFieldDoor.add(relayFrame);
    addInteraction(relayFrame, "field", "openRelay");
    const relayScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.59), new THREE.MeshBasicMaterial({ map: relayTexture }));
    relayScreen.position.set(0.82, 3.54, 0.208);
    leftFieldDoor.add(relayScreen);
    addInteraction(relayScreen, "field", "openRelay");
    const relayTag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.17),
      new THREE.MeshBasicMaterial({ map: labelTexture(["MOTOR RELAY", "PROTECTION & CONTROL"], { bg: "#e9ecee", fg: "#17222a", accent: "#2a8fc4", width: 1000, height: 260 }) }),
    );
    relayTag.position.set(0.82, 4.0, 0.21);
    leftFieldDoor.add(relayTag);
    [0, 1, 2, 3, 4].forEach((index) => {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), material(index === 3 ? 0xd83b3b : index === 2 ? 0xffb82e : 0x34d17b, 0.1, 0.25));
      led.position.set(0.45 + index * 0.18, 3.16, 0.215);
      leftFieldDoor.add(led);
    });
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.045), material(0x4f5960, 0.35, 0.42));
        key.position.set(0.46 + column * 0.18, 2.97 - row * 0.16, 0.205);
        leftFieldDoor.add(key);
        addInteraction(key, "field", "openRelay");
      }
    }

    function doorButton(label: string, actionKey: string, x: number, y: number, color: number, width = 0.52) {
      const buttonMat = material(color, 0.4, 0.3);
      buttonMat.emissive.setHex(color === 0xd92727 ? 0x4f0505 : 0x071a12);
      const button = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, 0.14), buttonMat);
      button.position.set(x, y, 0.16);
      leftFieldDoor.add(button);
      addInteraction(button, "field", actionKey);
      hoverMaterials.set(button, buttonMat);
      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.94, 0.15),
        new THREE.MeshBasicMaterial({ map: labelTexture([label], { bg: "#0b151b", accent: `#${color.toString(16).padStart(6, "0")}`, width: 620, height: 210 }) }),
      );
      tag.position.set(x, y + 0.23, 0.16);
      leftFieldDoor.add(tag);
      return buttonMat;
    }
    doorButton("SINGLE SPEED", "fieldSelectLow", 0.71, 2.42, 0x2a91c2, 0.92);
    doorButton("START", "fieldStart", 0.46, 1.96, 0x28b86f, 0.42);
    doorButton("STOP", "fieldStop", 0.96, 1.96, 0xd95a35, 0.42);
    doorButton("RESET", "motorReset", 0.46, 1.5, 0xffb82e, 0.42);
    const fieldEStopMat = doorButton("E-STOP", "eStop", 0.96, 1.5, 0xd92727, 0.48);
    visualRef.current.eStop = fieldEStopMat;
    doorButton("DCS", "authorityOvation", 0.38, 0.96, 0x29c7ff, 0.34);
    doorButton("FIELD", "authorityField", 0.82, 0.96, 0x34d17b, 0.34);
    doorButton("STARTER", "authorityStarter", 1.26, 0.96, 0xa278ff, 0.34);

    function fieldDevice(x: number, y: number, w: number, h: number, title: string, accent: number, subtitle = "", statusKey?: "m" | "mg" | "far" | "field" | "resistor" | "k45") {
      const statusMat = material(0x202a2f, 0.38, 0.36);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), statusMat);
      frame.position.set(x, y, 0.88);
      fieldGroup.add(frame);
      if (statusKey) visualRef.current.fieldSequence![statusKey] = statusMat;
      const texture = labelTexture([title, subtitle], { bg: "#071116", accent: `#${accent.toString(16).padStart(6, "0")}`, width: 900, height: 360 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.88, h * 0.72), new THREE.MeshBasicMaterial({ map: texture }));
      face.position.set(x, y, 0.995);
      fieldGroup.add(face);
      return frame;
    }

    fieldDevice(-1.15, 3.75, 0.62, 0.5, "M", 0x29c7ff, "CONTACTOR", "m");
    fieldDevice(-0.38, 3.75, 0.62, 0.5, "5R", 0x29c7ff, "RUN RELAY");
    fieldDevice(0.38, 3.75, 0.62, 0.5, "AR", 0xffb82e, "ALARM");
    fieldDevice(1.15, 3.75, 0.62, 0.5, "K45", 0x34d17b, "45 s SEAL", "k45");
    fieldDevice(-1.15, 2.95, 0.62, 0.56, "OL", 0xd95a35, "49 MOTOR");
    fieldDevice(-0.38, 2.95, 0.62, 0.56, "42a", 0x29c7ff, "AUX");
    fieldDevice(0.38, 2.95, 0.62, 0.56, "56", 0xa278ff, "FAR", "far");
    fieldDevice(1.15, 2.95, 0.62, 0.56, "41", 0x34d17b, "FIELD", "field");
    fieldDevice(-1.15, 2.15, 0.62, 0.56, "CT", 0x29c7ff, "3 PHASE");
    fieldDevice(-0.38, 2.15, 0.62, 0.56, "GF", 0xa278ff, "50G / 51G");
    fieldDevice(0.38, 2.15, 0.62, 0.56, "RTD", 0xffb82e, "5 BEARINGS");
    fieldDevice(1.15, 2.15, 0.62, 0.56, "VIB", 0xa278ff, "MOTOR / PUMP");
    fieldDevice(-1.0, 1.35, 0.92, 0.52, "125 VDC", 0xffb82e, "M-G READY", "mg");
    fieldDevice(0, 1.35, 0.72, 0.52, "RFD", 0xff7a3d, "CONNECTED", "resistor");
    fieldDevice(1.0, 1.35, 0.92, 0.52, "TB-MPR", 0x34d17b, "RTD · VIB");
    for (let index = 0; index < 10; index += 1) {
      const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.18), material(index % 2 ? 0x306e9a : 0xd39a29, 0.3, 0.42));
      terminal.position.set(-1.33 + index * 0.295, 0.62, 0.9);
      fieldGroup.add(terminal);
    }

    // Cabinet-top field-discharge resistor bank with visible ceramic coils.
    const resistorCase = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.86, 1.18), material(0x6b7478, 0.68, 0.3));
    resistorCase.position.set(0, 5.08, 0);
    fieldGroup.add(resistorCase);
    addInteraction(resistorCase, "field");
    for (let bank = -1; bank <= 1; bank += 2) {
      const ceramic = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.25, 16), material(0xe9dfc7, 0.15, 0.7));
      ceramic.rotation.z = Math.PI / 2;
      ceramic.position.set(0, 5.08, bank * 0.27);
      fieldGroup.add(ceramic);
      for (let coil = -9; coil <= 9; coil += 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 7, 16), material(0xbf5227, 0.78, 0.25));
        ring.rotation.y = Math.PI / 2;
        ring.position.set(coil * 0.11, 5.08, bank * 0.27);
        fieldGroup.add(ring);
      }
    }
    const resistorLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.68, 0.38),
      new THREE.MeshBasicMaterial({ map: labelTexture(["FIELD DISCHARGE RESISTOR", "RFD · CONNECTED UNTIL 41 CLOSES"], { bg: "#24120b", accent: "#ff7a3d", width: 1200, height: 310 }) }),
    );
    resistorLabel.position.set(0, 5.08, 0.61);
    fieldGroup.add(resistorLabel);

    // Motor-generator excitation set, physically adjacent to the exciter cabinet.
    const mgGroup = new THREE.Group();
    mgGroup.position.set(15.8, 0, -8.0);
    mgGroup.scale.setScalar(0.68);
    scene.add(mgGroup);
    const mgSkid = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.3, 2.25), material(0x26343b, 0.6, 0.5));
    mgSkid.position.y = 0.18;
    mgGroup.add(mgSkid);
    const mgRotor = new THREE.Group();
    mgRotor.position.set(0, 1.2, 0);
    mgGroup.add(mgRotor);
    const mgMotorMat = material(0x2a7396, 0.58, 0.34);
    const mgMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 1.55, 28), mgMotorMat);
    mgMotor.rotation.z = Math.PI / 2;
    mgMotor.position.x = -0.95;
    mgRotor.add(mgMotor);
    addInteraction(mgMotor, "mgSet");
    hoverMaterials.set(mgMotor, mgMotorMat);
    const mgGenerator = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.45, 28), material(0xb76a21, 0.58, 0.34));
    mgGenerator.rotation.z = Math.PI / 2;
    mgGenerator.position.x = 0.92;
    mgRotor.add(mgGenerator);
    const mgShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.7, 16), material(0xc4d0d5, 0.88, 0.2));
    mgShaft.rotation.z = Math.PI / 2;
    mgRotor.add(mgShaft);
    const commutatorRotor = new THREE.Group();
    commutatorRotor.position.x = 1.78;
    mgRotor.add(commutatorRotor);
    for (let barIndex = 0; barIndex < 20; barIndex += 1) {
      const angle = (barIndex / 20) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.11), material(0xc87527, 0.82, 0.24));
      bar.position.set(0, Math.cos(angle) * 0.31, Math.sin(angle) * 0.31);
      bar.rotation.x = angle;
      commutatorRotor.add(bar);
    }
    const brushRig = new THREE.Group();
    brushRig.position.set(1.78, 1.2, 0);
    mgGroup.add(brushRig);
    [-1, 1].forEach((direction) => {
      const holder = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), material(0x59666c, 0.7, 0.28));
      holder.position.y = direction * 0.51;
      brushRig.add(holder);
      const carbonBrush = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.16), material(0x16191a, 0.25, 0.72));
      carbonBrush.position.y = direction * 0.39;
      brushRig.add(carbonBrush);
    });
    const commutatorTag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.65, 0.36),
      new THREE.MeshBasicMaterial({ map: labelTexture(["DC COMMUTATOR", "20 BARS · 2 BRUSHES"], { bg: "#21140b", accent: "#d88731", width: 900, height: 320 }) }),
    );
    commutatorTag.position.set(1.25, 1.24, 0.8);
    mgGroup.add(commutatorTag);
    const mgPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.72),
      new THREE.MeshBasicMaterial({ map: labelTexture(["M-G EXCITATION SET", "AC DRIVE · 125 VDC GENERATOR"], { bg: "#101a20", accent: "#ffb82e", width: 1100, height: 360 }) }),
    );
    mgPlate.position.set(0, 2.35, 0.82);
    mgGroup.add(mgPlate);

    // Yellow community-lock LOTO station with lockbox, hasps and tags.
    const lotoGroup = new THREE.Group();
    lotoGroup.position.set(-17.0, 0, -2.6);
    lotoGroup.scale.setScalar(0.7);
    scene.add(lotoGroup);
    const lotoBoardMat = material(0x3b4143, 0.48, 0.48);
    const lotoBoard = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.15, 0.35), lotoBoardMat);
    lotoBoard.position.y = 1.85;
    lotoGroup.add(lotoBoard);
    addInteraction(lotoBoard, "loto", "openLoto");
    hoverMaterials.set(lotoBoard, lotoBoardMat);
    const lotoTitle = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 0.58),
      new THREE.MeshBasicMaterial({ map: labelTexture(["COMMUNITY LOTO", "YELLOW LOCK SYSTEM"], { bg: "#171507", fg: "#fff4b0", accent: "#ffd21f", width: 1100, height: 350 }) }),
    );
    lotoTitle.position.set(0, 2.98, 0.2);
    lotoGroup.add(lotoTitle);
    for (let index = 0; index < 6; index += 1) {
      const lock = padlockModel(0xffd21f, 1.25);
      lock.position.set(-1.05 + (index % 3) * 1.05, 2.24 - Math.floor(index / 3) * 0.65, 0.27);
      lotoGroup.add(lock);
    }
    const lockbox = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.38), material(0xf1c40f, 0.45, 0.38));
    lockbox.position.set(-0.65, 0.76, 0.33);
    lotoGroup.add(lockbox);
    const hasp = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 20, Math.PI * 1.5), material(0xcbd3d6, 0.86, 0.2));
    hasp.position.set(0.72, 0.9, 0.31);
    lotoGroup.add(hasp);
    const masterLock = padlockModel(0xffd21f, 1.45);
    masterLock.position.set(1.05, 0.7, 0.37);
    lotoGroup.add(masterLock);
    const tagPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.55, 0.45),
      new THREE.MeshBasicMaterial({ map: labelTexture(["TAGS · HASPS · INDIVIDUAL KEYS", "MASTER CONTROL LOCK / GROUP LOCKBOX"], { bg: "#301010", fg: "#ffffff", accent: "#ff4545", width: 1250, height: 300 }) }),
    );
    tagPanel.position.set(0, 0.25, 0.23);
    lotoGroup.add(tagPanel);

    // One large, front-facing operator control board with all controls on its face.
    const boardCanvas = document.createElement("canvas");
    boardCanvas.width = 1400;
    boardCanvas.height = 720;
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTexture.colorSpace = THREE.SRGBColorSpace;
    visualRef.current.boardCanvas = boardCanvas;
    visualRef.current.boardTexture = boardTexture;
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(-12.35, 0, -6.65);
    consoleGroup.scale.setScalar(0.58);
    scene.add(consoleGroup);
    const consoleBody = new THREE.Mesh(new THREE.BoxGeometry(7.35, 4.45, 1.25), material(0x34464f, 0.62, 0.38));
    consoleBody.position.y = 2.23;
    consoleGroup.add(consoleBody);
    const consoleFaceMat = material(0x4a5d66, 0.55, 0.35);
    const consoleFace = new THREE.Mesh(new THREE.BoxGeometry(7.08, 4.18, 0.08), consoleFaceMat);
    consoleFace.position.set(0, 2.23, 0.67);
    consoleGroup.add(consoleFace);
    addInteraction(consoleFace, "controlBoard");
    hoverMaterials.set(consoleFace, consoleFaceMat);
    const consoleTitle = new THREE.Mesh(
      new THREE.PlaneGeometry(6.72, 0.48),
      new THREE.MeshBasicMaterial({ map: labelTexture(["MOTOR · VALVE · MAIN / TIE CONTROL", "BUS 1 · NORMAL · BUS 2 SELECTOR"], { bg: "#0b1921", accent: "#29c7ff", width: 1600, height: 360 }) }),
    );
    consoleTitle.position.set(0, 4.02, 0.73);
    consoleGroup.add(consoleTitle);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 1.95), new THREE.MeshBasicMaterial({ map: boardTexture }));
    board.position.set(-1.65, 2.72, 0.73);
    consoleGroup.add(board);

    function panelButton(label: string, actionKey: string, x: number, y: number, color: number, width = 0.84, inspectId = "controlBoard") {
      const buttonMat = material(color, 0.38, 0.32);
      buttonMat.emissive.setHex(color === 0xd92727 ? 0x4c0505 : 0x061c14);
      const button = new THREE.Mesh(new THREE.BoxGeometry(width, 0.27, 0.15), buttonMat);
      button.position.set(x, y, 0.78);
      consoleGroup.add(button);
      addInteraction(button, inspectId, actionKey);
      hoverMaterials.set(button, buttonMat);
      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.96, 0.2),
        new THREE.MeshBasicMaterial({ map: labelTexture([label], { bg: "#0b151b", accent: `#${color.toString(16).padStart(6, "0")}`, width: 650, height: 220 }) }),
      );
      tag.position.set(x, y + 0.28, 0.75);
      consoleGroup.add(tag);
      return buttonMat;
    }

    panelButton("MOTOR · BUS 1", "selectLow", 1.43, 3.22, 0x2a91c2, 2.5);
    panelButton("START", "motorStart", 0.72, 2.43, 0x28b86f, 1.1);
    panelButton("NORMAL STOP", "motorStop", 2.15, 2.43, 0xd95a35, 1.1);
    panelButton("TRIP RESET", "motorReset", 0.72, 1.63, 0xffb82e, 1.1);
    panelButton("E-STOP", "eStop", 2.15, 1.63, 0xd92727, 1.1);
    panelButton("VALVE +", "valveOpen", -3.0, 1.23, 0x29c7ff, 0.72);
    panelButton("VALVE −", "valveClose", -2.12, 1.23, 0x29c7ff, 0.72);
    panelButton("LOTO", "openLoto", -1.24, 1.23, 0xffd21f, 0.72, "loto");
    const selectorKnob = new THREE.Group();
    selectorKnob.position.set(-0.36, 1.13, 0.8);
    consoleGroup.add(selectorKnob);
    visualRef.current.selectorKnob = selectorKnob;
    const selectorBaseMat = material(0x11191e, 0.72, 0.24);
    const selectorBase = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 24), selectorBaseMat);
    selectorBase.rotation.x = Math.PI / 2;
    selectorKnob.add(selectorBase);
    addInteraction(selectorBase, "tie", "cycleSelector");
    hoverMaterials.set(selectorBase, selectorBaseMat);
    const selectorPointer = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.13), material(0xffb82e, 0.35, 0.3));
    selectorPointer.position.set(0, 0.14, 0.08);
    selectorKnob.add(selectorPointer);
    const selectorTag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.2),
      new THREE.MeshBasicMaterial({ map: labelTexture(["3-POS SELECTOR"], { bg: "#0b151b", accent: "#ffb82e", width: 700, height: 220 }) }),
    );
    selectorTag.position.set(-0.36, 1.57, 0.75);
    consoleGroup.add(selectorTag);
    const selectorActions: Array<[string, string, number, number]> = [
      ["ALL BUS 1", "selectBus1", -2.65, 0x29c7ff],
      ["NORMAL", "selectNormal", -1.55, 0x34d17b],
      ["ALL BUS 2", "selectBus2", -0.45, 0xa278ff],
    ];
    selectorActions.forEach(([label, actionKey, x, color]) => panelButton(label, actionKey, x, 0.42, color, 0.86, "tie"));
    const breakerPanelActions: Array<[string, string, number, number]> = [
      ["M1 CLOSE", "mainACloseRemote", 0.5, 0xd83b3b],
      ["M1 OPEN", "mainAOpenRemote", 1.06, 0x34d17b],
      ["T CLOSE", "tieCloseRemote", 1.62, 0xd83b3b],
      ["T OPEN", "tieOpenRemote", 2.18, 0x34d17b],
      ["M2 CLOSE", "mainBCloseRemote", 2.74, 0xd83b3b],
      ["M2 OPEN", "mainBOpenRemote", 3.3, 0x34d17b],
    ];
    breakerPanelActions.forEach(([label, actionKey, x, color]) => panelButton(label, actionKey, x, 0.42, color, 0.48, "tie"));

    // Attached training-input bay: fault injector, five RTDs and vibration channels.
    const trainingWingMat = material(0x34464f, 0.62, 0.38);
    const trainingWing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.45, 1.25), trainingWingMat);
    trainingWing.position.set(4.8, 2.23, 0);
    consoleGroup.add(trainingWing);
    addInteraction(trainingWing, "controlBoard", "openTraining");
    hoverMaterials.set(trainingWing, trainingWingMat);
    const trainingFace = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.18, 0.08), consoleFaceMat);
    trainingFace.position.set(4.8, 2.23, 0.67);
    consoleGroup.add(trainingFace);
    addInteraction(trainingFace, "controlBoard", "openTraining");
    hoverMaterials.set(trainingFace, consoleFaceMat);
    const trainingTitle = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.48),
      new THREE.MeshBasicMaterial({ map: labelTexture(["TRAINING INPUTS", "FAULT · RTD · VIBRATION"], { bg: "#17111f", accent: "#a278ff", width: 1000, height: 360 }) }),
    );
    trainingTitle.position.set(4.8, 4.02, 0.73);
    consoleGroup.add(trainingTitle);
    const trainingCanvas = document.createElement("canvas");
    trainingCanvas.width = 900;
    trainingCanvas.height = 620;
    const trainingTexture = new THREE.CanvasTexture(trainingCanvas);
    trainingTexture.colorSpace = THREE.SRGBColorSpace;
    visualRef.current.trainingCanvas = trainingCanvas;
    visualRef.current.trainingTexture = trainingTexture;
    const trainingScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 1.32), new THREE.MeshBasicMaterial({ map: trainingTexture }));
    trainingScreen.position.set(4.8, 3.18, 0.73);
    consoleGroup.add(trainingScreen);
    addInteraction(trainingScreen, "controlBoard", "openTraining");
    const trainingButtons: Array<[string, string, number, number, number]> = [
      ["FAULT NEXT", "faultNext", 4.02, 2.18, 0xa278ff],
      ["INJECT", "faultInject", 4.8, 2.18, 0xd94a4a],
      ["CLEAR", "faultClear", 5.58, 2.18, 0x34d17b],
      ["RTD NEXT", "bearingNext", 4.02, 1.38, 0x29c7ff],
      ["TEMP +5", "bearingTempUp", 4.8, 1.38, 0xffb82e],
      ["TEMP −5", "bearingTempDown", 5.58, 1.38, 0x29c7ff],
      ["M VIB +", "motorVibUp", 4.02, 0.58, 0xa278ff],
      ["P VIB +", "pumpVibUp", 4.8, 0.58, 0xa278ff],
      ["NORMALIZE", "sensorNormalize", 5.58, 0.58, 0x34d17b],
    ];
    trainingButtons.forEach(([label, actionKey, x, y, color]) => panelButton(label, actionKey, x, y, color, 0.58));

    // Ovation remote station in the same aisle as the field cabinet and starters.
    const ovationGroup = new THREE.Group();
    ovationGroup.position.set(5.9, 0, -5.55);
    ovationGroup.scale.setScalar(0.72);
    scene.add(ovationGroup);
    const ovationDeskMat = material(0x35454d, 0.65, 0.36);
    const ovationDesk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 1.35), ovationDeskMat);
    ovationDesk.position.set(0, 1.15, 0);
    ovationGroup.add(ovationDesk);
    addInteraction(ovationDesk, "ovation", "openOvation");
    hoverMaterials.set(ovationDesk, ovationDeskMat);
    [-1.35, 1.35].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.12, 0.18), material(0x26333a, 0.72, 0.3));
      leg.position.set(x, 0.58, 0);
      ovationGroup.add(leg);
    });
    const ovationCanvas = document.createElement("canvas");
    ovationCanvas.width = 1280;
    ovationCanvas.height = 720;
    const ovationTexture = new THREE.CanvasTexture(ovationCanvas);
    ovationTexture.colorSpace = THREE.SRGBColorSpace;
    visualRef.current.ovationCanvas = ovationCanvas;
    visualRef.current.ovationTexture = ovationTexture;
    const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.75, 1.75, 0.16), material(0x11171b, 0.45, 0.28));
    monitorFrame.position.set(0, 2.35, 0.2);
    ovationGroup.add(monitorFrame);
    addInteraction(monitorFrame, "ovation", "openOvation");
    const ovationScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.52, 1.46), new THREE.MeshBasicMaterial({ map: ovationTexture }));
    ovationScreen.position.set(0, 2.35, 0.292);
    ovationGroup.add(ovationScreen);
    addInteraction(ovationScreen, "ovation", "openOvation");
    const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), material(0x222a2f, 0.72, 0.28));
    monitorStand.position.set(0, 1.3, 0.15);
    ovationGroup.add(monitorStand);
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.09, 0.52), material(0x1b2226, 0.3, 0.48));
    keyboard.position.set(0, 1.31, 0.46);
    keyboard.rotation.x = -0.08;
    ovationGroup.add(keyboard);
    addInteraction(keyboard, "ovation", "openOvation");
    const ovationSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.75, 0.42),
      new THREE.MeshBasicMaterial({ map: labelTexture(["DCS REMOTE OPERATOR STATION", "MOTOR · VALVE · PROTECTION · STARTER STATUS"], { bg: "#121a23", accent: "#31c7ef", width: 1300, height: 320 }) }),
    );
    ovationSign.position.set(0, 3.52, 0.2);
    ovationGroup.add(ovationSign);

    // Compact single-speed machine train kept in the switchgear-side sight line.
    const motorTrainRoot = new THREE.Group();
    motorTrainRoot.position.set(11.0, 0, -0.6);
    motorTrainRoot.rotation.y = -Math.PI / 2;
    motorTrainRoot.scale.setScalar(0.78);
    scene.add(motorTrainRoot);
    const motorTrainLayout = new THREE.Group();
    motorTrainLayout.position.z = -2.9;
    motorTrainRoot.add(motorTrainLayout);
    function machineBox(w: number, h: number, d: number, color: number, x: number, y: number, z: number, mat?: THREE.MeshStandardMaterial) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat ?? material(color));
      mesh.position.set(x, y, z);
      motorTrainLayout.add(mesh);
      return mesh;
    }
    function machineLabel(lines: string[], w: number, h: number, x: number, y: number, z: number, options?: Parameters<typeof labelTexture>[1]) {
      const label = labelPlane(lines, w, h, x, y, z, options);
      motorTrainLayout.add(label);
      return label;
    }
    machineBox(14.6, 0.34, 4.8, 0x26343b, 0, 0.17, 3.2, material(0x26343b, 0.22, 0.75));
    const hazardMat = material(0xffb82e, 0.15, 0.5);
    machineBox(14.9, 0.06, 0.16, 0xffb82e, 0, 0.38, 0.72, hazardMat);
    machineBox(14.9, 0.06, 0.16, 0xffb82e, 0, 0.38, 5.68, hazardMat);
    machineBox(0.16, 0.06, 5.05, 0xffb82e, -7.45, 0.38, 3.2, hazardMat);
    machineBox(0.16, 0.06, 5.05, 0xffb82e, 7.45, 0.38, 3.2, hazardMat);

    const rotatingMotorParts: THREE.Group[] = [];

    function motorMachine(x: number, length: number, radius: number, color: number, id: string, title: string, subtitle: string) {
      const group = new THREE.Group();
      group.position.set(x, 1.65, 3.2);
      motorTrainLayout.add(group);
      const frameMat = material(color, 0.6, 0.33);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 32, 1), frameMat);
      shell.rotation.z = Math.PI / 2;
      group.add(shell);
      addInteraction(shell, id);
      hoverMaterials.set(shell, frameMat);
      for (let rib = -length / 2 + 0.25; rib < length / 2; rib += 0.38) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.045, 0.045, 8, 28), material(0x9fb0b7, 0.75, 0.3));
        ring.position.x = rib;
        ring.rotation.y = Math.PI / 2;
        group.add(ring);
      }
      const endA = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.18, 28), material(0x25343b, 0.65, 0.35));
      endA.rotation.z = Math.PI / 2;
      endA.position.x = -length / 2 - 0.05;
      group.add(endA);
      const endB = endA.clone();
      endB.position.x = length / 2 + 0.05;
      group.add(endB);
      const electricalRotor = new THREE.Group();
      group.add(electricalRotor);
      rotatingMotorParts.push(electricalRotor);
      const slipRingRadius = radius * 0.38;
      [length / 2 + 0.22, length / 2 + 0.39].forEach((ringX, ringIndex) => {
        const slipRing = new THREE.Mesh(new THREE.TorusGeometry(slipRingRadius, 0.055, 10, 30), material(0xc87b2d, 0.88, 0.22));
        slipRing.rotation.y = Math.PI / 2;
        slipRing.position.x = ringX;
        electricalRotor.add(slipRing);
        const ringMarker = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.08), material(ringIndex ? 0xffe36c : 0xff8a43, 0.3, 0.35));
        ringMarker.position.set(ringX, slipRingRadius, 0);
        electricalRotor.add(ringMarker);
      });
      [-1, 1].forEach((direction) => {
        const brushHolder = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.24, 0.28), material(0x59666c, 0.74, 0.3));
        brushHolder.position.set(length / 2 + 0.31, direction * (slipRingRadius + 0.2), 0);
        group.add(brushHolder);
        const brush = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.2), material(0x151819, 0.22, 0.75));
        brush.position.set(length / 2 + 0.31, direction * (slipRingRadius + 0.07), 0);
        group.add(brush);
      });
      const fanRotor = new THREE.Group();
      fanRotor.position.x = -length / 2 - 0.2;
      electricalRotor.add(fanRotor);
      for (let bladeIndex = 0; bladeIndex < 6; bladeIndex += 1) {
        const angle = (bladeIndex / 6) * Math.PI * 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, radius * 0.72, 0.16), material(0xd6e3e7, 0.66, 0.28));
        blade.position.set(0, Math.cos(angle) * radius * 0.36, Math.sin(angle) * radius * 0.36);
        blade.rotation.x = angle;
        fanRotor.add(blade);
      }
      const slipRingTag = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(1.55, length * 0.55), 0.36),
        new THREE.MeshBasicMaterial({ map: labelTexture(["SLIP RINGS", "2 RINGS · CARBON BRUSHES"], { bg: "#21140b", accent: "#d88731", width: 900, height: 320 }) }),
      );
      slipRingTag.position.set(length / 2 + 0.3, radius * 0.8, radius * 0.76);
      group.add(slipRingTag);
      const label = labelTexture([title, subtitle], { bg: "#0c1c25", accent: "#ff8b3d", width: 1000, height: 370 });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(length * 0.7, 2.8), 0.62), new THREE.MeshBasicMaterial({ map: label }));
      plate.position.set(0, 0.22, radius + 0.04);
      group.add(plate);
      const footMat = material(0x202a30, 0.75, 0.38);
      [-length * 0.32, length * 0.32].forEach((footX) => {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, radius * 1.25), footMat);
        foot.position.set(footX, -radius - 0.15, 0);
        group.add(foot);
      });
      return group;
    }

    const syncMotor = motorMachine(-3.95, 3.25, 1.25, 0x16769d, "motorLow", "BRUSHED SYNCHRONOUS MOTOR", "SINGLE SPEED · 2500 HP · 4.8 kV");

    const shaftMat = material(0xb7c5ca, 0.9, 0.18);
    const shaftRotor = new THREE.Group();
    shaftRotor.position.set(0, 1.65, 3.2);
    motorTrainLayout.add(shaftRotor);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 11.4, 20), shaftMat);
    shaft.rotation.z = Math.PI / 2;
    shaftRotor.add(shaft);

    function coupling(x: number, color = 0xffb82e) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.36, 20), material(color, 0.65, 0.26));
      mesh.rotation.z = Math.PI / 2;
      mesh.position.x = x + 0.3;
      shaftRotor.add(mesh);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.5), material(0xfff06a, 0.35, 0.32));
      marker.position.set(x + 0.3, 0.34, 0);
      shaftRotor.add(marker);
      return mesh;
    }
    coupling(-2.15);
    coupling(1.95);
    coupling(2.85);

    // Pump volute approximation and 36-inch discharge piping.
    const pumpGroup = new THREE.Group();
    pumpGroup.position.set(1.0, 1.65, 3.2);
    motorTrainLayout.add(pumpGroup);
    const pumpMat = material(0xb95e24, 0.5, 0.45);
    const pumpCasing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.42, 16, 32, Math.PI * 1.78), pumpMat);
    pumpCasing.rotation.y = Math.PI / 2;
    pumpGroup.add(pumpCasing);
    addInteraction(pumpCasing, "pump");
    hoverMaterials.set(pumpCasing, pumpMat);
    const pumpHub = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 1.0, 28), material(0x9b4b1e, 0.58, 0.4));
    pumpHub.rotation.z = Math.PI / 2;
    pumpGroup.add(pumpHub);
    const pumpPlate = labelTexture(["CENTRIFUGAL PUMP", "COMMON SHAFT"], { bg: "#1e1510", accent: "#ff8b3d", width: 900, height: 350 });
    const pumpLabel = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.55), new THREE.MeshBasicMaterial({ map: pumpPlate }));
    pumpLabel.position.set(0, 0.24, 1.32);
    pumpGroup.add(pumpLabel);

    const pipeMat = material(0x3a7b91, 0.55, 0.34);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 6.6, 28), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(4.75, 2.65, 3.2);
    motorTrainLayout.add(pipe);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.05, 28), pipeMat);
    riser.position.set(1.75, 2.7, 3.2);
    motorTrainLayout.add(riser);

    const valveGroup = new THREE.Group();
    valveGroup.position.set(5.75, 2.65, 3.2);
    motorTrainLayout.add(valveGroup);
    const valveBody = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 1.15, 28), material(0x25586b, 0.65, 0.32));
    valveBody.rotation.z = Math.PI / 2;
    valveGroup.add(valveBody);
    addInteraction(valveBody, "pump");
    const valveBladePivot = new THREE.Group();
    valveGroup.add(valveBladePivot);
    const valveBlade = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.07, 28), material(0xe18a2d, 0.72, 0.28));
    valveBlade.rotation.z = Math.PI / 2;
    valveBladePivot.add(valveBlade);
    const bladeStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.25, 0.12), material(0xffec7a, 0.3, 0.35));
    bladeStripe.position.x = 0.04;
    valveBladePivot.add(bladeStripe);
    const actuator = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.8, 0.75), material(0xffb82e, 0.35, 0.42));
    actuator.position.y = 1.04;
    valveGroup.add(actuator);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.72, 14), shaftMat);
    stem.position.y = 0.62;
    valveGroup.add(stem);
    const valveDial = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.045, 8, 28, Math.PI), material(0xd6e3e7, 0.75, 0.24));
    valveDial.position.set(0, 1.38, 0.48);
    valveGroup.add(valveDial);
    const valvePointer = new THREE.Group();
    valvePointer.position.set(0, 1.38, 0.52);
    valveGroup.add(valvePointer);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.58, 0.07), material(0xff4545, 0.25, 0.32));
    needle.position.y = 0.25;
    valvePointer.add(needle);
    const valveCanvas = document.createElement("canvas");
    valveCanvas.width = 1100;
    valveCanvas.height = 360;
    const valveLabel = new THREE.CanvasTexture(valveCanvas);
    valveLabel.colorSpace = THREE.SRGBColorSpace;
    visualRef.current.valveCanvas = valveCanvas;
    visualRef.current.valveTexture = valveLabel;
    const valvePlate = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.68), new THREE.MeshBasicMaterial({ map: valveLabel }));
    valvePlate.position.set(0, 1.7, 0.78);
    valveGroup.add(valvePlate);

    // Five individual bearing stations with labels kept apart.
    const bearings = [
      [-5.75, "MOTOR OB", "mob"],
      [-2.15, "MOTOR IB", "mib"],
      [-0.35, "PUMP IB", "pib"],
      [2.15, "PUMP OB", "pob"],
      [2.85, "THRUST", "thrust"],
    ] as Array<[number, string, BearingKey]>;
    visualRef.current.bearingIndicators = {};
    bearings.forEach(([x, name, key], index) => {
      const bearingMat = material(0x657780, 0.7, 0.32);
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.82), bearingMat);
      pedestal.position.set(x, 0.73, 3.2);
      motorTrainLayout.add(pedestal);
      visualRef.current.bearingIndicators![key] = bearingMat;
      const tag = labelTexture([name, "75 ALM · 85 TRIP"], { bg: "#15242b", accent: index % 2 ? "#29c7ff" : "#34d17b", width: 900, height: 340 });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.46), new THREE.MeshBasicMaterial({ map: tag }));
      plate.position.set(x, 0.62 + (index % 2) * 0.55, 3.67 + (index % 2) * 0.08);
      motorTrainLayout.add(plate);
    });

    machineLabel(["SINGLE-SPEED MOTOR / PUMP", "VIBRATION TRIP = 0.20 in/s RMS"], 5.8, 0.88, -1.5, 4.55, 5.62, {
      bg: "#15111c",
      accent: "#a278ff",
    });

    // Equipment inspection sign at the start point.
    const welcome = labelPlane(["QUEST 2 MOTOR FLOOR", "POINT + TRIGGER TO INSPECT · TRIGGER FLOOR TO TELEPORT"], 7.8, 1.05, 0, 3.1, 9.8, {
      bg: "#0b1b24",
      accent: "#29c7ff",
    });
    welcome.rotation.y = Math.PI;

    // Desktop movement and pointing.
    const keys = new Set<string>();
    let yaw = -0.28;
    let pitch = -0.08;
    let pointerDown = false;
    let pointerMoved = false;
    let lastX = 0;
    let lastY = 0;
    let hovered: THREE.Object3D | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const findInteractive = (object: THREE.Object3D | null) => {
      let node = object;
      while (node) {
        if (node.userData.inspectId || node.userData.actionKey) return node;
        node = node.parent;
      }
      return null;
    };

    const activateObject = (object: THREE.Object3D | null) => {
      const target = findInteractive(object);
      if (!target) return false;
      if (target.userData.inspectId) setSelectedId(target.userData.inspectId as string);
      const actionKey = target.userData.actionKey as string | undefined;
      if (actionKey) actionRef.current[actionKey]?.();
      return true;
    };

    function desktopRay(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(interactive, true);
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerDown = true;
      pointerMoved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerDown) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) pointerMoved = true;
        yaw -= dx * 0.004;
        pitch = THREE.MathUtils.clamp(pitch - dy * 0.0035, -1.15, 1.0);
        lastX = event.clientX;
        lastY = event.clientY;
      }
      const hit = desktopRay(event)[0];
      const nextHover = findInteractive(hit?.object ?? null);
      if (hovered !== nextHover) {
        renderer.domElement.style.cursor = nextHover ? "pointer" : pointerDown ? "grabbing" : "grab";
        hovered = nextHover;
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
      if (!pointerMoved) activateObject(desktopRay(event)[0]?.object ?? null);
    };
    const onKeyDown = (event: KeyboardEvent) => keys.add(event.key.toLowerCase());
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Quest controller rays: trigger equipment to inspect, console buttons to operate,
    // or the floor to teleport.
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const tempMatrix = new THREE.Matrix4();
    const hitPoint = new THREE.Vector3();
    const controllers: THREE.Group[] = [];
    for (let index = 0; index < 2; index += 1) {
      const controller = renderer.xr.getController(index);
      const rayGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -8)]);
      const rayLine = new THREE.Line(rayGeometry, new THREE.LineBasicMaterial({ color: index === 0 ? 0x29c7ff : 0xffb82e }));
      controller.add(rayLine);
      controller.addEventListener("selectstart", () => {
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        const hits = raycaster.intersectObjects(interactive, true);
        if (hits.length && activateObject(hits[0].object)) return;
        if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
          const xrCamera = renderer.xr.getCamera();
          const head = new THREE.Vector3();
          xrCamera.getWorldPosition(head);
          const dx = hitPoint.x - head.x;
          const dz = hitPoint.z - head.z;
          if (Math.hypot(dx, dz) < 12 && hitPoint.x > -18.5 && hitPoint.x < 18.5 && hitPoint.z > -13 && hitPoint.z < 13) {
            rig.position.x += dx;
            rig.position.z += dz;
          }
        }
      });
      rig.add(controller);
      controllers.push(controller);
    }

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.05);
      if (!renderer.xr.isPresenting) {
        camera.rotation.set(pitch, yaw, 0);
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const move = new THREE.Vector3();
        if (keys.has("w") || keys.has("arrowup")) move.add(forward);
        if (keys.has("s") || keys.has("arrowdown")) move.sub(forward);
        if (keys.has("d") || keys.has("arrowright")) move.add(right);
        if (keys.has("a") || keys.has("arrowleft")) move.sub(right);
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(delta * (keys.has("shift") ? 7 : 3.4));
          rig.position.add(move);
          rig.position.x = THREE.MathUtils.clamp(rig.position.x, -18, 18);
          rig.position.z = THREE.MathUtils.clamp(rig.position.z, -12.5, 13);
        }
      }
      breakerDoorPivots.forEach((pivot) => {
        const target = Number(pivot.userData.targetRotation ?? 0);
        pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, target, Math.min(1, delta * 8));
      });
      Object.values(visualRef.current.gearCarriages ?? {}).forEach((carriage) => {
        if (!carriage) return;
        carriage.position.z = THREE.MathUtils.lerp(carriage.position.z, Number(carriage.userData.targetZ ?? 0.68), Math.min(1, delta * 2.8));
      });
      const running = stateRef.current.motorStatus === "RUNNING";
      if (running) {
        const rotorSpeed = 5.2;
        shaftRotor.rotation.x += delta * rotorSpeed;
        rotatingMotorParts.forEach((rotor) => { rotor.rotation.x += delta * rotorSpeed; });
        syncMotor.rotation.x = Math.sin(clock.elapsedTime * 5) * 0.001;
      }
      if (stateRef.current.mgRunning) mgRotor.rotation.x += delta * 4.8;
      const valveRatio = stateRef.current.valvePosition / 100;
      valveBladePivot.rotation.y = THREE.MathUtils.lerp(valveBladePivot.rotation.y, valveRatio * Math.PI / 2, Math.min(1, delta * 4));
      valvePointer.rotation.z = THREE.MathUtils.lerp(valvePointer.rotation.z, -1.15 + valveRatio * 2.3, Math.min(1, delta * 5));
      actuator.position.y = THREE.MathUtils.lerp(actuator.position.y, 1.04 + valveRatio * 0.34, Math.min(1, delta * 3));
      stem.scale.y = THREE.MathUtils.lerp(stem.scale.y, 1 + valveRatio * 0.48, Math.min(1, delta * 3));
      stem.position.y = 0.62 + (stem.scale.y - 1) * 0.16;
      renderer.render(scene, camera);
    });

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    };
    window.addEventListener("resize", onResize);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controllers.forEach((controller) => rig.remove(controller));
      vrButton.remove();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry?.dispose();
          const mats = Array.isArray(object.material) ? object.material : [object.material];
          mats.forEach((mat) => {
            if (mat && "map" in mat) (mat.map as THREE.Texture | null)?.dispose();
            mat?.dispose();
          });
        }
      });
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const visuals = visualRef.current;
    const setBreaker = (key: BreakerKey, closed: boolean) => {
      const mat = visuals.indicators[key];
      if (!mat) return;
      mat.color.setHex(closed ? 0xe63f3f : 0x39d77c);
      mat.emissive.setHex(closed ? 0x6b0808 : 0x07552a);
    };
    setBreaker("mainA", plant.mainA);
    setBreaker("tie", plant.tie);
    setBreaker("mainB", plant.mainB);
    const setSource = (key: SourceKey, available: boolean) => {
      const mat = visuals.sourceIndicators[key];
      if (!mat) return;
      mat.color.setHex(available ? 0x39d77c : 0xd83b3b);
      mat.emissive.setHex(available ? 0x07552a : 0x5c0707);
    };
    setSource("sourceA", plant.sourceA);
    setSource("sourceB", plant.sourceB);
    const bus1On = busEnergized(plant, "1");
    const bus2On = busEnergized(plant, "2");
    visuals.busA?.color.setHex(bus1On ? 0x22bff4 : 0x354650);
    visuals.busB?.color.setHex(bus2On ? 0x22bff4 : 0x354650);
    if (visuals.eStop) visuals.eStop.emissive.setHex(plant.eStopLatched ? 0xff1010 : 0x4f0505);
    if (visuals.selectorKnob) {
      visuals.selectorKnob.rotation.z = plant.transferPosition === "BUS1" ? 0.82 : plant.transferPosition === "BUS2" ? -0.82 : 0;
    }
    GEAR_BREAKER_DEFS.forEach(({ id }) => {
      const closed = gearBreakerClosed(plant, id);
      const indicator = visuals.gearIndicators?.[id];
      if (indicator) {
        indicator.color.setHex(closed ? 0xe63f3f : 0x39d77c);
        indicator.emissive.setHex(closed ? 0x6b0808 : 0x07552a);
      }
      const lock = visuals.lotoLocks?.[id];
      if (lock) lock.visible = plant.gearBreakers[id].locked || (plant.lotoActive && plant.lotoStep >= 4 && id === plant.lotoTarget);
      const carriage = visuals.gearCarriages?.[id];
      if (carriage) {
        const position = plant.gearBreakers[id].position;
        carriage.userData.targetZ = position === "CONNECTED" ? 0.68 : position === "TEST" ? 0.82 : 1.04;
      }
    });
    BEARING_KEYS.forEach((key) => {
      const mat = visuals.bearingIndicators?.[key];
      if (!mat) return;
      const level = bearingLevel(plant.bearingTemps[key]);
      mat.color.setHex(level === "trip" ? 0xd93636 : level === "alarm" ? 0xffb82e : 0x657780);
      mat.emissive.setHex(level === "trip" ? 0x680707 : level === "alarm" ? 0x654100 : 0x000000);
    });

    const setStarter = (motor: MotorKey, closed: boolean) => {
      const mat = visuals.starterIndicators?.[motor];
      if (!mat) return;
      mat.color.setHex(closed ? 0xe63f3f : 0x39d77c);
      mat.emissive.setHex(closed ? 0x6b0808 : 0x07552a);
    };
    setStarter("low", plant.starterLowClosed);
    const setFieldDevice = (key: "m" | "mg" | "far" | "field" | "resistor" | "k45", active: boolean, activeColor = 0x34d17b) => {
      const mat = visuals.fieldSequence?.[key];
      if (!mat) return;
      mat.color.setHex(active ? activeColor : 0x202a2f);
      mat.emissive.setHex(active ? activeColor : 0x000000);
      mat.emissiveIntensity = active ? 0.24 : 0;
    };
    setFieldDevice("m", plant.mainContactorClosed, 0x29c7ff);
    setFieldDevice("mg", plant.mgRunning, 0xffb82e);
    setFieldDevice("far", plant.farPicked, 0xa278ff);
    setFieldDevice("field", plant.fieldOn, 0x34d17b);
    setFieldDevice("resistor", !plant.fieldOn, 0xff7a3d);
    setFieldDevice("k45", plant.k45Seal, 0x29c7ff);

    if (visuals.relayCanvas && visuals.relayTexture) {
      const relayCtx = visuals.relayCanvas.getContext("2d")!;
      relayCtx.fillStyle = "#11161a";
      relayCtx.fillRect(0, 0, 920, 520);
      relayCtx.fillStyle = plant.motorStatus === "TRIPPED" ? "#ff3434" : "#52d78c";
      relayCtx.fillRect(0, 0, 920, 18);
      relayCtx.fillStyle = "#dfe8eb";
      relayCtx.font = "800 44px Arial";
      relayCtx.textAlign = "left";
      relayCtx.fillText("MOTOR PROTECTION RELAY", 34, 65);
      relayCtx.fillStyle = "#0f2b26";
      relayCtx.fillRect(32, 92, 856, 330);
      relayCtx.strokeStyle = "#7cbca5";
      relayCtx.lineWidth = 5;
      relayCtx.strokeRect(32, 92, 856, 330);
      relayCtx.fillStyle = plant.motorStatus === "TRIPPED" ? "#ff8a7f" : "#bff5d4";
      relayCtx.font = "900 46px monospace";
      relayCtx.fillText(plant.motorStatus === "TRIPPED" ? "TRIP TARGET" : "SYNCHRONOUS MOTOR", 58, 155);
      relayCtx.fillStyle = "#d3eedf";
      relayCtx.font = "700 31px monospace";
      const relayLines = plant.motorStatus === "TRIPPED"
        ? [plant.tripCause ?? "TARGET ACTIVE", relayAcknowledged ? "TARGET ACKNOWLEDGED" : "PRESS ACK / RESET", "OPEN INPUT BEFORE RESET"]
        : [`STATUS  ${plant.motorStatus}`, `I AVG   ${plant.motorStatus === "RUNNING" ? "241 A" : "0 A"}`, `FIELD   ${plant.fieldOn ? "125 VDC / APPLIED" : "DISCHARGE RFD"}`, `VALVE   ${plant.valvePosition}% OPEN`];
      relayLines.forEach((line, index) => relayCtx.fillText(line, 58, 218 + index * 55, 790));
      relayCtx.fillStyle = "#8da2aa";
      relayCtx.font = "800 25px Arial";
      relayCtx.fillText("HOME · METER · THERMAL · I/O · TARGETS · EVENTS", 34, 477);
      visuals.relayTexture.needsUpdate = true;
    }

    if (visuals.ovationCanvas && visuals.ovationTexture) {
      const hmi = visuals.ovationCanvas.getContext("2d")!;
      hmi.fillStyle = "#10171e";
      hmi.fillRect(0, 0, 1280, 720);
      hmi.fillStyle = "#24333d";
      hmi.fillRect(0, 0, 1280, 72);
      hmi.fillStyle = "#f3f7f8";
      hmi.font = "800 34px Arial";
      hmi.textAlign = "left";
      hmi.fillText("DCS · SYNCHRONOUS PUMP DRIVE", 35, 48);
      hmi.fillStyle = plant.controlAuthority === "OVATION" ? "#48df8d" : "#ffbf47";
      hmi.textAlign = "right";
      hmi.fillText(plant.controlAuthority === "OVATION" ? "REMOTE ENABLED" : `${plant.controlAuthority} CONTROL`, 1240, 48);
      hmi.strokeStyle = "#38bfe8";
      hmi.lineWidth = 8;
      hmi.beginPath();
      hmi.moveTo(90, 230);
      hmi.lineTo(1190, 230);
      hmi.stroke();
      const hmiCells: Array<[string, string, number, string]> = [
        ["BUS", "BUS 1", 60, busEnergized(plant, "1") ? "#48df8d" : "#ff5959"],
        ["STARTER", starterClosed(plant, plant.selectedMotor) ? "CLOSED" : "OPEN", 300, starterClosed(plant, plant.selectedMotor) ? "#ff6666" : "#48df8d"],
        ["MOTOR", plant.motorStatus, 540, plant.motorStatus === "TRIPPED" ? "#ff5959" : plant.motorStatus === "RUNNING" ? "#48df8d" : "#d2dde1"],
        ["FIELD", plant.fieldOn ? "APPLIED" : "RFD", 780, plant.fieldOn ? "#48df8d" : "#ff9b53"],
        ["VALVE", `${plant.valvePosition}%`, 1020, plant.valvePosition >= 30 ? "#48df8d" : "#ffbf47"],
      ];
      hmiCells.forEach(([label, value, x, color]) => {
        hmi.fillStyle = "#17242d";
        hmi.fillRect(x, 130, 200, 200);
        hmi.strokeStyle = color;
        hmi.lineWidth = 5;
        hmi.strokeRect(x, 130, 200, 200);
        hmi.fillStyle = "#8faab7";
        hmi.font = "800 24px Arial";
        hmi.textAlign = "center";
        hmi.fillText(label, x + 100, 180);
        hmi.fillStyle = color;
        hmi.font = "900 33px Arial";
        hmi.fillText(value, x + 100, 260, 180);
      });
      hmi.fillStyle = plant.tripCause ? "#5a1717" : "#163229";
      hmi.fillRect(60, 380, 1160, 105);
      hmi.fillStyle = plant.tripCause ? "#ff8a82" : "#76edaa";
      hmi.font = "900 30px Arial";
      hmi.textAlign = "left";
      hmi.fillText(plant.tripCause ? `RELAY TRIP · ${plant.tripCause}` : "RELAY HEALTHY · REMOTE PATH SUPERVISED", 85, 425, 1100);
      hmi.fillStyle = "#c3d2d8";
      hmi.font = "700 24px Arial";
      hmi.fillText(plant.motorEvent, 85, 463, 1100);
      hmi.fillStyle = "#263943";
      hmi.fillRect(60, 530, 1160, 120);
      hmi.fillStyle = "#dbe8ed";
      hmi.font = "800 25px Arial";
      hmi.fillText("PERMISSIVES", 85, 570);
      hmi.font = "700 23px Arial";
      hmi.fillText(`VLV-CLS ${plant.valvePosition === 0 ? "YES" : "NO"}  ·  K45 ${plant.k45Seal ? "ON" : "OFF"}  ·  M-G ${plant.mgRunning ? "READY" : "OFF"}  ·  56 ${plant.farPicked ? "PICKED" : "DROP"}  ·  41 ${plant.fieldOn ? "CLOSED" : "OPEN"}`, 85, 615, 1080);
      visuals.ovationTexture.needsUpdate = true;
    }

    if (visuals.trainingCanvas && visuals.trainingTexture) {
      const trainingCtx = visuals.trainingCanvas.getContext("2d")!;
      const hottestKey = BEARING_KEYS.reduce((hottest, key) => plant.bearingTemps[key] > plant.bearingTemps[hottest] ? key : hottest, BEARING_KEYS[0]);
      const hottestLevel = bearingLevel(plant.bearingTemps[hottestKey]);
      const alarmActive = hottestLevel !== "normal";
      const vibrationTrip = plant.motorVibration >= VIBRATION_TRIP || plant.pumpVibration >= VIBRATION_TRIP;
      const protectionState = plant.motorStatus === "TRIPPED" ? "TRIP LATCHED" : alarmActive ? "ALARM" : "HEALTHY";
      const protectionColor = plant.motorStatus === "TRIPPED" ? "#ff5555" : alarmActive ? "#ffbf3f" : "#55e598";
      trainingCtx.fillStyle = "#09141b";
      trainingCtx.fillRect(0, 0, 900, 620);
      trainingCtx.fillStyle = "#a278ff";
      trainingCtx.fillRect(0, 0, 900, 22);
      trainingCtx.fillStyle = "#f4fbff";
      trainingCtx.font = "900 50px Arial";
      trainingCtx.textAlign = "left";
      trainingCtx.fillText("MOTOR-RELAY TRAINING INPUTS", 35, 78);
      trainingCtx.fillStyle = plant.activeFault === "none" ? "#55e598" : "#ff7777";
      trainingCtx.font = "800 30px Arial";
      trainingCtx.fillText(plant.activeFault === "none" ? "FAULT: CLEAR" : `FAULT: ${FAULT_TARGETS[plant.activeFault]} ACTIVE`, 35, 128);
      trainingCtx.fillStyle = "#a8c2cd";
      trainingCtx.font = "700 24px Arial";
      trainingCtx.fillText(`SELECTED: ${FAULT_LABELS[plant.faultSelection]}`, 35, 168, 830);
      const cells: Array<[string, string, string, number]> = [
        ["SELECTED RTD", `${BEARING_LABELS[plant.selectedBearing]} · ${plant.bearingTemps[plant.selectedBearing]}°C`, bearingLevel(plant.bearingTemps[plant.selectedBearing]) === "trip" ? "#ff5555" : bearingLevel(plant.bearingTemps[plant.selectedBearing]) === "alarm" ? "#ffbf3f" : "#55e598", 210],
        ["HOTTEST RTD", `${BEARING_LABELS[hottestKey]} · ${plant.bearingTemps[hottestKey]}°C`, hottestLevel === "trip" ? "#ff5555" : hottestLevel === "alarm" ? "#ffbf3f" : "#55e598", 320],
        ["MOTOR VIB", `${plant.motorVibration.toFixed(2)} in/s · T=0.20`, plant.motorVibration >= VIBRATION_TRIP ? "#ff5555" : "#55e598", 430],
        ["PUMP VIB", `${plant.pumpVibration.toFixed(2)} in/s · T=0.20`, plant.pumpVibration >= VIBRATION_TRIP ? "#ff5555" : "#55e598", 540],
      ];
      cells.forEach(([label, value, color, y]) => {
        trainingCtx.fillStyle = "#10252f";
        trainingCtx.fillRect(30, y - 28, 840, 88);
        trainingCtx.strokeStyle = color;
        trainingCtx.lineWidth = 5;
        trainingCtx.strokeRect(30, y - 28, 840, 88);
        trainingCtx.fillStyle = "#a9c0ca";
        trainingCtx.font = "800 22px Arial";
        trainingCtx.fillText(label, 52, y + 3);
        trainingCtx.fillStyle = color;
        trainingCtx.font = "900 28px Arial";
        trainingCtx.textAlign = "right";
        trainingCtx.fillText(value, 845, y + 22, 570);
        trainingCtx.textAlign = "left";
      });
      trainingCtx.fillStyle = protectionColor;
      trainingCtx.font = "900 30px Arial";
      trainingCtx.textAlign = "center";
      trainingCtx.fillText(`RELAY ${protectionState}${vibrationTrip ? " · VIB" : ""}`, 450, 606);
      visuals.trainingTexture.needsUpdate = true;
    }

    if (visuals.valveCanvas && visuals.valveTexture) {
      const valveCtx = visuals.valveCanvas.getContext("2d")!;
      valveCtx.fillStyle = "#0b1c24";
      valveCtx.fillRect(0, 0, 1100, 360);
      valveCtx.fillStyle = "#ffb82e";
      valveCtx.fillRect(0, 0, 1100, 24);
      valveCtx.fillStyle = "#f4fbff";
      valveCtx.font = "800 76px Arial";
      valveCtx.textAlign = "center";
      valveCtx.fillText("36 in VENTURI VALVE", 550, 105);
      valveCtx.fillStyle = "#102d38";
      valveCtx.fillRect(95, 155, 910, 95);
      valveCtx.fillStyle = plant.valvePosition >= 30 ? "#34d17b" : "#ffb82e";
      valveCtx.fillRect(95, 155, 9.1 * plant.valvePosition, 95);
      valveCtx.strokeStyle = "#dbeaf0";
      valveCtx.lineWidth = 8;
      valveCtx.strokeRect(95, 155, 910, 95);
      valveCtx.fillStyle = "#ffffff";
      valveCtx.font = "900 72px Arial";
      valveCtx.fillText(`${plant.valvePosition}% OPEN`, 550, 232);
      valveCtx.fillStyle = "#a9c1cc";
      valveCtx.font = "700 38px Arial";
      valveCtx.fillText("30% MINIMUM WHILE RUNNING · CLOSE LIMIT → K45", 550, 315);
      visuals.valveTexture.needsUpdate = true;
    }

    const canvas = visuals.boardCanvas;
    if (canvas && visuals.boardTexture) {
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#07141c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const motorColor = plant.motorStatus === "TRIPPED" ? "#ff4545" : plant.motorStatus === "RUNNING" ? "#34d17b" : plant.motorStatus === "STARTING" ? "#29c7ff" : "#78909a";
      ctx.fillStyle = plant.lotoActive ? "#ffd21f" : motorColor;
      ctx.fillRect(0, 0, canvas.width, 28);
      ctx.fillStyle = "#f3fbff";
      ctx.font = "800 58px Arial";
      ctx.textAlign = "left";
      ctx.fillText("MOTOR · VALVE · MTM CONTROL MIMIC", 45, 82);
      ctx.fillStyle = motorColor;
      ctx.textAlign = "right";
      ctx.fillText(plant.motorStatus, 1355, 82);
      ctx.textAlign = "left";
      ctx.fillStyle = "#9db9c7";
      ctx.font = "700 29px Arial";
      ctx.fillText(plant.motorEvent, 45, 125, 1310);

      const statusCells: Array<[string, string, boolean, number]> = [
        ["MOTOR", "SINGLE SPEED · BUS 1", true, 45],
        ["M-G SET", plant.mgRunning ? "RUNNING" : "STOPPED", plant.mgRunning, 375],
        ["FIELD", plant.fieldOn ? "APPLIED" : "OFF", plant.fieldOn, 705],
        ["SELECTOR", plant.transferPosition === "BUS1" ? "ALL BUS 1" : plant.transferPosition === "BUS2" ? "ALL BUS 2" : "NORMAL", true, 1035],
      ];
      statusCells.forEach(([name, value, good, x]) => {
        ctx.fillStyle = "#10252f";
        ctx.fillRect(x, 155, 285, 118);
        ctx.strokeStyle = good ? "#34d17b" : "#385766";
        ctx.lineWidth = 6;
        ctx.strokeRect(x, 155, 285, 118);
        ctx.fillStyle = "#f4fbff";
        ctx.font = "800 27px Arial";
        ctx.textAlign = "left";
        ctx.fillText(name, x + 18, 193);
        ctx.fillStyle = good ? "#55e598" : "#b7c8d0";
        ctx.font = "900 34px Arial";
        ctx.fillText(value, x + 18, 244, 250);
      });

      ctx.fillStyle = "#10252f";
      ctx.fillRect(45, 305, 1310, 105);
      ctx.fillStyle = plant.valvePosition >= 30 ? "#34d17b" : "#ffb82e";
      ctx.fillRect(55, 315, 12.9 * plant.valvePosition, 85);
      ctx.strokeStyle = "#8caab7";
      ctx.lineWidth = 6;
      ctx.strokeRect(45, 305, 1310, 105);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 48px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`VENTURI VALVE · ${plant.valvePosition}% OPEN`, 700, 375);

      const cells: Array<[string, boolean, number, string]> = [
        ["52-M1", plant.mainA, 45, `BUS 1 ${bus1On ? "LIVE" : "DEAD"}`],
        ["52-T", plant.tie, 485, plant.sequence],
        ["52-M2", plant.mainB, 925, `BUS 2 ${bus2On ? "LIVE" : "DEAD"}`],
      ];
      cells.forEach(([name, closed, x, subtitle]) => {
        ctx.fillStyle = "#0d2029";
        ctx.fillRect(x, 445, 390, 135);
        ctx.strokeStyle = closed ? "#ff5454" : "#48df8d";
        ctx.lineWidth = 7;
        ctx.strokeRect(x, 445, 390, 135);
        ctx.fillStyle = "#f4fbff";
        ctx.font = "800 34px Arial";
        ctx.textAlign = "left";
        ctx.fillText(name, x + 20, 488);
        ctx.fillStyle = closed ? "#ff6d6d" : "#55e598";
        ctx.textAlign = "right";
        ctx.fillText(statusWord(closed), x + 370, 488);
        ctx.fillStyle = "#89a8b6";
        ctx.font = "700 23px Arial";
        ctx.textAlign = "left";
        ctx.fillText(subtitle, x + 20, 545, 350);
      });

      ctx.fillStyle = plant.lotoActive ? "#3d3500" : "#0d2029";
      ctx.fillRect(45, 615, 1310, 68);
      ctx.fillStyle = plant.lotoActive ? "#ffe75f" : plant.overlap ? "#ffcd59" : "#b4ceda";
      ctx.font = "800 27px Arial";
      ctx.textAlign = "left";
      ctx.fillText(plant.lotoActive ? `LOTO ACTIVE · ${plant.lotoTarget.toUpperCase()} · STEP ${plant.lotoStep}/7` : plant.event, 65, 660, 1270);
      visuals.boardTexture.needsUpdate = true;
    }
  }, [plant, relayAcknowledged]);

  const hottestBearing = BEARING_KEYS.reduce(
    (hottest, key) => plant.bearingTemps[key] > plant.bearingTemps[hottest] ? key : hottest,
    BEARING_KEYS[0],
  );
  const hottestBearingLevel = bearingLevel(plant.bearingTemps[hottestBearing]);
  const vibrationTripActive = plant.motorVibration >= VIBRATION_TRIP || plant.pumpVibration >= VIBRATION_TRIP;
  const protectionAlarmActive = hottestBearingLevel === "alarm";
  const protectionLabel = plant.motorStatus === "TRIPPED"
    ? "RELAY TRIP"
    : protectionAlarmActive
      ? "RELAY ALARM"
      : "RELAY HEALTHY";
  const selectedBus = "1" as const;
  const selectedStarterClosed = plant.starterLowClosed;
  const selectedGearDefinition = GEAR_BREAKER_BY_ID[selectedGearId];
  const selectedGearState = plant.gearBreakers[selectedGearId];
  const selectedGearClosed = gearBreakerClosed(plant, selectedGearId);
  const rackReady = rackChecks.identity && rackChecks.coupled && rackChecks.floorLock && rackChecks.areaClear && !selectedGearClosed;
  const relayPageData = useMemo(() => {
    const runningCurrent = "241 A";
    const rowsByPage: Record<RelayPage, Array<[string, string]>> = {
      home: [
        ["Motor", "SINGLE SPEED · 2,500 hp"],
        ["State", plant.motorStatus],
        ["Control", authorityDisplay(plant.controlAuthority)],
        ["Target", plant.tripCause ?? "NONE"],
      ],
      metering: [
        ["Ia / Ib / Ic", plant.motorStatus === "RUNNING" ? `${runningCurrent} / ${runningCurrent} / ${runningCurrent}` : "0 / 0 / 0 A"],
        ["Vab / Vbc / Vca", busEnergized(plant, selectedBus) ? "4.80 / 4.79 / 4.81 kV" : "0 / 0 / 0 kV"],
        ["Power", plant.motorStatus === "RUNNING" ? "1.62 MW · 0.94 PF" : "0.00 MW"],
        ["Field", plant.fieldOn ? "125 VDC · APPLIED" : "RFD CONNECTED"],
      ],
      thermal: [
        ["Thermal capacity", plant.motorStatus === "RUNNING" ? "42% USED" : "18% USED"],
        ["Hottest RTD", `${BEARING_LABELS[hottestBearing]} · ${plant.bearingTemps[hottestBearing]}°C`],
        ["Motor vibration", `${plant.motorVibration.toFixed(2)} in/s RMS`],
        ["Pump vibration", `${plant.pumpVibration.toFixed(2)} in/s RMS`],
      ],
      inputs: [
        ["52 starter / M", `${selectedStarterClosed ? "CLOSED" : "OPEN"} / ${plant.mainContactorClosed ? "PICKED" : "DROP"}`],
        ["VLV-CLS / K45", `${plant.valvePosition === 0 ? "ON" : "OFF"} / ${plant.k45Seal ? "PICKED" : "DROP"}`],
        ["M-G / 125 VDC", `${plant.mgRunning ? "RUN" : "STOP"} / ${plant.mgRunning ? "READY" : "OFF"}`],
        ["56/FAR / 41", `${plant.farPicked ? "PICKED" : "DROP"} / ${plant.fieldOn ? "CLOSED" : "OPEN"}`],
      ],
      targets: [
        ["Trip", plant.tripCause ?? "NO ACTIVE TARGET"],
        ["Acknowledged", relayAcknowledged ? "YES" : plant.tripCause ? "NO" : "N/A"],
        ["Alarm", protectionAlarmActive ? `${BEARING_LABELS[hottestBearing]} ≥75°C` : "NONE"],
        ["Reset permissive", activeProtectionInput(plant) ?? (plant.motorStatus === "TRIPPED" ? "READY — PRESS RESET" : "NO RESET REQUIRED")],
      ],
      events: [
        ["1 · Motor", plant.motorEvent],
        ["2 · Power", plant.event],
        ["3 · Sequence", `M ${plant.mainContactorClosed ? "1" : "0"} · MG ${plant.mgRunning ? "1" : "0"} · 56 ${plant.farPicked ? "1" : "0"} · 41 ${plant.fieldOn ? "1" : "0"}`],
        ["4 · Valve", `${plant.valvePosition}% · K45 ${plant.k45Seal ? "ON" : "OFF"}`],
      ],
    };
    return rowsByPage[relayPage];
  }, [hottestBearing, plant, protectionAlarmActive, relayAcknowledged, relayPage, selectedBus, selectedStarterClosed]);

  const moveRelayPage = useCallback((direction: number) => {
    const currentIndex = RELAY_PAGES.findIndex(({ id }) => id === relayPage);
    const nextIndex = (currentIndex + direction + RELAY_PAGES.length) % RELAY_PAGES.length;
    setRelayPage(RELAY_PAGES[nextIndex].id);
    playEquipmentSound("selector");
  }, [playEquipmentSound, relayPage]);

  return (
    <main className="motor-floor-shell">
      <div ref={mountRef} className="motor-floor-canvas" aria-label="Interactive 3D medium-voltage synchronous motor training floor" />

      {webglUnavailable && (
        <section className="webgl-fallback" role="status">
          <div className="fallback-room" aria-hidden="true">
            <div className="fallback-lineup">
              {["A1/A5", "A2/A6", "A3/A7", "A4/A8", "M1", "TIE", "M2", "B1/B5", "B2/B6", "B3/B7", "B4/B8"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="fallback-machine"><i /><b>2500 HP SYNCHRONOUS</b><em>PUMP</em></div>
          </div>
          <div className="fallback-message">
            <span className="vr-kicker">3D HARDWARE UNAVAILABLE</span>
            <h2>This browser could not start WebGL.</h2>
            <p>The unified motor, valve, MTM, fault/RTD/vibration, and LOTO controls still work below. Open this page in Meta Quest Browser or a hardware-accelerated laptop browser for the walk-through motor floor.</p>
            <a href="/simulator-v5.html?v=6">Open the full 2D simulator</a>
          </div>
        </section>
      )}

      <header className="vr-topbar">
        <div>
          <span className="vr-kicker">MEDIUM-VOLTAGE SYNCHRONOUS MOTOR TRAINER</span>
          <h1>Interactive motor floor · WebXR</h1>
        </div>
        <div className="vr-top-actions">
          <span className={`vr-state-pill ${plant.lotoActive || plant.overlap ? "parallel" : plant.busy ? "active" : "ready"}`}>
            {plant.lotoActive ? `LOTO · STEP ${plant.lotoStep}/7` : plant.overlap ? "CLOSED TRANSITION" : plant.busy ? "SEQUENCE ACTIVE" : `${plant.motorStatus} · ${plant.sequence}`}
          </span>
          <button className="vr-icon-button sound-button" type="button" onClick={toggleSound} aria-pressed={soundEnabled}>{soundEnabled ? "Sound on" : "Sound off"}</button>
          <button className="vr-icon-button relay-top-button" type="button" onClick={() => setRelayOpen(true)}>Motor relay</button>
          <button className="vr-icon-button ovation-top-button" type="button" onClick={() => setOvationOpen(true)}>DCS</button>
          <button className="vr-icon-button rack-top-button" type="button" onClick={() => openGearStation(selectedGearId)}>Breakers / RRS-1</button>
          <button className="vr-icon-button loto-top-button" type="button" onClick={() => setLotoOpen(true)}>LOTO</button>
          <button className="vr-icon-button" type="button" onClick={() => setHelpOpen((open) => !open)} aria-expanded={helpOpen}>
            Help
          </button>
          <a className="vr-icon-button" href="/simulator-v5.html?v=6">Legacy 2D</a>
        </div>
      </header>

      {helpOpen && (
        <section className="vr-help-card" aria-label="Controls">
          <button className="vr-close" type="button" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button>
          <span className="vr-kicker">HOW TO MOVE</span>
          <h2>Laptop, tablet, or Quest 2</h2>
          <p><strong>Laptop:</strong> drag to look, W/A/S/D to walk, and click equipment to inspect it.</p>
          <p><strong>Quest 2:</strong> choose Enter VR, point at equipment and squeeze the trigger. Point at the floor and squeeze to teleport.</p>
          <p>The normally scaled control board, attached fault/RTD/vibration training bay, exciter-cabinet controls, local breaker OPEN/CLOSE buttons, selector, animated valve, and LOTO station also work from the headset. Equipment sound begins after the first control is pressed.</p>
        </section>
      )}

      <aside className="inspection-card" aria-live="polite">
        <div className="inspection-heading">
          <div>
            <span className="vr-kicker">{selected.eyebrow}</span>
            <h2>{selected.title}</h2>
          </div>
          <span className="inspection-dot" />
        </div>
        <p>{selected.description}</p>
        <dl>
          {selected.rows.map(([label, value]) => (
            <div key={`${label}-${value}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {selected.note && <p className="inspection-note">{selected.note}</p>}
      </aside>

      {relayOpen && (
        <section className="relay-dialog" role="dialog" aria-modal="true" aria-labelledby="relay-title">
          <button className="vr-close relay-close" type="button" onClick={() => setRelayOpen(false)} aria-label="Close motor relay">×</button>
          <div className="relay-869-bezel">
            <header className="relay-brand-row">
              <div><span>MOTOR RELAY</span><strong id="relay-title">MPR</strong><small>Protection &amp; Control</small></div>
              <div className="relay-usb"><i />USB</div>
            </header>
            <div className="relay-led-bank" aria-label="Relay target LEDs">
              <span className="on green"><i />IN SERVICE</span>
              <span className={protectionAlarmActive ? "on amber" : ""}><i />ALARM</span>
              <span className={plant.motorStatus === "STARTING" ? "on amber" : ""}><i />PICKUP</span>
              <span className={plant.motorStatus === "TRIPPED" ? "on red" : ""}><i />TRIP</span>
              <span className={plant.controlAuthority === "OVATION" ? "on blue" : ""}><i />REMOTE</span>
            </div>
            <div className={`relay-lcd ${plant.motorStatus === "TRIPPED" ? "trip" : ""}`}>
              <div className="relay-lcd-title"><span>{RELAY_PAGES.find(({ id }) => id === relayPage)?.label}</span><b>{plant.motorStatus === "TRIPPED" ? "TARGET" : "MPR"}</b></div>
              <div className="relay-lcd-mimic">
                <span className={busEnergized(plant, selectedBus) ? "live" : "dead"}>BUS {selectedBus}</span>
                <i className={selectedStarterClosed ? "closed" : "open"} />
                <span className={plant.mainContactorClosed ? "live" : "dead"}>M</span>
                <i className={plant.fieldOn ? "closed" : "open"} />
                <span className={plant.fieldOn ? "live" : "dead"}>FIELD</span>
              </div>
              <dl className="relay-lcd-rows">
                {relayPageData.map(([label, value]) => <div key={`${relayPage}-${label}`}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
              <div className="relay-lcd-footer">{plant.tripCause ? (relayAcknowledged ? "TARGET ACKNOWLEDGED · CLEAR CAUSE BEFORE RESET" : "NEW TARGET · PRESS ACK") : "ESC = BACK · ▲/▼ = PAGE · ENTER = SELECT"}</div>
            </div>
            <div className="relay-softkeys" role="group" aria-label="Motor-relay display pages">
              {RELAY_PAGES.map(({ id, label }) => <button type="button" className={relayPage === id ? "active" : ""} onClick={() => setRelayPage(id)} key={id}>{label}</button>)}
            </div>
            <div className="relay-keypad">
              <button type="button" onClick={() => setRelayPage("home")}>HOME</button>
              <button type="button" onClick={() => moveRelayPage(-1)}>▲</button>
              <button type="button" onClick={() => setRelayAcknowledged(true)} disabled={!plant.tripCause || relayAcknowledged}>ACK</button>
              <button type="button" onClick={() => moveRelayPage(-1)}>◀</button>
              <button type="button" className="enter-key" onClick={() => setRelayOpen(true)}>ENTER</button>
              <button type="button" onClick={() => moveRelayPage(1)}>▶</button>
              <button type="button" onClick={() => setRelayPage("home")}>ESC</button>
              <button type="button" onClick={() => moveRelayPage(1)}>▼</button>
              <button type="button" className="reset-key" onClick={resetMotor}>RESET</button>
            </div>
            <footer className="relay-footer-strip">
              <span>DRAWOUT MOTOR PROTECTION</span><span>CT · VT · RTD · DIGITAL I/O · ETHERNET</span>
            </footer>
          </div>
          <p className="relay-model-note">Manufacturer-neutral training representation of a modern motor-protection relay. Pages and values follow this simulator; the installed relay manual, settings file, and approved procedure remain authoritative.</p>
        </section>
      )}

      {ovationOpen && (
        <section className="ovation-dialog" role="dialog" aria-modal="true" aria-labelledby="ovation-title">
          <button className="vr-close" type="button" onClick={() => setOvationOpen(false)} aria-label="Close DCS station">×</button>
          <header className="ovation-dialog-header">
            <div><span className="vr-kicker">REMOTE DCS OPERATOR STATION</span><h2 id="ovation-title">DCS · synchronous pump drive</h2></div>
            <div className="ovation-comm"><i />CONTROLLER LINK HEALTHY</div>
          </header>
          <div className="ovation-authority" role="group" aria-label="Motor control authority">
            <span>CONTROL AUTHORITY</span>
            <button type="button" className={plant.controlAuthority === "OVATION" ? "selected" : ""} onClick={() => setControlAuthority("OVATION")}>DCS / Remote</button>
            <button type="button" className={plant.controlAuthority === "FIELD" ? "selected" : ""} onClick={() => setControlAuthority("FIELD")}>Field local</button>
            <button type="button" className={plant.controlAuthority === "STARTER" ? "selected" : ""} onClick={() => setControlAuthority("STARTER")}>Starter local</button>
          </div>
          <div className="ovation-mimic" aria-label="Motor sequence mimic">
            {([
              ["BUS", `BUS ${selectedBus}`, busEnergized(plant, selectedBus)],
              ["52 STARTER", selectedStarterClosed ? "CLOSED" : "OPEN", selectedStarterClosed],
              ["M CONTACTOR", plant.mainContactorClosed ? "PICKED" : "DROP", plant.mainContactorClosed],
              ["M-G / DC", plant.mgRunning ? "125 VDC" : "OFF", plant.mgRunning],
              ["56 / FAR", plant.farPicked ? "PICKED" : "DROP", plant.farPicked],
              ["41 FIELD", plant.fieldOn ? "CLOSED" : "OPEN", plant.fieldOn],
              ["VALVE", `${plant.valvePosition}%`, plant.valvePosition >= 30],
            ] as Array<[string, string, boolean]>).map(([label, value, active], index) => (
              <div className={active ? "active" : ""} key={label}><span>{label}</span><strong>{value}</strong>{index < 6 && <i />}</div>
            ))}
          </div>
          <div className="ovation-work-area">
            <section className="ovation-command-card">
              <header><span>MOTOR COMMAND</span><b className={plant.controlAuthority === "OVATION" ? "ready" : "blocked"}>{plant.controlAuthority === "OVATION" ? "REMOTE ENABLED" : "REMOTE BLOCKED"}</b></header>
              <div className="ovation-speed-select">
                <button type="button" className="selected" onClick={() => selectMotor("low", "ovation")}>SINGLE SPEED · 2,500 hp · BUS 1</button>
              </div>
              <div className="ovation-command-buttons">
                <button type="button" className="start-control" onClick={() => startMotor("ovation")}>START</button>
                <button type="button" className="stop-control" onClick={() => stopMotor("ovation")}>NORMAL STOP</button>
                <button type="button" className="reset-button" onClick={resetMotor}>RELAY RESET</button>
                <button type="button" className="estop-control" onClick={emergencyStop}>EMERGENCY TRIP</button>
              </div>
              <div className="ovation-valve-control">
                <span>36 in Venturi valve</span><strong>{plant.valvePosition}% OPEN</strong>
                <div><button type="button" onClick={() => adjustValve(10)}>OPEN +10%</button><button type="button" onClick={() => adjustValve(-10)}>CLOSE −10%</button></div>
              </div>
            </section>
            <section className="ovation-status-card">
              <header><span>START PERMISSIVES / PROTECTION</span><button type="button" onClick={() => setRelayOpen(true)}>OPEN MOTOR RELAY</button></header>
              <ul className="ovation-permissives">
                <li className={busEnergized(plant, selectedBus) ? "good" : "bad"}><i />Bus {selectedBus} energized</li>
                <li className={selectedStarterClosed ? "good" : "bad"}><i />Selected starter 52 closed</li>
                <li className={plant.valvePosition === 0 && plant.activeFault !== "valve-closed-proof" ? "good" : "bad"}><i />VLV-CLS closed-limit proof</li>
                <li className={!plant.eStopLatched && plant.motorStatus !== "TRIPPED" ? "good" : "bad"}><i />Motor relay / emergency-stop chain healthy</li>
                <li className={!plant.lotoActive ? "good" : "bad"}><i />LOTO start inhibit clear</li>
                <li className={plant.controlAuthority === "OVATION" ? "good" : "bad"}><i />Remote authority selected</li>
              </ul>
              <div className={`ovation-protection-banner ${plant.motorStatus === "TRIPPED" ? "trip" : protectionAlarmActive ? "alarm" : "healthy"}`}>
                <strong>{protectionLabel}</strong><span>{plant.tripCause ?? plant.motorEvent}</span>
              </div>
              <div className="ovation-starter-remote">
                <span>MOTOR FEEDER</span>
                <div><b>52-A1 · {statusWord(plant.starterLowClosed)}</b><button type="button" onClick={() => operateStarter("low", true, "DCS")}>CLOSE</button><button type="button" onClick={() => operateStarter("low", false, "DCS")}>OPEN</button></div>
                <button type="button" onClick={() => openGearStation("A1")}>OPEN BREAKER / RACKING WORKSTATION</button>
              </div>
            </section>
          </div>
          <footer className="ovation-footer"><span>{plant.event}</span><b>{new Date(0).toISOString().slice(11, 19)} · TRAINING CLOCK</b></footer>
        </section>
      )}

      {gearDialogOpen && (
        <section className="gear-dialog" role="dialog" aria-modal="true" aria-labelledby="gear-dialog-title">
          <button className="vr-close" type="button" onClick={() => setGearDialogOpen(false)} aria-label="Close breaker workstation">×</button>
          <header className="gear-dialog-header">
            <div>
              <span className="vr-kicker">EATON VCP-W LINEUP · BREAKER WORKSTATION</span>
              <h2 id="gear-dialog-title">{selectedGearDefinition.label} · {selectedGearDefinition.duty}</h2>
            </div>
            <div className={`gear-state-badge ${selectedGearClosed ? "closed" : "open"}`}>
              <strong>{selectedGearClosed ? "CLOSED" : "OPEN"}</strong>
              <span>{selectedGearState.position}</span>
            </div>
          </header>

          <div className="gear-selector-row">
            <label htmlFor="gear-breaker-select">Selected breaker</label>
            <select id="gear-breaker-select" value={selectedGearId} onChange={(event) => openGearStation(event.target.value as GearBreakerId, gearTab)}>
              <optgroup label="Bus 1 · upper">
                {BUS_1_UPPER.map((id) => <option key={id} value={id}>{GEAR_BREAKER_BY_ID[id].label} · {GEAR_BREAKER_BY_ID[id].duty}</option>)}
              </optgroup>
              <optgroup label="Bus 1 · lower">
                {BUS_1_LOWER.map((id) => <option key={id} value={id}>{GEAR_BREAKER_BY_ID[id].label} · {GEAR_BREAKER_BY_ID[id].duty}</option>)}
              </optgroup>
              <optgroup label="Main–tie–main">
                {(["mainA", "tie", "mainB"] as GearBreakerId[]).map((id) => <option key={id} value={id}>{GEAR_BREAKER_BY_ID[id].label} · {GEAR_BREAKER_BY_ID[id].duty}</option>)}
              </optgroup>
              <optgroup label="Bus 2 · upper">
                {BUS_2_UPPER.map((id) => <option key={id} value={id}>{GEAR_BREAKER_BY_ID[id].label} · {GEAR_BREAKER_BY_ID[id].duty}</option>)}
              </optgroup>
              <optgroup label="Bus 2 · lower">
                {BUS_2_LOWER.map((id) => <option key={id} value={id}>{GEAR_BREAKER_BY_ID[id].label} · {GEAR_BREAKER_BY_ID[id].duty}</option>)}
              </optgroup>
            </select>
          </div>

          <div className="gear-lineup-map" aria-label="Double-ended lineup breaker selector">
            <div className="gear-map-bus">
              <span>BUS 1</span>
              {BUS_1_UPPER.map((upper, index) => (
                <div key={upper} className="gear-map-stack">
                  {[upper, BUS_1_LOWER[index]].map((id) => <button type="button" className={selectedGearId === id ? "selected" : ""} onClick={() => openGearStation(id, gearTab)} key={id}>{id}</button>)}
                </div>
              ))}
            </div>
            <div className="gear-map-center">
              {(["mainA", "tie", "mainB"] as GearBreakerId[]).map((id) => <button type="button" className={selectedGearId === id ? "selected" : ""} onClick={() => openGearStation(id, gearTab)} key={id}>{GEAR_BREAKER_BY_ID[id].label}</button>)}
            </div>
            <div className="gear-map-bus">
              <span>BUS 2</span>
              {BUS_2_UPPER.map((upper, index) => (
                <div key={upper} className="gear-map-stack">
                  {[upper, BUS_2_LOWER[index]].map((id) => <button type="button" className={selectedGearId === id ? "selected" : ""} onClick={() => openGearStation(id, gearTab)} key={id}>{id}</button>)}
                </div>
              ))}
            </div>
          </div>

          <nav className="gear-tabs" aria-label="Breaker workstation pages">
            <button type="button" className={gearTab === "controls" ? "selected" : ""} onClick={() => setGearTab("controls")}>Breaker / LOTO</button>
            <button type="button" className={gearTab === "racking" ? "selected" : ""} onClick={() => setGearTab("racking")}>ArcSafe RRS-1</button>
            <button type="button" className={gearTab === "sop" ? "selected" : ""} onClick={() => setGearTab("sop")}>Breaker SOP</button>
          </nav>

          {gearTab === "controls" && (
            <div className="gear-work-area">
              <section className="gear-control-card">
                <header><span>LOCAL BREAKER CONTROL</span><b>{selectedGearState.position}</b></header>
                <div className="gear-control-buttons">
                  <button type="button" className="close-command" disabled={selectedGearClosed || selectedGearState.racking} onClick={() => operateGearBreaker(selectedGearId, true, "breaker workstation")}>CLOSE</button>
                  <button type="button" className="open-command" disabled={!selectedGearClosed || selectedGearState.racking} onClick={() => operateGearBreaker(selectedGearId, false, "breaker workstation")}>OPEN / TRIP</button>
                </div>
                <dl className="gear-status-list">
                  <div><dt>Primary position</dt><dd>{selectedGearState.position}</dd></div>
                  <div><dt>52 status</dt><dd>{selectedGearClosed ? "CLOSED" : "OPEN"}</dd></div>
                  <div><dt>Shutters</dt><dd>{selectedGearState.position === "DISCONNECTED" ? "CLOSED" : "OPEN / ENGAGED"}</dd></div>
                  <div><dt>Protection / metering</dt><dd>Relay healthy · IQ online</dd></div>
                  <div><dt>Close permissive</dt><dd>{!selectedGearClosed && selectedGearState.position === "CONNECTED" && !selectedGearState.locked ? "READY" : "NOT READY"}</dd></div>
                </dl>
                <button type="button" className="rack-launch" onClick={() => setGearTab("racking")}>Open remote racking console</button>
              </section>

              <section className={`gear-loto-card ${selectedGearState.locked ? "locked" : ""}`}>
                <header><span>BREAKER ISOLATION HARDWARE</span><b>{selectedGearState.locked ? "LOCKED OUT" : "AVAILABLE"}</b></header>
                <div className="gear-lock-visual" aria-hidden="true"><i /><strong>YELLOW</strong><span>DO NOT OPERATE</span></div>
                <p>Application is enabled only with the breaker OPEN and verified in DISCONNECTED. The simulated hasp, yellow isolation lock, and danger tag then appear on this exact compartment.</p>
                {!selectedGearState.locked ? (
                  <button type="button" className="apply-lock-command" onClick={applyGearLockout}>Apply yellow lock + hasp + tag</button>
                ) : (
                  <>
                    <label className="gear-release-check"><input type="checkbox" checked={lockRemovalAuthorized} onChange={(event) => setLockRemovalAuthorized(event.target.checked)} /><span>Authorized removal, workers accounted for, area clear, and restoration notice confirmed.</span></label>
                    <button type="button" className="remove-lock-command" onClick={removeGearLockout}>Remove isolation lock / tag</button>
                  </>
                )}
                <div className="gear-loto-actions">
                  <button type="button" onClick={startLotoForGear}>Run full group LOTO</button>
                  <button type="button" onClick={() => setGearTab("sop")}>View this breaker&apos;s SOP</button>
                </div>
              </section>
            </div>
          )}

          {gearTab === "racking" && (
            <div className="rrs-console">
              <header>
                <div><span>CBS ARCSAFE RRS-1 · TRAINING REPRESENTATION</span><strong>Universal rotary remote racking console</strong></div>
                <b className={selectedGearState.racking ? "racking" : rackReady ? "ready" : "hold"}>{selectedGearState.racking ? "DRIVE ACTIVE" : rackReady ? "READY" : "SETUP HOLD"}</b>
              </header>
              <div className="rrs-position-track" aria-label={`Breaker position ${selectedGearState.position}`}>
                {(["DISCONNECTED", "TEST", "CONNECTED"] as RackPosition[]).map((position, index) => (
                  <div className={selectedGearState.position === position ? "active" : ""} key={position}><i />{index < 2 && <span /> }<b>{position}</b></div>
                ))}
              </div>
              <div className="rrs-body">
                <section className="rrs-machine-graphic" aria-label="Remote racking machine graphic">
                  <div className="rrs-cart"><i className="rrs-drive" /><i className="rrs-shaft" /><i className="rrs-control" /><span>RRS-1</span></div>
                  <p>Portable drive · quick-release rotary shaft · control module · floor stabilizer</p>
                </section>
                <section className="rrs-checks">
                  <label className={!selectedGearClosed ? "verified" : "blocked"}><input type="checkbox" checked={!selectedGearClosed} readOnly /><span><b>Breaker OPEN</b>VCP-W trip-free interlock blocks movement of a closed breaker.</span></label>
                  <label><input type="checkbox" checked={rackChecks.identity} onChange={(event) => setRackChecks((checks) => ({ ...checks, identity: event.target.checked }))} /><span><b>Identity / work boundary verified</b>{selectedGearDefinition.label}, compartment, one-line, authorization, and clear work zone confirmed.</span></label>
                  <label><input type="checkbox" checked={rackChecks.coupled} onChange={(event) => setRackChecks((checks) => ({ ...checks, coupled: event.target.checked }))} /><span><b>Drive and coupling installed</b>Correct shaft, torque limiter, quick-release coupling, and racking-port engagement represented.</span></label>
                  <label><input type="checkbox" checked={rackChecks.floorLock} onChange={(event) => setRackChecks((checks) => ({ ...checks, floorLock: event.target.checked }))} /><span><b>Cart stabilized</b>Hand truck positioned and simulated floor lock / stabilizer secured.</span></label>
                  <label><input type="checkbox" checked={rackChecks.areaClear} onChange={(event) => setRackChecks((checks) => ({ ...checks, areaClear: event.target.checked }))} /><span><b>Operator outside boundary</b>Area clear, door closed, cable routed, and remote control position established.</span></label>
                </section>
              </div>
              <div className="rrs-controls">
                <button type="button" disabled={selectedGearState.racking} onClick={() => rackGearBreaker("out")}>RACK OUT</button>
                <div><span>REMOTE DRIVE</span><b>{selectedGearState.racking ? "RUNNING" : "STOPPED"}</b><small>Redundant end-position / over-rack protection simulated</small></div>
                <button type="button" disabled={selectedGearState.racking} onClick={() => rackGearBreaker("in")}>RACK IN</button>
              </div>
              <p className="rrs-note">The RRS-1 representation models a portable rotary remote-racking setup and keeps the operator away from the breaker compartment. Actual shafts, couplings, torque settings, boundaries, and operating steps must come from the breaker-specific <a href="https://cbsarcsafe.com/products/remote-racking-solutions/remote-racking-systems/rrs-1/" target="_blank" rel="noreferrer">CBS ArcSafe instructions</a>, <a href="https://www.eaton.com/us/en-us/catalog/electrical-circuit-protection/mv-vcp-w-vacuum-circuit-breakers.html" target="_blank" rel="noreferrer">Eaton VCP-W manual</a>, and approved facility procedure.</p>
            </div>
          )}

          {gearTab === "sop" && (
            <article className="breaker-sop">
              <header><span>TRAINING SOP · {selectedGearDefinition.label}</span><strong>{selectedGearDefinition.duty}</strong></header>
              <div className="sop-prerequisite"><b>Scope</b><span>Operate, remote-rack, isolate, and restore this simulated VCP-W breaker. Qualified-person rules and the approved equipment-specific procedure are prerequisites.</span></div>
              <ol>
                <li><b>Plan and authorize.</b> Confirm the correct one-line, source/load, operating order, switching authority, incident-energy label, PPE, and affected-employee notification.</li>
                <li><b>Identify the device.</b> Match {selectedGearDefinition.label}, {selectedGearDefinition.duty}, Bus {selectedGearDefinition.bus === "CENTER" ? "center MTM" : selectedGearDefinition.bus}, and the physical compartment.</li>
                <li><b>Open and verify.</b> Issue OPEN/TRIP, verify the 52 OPEN indication and current interruption, and confirm the motor is stopped before opening A1.</li>
                <li><b>Set up remote racking.</b> Inspect the RRS-1-style cart, correct shaft/coupling and torque-limiting parts; engage the port, stabilize the cart, close the door, clear the area, and move to the remote control point.</li>
                <li><b>Rack out.</b> Move CONNECTED → TEST → DISCONNECTED one detent at a time. Verify position indication, secondary disconnect state, and closed primary shutters; stop on abnormal sound, movement, or torque.</li>
                <li><b>Apply hazardous-energy control.</b> Follow the approved LOTO method: apply the hasp, yellow isolation lock and completed danger tag; secure controlled keys and apply group/personal locks as required.</li>
                <li><b>Verify safe condition.</b> Perform the required try operation, return controls to neutral, and have a qualified person perform the approved live-dead-live absence-of-voltage test and stored-energy controls.</li>
                <li><b>Restore deliberately.</b> Inspect the area, account for people and tools, have each person remove their own lock, complete notifications, remove isolation hardware under authorization, rack DISCONNECTED → TEST → CONNECTED, then close only on a valid switching order.</li>
              </ol>
              <div className="sop-actions"><button type="button" onClick={() => setGearTab("controls")}>Go to breaker controls</button><button type="button" onClick={() => setGearTab("racking")}>Go to RRS-1 console</button><button type="button" onClick={startLotoForGear}>Start group LOTO</button></div>
              <p>Training aid only—not an energized-work authorization or substitute for Eaton/CBS ArcSafe manuals, the arc-flash study, OSHA/NFPA requirements, or your facility&apos;s approved switching and lockout procedures.</p>
            </article>
          )}
        </section>
      )}

      {lotoOpen && (
        <section className="loto-dialog" role="dialog" aria-modal="true" aria-labelledby="loto-title">
          <button className="vr-close" type="button" onClick={() => setLotoOpen(false)} aria-label="Close LOTO trainer">×</button>
          <span className="vr-kicker">GROUP LOCKOUT SYSTEM · TRAINING ONLY</span>
          <h2 id="loto-title">Lockout / tagout protocol</h2>
          <p className="loto-system-note">Yellow isolation locks, one key per lock, tags and multi-lock hasps. The master control lock secures the controlled key set / group lockbox until every assigned lock is accounted for.</p>
          <label className="loto-target-label" htmlFor="loto-target">Energy-isolating breaker</label>
          <select
            id="loto-target"
            value={plant.lotoTarget}
            disabled={plant.lotoActive && plant.lotoStep >= 3}
            onChange={(event) => chooseLotoTarget(event.target.value as LotoTarget)}
          >
            {Object.entries(LOTO_TARGET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="loto-progress" aria-live="polite">
            <span>STEP {plant.lotoStep} / 7</span>
            <strong>{LOTO_STEPS[plant.lotoStep]}</strong>
          </div>
          {plant.lotoActive && (
            <div className="loto-verification-panel">
              {plant.lotoStep === 1 && (
                <label><input type="checkbox" checked={plant.lotoNotified} onChange={(event) => setPlant((state) => ({ ...state, lotoNotified: event.target.checked }))} /><span><b>Preparation confirmed</b>Energy types/magnitudes identified; affected employees notified; authorized employee assigned.</span></label>
              )}
              {plant.lotoStep === 2 && (
                <div className="loto-operating-check">
                  <div className={plant.motorStatus === "STOPPED" && !plant.mainContactorClosed && !plant.mgRunning && !plant.fieldOn && plant.valvePosition === 0 ? "verified" : "hold"}>
                    <b>Shutdown status</b><span>Motor {plant.motorStatus} · M {plant.mainContactorClosed ? "PICKED" : "OPEN"} · M-G {plant.mgRunning ? "RUN" : "OFF"} · Field {plant.fieldOn ? "ON" : "DISCHARGED"} · Valve {plant.valvePosition}%</span>
                  </div>
                  <button type="button" onClick={() => stopMotor("field")}>Issue orderly normal stop</button>
                  <button type="button" onClick={() => adjustValve(-100)}>Command valve closed</button>
                </div>
              )}
              {plant.lotoStep === 3 && (
                <div className="loto-operating-check">
                  <div className={lotoTargetOpen(plant) && !plant.mgRunning && !plant.fieldOn ? "verified" : "hold"}>
                    <b>{LOTO_TARGET_LABELS[plant.lotoTarget]}</b><span>{lotoTargetOpen(plant) ? "OPEN" : "CLOSED"} / {plant.gearBreakers[plant.lotoTarget].position} · M-G {plant.mgRunning ? "ENERGIZED" : "OFF"} · Field {plant.fieldOn ? "ENERGIZED" : "DISCHARGED"}</span>
                  </div>
                  <button type="button" onClick={isolateLotoTarget}>OPEN and rack out selected isolator</button>
                </div>
              )}
              {plant.lotoStep === 4 && (
                <>
                  <label><input type="checkbox" checked={plant.lotoIsolationLocked} onChange={(event) => setPlant((state) => ({ ...state, lotoIsolationLocked: event.target.checked, gearBreakers: { ...state.gearBreakers, [state.lotoTarget]: { ...state.gearBreakers[state.lotoTarget], locked: event.target.checked } } }))} /><span><b>Isolation lock / hasp applied</b>Yellow lock applied; controlled key placed in the group lockbox.</span></label>
                  <label><input type="checkbox" checked={plant.lotoTagApplied} onChange={(event) => setPlant((state) => ({ ...state, lotoTagApplied: event.target.checked, gearBreakers: { ...state.gearBreakers, [state.lotoTarget]: { ...state.gearBreakers[state.lotoTarget], tagged: event.target.checked } } }))} /><span><b>Danger tag completed</b>Identity, date, equipment and “Do Not Operate” warning are legible.</span></label>
                </>
              )}
              {plant.lotoStep === 5 && (
                <div className="loto-group-locks">
                  <button type="button" className={plant.lotoMasterApplied ? "applied" : ""} onClick={() => setPlant((state) => ({ ...state, lotoMasterApplied: !state.lotoMasterApplied }))}>{plant.lotoMasterApplied ? "Master control lock applied" : "Apply master control lock"}</button>
                  <div><button type="button" onClick={() => setPlant((state) => ({ ...state, lotoPersonalLocks: Math.min(12, state.lotoPersonalLocks + 1) }))}>+ Authorized employee lock</button><strong>{plant.lotoPersonalLocks} PERSONAL LOCK{plant.lotoPersonalLocks === 1 ? "" : "S"}</strong></div>
                  <p>Each authorized employee applies and retains the key for their own identifiable lock/tag.</p>
                </div>
              )}
              {plant.lotoStep === 6 && (
                <>
                  <div className="loto-try-row"><button type="button" className={plant.lotoTryAttempted ? "verified" : ""} onClick={performLotoTryStart}>{plant.lotoTryAttempted ? "Try-start blocked ✓" : "Perform DCS + local try-start"}</button><span>Return every control to STOP / neutral after the attempt.</span></div>
                  <label><input type="checkbox" checked={plant.lotoZeroVerified} onChange={(event) => setPlant((state) => ({ ...state, lotoZeroVerified: event.target.checked }))} /><span><b>Electrical absence verified</b>Approved test instrument and live-dead-live method represented; 4.8 kV and 125 VDC are absent.</span></label>
                  <label><input type="checkbox" checked={plant.lotoStoredEnergySafe} onChange={(event) => setPlant((state) => ({ ...state, lotoStoredEnergySafe: event.target.checked }))} /><span><b>Stored energy controlled</b>Rotor stopped, field discharged, hydraulic energy relieved/restrained, reaccumulation addressed.</span></label>
                </>
              )}
              {plant.lotoStep === 7 && (
                <>
                  <label><input type="checkbox" checked={plant.lotoAreaClear} onChange={(event) => setPlant((state) => ({ ...state, lotoAreaClear: event.target.checked }))} /><span><b>Work area inspected</b>Tools and nonessential items removed; components operationally intact.</span></label>
                  <label><input type="checkbox" checked={plant.lotoWorkersAccounted} onChange={(event) => setPlant((state) => ({ ...state, lotoWorkersAccounted: event.target.checked }))} /><span><b>People accounted for</b>Every employee is safely positioned and affected employees are ready for restoration notice.</span></label>
                  <div className="loto-release-controls">
                    <button type="button" disabled={plant.lotoPersonalLocks === 0} onClick={() => setPlant((state) => ({ ...state, lotoPersonalLocks: Math.max(0, state.lotoPersonalLocks - 1) }))}>Employee removes own lock ({plant.lotoPersonalLocks})</button>
                    <button type="button" disabled={plant.lotoPersonalLocks > 0 || !plant.lotoMasterApplied} onClick={() => setPlant((state) => ({ ...state, lotoMasterApplied: false }))}>Remove master lock</button>
                    <button type="button" disabled={plant.lotoPersonalLocks > 0 || plant.lotoMasterApplied || !plant.lotoIsolationLocked} onClick={() => setPlant((state) => ({ ...state, lotoIsolationLocked: false, lotoTagApplied: false, gearBreakers: { ...state.gearBreakers, [state.lotoTarget]: { ...state.gearBreakers[state.lotoTarget], locked: false, tagged: false } } }))}>Remove isolation lock / tag</button>
                  </div>
                </>
              )}
            </div>
          )}
          <ol className="loto-steps">
            {LOTO_STEPS.slice(1).map((step, index) => {
              const stepNumber = index + 1;
              return <li key={step} className={stepNumber === plant.lotoStep ? "current" : stepNumber < plant.lotoStep ? "complete" : ""}>{step}</li>;
            })}
          </ol>
          <div className="loto-actions">
            <button type="button" disabled={plant.lotoActive} onClick={beginLoto}>Begin LOTO</button>
            <button type="button" disabled={!plant.lotoActive || plant.lotoStep >= 7} onClick={advanceLoto}>Next step</button>
            <button type="button" disabled={!plant.lotoActive || plant.lotoStep < 7} onClick={completeLoto}>Release after checks</button>
          </div>
          <p className="loto-disclaimer">This enforces an OSHA-aligned training sequence, including group-lock accountability and verification gates, but it does not authorize field work. The approved equipment-specific procedure, arc-flash/electrical-safety program, qualified test methods, and authorized-person rules control the real job. <a href="https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147" target="_blank" rel="noreferrer">OSHA 1910.147 reference</a></p>
        </section>
      )}

      {trainingOpen && (
        <section className="training-dialog" role="dialog" aria-modal="true" aria-labelledby="training-title">
          <button className="vr-close" type="button" onClick={() => setTrainingOpen(false)} aria-label="Close training inputs">×</button>
          <span className="vr-kicker">MOTOR-RELAY TRAINING INPUTS</span>
          <h2 id="training-title">Fault injector · RTD · vibration</h2>
          <div className={`training-protection-state ${plant.motorStatus === "TRIPPED" ? "trip" : protectionAlarmActive ? "alarm" : "healthy"}`}>
            <strong>{protectionLabel}</strong>
            <span>{plant.tripCause ?? `${BEARING_LABELS[hottestBearing]} ${plant.bearingTemps[hottestBearing]}°C · M ${plant.motorVibration.toFixed(2)} / P ${plant.pumpVibration.toFixed(2)} in/s RMS`}</span>
          </div>

          <div className="training-section fault-injector-section">
            <div className="training-section-heading">
              <div><span>GUIDED CONDITION</span><strong>{plant.activeFault === "none" ? "No fault active" : `${FAULT_TARGETS[plant.activeFault]} · ${FAULT_LABELS[plant.activeFault]}`}</strong></div>
              <span className={plant.activeFault === "none" ? "input-normal" : "input-trip"}>{plant.activeFault === "none" ? "CLEAR" : "ACTIVE"}</span>
            </div>
            <label htmlFor="vr-fault-select">Fault to inject</label>
            <div className="fault-control-row">
              <select
                id="vr-fault-select"
                value={plant.faultSelection}
                onChange={(event) => setPlant((state) => ({ ...state, faultSelection: event.target.value as FaultCode }))}
              >
                {FAULT_OPTIONS.map(({ value, label, target }) => <option key={value} value={value}>{target} · {label}</option>)}
              </select>
              <button type="button" disabled={plant.faultSelection === "none"} className="inject-command" onClick={() => injectFault()}>Inject</button>
              <button type="button" disabled={plant.activeFault === "none"} className="clear-command" onClick={clearFault}>Clear fault</button>
            </div>
          </div>

          <div className="training-section sensor-section">
            <div className="training-section-heading">
              <div><span>FIVE BEARING RTDs</span><strong>75°C alarm · 85°C latched trip</strong></div>
              <span className={`input-${hottestBearingLevel}`}>{BEARING_LABELS[hottestBearing]} · {plant.bearingTemps[hottestBearing]}°C</span>
            </div>
            <div className="bearing-input-grid" role="group" aria-label="Bearing RTD test channel">
              {BEARING_KEYS.map((key) => {
                const level = bearingLevel(plant.bearingTemps[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${level} ${plant.selectedBearing === key ? "selected" : ""}`}
                    aria-pressed={plant.selectedBearing === key}
                    onClick={() => setPlant((state) => ({ ...state, selectedBearing: key }))}
                  >
                    <span>{BEARING_LABELS[key]}</span><strong>{plant.bearingTemps[key]}°C</strong><small>{level.toUpperCase()}</small>
                  </button>
                );
              })}
            </div>
            <label className="range-control" htmlFor="vr-bearing-temp">
              <span>{BEARING_LABELS[plant.selectedBearing]} test temperature</span>
              <strong>{plant.bearingTemps[plant.selectedBearing]}°C</strong>
              <input
                id="vr-bearing-temp"
                type="range"
                min="35"
                max="100"
                step="1"
                value={plant.bearingTemps[plant.selectedBearing]}
                onChange={(event) => setBearingTemperature(plant.selectedBearing, Number(event.target.value))}
              />
            </label>
          </div>

          <div className="training-section vibration-section">
            <div className="training-section-heading">
              <div><span>VIBRATION INPUTS</span><strong>Motor-relay latched trip at ≥0.20 in/s RMS</strong></div>
              <span className={vibrationTripActive ? "input-trip" : "input-normal"}>{vibrationTripActive ? "TRIP INPUT" : "NORMAL"}</span>
            </div>
            <div className="vibration-input-grid">
              <label className={`range-control ${plant.motorVibration >= VIBRATION_TRIP ? "trip" : ""}`} htmlFor="vr-motor-vibration">
                <span>Motor vibration</span><strong>{plant.motorVibration.toFixed(2)} in/s RMS</strong>
                <input id="vr-motor-vibration" type="range" min="0" max="0.5" step="0.01" value={plant.motorVibration} onChange={(event) => setVibration("motor", Number(event.target.value))} />
              </label>
              <label className={`range-control ${plant.pumpVibration >= VIBRATION_TRIP ? "trip" : ""}`} htmlFor="vr-pump-vibration">
                <span>Pump vibration</span><strong>{plant.pumpVibration.toFixed(2)} in/s RMS</strong>
                <input id="vr-pump-vibration" type="range" min="0" max="0.5" step="0.01" value={plant.pumpVibration} onChange={(event) => setVibration("pump", Number(event.target.value))} />
              </label>
            </div>
          </div>

          <div className="training-message" role="status" aria-live="polite">{plant.motorEvent}</div>
          <div className="training-actions">
            <button type="button" onClick={normalizeSensors}>Normalize RTD / vibration</button>
            <button type="button" className="reset-button" onClick={resetMotor}>Reset relay trip</button>
            <button type="button" onClick={() => setTrainingOpen(false)}>Close</button>
          </div>
          <p className="training-disclaimer">Training simulation only. Clear the active cause before resetting a latched trip. Actual relay settings, sensor scaling, and plant procedures remain authoritative.</p>
        </section>
      )}

      <section className="mtm-dock unified-dock" aria-label="Unified motor and main tie main training controls">
        <div className="control-summary">
          <span className="vr-kicker">DCS REMOTE CONTROL BOARD</span>
          <strong>{plant.motorEvent}</strong>
          <div className="status-chip-row">
            <span className={`status-chip ${plant.motorStatus.toLowerCase()}`}>{plant.motorStatus}</span>
            <span className={`status-chip ${plant.mainContactorClosed ? "good" : "off"}`}>M {plant.mainContactorClosed ? "PICKED" : "DROP"}</span>
            <span className={`status-chip ${plant.mgRunning ? "good" : "off"}`}>M-G {plant.mgRunning ? "RUN" : "OFF"}</span>
            <span className={`status-chip ${plant.farPicked ? "good" : "off"}`}>56 {plant.farPicked ? "PICKED" : "DROP"}</span>
            <span className={`status-chip ${plant.fieldOn ? "good" : "off"}`}>41 {plant.fieldOn ? "CLOSED" : "OPEN"}</span>
            <span className={`status-chip ${plant.lotoActive ? "loto" : "off"}`}>{plant.lotoActive ? "LOTO ACTIVE" : `VALVE ${plant.valvePosition}%`}</span>
            <span className={`status-chip ${plant.motorStatus === "TRIPPED" ? "tripped" : protectionAlarmActive ? "alarm" : "good"}`}>{protectionLabel}</span>
            <span className={`status-chip ${plant.controlAuthority === "OVATION" ? "good" : "alarm"}`}>AUTH {plant.controlAuthority === "OVATION" ? "DCS" : plant.controlAuthority}</span>
          </div>
        </div>

        <div className="motor-control-bank">
          <div className="bank-heading"><span>DCS MOTOR / FIELD CONTROL</span><b>SINGLE SPEED · BUS 1</b></div>
          <div className="dock-authority" role="group" aria-label="Control authority">
            <button type="button" className={plant.controlAuthority === "OVATION" ? "selected" : ""} onClick={() => setControlAuthority("OVATION")}>Remote</button>
            <button type="button" className={plant.controlAuthority === "FIELD" ? "selected" : ""} onClick={() => setControlAuthority("FIELD")}>Field</button>
            <button type="button" className={plant.controlAuthority === "STARTER" ? "selected" : ""} onClick={() => setControlAuthority("STARTER")}>Starter</button>
          </div>
          <div className="motor-actions">
            <button type="button" className="selected" onClick={() => selectMotor("low", "ovation")}>Single speed · 2500 hp</button>
            <button type="button" className="start-control" onClick={() => startMotor("ovation")}>Start</button>
            <button type="button" className="stop-control" onClick={() => stopMotor("ovation")}>Normal stop</button>
            <button type="button" className="reset-button" onClick={resetMotor}>Trip reset</button>
            <button type="button" onClick={() => setRelayOpen(true)}>Motor relay</button>
            <button type="button" onClick={() => setOvationOpen(true)}>Full DCS</button>
            <button type="button" className="training-control" onClick={() => setTrainingOpen(true)}>Training inputs</button>
            <button type="button" onClick={() => adjustValve(10)}>Valve +</button>
            <button type="button" onClick={() => adjustValve(-10)}>Valve −</button>
            <button type="button" className="loto-control" onClick={() => setLotoOpen(true)}>LOTO</button>
            <button type="button" className="estop-control" onClick={emergencyStop}>E-STOP</button>
          </div>
          <div className="dock-starter-breakers">
            <span>LOAD-RATED MOTOR FEEDER</span>
            <div><b>52-A1 · {statusWord(plant.starterLowClosed)}</b><button type="button" onClick={() => operateStarter("low", true, "DCS")}>Close</button><button type="button" onClick={() => operateStarter("low", false, "DCS")}>Open</button></div>
            <button type="button" onClick={() => openGearStation("A1")}>Breaker / RRS-1 / SOP</button>
          </div>
        </div>

        <div className="mtm-control-bank">
          <div className="bank-heading"><span>MAIN · TIE · MAIN</span><b>{plant.event}</b></div>
          <div className="transfer-selector" role="group" aria-label="Three-position bus transfer selector">
            <button type="button" disabled={plant.busy} className={plant.transferPosition === "BUS1" ? "selected" : ""} onClick={() => selectTransferPosition("BUS1")}>All on Bus 1</button>
            <button type="button" disabled={plant.busy} className={plant.transferPosition === "NORMAL" ? "selected normal" : ""} onClick={() => selectTransferPosition("NORMAL")}>Normal</button>
            <button type="button" disabled={plant.busy} className={plant.transferPosition === "BUS2" ? "selected" : ""} onClick={() => selectTransferPosition("BUS2")}>All on Bus 2</button>
            <span className={`selector-handle position-${plant.transferPosition.toLowerCase()}`} aria-hidden="true" />
          </div>
          <div className="breaker-control-grid">
            {([
              ["mainA", "52-M1", plant.mainA],
              ["tie", "52-T", plant.tie],
              ["mainB", "52-M2", plant.mainB],
            ] as Array<[BreakerKey, string, boolean]>).map(([key, label, closed]) => (
              <div className={`breaker-control-card ${closed ? "closed" : "open"}`} key={key}>
                <button type="button" className="breaker-status-button" onClick={() => setSelectedId(key)}><span>{label}</span><b>{statusWord(closed)}</b></button>
                <div>
                  <button type="button" disabled={plant.busy || closed} className="close-command" onClick={() => operateBreaker(key, true, "switchboard")}>Close</button>
                  <button type="button" disabled={plant.busy || !closed} className="open-command" onClick={() => operateBreaker(key, false, "switchboard")}>Open</button>
                </div>
              </div>
            ))}
          </div>
          <div className="source-actions">
            <button type="button" disabled={plant.busy} className={plant.sourceA ? "source-good" : "source-bad"} onClick={() => plant.sourceA ? failSource("A") : restoreSource("A")}>
              Source 1 · {plant.sourceA ? "FAIL" : "RESTORE"}
            </button>
            <button type="button" disabled={plant.busy} className={plant.sourceB ? "source-good" : "source-bad"} onClick={() => plant.sourceB ? failSource("B") : restoreSource("B")}>
              Source 2 · {plant.sourceB ? "FAIL" : "RESTORE"}
            </button>
            <button type="button" disabled={plant.busy} className="reset-button" onClick={resetNormal}>Reset all</button>
            </div>
        </div>
      </section>

      <div className="vr-safety-banner">
        <strong>SIMULATION</strong>
        <span>Motor · excitation · valve · MTM · fault / RTD / vibration · LOTO</span>
      </div>
    </main>
  );
}
