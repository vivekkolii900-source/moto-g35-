export type TrackId = 'redstone' | 'harbor';

export type GameMode = 'race' | 'elimination' | 'drift' | 'freeroam';

export type VehicleClass = 'gt' | 'muscle' | 'rally' | 'hypercar' | 'formula';

export type Drivetrain = 'rwd' | 'awd';

export type ChassisId =
  | 'valkyrie'
  | 'monza'
  | 'dominator'
  | 'outlaw'
  | 'kurogane'
  | 'stratos'
  | 'titan'
  | 'spectre'
  | 'formula_f1'
  | 'formula_jr';

export type PaintFinish = 'metallic' | 'matte' | 'pearl';

export type LiveryPattern = 'clean' | 'stripe' | 'apex' | 'checker';

export type WingStyle = 'lip' | 'gt' | 'timeattack';

export type RimStyle = 'forged5' | 'mesh' | 'turbofan';

export type TireCompound = 'sport' | 'semislick' | 'slick';

export type SuspensionSetup = 'soft' | 'track' | 'stiff';

export type GearRatioSetup = 'accel' | 'balanced' | 'topspeed';

export interface VehicleConfig {
  chassis: ChassisId;
  primaryColor: string;
  accentColor: string;
  rimColor: string;
  paintFinish: PaintFinish;
  livery: LiveryPattern;
  racingNumber: number;
  wing: WingStyle;
  rims: RimStyle;
  tires: TireCompound;
  suspension: SuspensionSetup;
  gearRatio: GearRatioSetup;
  engineMap: number; // 1.0 to 1.3 (Stage 1 to Stage 3 ECU)
}

export interface ChassisSpec {
  id: ChassisId;
  name: string;
  vehicleClass: VehicleClass;
  drivetrain: Drivetrain;
  tagline: string;
  massKg: number;
  basePowerKw: number;
  peakTorqueNm: number;
  redlineRpm: number;
  dragCoeff: number;
  baseDownforce: number;
  offTrackGripFactor: number;
  rideHeightOffset: number;
  wheelRadius: number;
  wheelWidth: number;
  wheelbaseM: number;
  trackWidthM: number;
  cgHeightM: number;
  frontWeightBias: number; // 0.42 - 0.54
  bodyLengthM: number;
  bodyWidthM: number;
  bodyHeightM: number;
  noseSlope: number;
  cabinOffsetZ: number;
}

export interface TrackSpec {
  id: TrackId;
  name: string;
  location: string;
  laps: number;
  lengthLabel: string;
  roadWidth: number;
  skyTopColor: string;
  skyHorizonColor: string;
  fogColor: string;
  fogDensity: number;
  groundColor: string;
  ambientTone: 'sunset' | 'night';
  description: string;
}

export interface GhostSample {
  t: number; // seconds from race start
  x: number;
  y: number;
  z: number;
  yaw: number;
  steer: number;
}

export interface LeaderboardEntry {
  id: string;
  driverName: string;
  country: string;
  trackId: TrackId;
  chassis: ChassisId;
  vehicleSummary: string;
  primaryColor: string;
  bestLapMs: number;
  totalTimeMs: number;
  topSpeedKmh: number;
  createdAt: string;
  isVerifiedRun: boolean;
  ghost?: GhostSample[];
}

export interface RaceTelemetry {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number; // -1 = R, 0 = N, 1..6
  throttle: number;
  brake: number;
  handbrake: boolean;
  steerAngle: number;
  slipRatio: number;
  absActive: boolean;
  offTrack: boolean;
  wrongWay: boolean;
  nitroPct: number;
  nitroActive: boolean;
  drafting: boolean;
  driftScore: number;
  driftCurrentPts: number;
  driftMultiplier: number;
  driftTimeRemainingSec: number;
  driftStatus: 'none' | 'sliding' | 'banked' | 'lost';
  knockoutNextSec: number;
  activeRacersCount: number;
  knockoutWarning: boolean;
  knockoutBanner: string | null;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  currentLapMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  totalRaceMs: number;
  sectorSplitsMs: [number | null, number | null, number | null];
  deltaBestMs: number | null;
  topSpeedKmh: number;
  progressNorm: number; // 0..1 around spline
  playerPos: { x: number; z: number; yaw: number };
  rivals: Array<{
    id: string;
    name: string;
    x: number;
    z: number;
    yaw: number;
    color: string;
    isGhost: boolean;
    lapProgress: number;
    eliminated?: boolean;
  }>;
}

