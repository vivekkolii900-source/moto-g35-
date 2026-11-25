import * as THREE from 'three';
import { TrackData, TrackProjection, projectToTrack } from './tracks';
import { CHASSIS_SPECS, VehicleConfig } from './types';

export interface CarInputState {
  throttle: number;
  brake: number;
  steer: number; // -1 (right) to +1 (left)
  handbrake: boolean;
  nitro?: boolean;
}

export interface CarPhysicsState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number; // radians; 0 = +Z, +PI/2 = +X
  yawRate: number; // rad/s
  steerAngle: number; // current front wheel steer rad
  pitch: number; // body dive/squat rad
  roll: number; // body roll rad
  slopePitch: number; // road incline alignment rad
  wheelSpin: number; // cumulative tire rotation rad
  rpm: number;
  gear: number; // -1 R, 0 N, 1..6
  shiftCooldown: number;
  backfireTimer: number;
  brakeHeat: number; // 0..1
  slipRatio: number; // 0..1+
  absActive: boolean;
  nitroPct: number; // 0..100
  nitroActive: boolean;
  drafting: boolean;
  speedMs: number;
  speedKmh: number;
  longAccelG: number;
  latAccelG: number;
  trackProj: TrackProjection;
  collisionImpulse: number; // resets each step
}

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
const GEAR_RATIOS = [3.35, 2.28, 1.66, 1.28, 1.02, 0.84];

export function createInitialPhysicsState(
  track: TrackData,
  startDistOffset = -6,
  lateralOffset = 0
): CarPhysicsState {
  const n = track.samples.length;
  let t = startDistOffset / track.totalLength;
  while (t < 0) t += 1;
  while (t >= 1) t -= 1;

  const idx = Math.floor(t * n) % n;
  const s = track.samples[idx];
  const pos = new THREE.Vector3()
    .copy(s.point)
    .addScaledVector(s.right, lateralOffset);
  const yaw = Math.atan2(s.tangent.x, s.tangent.z);
  const proj = projectToTrack(track, pos.x, pos.z, idx);

  return {
    pos,
    vel: new THREE.Vector3(),
    yaw,
    yawRate: 0,
    steerAngle: 0,
    pitch: 0,
    roll: 0,
    slopePitch: -Math.asin(THREE.MathUtils.clamp(proj.tangent.y, -0.35, 0.35)),
    wheelSpin: 0,
    rpm: 1150,
    gear: 1,
    shiftCooldown: 0,
    backfireTimer: 0,
    brakeHeat: 0,
    slipRatio: 0,
    absActive: false,
    nitroPct: 100,
    nitroActive: false,
    drafting: false,
    speedMs: 0,
    speedKmh: 0,
    longAccelG: 0,
    latAccelG: 0,
    trackProj: proj,
    collisionImpulse: 0,
  };
}

function getEngineTorqueFactor(rpmNorm: number, isMuscle: boolean): number {
  if (isMuscle) {
    // Broad low-end V8 torque punch
    if (rpmNorm < 0.2) return 0.84;
    if (rpmNorm < 0.65) return 0.96 + Math.sin(((rpmNorm - 0.2) / 0.45) * Math.PI) * 0.06;
    if (rpmNorm <= 1.0) return 0.96 - ((rpmNorm - 0.65) / 0.35) * 0.22;
    return 0.0;
  }
  if (rpmNorm < 0.15) return 0.65;
  if (rpmNorm < 0.35) return 0.80 + ((rpmNorm - 0.15) / 0.2) * 0.15;
  if (rpmNorm < 0.78) return 0.95 + Math.sin(((rpmNorm - 0.35) / 0.43) * Math.PI) * 0.08;
  if (rpmNorm <= 1.0) return 0.94 - ((rpmNorm - 0.78) / 0.22) * 0.16;
  return 0.0;
}