export type GamePhase =
  | 'title'
  | 'garage'
  | 'countdown'
  | 'racing'
  | 'paused'
  | 'finished'
  | 'replay';

export type CameraMode = 'chase' | 'hood' | 'orbit';

export type ReplayCameraAngle =
  | 'tv'
  | 'chase'
  | 'hood'
  | 'bumper'
  | 'fender'
  | 'helicopter';

export interface ReplayCarSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  slopePitch?: number;
  steer: number;
  wheelSpin: number;
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  brakeHeat: number;
  backfire: boolean;
  nitroActive?: boolean;
  slipRatio: number;
  offTrack: boolean;
  lap: number;
}

export interface ReplayAiSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  steer: number;
  wheelSpin: number;
  speedKmh: number;
  eliminated?: boolean;
}

export interface ReplayFrame {
  t: number;
  player: ReplayCarSnapshot;
  ai: ReplayAiSnapshot[];
  ghost?: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    steer: number;
  };
}

export interface ReplayParticipant {
  id: string;
  name: string;
  config: VehicleConfig;
}

export interface FullRaceSession {
  id: string;
  title: string;
  createdAt: string;
  trackId: TrackId;
  gameMode: GameMode;
  driverName: string;
  vehicleConfig: VehicleConfig;
  aiParticipants: ReplayParticipant[];
  activeGhostName: string | null;
  totalTimeMs: number;
  bestLapMs: number | null;
  topSpeedKmh: number;
  position: number;
  totalRacers: number;
  driftScore?: number;
  lapSplitsMs: number[];
  frames: ReplayFrame[];
}

export interface SavedSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  trackId: TrackId;
  gameMode: GameMode;
  driverName: string;
  vehicleConfig: VehicleConfig;
  totalTimeMs: number;
  bestLapMs: number | null;
  topSpeedKmh: number;
  position: number;
  totalRacers: number;
  driftScore?: number;
  frameCount: number;
  durationSec: number;
}

export interface ReplayPlaybackTelemetry {
  currentTimeSec: number;
  durationSec: number;
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  lap: number;
  throttle: number;
  brake: number;
  offTrack: boolean;
  focusName: string;
  nitroActive?: boolean;
}

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  gt: 'GT',
  muscle: 'Muscle',
  rally: 'Rally',
  hypercar: 'Hypercar',
  formula: 'Formula',
};

export const CHASSIS_SPECS: Record<ChassisId, ChassisSpec> = {
  valkyrie: {
    id: 'valkyrie',
    name: 'Valkyrie GT3',
    vehicleClass: 'gt',
    drivetrain: 'rwd',
    tagline: 'Mid-engine endurance GT3 racer with balanced trail-braking stability.',
    massKg: 1265,
    basePowerKw: 430,
    peakTorqueNm: 590,
    redlineRpm: 8600,
    dragCoeff: 0.31,
    baseDownforce: 1.48,
    offTrackGripFactor: 0.56,
    rideHeightOffset: 0.0,
    wheelRadius: 0.34,
    wheelWidth: 0.29,
    wheelbaseM: 2.68,
    trackWidthM: 1.66,
    cgHeightM: 0.43,
    frontWeightBias: 0.46,
    bodyLengthM: 4.52,
    bodyWidthM: 1.96,
    bodyHeightM: 1.18,
    noseSlope: 0.28,
    cabinOffsetZ: 0.1,
  },
  monza: {
    id: 'monza',
    name: 'Apex Monza V8',
    vehicleClass: 'gt',
    drivetrain: 'rwd',
    tagline: 'Long-hood front-mid GT widebody built for blistering corner-exit drive.',
    massKg: 1310,
    basePowerKw: 465,
    peakTorqueNm: 635,
    redlineRpm: 8200,
    dragCoeff: 0.30,
    baseDownforce: 1.42,
    offTrackGripFactor: 0.55,
    rideHeightOffset: 0.0,
    wheelRadius: 0.35,
    wheelWidth: 0.30,
    wheelbaseM: 2.74,
    trackWidthM: 1.70,
    cgHeightM: 0.44,
    frontWeightBias: 0.51,
    bodyLengthM: 4.62,
    bodyWidthM: 1.98,
    bodyHeightM: 1.20,
    noseSlope: 0.32,
    cabinOffsetZ: -0.18,
  },
  dominator: {
    id: 'dominator',
    name: 'Dominator V8',
    vehicleClass: 'muscle',
    drivetrain: 'rwd',
    tagline: 'Supercharged V8 muscle coupe with ferocious low-end torque and playful drift balance.',
    massKg: 1490,
    basePowerKw: 545,
    peakTorqueNm: 820,
    redlineRpm: 7200,
    dragCoeff: 0.36,
    baseDownforce: 1.05,
    offTrackGripFactor: 0.58,
    rideHeightOffset: 0.03,
    wheelRadius: 0.36,
    wheelWidth: 0.32,
    wheelbaseM: 2.82,
    trackWidthM: 1.72,
    cgHeightM: 0.49,
    frontWeightBias: 0.54,
    bodyLengthM: 4.74,
    bodyWidthM: 2.00,
    bodyHeightM: 1.30,
    noseSlope: 0.18,
    cabinOffsetZ: -0.12,
  },
  outlaw: {
    id: 'outlaw',
    name: 'Outlaw 700',
    vehicleClass: 'muscle',
    drivetrain: 'rwd',
    tagline: 'Classic fastback restomod tuned for aggressive launches and long smokey slides.',
    massKg: 1415,
    basePowerKw: 505,
    peakTorqueNm: 760,
    redlineRpm: 7600,
    dragCoeff: 0.34,
    baseDownforce: 1.12,
    offTrackGripFactor: 0.60,
    rideHeightOffset: 0.02,
    wheelRadius: 0.35,
    wheelWidth: 0.31,
    wheelbaseM: 2.76,
    trackWidthM: 1.68,
    cgHeightM: 0.47,
    frontWeightBias: 0.53,
    bodyLengthM: 4.66,
    bodyWidthM: 1.94,
    bodyHeightM: 1.28,
    noseSlope: 0.22,
    cabinOffsetZ: -0.05,
  },
  kurogane: {
    id: 'kurogane',
    name: 'Kurogane RS',
    vehicleClass: 'rally',
    drivetrain: 'awd',
    tagline: 'Nimble AWD tarmac-spec rally coupe with crisp turn-in and strong curb compliance.',
    massKg: 1180,
    basePowerKw: 385,
    peakTorqueNm: 510,
    redlineRpm: 8800,
    dragCoeff: 0.32,
    baseDownforce: 1.26,
    offTrackGripFactor: 0.84,
    rideHeightOffset: 0.06,
    wheelRadius: 0.35,
    wheelWidth: 0.27,
    wheelbaseM: 2.54,
    trackWidthM: 1.64,
    cgHeightM: 0.46,
    frontWeightBias: 0.51,
    bodyLengthM: 4.30,
    bodyWidthM: 1.88,
    bodyHeightM: 1.30,
    noseSlope: 0.34,
    cabinOffsetZ: 0.16,
  },
  stratos: {
    id: 'stratos',
    name: 'Stratos Evo WRC',
    vehicleClass: 'rally',
    drivetrain: 'awd',
    tagline: 'Full-spec AWD rally machine with roof light pod and relentless gravel/curb traction.',
    massKg: 1210,
    basePowerKw: 410,
    peakTorqueNm: 560,
    redlineRpm: 8500,
    dragCoeff: 0.35,
    baseDownforce: 1.34,
    offTrackGripFactor: 0.90,
    rideHeightOffset: 0.09,
    wheelRadius: 0.36,
    wheelWidth: 0.28,
    wheelbaseM: 2.56,
    trackWidthM: 1.68,
    cgHeightM: 0.48,
    frontWeightBias: 0.50,
    bodyLengthM: 4.24,
    bodyWidthM: 1.92,
    bodyHeightM: 1.34,
    noseSlope: 0.38,
    cabinOffsetZ: 0.12,
  },
  titan: {
    id: 'titan',
    name: 'Titan V10',
    vehicleClass: 'hypercar',
    drivetrain: 'rwd',
    tagline: 'Long-tail aero prototype delivering relentless straight-line velocity.',
    massKg: 1320,
    basePowerKw: 540,
    peakTorqueNm: 690,
    redlineRpm: 8900,
    dragCoeff: 0.26,
    baseDownforce: 1.72,
    offTrackGripFactor: 0.52,
    rideHeightOffset: -0.02,
    wheelRadius: 0.34,
    wheelWidth: 0.31,
    wheelbaseM: 2.78,
    trackWidthM: 1.74,
    cgHeightM: 0.39,
    frontWeightBias: 0.44,
    bodyLengthM: 4.70,
    bodyWidthM: 2.02,
    bodyHeightM: 1.10,
    noseSlope: 0.20,
    cabinOffsetZ: 0.05,
  },
  spectre: {
    id: 'spectre',
    name: 'Spectre E-Hyper',
    vehicleClass: 'hypercar',
    drivetrain: 'awd',
    tagline: 'Twin-motor active-aero AWD hypercar with instant torque vectoring out of hairpins.',
    massKg: 1380,
    basePowerKw: 620,
    peakTorqueNm: 860,
    redlineRpm: 9400,
    dragCoeff: 0.25,
    baseDownforce: 1.88,
    offTrackGripFactor: 0.56,
    rideHeightOffset: -0.02,
    wheelRadius: 0.34,
    wheelWidth: 0.32,
    wheelbaseM: 2.74,
    trackWidthM: 1.76,
    cgHeightM: 0.38,
    frontWeightBias: 0.45,
    bodyLengthM: 4.64,
    bodyWidthM: 2.04,
    bodyHeightM: 1.08,
    noseSlope: 0.24,
    cabinOffsetZ: 0.12,
  },
  formula_f1: {
    id: 'formula_f1',
    name: 'Formula Apex F1',
    vehicleClass: 'formula',
    drivetrain: 'rwd',
    tagline: 'Open-wheel grand prix chassis with massive ground-effect downforce and 10,800 RPM scream.',
    massKg: 798,
    basePowerKw: 590,
    peakTorqueNm: 540,
    redlineRpm: 10800,
    dragCoeff: 0.38,
    baseDownforce: 2.75,
    offTrackGripFactor: 0.48,
    rideHeightOffset: -0.03,
    wheelRadius: 0.35,
    wheelWidth: 0.36,
    wheelbaseM: 3.10,
    trackWidthM: 1.82,
    cgHeightM: 0.30,
    frontWeightBias: 0.45,
    bodyLengthM: 4.95,
    bodyWidthM: 1.98,
    bodyHeightM: 0.96,
    noseSlope: 0.14,
    cabinOffsetZ: -0.05,
  },
  formula_jr: {
    id: 'formula_jr',
    name: 'Formula Junior V6',
    vehicleClass: 'formula',
    drivetrain: 'rwd',
    tagline: 'Featherweight open-wheel feeder racer built for razor-sharp apex precision.',
    massKg: 690,
    basePowerKw: 415,
    peakTorqueNm: 410,
    redlineRpm: 10200,
    dragCoeff: 0.34,
    baseDownforce: 2.20,
    offTrackGripFactor: 0.52,
    rideHeightOffset: -0.02,
    wheelRadius: 0.33,
    wheelWidth: 0.32,
    wheelbaseM: 2.86,
    trackWidthM: 1.74,
    cgHeightM: 0.31,
    frontWeightBias: 0.46,
    bodyLengthM: 4.58,
    bodyWidthM: 1.88,
    bodyHeightM: 0.94,
    noseSlope: 0.16,
    cabinOffsetZ: 0.0,
  },
};