export function stepCarPhysics(
  state: CarPhysicsState,
  input: CarInputState,
  config: VehicleConfig,
  track: TrackData,
  dt: number,
  isDrafting = false
): void {
  const spec = CHASSIS_SPECS[config.chassis];
  state.collisionImpulse = 0;
  state.drafting = isDrafting;

  const tireGripBase =
    config.tires === 'slick' ? 1.32 : config.tires === 'semislick' ? 1.18 : 1.04;
  const tireStiffness =
    config.tires === 'slick' ? 14.8 : config.tires === 'semislick' ? 12.4 : 10.2;

  const wingDownforceMult =
    config.wing === 'timeattack' ? 1.48 : config.wing === 'gt' ? 1.18 : 0.85;
  const wingDragAdd =
    config.wing === 'timeattack' ? 0.075 : config.wing === 'gt' ? 0.032 : 0.0;

  // Higher-RPM Formula cars use taller rev gearing automatically
  const revScale = 8600 / spec.redlineRpm;
  const finalDrive =
    (config.gearRatio === 'accel' ? 4.05 : config.gearRatio === 'topspeed' ? 3.12 : 3.55) /
    revScale;

  const suspStiffness =
    config.suspension === 'stiff' ? 1.35 : config.suspension === 'soft' ? 0.76 : 1.05;

  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);
  const fwdX = sinY;
  const fwdZ = cosY;
  const rightX = -cosY;
  const rightZ = sinY;

  let vLong = state.vel.x * fwdX + state.vel.z * fwdZ;
  let vLat = state.vel.x * rightX + state.vel.z * rightZ;
  const speedAbs = Math.hypot(vLong, vLat);
  state.speedMs = speedAbs;
  state.speedKmh = speedAbs * 3.6;

  // Nitrous Boost engagement & recharge (recharges passively, faster via drifting or slipstream)
  const wantNitro = Boolean(input.nitro && input.throttle > 0.15 && state.gear >= 1 && state.nitroPct > 1.2);
  if (wantNitro) {
    state.nitroActive = true;
    state.nitroPct = Math.max(0, state.nitroPct - 24 * dt);
    state.backfireTimer = Math.max(state.backfireTimer, 0.05);
  } else {
    state.nitroActive = false;
    const driftBonus = state.slipRatio > 0.36 && state.speedKmh > 35 ? 14 : 0;
    const draftBonus = isDrafting && state.speedKmh > 50 ? 18 : 0;
    state.nitroPct = Math.min(100, state.nitroPct + (4.2 + driftBonus + draftBonus) * dt);
  }

  // Formula & Rally have crisp front bite; speed-sensitive steering limits
  const maxSteerAtSpeed = THREE.MathUtils.lerp(
    spec.vehicleClass === 'formula' ? 0.50 : 0.56,
    spec.vehicleClass === 'formula' ? 0.21 : 0.16,
    Math.min(1, speedAbs / 72)
  );
  const targetSteer = input.steer * maxSteerAtSpeed;
  const steerSpeed = Math.abs(targetSteer) > Math.abs(state.steerAngle) ? 7.2 : 10.0;
  state.steerAngle = THREE.MathUtils.damp(state.steerAngle, targetSteer, steerSpeed, dt);

  // Surface grip & drag from current track projection (Rally retains high off-track grip!)
  const proj = state.trackProj;
  let surfaceGrip = 1.0;
  let surfaceDrag = 0.0;
  if (proj.offTrack) {
    surfaceGrip = spec.offTrackGripFactor;
    surfaceDrag = spec.vehicleClass === 'rally' ? 0.85 : 2.5;
  } else if (proj.onCurb) {
    surfaceGrip = spec.vehicleClass === 'rally' ? 0.99 : 0.94;
    surfaceDrag = 0.12;
  }

  state.shiftCooldown = Math.max(0, state.shiftCooldown - dt);
  state.backfireTimer = Math.max(0, state.backfireTimer - dt);

  const wheelRadius = spec.wheelRadius;
  if (vLong < 0.8 && input.brake > 0.25 && input.throttle < 0.1) {
    state.gear = -1;
  } else if (state.gear === -1 && (input.throttle > 0.15 || vLong > 1.0)) {
    state.gear = 1;
  } else if (state.gear <= 0) {
    state.gear = 1;
  }

  const gearRatio =
    state.gear === -1 ? 3.2 : GEAR_RATIOS[Math.max(0, Math.min(5, state.gear - 1))];
  const wheelRpm = (Math.abs(vLong) / (2 * Math.PI * wheelRadius)) * 60;
  const coupledRpm = wheelRpm * gearRatio * finalDrive;
  const idleRpm = spec.vehicleClass === 'formula' ? 2400 : 1150;
  const targetRpm = THREE.MathUtils.clamp(
    Math.max(idleRpm + input.throttle * (spec.redlineRpm * 0.34), coupledRpm),
    idleRpm,
    spec.redlineRpm + 250
  );
  state.rpm = THREE.MathUtils.damp(state.rpm, targetRpm, 15, dt);

  if (state.gear >= 1 && state.shiftCooldown <= 0) {
    if (state.rpm > spec.redlineRpm * 0.94 && state.gear < 6 && input.throttle > 0.2) {
      state.gear += 1;
      state.shiftCooldown = 0.20;
      state.backfireTimer = 0.16;
    } else if (state.rpm < spec.redlineRpm * 0.42 && state.gear > 1 && vLong > 2) {
      state.gear -= 1;
      state.shiftCooldown = 0.18;
    }
  }

  const rpmNorm = state.rpm / spec.redlineRpm;
  const torqueFactor = getEngineTorqueFactor(rpmNorm, spec.vehicleClass === 'muscle');
  const boostMult = state.nitroActive ? 1.34 : 1.0;
  const effectiveTorque = spec.peakTorqueNm * config.engineMap * torqueFactor * boostMult;

  let driveForce = 0;
  if (state.gear === -1) {
    driveForce = -input.brake * spec.peakTorqueNm * 2.2;
  } else {
    driveForce =
      (input.throttle * effectiveTorque * gearRatio * finalDrive * 0.9) / wheelRadius;
    const tractionCeiling = (spec.drivetrain === 'awd' ? 1.42 : 1.15) * (state.nitroActive ? 1.16 : 1.0);
    const maxDriveTraction =
      spec.massKg * GRAVITY * tractionCeiling * tireGripBase * surfaceGrip;
    driveForce = Math.min(driveForce, maxDriveTraction);
  }

  // Braking force (Formula high-downforce allows stronger threshold braking)
  let brakeForce = 0;
  state.absActive = false;
  if (state.gear !== -1 && input.brake > 0.02) {
    const brakeScale = spec.vehicleClass === 'formula' ? 17.5 : 13.8;
    const rawBrake = input.brake * spec.massKg * brakeScale * tireGripBase * surfaceGrip;
    if (input.brake > 0.82 && speedAbs > 8 && surfaceGrip < 0.96) {
      state.absActive = true;
      brakeForce = rawBrake * (0.9 + 0.1 * Math.sin(performance.now() * 0.09));
    } else {
      brakeForce = rawBrake;
    }
    if (vLong < 0.2 && vLong > -0.2) brakeForce = 0;
  }
  const brakeDir = vLong >= 0 ? -1 : 1;
  const handbrakeDrag = input.handbrake ? spec.massKg * 5.2 * (vLong >= 0 ? -1 : 1) : 0;

  // Aerodynamic drag & downforce (reduced drag when drafting behind rival)
  const frontalArea = spec.bodyWidthM * spec.bodyHeightM * 0.82;
  const draftDragMult = isDrafting ? 0.82 : 1.0;
  const totalCd = (spec.dragCoeff + wingDragAdd) * draftDragMult;
  const aeroDrag = 0.5 * AIR_DENSITY * totalCd * frontalArea * vLong * Math.abs(vLong);
  const downforce =
    0.5 * AIR_DENSITY * spec.baseDownforce * wingDownforceMult * frontalArea * speedAbs * speedAbs;

  const rollingResist = vLong * (14 + surfaceDrag * 36);
  const slopeForce = -spec.massKg * GRAVITY * proj.tangent.y;

  const netLongForce =
    driveForce +
    (Math.abs(vLong) > 0.15 ? brakeDir * brakeForce : 0) +
    handbrakeDrag -
    aeroDrag -
    rollingResist +
    slopeForce;

  const longAccel = netLongForce / spec.massKg;
  state.longAccelG = longAccel / GRAVITY;

  // Weight transfer
  const totalWeight = spec.massKg * GRAVITY + downforce;
  const staticFrontW = totalWeight * spec.frontWeightBias;
  const staticRearW = totalWeight * (1 - spec.frontWeightBias);
  const weightTransfer = (spec.massKg * longAccel * spec.cgHeightM) / spec.wheelbaseM;
  const frontLoad = Math.max(totalWeight * 0.18, staticFrontW - weightTransfer);
  const rearLoad = Math.max(totalWeight * 0.18, staticRearW + weightTransfer);

  // Pacejka lateral tire forces
  const distFront = spec.wheelbaseM * (1 - spec.frontWeightBias);
  const distRear = spec.wheelbaseM * spec.frontWeightBias;
  const mu = tireGripBase * surfaceGrip;

  let fLatFront = 0;
  let fLatRear = 0;
  let slipPeak = 0;

  if (speedAbs > 0.6) {
    const vLongSafe = Math.max(Math.abs(vLong), 1.8);
    const alphaFront =
      Math.atan2(vLat - state.yawRate * distFront, vLongSafe) +
      state.steerAngle * Math.sign(vLong || 1);
    const alphaRear = Math.atan2(vLat + state.yawRate * distRear, vLongSafe);

    const pacejka = (alpha: number, load: number, gripScale: number) => {
      const x = tireStiffness * alpha;
      return -mu * gripScale * load * Math.sin(1.45 * Math.atan(x));
    };

    fLatFront = pacejka(alphaFront, frontLoad, spec.drivetrain === 'awd' ? 1.04 : 1.0);
    // Muscle cars break rear traction slightly easier under heavy throttle for satisfying RWD drift
    const powerOversteer =
      spec.vehicleClass === 'muscle' && input.throttle > 0.7 ? 0.88 : 1.02;
    const rearGripScale = input.handbrake ? 0.42 : powerOversteer;
    fLatRear = pacejka(alphaRear, rearLoad, rearGripScale);

    slipPeak = Math.max(Math.abs(alphaFront), Math.abs(alphaRear)) / 0.35;
  } else {
    vLong *= Math.max(0, 1 - 6 * dt);
    vLat *= Math.max(0, 1 - 12 * dt);
    state.yawRate *= Math.max(0, 1 - 10 * dt);
  }

  state.slipRatio = THREE.MathUtils.clamp(
    slipPeak + (input.handbrake && speedAbs > 5 ? 0.45 : 0),
    0,
    1.5
  );

  const latForceTotal = fLatFront + fLatRear;
  const latAccel = latForceTotal / spec.massKg;
  state.latAccelG = latAccel / GRAVITY;

  const yawInertia = spec.massKg * (spec.wheelbaseM * spec.wheelbaseM * 0.32);
  const yawTorque = -fLatFront * distFront + fLatRear * distRear;
  const yawAccel = yawTorque / yawInertia;

  vLong += longAccel * dt;
  vLat += latAccel * dt;

  if (Math.abs(vLong) < 0.35 && input.throttle < 0.05 && input.brake > 0.1) {
    vLong = 0;
  }
  if (speedAbs < 2.2) {
    vLat *= Math.max(0, 1 - 5.5 * dt);
  }

  state.yawRate += yawAccel * dt;
  state.yawRate *= Math.max(0, 1 - 1.15 * dt);
  state.yaw += state.yawRate * dt;

  const newSin = Math.sin(state.yaw);
  const newCos = Math.cos(state.yaw);
  const nFwdX = newSin;
  const nFwdZ = newCos;
  const nRightX = -newCos;
  const nRightZ = newSin;

  state.vel.x = vLong * nFwdX + vLat * nRightX;
  state.vel.z = vLong * nFwdZ + vLat * nRightZ;

  state.pos.x += state.vel.x * dt;
  state.pos.z += state.vel.z * dt;

  const nextProj = projectToTrack(track, state.pos.x, state.pos.z, proj.sampleIndex);
  state.trackProj = nextProj;
  state.pos.y = THREE.MathUtils.damp(state.pos.y, nextProj.roadY, 24, dt);

  if (nextProj.wallPenetration > 0) {
    const sign = nextProj.lateralOffset >= 0 ? 1 : -1;
    state.pos.x -= nextProj.right.x * sign * nextProj.wallPenetration;
    state.pos.z -= nextProj.right.z * sign * nextProj.wallPenetration;

    const vOut = (state.vel.x * nextProj.right.x + state.vel.z * nextProj.right.z) * sign;
    if (vOut > 0) {
      state.collisionImpulse = Math.max(state.collisionImpulse, vOut);
      const bounce = 1.32;
      state.vel.x -= nextProj.right.x * sign * vOut * bounce;
      state.vel.z -= nextProj.right.z * sign * vOut * bounce;
      state.vel.multiplyScalar(0.86);
      state.yawRate *= 0.4;
    }
  }

  const targetPitch = THREE.MathUtils.clamp(-state.longAccelG * 0.032 / suspStiffness, -0.05, 0.05);
  const targetRoll = THREE.MathUtils.clamp(-state.latAccelG * 0.042 / suspStiffness, -0.08, 0.08);
  const targetSlopePitch = -Math.asin(THREE.MathUtils.clamp(nextProj.tangent.y, -0.35, 0.35));
  const curbJitter =
    nextProj.onCurb && speedAbs > 6 ? Math.sin(performance.now() * 0.14) * 0.012 : 0;

  state.pitch = THREE.MathUtils.damp(state.pitch, targetPitch + curbJitter, 10, dt);
  state.roll = THREE.MathUtils.damp(state.roll, targetRoll, 10, dt);
  state.slopePitch = THREE.MathUtils.damp(state.slopePitch, targetSlopePitch, 14, dt);
  state.wheelSpin += (vLong / wheelRadius) * dt;

  const heatTarget =
    input.brake > 0.2 && speedAbs > 14 ? Math.min(1, input.brake * (speedAbs / 55)) : 0;
  state.brakeHeat = THREE.MathUtils.damp(
    state.brakeHeat,
    heatTarget,
    heatTarget > state.brakeHeat ? 4 : 1.5,
    dt
  );
}