export const TRACK_SPECS: Record<TrackId, TrackSpec> = {
  redstone: {
    id: 'redstone',
    name: 'Redstone Ridge GP',
    location: 'Sierra Canyon, USA',
    laps: 3,
    lengthLabel: '2.4 km Circuit',
    roadWidth: 16,
    skyTopColor: '#1f2b47',
    skyHorizonColor: '#d97b59',
    fogColor: '#9b6355',
    fogDensity: 0.0019,
    groundColor: '#4e392c',
    ambientTone: 'sunset',
    description: 'High-speed canyon elevation sweeps, a downhill braking hairpin, and technical chicane.',
  },
  harbor: {
    id: 'harbor',
    name: 'Neon Harbor Street',
    location: 'Yokohama Bay, JPN',
    laps: 3,
    lengthLabel: '2.1 km Street',
    roadWidth: 14.5,
    skyTopColor: '#070b17',
    skyHorizonColor: '#1b2b48',
    fogColor: '#121d33',
    fogDensity: 0.0024,
    groundColor: '#171c26',
    ambientTone: 'night',
    description: 'Floodlit waterfront tarmac with heavy 90° braking zones and sweeping bayfront curves.',
  },
};

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  chassis: 'valkyrie',
  primaryColor: '#e63946',
  accentColor: '#f8fafc',
  rimColor: '#cbd5e1',
  paintFinish: 'metallic',
  livery: 'apex',
  racingNumber: 24,
  wing: 'gt',
  rims: 'forged5',
  tires: 'semislick',
  suspension: 'track',
  gearRatio: 'balanced',
  engineMap: 1.1,
};
