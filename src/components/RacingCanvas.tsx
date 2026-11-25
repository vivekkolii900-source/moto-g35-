import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RacingAudioEngine } from '../game/audio';
import { BuiltCar, buildVehicleMesh } from '../game/carBuilder';
import {
  CarInputState,
  CarPhysicsState,
  createInitialPhysicsState,
  stepCarPhysics,
} from '../game/physics';
import { sampleReplayAtTime } from '../game/replayStorage';
import {
  AiRacerState,
  createAiRacers,
  sampleGhostAtTime,
  stepAiRacer,
} from '../game/rivals';
import { TrackData, buildTrackData, buildTrackEnvironment } from '../game/tracks';
import {
  CameraMode,
  CHASSIS_SPECS,
  FullRaceSession,
  GameMode,
  GamePhase,
  GhostSample,
  RaceTelemetry,
  ReplayCameraAngle,
  ReplayFrame,
  ReplayPlaybackTelemetry,
  TRACK_SPECS,
  TrackId,
  VehicleConfig,
} from '../game/types';

export interface RaceFinishResult {
  bestLapMs: number;
  totalTimeMs: number;
  topSpeedKmh: number;
  position: number;
  driftScore?: number;
  ghost: GhostSample[];
  session: FullRaceSession;
}

interface RacingCanvasProps {
  phase: GamePhase;
  gameMode: GameMode;
  freeRoamTraffic: boolean;
  trackId: TrackId;
  driverName: string;
  vehicleConfig: VehicleConfig;
  cameraMode: CameraMode;
  muted: boolean;
  raceSessionId: number;
  resetCarToken?: number;
  activeGhost: { driverName: string; samples: GhostSample[] } | null;
  replaySession?: FullRaceSession | null;
  replayPlaying?: boolean;
  replaySpeed?: number;
  replayCameraAngle?: ReplayCameraAngle;
  replayFocusIndex?: number;
  replaySeekTarget?: { timeSec: number; seq: number } | null;
  captureSessionRef?: React.MutableRefObject<(() => FullRaceSession | null) | null>;
  touchInputRef: React.MutableRefObject<{
    throttle: number;
    brake: number;
    steer: number;
    handbrake: boolean;
    nitro?: boolean;
  }>;
  onTelemetry: (telemetry: RaceTelemetry) => void;
  onReplayTelemetry?: (telemetry: ReplayPlaybackTelemetry) => void;
  onReplayEnd?: () => void;
  onCountdownTick: (value: number | 'GO' | null) => void;
  onRaceStart: () => void;
  onRaceFinish: (result: RaceFinishResult) => void;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onContextLostChange?: (lost: boolean) => void;
}

// Pre-allocated math helpers outside the render loop (Zero GC)
const _camDesired = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _vecA = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  isSpark: boolean;
}

export const RacingCanvas: React.FC<RacingCanvasProps> = ({
  phase,
  gameMode,
  freeRoamTraffic,
  trackId,
  driverName,
  vehicleConfig,
  cameraMode,
  muted,
  raceSessionId,
  resetCarToken = 0,
  activeGhost,
  replaySession = null,
  replayPlaying = true,
  replaySpeed = 1,
  replayCameraAngle = 'tv',
  replayFocusIndex = -1,
  replaySeekTarget = null,
  captureSessionRef,
  touchInputRef,
  onTelemetry,
  onReplayTelemetry,
  onReplayEnd,
  onCountdownTick,
  onRaceStart,
  onRaceFinish,
  onTogglePause,
  onCycleCamera,
  onToggleMute,
  onContextLostChange,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Latest props in refs so the 60fps loop never resets
  const stateRef = useRef({
    phase,
    gameMode,
    freeRoamTraffic,
    trackId,
    driverName,
    vehicleConfig,
    cameraMode,
    muted,
    raceSessionId,
    activeGhost,
    replaySession,
    replayPlaying,
    replaySpeed,
    replayCameraAngle,
    replayFocusIndex,
    onTelemetry,
    onReplayTelemetry,
    onReplayEnd,
    onCountdownTick,
    onRaceStart,
    onRaceFinish,
    onTogglePause,
    onCycleCamera,
    onToggleMute,
    onContextLostChange,
  });
  stateRef.current = {
    phase,
    gameMode,
    freeRoamTraffic,
    trackId,
    driverName,
    vehicleConfig,
    cameraMode,
    muted,
    raceSessionId,
    activeGhost,
    replaySession,
    replayPlaying,
    replaySpeed,
    replayCameraAngle,
    replayFocusIndex,
    onTelemetry,
    onReplayTelemetry,
    onReplayEnd,
    onCountdownTick,
    onRaceStart,
    onRaceFinish,
    onTogglePause,
    onCycleCamera,
    onToggleMute,
    onContextLostChange,
  };

  // Callbacks to trigger scene swaps from prop effects
  const rebuildCarRef = useRef<((cfg: VehicleConfig) => void) | null>(null);
  const rebuildTrackRef = useRef<((tId: TrackId) => void) | null>(null);
  const resetRaceRef = useRef<(() => void) | null>(null);
  const recoverCarRef = useRef<(() => void) | null>(null);
  const syncAiPackRef = useRef<(() => void) | null>(null);
  const syncGhostRef = useRef<
    ((ghost: { driverName: string; samples: GhostSample[] } | null) => void) | null
  >(null);
  const enterReplayRef = useRef<((session: FullRaceSession) => void) | null>(null);
  const exitReplayRef = useRef<(() => void) | null>(null);
  const seekReplayRef = useRef<((timeSec: number) => void) | null>(null);
  const audioRef = useRef<RacingAudioEngine | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // 3. Scene, Camera & Studio Environment
    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      60,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.3,
      1400
    );

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.07;
    orbitControls.minDistance = 4.2;
    orbitControls.maxDistance = 14;
    orbitControls.maxPolarAngle = Math.PI * 0.47;
    orbitControls.minPolarAngle = 0.12;
    orbitControls.enablePan = false;
    orbitControls.enabled = false;

    // 4. 3-Point Warm/Cool Lighting Rig + Garage Showroom Softboxes
    const hemiLight = new THREE.HemisphereLight(0xa5c8ff, 0x3b2c25, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(60, 95, 45);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 220;
    const d = 38;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.radius = 2.5;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.9);
    rimLight.position.set(-45, 35, -60);
    scene.add(rimLight);

    // Studio Softbox Area Lights (GPU only, illuminated during Garage inspection)
    let garageSoftboxA: THREE.RectAreaLight | null = null;
    let garageSoftboxB: THREE.RectAreaLight | null = null;
    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      garageSoftboxA = new THREE.RectAreaLight(0xffffff, 0, 8, 2.6);
      scene.add(garageSoftboxA);
      garageSoftboxB = new THREE.RectAreaLight(0xbae6fd, 0, 7, 2.2);
      scene.add(garageSoftboxB);
    }

    // GPU Post-Processing Pipeline (Subtle HDR Bloom + ACES Filmic Output)
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (!isSoftwareGl) {
      const initW = container.clientWidth || window.innerWidth;
      const initH = container.clientHeight || window.innerHeight;
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      composer.setSize(initW, initH);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(initW, initH),
        0.34,
        0.36,
        0.88
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    }

    // 5. Audio Engine
    const audio = new RacingAudioEngine();
    audio.setMuted(stateRef.current.muted);
    audioRef.current = audio;

    // 6. Pooled Tire Smoke & Collision Sparks (InstancedMesh)
    const PARTICLE_COUNT = 80;
    const particleGeo = new THREE.DodecahedronGeometry(0.24, 0);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_COUNT);
    particleMesh.frustumCulled = false;
    const particlePool: ParticleSlot[] = [];
    const tmpColor = new THREE.Color();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlePool.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0.001,
        isSpark: false,
      });
      _dummyObj.position.set(0, -100, 0);
      _dummyObj.scale.setScalar(0.001);
      _dummyObj.updateMatrix();
      particleMesh.setMatrixAt(i, _dummyObj.matrix);
      particleMesh.setColorAt(i, tmpColor.setHex(0xcbd5e1));
    }
    scene.add(particleMesh);
    let particleCursor = 0;

    function spawnParticle(
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      isSpark: boolean
    ) {
      const p = particlePool[particleCursor];
      particleCursor = (particleCursor + 1) % PARTICLE_COUNT;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
      p.life = 0;
      p.maxLife = isSpark ? 0.35 + Math.random() * 0.2 : 0.45 + Math.random() * 0.35;
      p.scale = isSpark ? 0.35 : 0.8 + Math.random() * 0.6;
      p.isSpark = isSpark;
    }

    // 6b. Persistent Tire Skidmarks Ring Buffer (InstancedMesh)
    const SKID_COUNT = 720;
    const skidGeo = new THREE.PlaneGeometry(0.32, 0.85);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x090b0f,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, SKID_COUNT);
    skidMesh.frustumCulled = false;
    let skidCursor = 0;
    let lastSkidX = 99999;
    let lastSkidZ = 99999;

    function clearSkidmarks() {
      skidCursor = 0;
      lastSkidX = 99999;
      lastSkidZ = 99999;
      _dummyObj.position.set(0, -100, 0);
      _dummyObj.rotation.set(0, 0, 0);
      _dummyObj.scale.setScalar(0.001);
      _dummyObj.updateMatrix();
      for (let i = 0; i < SKID_COUNT; i++) {
        skidMesh.setMatrixAt(i, _dummyObj.matrix);
      }
      skidMesh.instanceMatrix.needsUpdate = true;
    }
    clearSkidmarks();
    scene.add(skidMesh);

    function laySkidPair(x: number, y: number, z: number, yaw: number, trackHalf: number) {
      const dx = x - lastSkidX;
      const dz = z - lastSkidZ;
      if (dx * dx + dz * dz < 0.34) return;
      lastSkidX = x;
      lastSkidZ = z;
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const rightX = -cosY;
      const rightZ = sinY;
      for (const side of [-1, 1]) {
        const sx = x - sinY * 1.2 + rightX * side * trackHalf;
        const sz = z - cosY * 1.2 + rightZ * side * trackHalf;
        _dummyObj.position.set(sx, y + 0.032, sz);
        _dummyObj.rotation.set(0, yaw, 0);
        _dummyObj.scale.set(1, 1, 1);
        _dummyObj.updateMatrix();
        skidMesh.setMatrixAt(skidCursor, _dummyObj.matrix);
        skidCursor = (skidCursor + 1) % SKID_COUNT;
      }
      skidMesh.instanceMatrix.needsUpdate = true;
    }

    // 7. Mutable World State (Track, Cars, AI, Ghost, Race Session)
    let trackData: TrackData = buildTrackData(stateRef.current.trackId);
    let trackEnv = buildTrackEnvironment(trackData, maxAnisotropy);
    scene.add(trackEnv.group);

    let playerCar: BuiltCar = buildVehicleMesh(stateRef.current.vehicleConfig, {
      isSoftwareGl,
      maxAnisotropy,
      enableHeadlights: !isSoftwareGl,
    });
    scene.add(playerCar.root);

    let aiRacers: AiRacerState[] = [];
    let aiCars: BuiltCar[] = [];
    let ghostCar: BuiltCar | null = null;
    let ghostSamples: GhostSample[] | null = null;

    let playerPhysics: CarPhysicsState = createInitialPhysicsState(trackData, -34, 2.4);

    // Race progression tracking
    let countdownRemaining = 3.5;
    let lastCountdownInt = 4;
    let raceElapsedMs = 0;
    let currentLap = 1;
    let currentLapStartMs = 0;
    let bestLapMs: number | null = null;
    let lastLapMs: number | null = null;
    let topSpeedKmh = 0;
    let lastPlayerT = playerPhysics.trackProj.t;
    let playerTotalProgress = playerPhysics.trackProj.t - 1; // negative until crossing start line
    let crossedStartLine = false;
    let sectorFlags: [boolean, boolean] = [false, false];
    let sectorSplitsMs: [number | null, number | null, number | null] = [null, null, null];
    let hitstopTimer = 0;
    let shakeIntensity = 0;
    let recordedGhost: GhostSample[] = [];
    let nextGhostRecordTime = 0;
    let recordedFrames: ReplayFrame[] = [];
    let nextReplayRecordTime = 0;
    let lapSplitsMs: number[] = [];
    let lastTelemetryEmit = 0;
    let titleOrbitAngle = 0.65;

    // Special Mode State (Drift Attack + Knockout Elimination)
    const DRIFT_DURATION_SEC = 90;
    let driftScore = 0;
    let driftCurrentPts = 0;
    let driftSlideTime = 0;
    let driftMultiplier = 1;
    let driftIdleTimer = 0;
    let driftStatus: 'none' | 'sliding' | 'banked' | 'lost' = 'none';
    let driftStatusTimer = 0;

    let knockoutNextSec = 25;
    let knockoutBanner: string | null = null;
    let knockoutBannerTimer = 0;

    // Replay playback state
    let activeTrackRendered: TrackId = stateRef.current.trackId;
    let replayClockSec = 0;
    let replayEndedEmitted = false;
    let lastReplayTelemetryEmit = 0;
    let replayCars: BuiltCar[] = [];
    let replayGhostCar: BuiltCar | null = null;
    let lastTvAnchorIdx = -1;

    function syncPlayerHeadlightIntensity() {
      if (playerCar.headlightSpot) {
        playerCar.headlightSpot.intensity =
          trackData.spec.ambientTone === 'night' ? 22 : 2.5;
      }
    }

    function applyTrackLighting(tData: TrackData) {
      const isNight = tData.spec.ambientTone === 'night';
      scene.background = new THREE.Color(tData.spec.skyHorizonColor);
      scene.fog = new THREE.FogExp2(tData.spec.fogColor, tData.spec.fogDensity);
      if (isNight) {
        hemiLight.color.setHex(0x60a5fa);
        hemiLight.groundColor.setHex(0x0f172a);
        hemiLight.intensity = 0.9;
        keyLight.color.setHex(0xdbeafe);
        keyLight.intensity = 1.65;
        rimLight.color.setHex(0x22d3ee);
        rimLight.intensity = 1.1;
      } else {
        hemiLight.color.setHex(0x93c5fd);
        hemiLight.groundColor.setHex(0x5c3a28);
        hemiLight.intensity = 0.9;
        keyLight.color.setHex(0xffe7c2);
        keyLight.intensity = 2.3;
        rimLight.color.setHex(0xf97316);
        rimLight.intensity = 0.85;
      }
      syncPlayerHeadlightIntensity();
    }
    applyTrackLighting(trackData);

    function spawnAiPack() {
      aiCars.forEach((c) => {
        scene.remove(c.root);
        c.dispose();
      });
      aiCars = [];
      aiRacers = createAiRacers(
        trackData,
        stateRef.current.gameMode,
        stateRef.current.freeRoamTraffic
      );
      for (const ai of aiRacers) {
        const mesh = buildVehicleMesh(ai.config, { isSoftwareGl, maxAnisotropy });
        mesh.root.position.copy(ai.pos);
        mesh.root.rotation.y = ai.yaw;
        scene.add(mesh.root);
        aiCars.push(mesh);
      }
    }
    spawnAiPack();

    function updateGhostCar(ghost: { driverName: string; samples: GhostSample[] } | null) {
      if (ghostCar) {
        scene.remove(ghostCar.root);
        ghostCar.dispose();
        ghostCar = null;
      }
      ghostSamples = ghost?.samples ?? null;
      if (ghostSamples && ghostSamples.length > 0) {
        ghostCar = buildVehicleMesh(stateRef.current.vehicleConfig, {
          isSoftwareGl,
          maxAnisotropy,
          isGhost: true,
        });
        ghostCar.root.visible = false;
        scene.add(ghostCar.root);
      }
    }
    updateGhostCar(stateRef.current.activeGhost);

    function swapTrackIfNeeded(targetTrackId: TrackId) {
      if (activeTrackRendered === targetTrackId) return;
      scene.remove(trackEnv.group);
      trackEnv.dispose();
      trackData = buildTrackData(targetTrackId);
      trackEnv = buildTrackEnvironment(trackData, maxAnisotropy);
      scene.add(trackEnv.group);
      applyTrackLighting(trackData);
      activeTrackRendered = targetTrackId;
    }

    function clearReplayCars() {
      replayCars.forEach((c) => {
        scene.remove(c.root);
        c.dispose();
      });
      replayCars = [];
      if (replayGhostCar) {
        scene.remove(replayGhostCar.root);
        replayGhostCar.dispose();
        replayGhostCar = null;
      }
    }

    function buildFullSessionSnapshot(
      posRank: number,
      totalTimeOverrideMs?: number,
      driftScoreOverride?: number
    ): FullRaceSession {
      const curState = stateRef.current;
      const elapsedMs = Math.round(totalTimeOverrideMs ?? raceElapsedMs);
      const trackName = TRACK_SPECS[curState.trackId].name;
      const modeLabel =
        curState.gameMode === 'freeroam'
          ? 'Free Roam'
          : curState.gameMode === 'drift'
            ? `Drift ${Math.round(driftScoreOverride ?? driftScore).toLocaleString()} pts`
            : curState.gameMode === 'elimination'
              ? `Knockout P${posRank}`
              : `P${posRank} Finish`;
      return {
        id: `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title: `${trackName} · ${modeLabel}`,
        createdAt: new Date().toISOString(),
        trackId: curState.trackId,
        gameMode: curState.gameMode,
        driverName: curState.driverName || 'Apex Driver',
        vehicleConfig: { ...curState.vehicleConfig },
        aiParticipants: aiRacers.map((a) => ({
          id: a.id,
          name: a.name,
          config: { ...a.config },
        })),
        activeGhostName: curState.activeGhost?.driverName ?? null,
        totalTimeMs: elapsedMs,
        bestLapMs: bestLapMs ? Math.round(bestLapMs) : null,
        topSpeedKmh: Math.round(topSpeedKmh),
        position: posRank,
        totalRacers: aiRacers.length + 1,
        driftScore:
          curState.gameMode === 'drift'
            ? Math.round(driftScoreOverride ?? driftScore)
            : undefined,
        lapSplitsMs: lapSplitsMs.map((ms) => Math.round(ms)),
        frames: [...recordedFrames],
      };
    }

    if (captureSessionRef) {
      captureSessionRef.current = () => {
        if (recordedFrames.length < 4) return null;
        const posRank =
          1 + aiRacers.filter((a) => !a.eliminated && a.totalProgress > playerTotalProgress).length;
        return buildFullSessionSnapshot(posRank);
      };
    }

    function resetRaceSession() {
      clearReplayCars();
      clearSkidmarks();
      swapTrackIfNeeded(stateRef.current.trackId);
      const startDist =
        stateRef.current.gameMode === 'freeroam' || stateRef.current.gameMode === 'drift'
          ? -18
          : -34;
      playerPhysics = createInitialPhysicsState(trackData, startDist, 2.4);
      playerCar.root.position.copy(playerPhysics.pos);
      playerCar.root.rotation.y = playerPhysics.yaw;
      playerCar.bodyPivot.rotation.set(playerPhysics.slopePitch, 0, 0);

      spawnAiPack();
      updateGhostCar(stateRef.current.activeGhost);

      countdownRemaining = 3.4;
      lastCountdownInt = 4;
      raceElapsedMs = 0;
      currentLap = 1;
      currentLapStartMs = 0;
      bestLapMs = null;
      lastLapMs = null;
      topSpeedKmh = 0;
      lastPlayerT = playerPhysics.trackProj.t;
      playerTotalProgress = playerPhysics.trackProj.t - 1;
      crossedStartLine = false;
      sectorFlags = [false, false];
      sectorSplitsMs = [null, null, null];
      hitstopTimer = 0;
      shakeIntensity = 0;
      recordedGhost = [];
      nextGhostRecordTime = 0;
      recordedFrames = [];
      nextReplayRecordTime = 0;
      lapSplitsMs = [];

      driftScore = 0;
      driftCurrentPts = 0;
      driftSlideTime = 0;
      driftMultiplier = 1;
      driftIdleTimer = 0;
      driftStatus = 'none';
      driftStatusTimer = 0;

      knockoutNextSec = 25;
      knockoutBanner = null;
      knockoutBannerTimer = 0;

      // Reset start lights
      trackEnv.startLights.forEach((m) => {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.color.setHex(0x1e293b);
        mat.emissive.setHex(0x000000);
      });

      // Snap camera behind car on grid
      const backX = -Math.sin(playerPhysics.yaw) * 7.8;
      const backZ = -Math.cos(playerPhysics.yaw) * 7.8;
      camera.position.set(
        playerPhysics.pos.x + backX,
        playerPhysics.pos.y + 3.0,
        playerPhysics.pos.z + backZ
      );
      camera.lookAt(playerPhysics.pos.x, playerPhysics.pos.y + 1.0, playerPhysics.pos.z);
    }

    // Expose imperative hooks for React prop sync
    rebuildCarRef.current = (cfg: VehicleConfig) => {
      const pos = playerCar.root.position.clone();
      const yaw = playerCar.root.rotation.y;
      scene.remove(playerCar.root);
      playerCar.dispose();
      playerCar = buildVehicleMesh(cfg, {
        isSoftwareGl,
        maxAnisotropy,
        enableHeadlights: !isSoftwareGl,
      });
      playerCar.root.position.copy(pos);
      playerCar.root.rotation.y = yaw;
      scene.add(playerCar.root);
      syncPlayerHeadlightIntensity();
    };

    rebuildTrackRef.current = (tId: TrackId) => {
      swapTrackIfNeeded(tId);
      resetRaceSession();
    };

    function recoverCarOnTrack() {
      const curProj = playerPhysics.trackProj;
      const dist = curProj.t * trackData.totalLength;
      playerPhysics = createInitialPhysicsState(trackData, dist, 0);
      playerCar.root.position.copy(playerPhysics.pos);
      playerCar.root.rotation.y = playerPhysics.yaw;
      playerCar.bodyPivot.rotation.set(0, 0, 0);
    }

    enterReplayRef.current = (session: FullRaceSession) => {
      clearSkidmarks();
      swapTrackIfNeeded(session.trackId);

      // Hide live AI / ghost and spawn exact session participant meshes
      aiCars.forEach((c) => {
        c.root.visible = false;
      });
      if (ghostCar) ghostCar.root.visible = false;

      clearReplayCars();
      rebuildCarRef.current?.(session.vehicleConfig);

      for (const participant of session.aiParticipants) {
        const mesh = buildVehicleMesh(participant.config, {
          isSoftwareGl,
          maxAnisotropy,
        });
        scene.add(mesh.root);
        replayCars.push(mesh);
      }

      if (session.activeGhostName) {
        replayGhostCar = buildVehicleMesh(session.vehicleConfig, {
          isSoftwareGl,
          maxAnisotropy,
          isGhost: true,
        });
        replayGhostCar.root.visible = false;
        scene.add(replayGhostCar.root);
      }

      replayClockSec = 0;
      replayEndedEmitted = false;
      lastTvAnchorIdx = -1;
      lastReplayTelemetryEmit = 0;
    };

    exitReplayRef.current = () => {
      clearReplayCars();
      clearSkidmarks();
      swapTrackIfNeeded(stateRef.current.trackId);
      rebuildCarRef.current?.(stateRef.current.vehicleConfig);
      playerCar.root.position.copy(playerPhysics.pos);
      playerCar.root.rotation.y = playerPhysics.yaw;
      playerCar.bodyPivot.rotation.set(playerPhysics.slopePitch, 0, 0);
      aiCars.forEach((c, idx) => {
        const ai = aiRacers[idx];
        if (ai) {
          c.root.position.copy(ai.pos);
          c.root.rotation.y = ai.yaw;
        }
        c.root.visible = true;
      });
      if (ghostCar) ghostCar.root.visible = false;
      audio.updateTelemetry(1150, 8500, 0, 0, 0, false);
    };

    seekReplayRef.current = (timeSec: number) => {
      clearSkidmarks();
      replayClockSec = Math.max(0, timeSec);
      replayEndedEmitted = false;
      lastTvAnchorIdx = -1;
      lastReplayTelemetryEmit = 0;
    };

    resetRaceRef.current = resetRaceSession;
    recoverCarRef.current = recoverCarOnTrack;
    syncAiPackRef.current = spawnAiPack;
    syncGhostRef.current = updateGhostCar;

    // 8. Input Handling (separated held keys, cleared on blur)
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not hijack typing inside driver name input
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)
      ) {
        e.preventDefault();
      }
      audio.init();

      if (!e.repeat) {
        if (e.code === 'Escape') {
          if (stateRef.current.phase === 'racing' || stateRef.current.phase === 'paused') {
            stateRef.current.onTogglePause();
          }
        } else if (e.code === 'KeyC') {
          stateRef.current.onCycleCamera();
        } else if (e.code === 'KeyM') {
          stateRef.current.onToggleMute();
        } else if (e.code === 'KeyR' && stateRef.current.phase === 'racing') {
          recoverCarOnTrack();
        }
      }
      keys[e.code] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const onBlur = () => {
      Object.keys(keys).forEach((k) => {
        keys[k] = false;
      });
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) {
        composer.setSize(w, h);
      }
      if (bloomPass) {
        bloomPass.resolution.set(w, h);
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      stateRef.current.onContextLostChange?.(true);
    };
    const onContextRestored = () => {
      stateRef.current.onContextLostChange?.(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 9. Game Loop (Software WebGL paced via afterDraw, GPU via rAF)
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function readInputs(): CarInputState {
      const touch = touchInputRef.current;
      const up = keys['KeyW'] || keys['ArrowUp'] ? 1 : 0;
      const down = keys['KeyS'] || keys['ArrowDown'] ? 1 : 0;
      const left = keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0;
      const right = keys['KeyD'] || keys['ArrowRight'] ? 1 : 0;
      const hb = Boolean(keys['Space'] || touch.handbrake);
      const nitro = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyN'] || touch.nitro);

      return {
        throttle: Math.max(up, touch.throttle),
        brake: Math.max(down, touch.brake),
        steer: THREE.MathUtils.clamp(left - right + touch.steer, -1, 1),
        handbrake: hb,
        nitro,
      };
    }

    function getAudioPitchScale(chassis: VehicleConfig['chassis']): number {
      const cls = CHASSIS_SPECS[chassis].vehicleClass;
      if (cls === 'formula') return 1.28;
      if (cls === 'hypercar') return 1.1;
      if (cls === 'muscle') return 0.78;
      if (cls === 'rally') return 1.04;
      return 1.0;
    }

    function updateCarVisuals(
      car: BuiltCar,
      steerRad: number,
      spinRad: number,
      pitch: number,
      roll: number,
      slopePitch: number,
      brakeHeat: number,
      brakeInput: number,
      backfire: boolean,
      nitroActive = false
    ) {
      car.bodyPivot.rotation.x = slopePitch + pitch;
      car.bodyPivot.rotation.z = roll;
      car.frontSteerPivots[0].rotation.y = steerRad;
      car.frontSteerPivots[1].rotation.y = steerRad;
      for (let i = 0; i < 4; i++) {
        car.wheelSpinGroups[i].rotation.x = spinRad;
      }
      for (const m of car.brakeDiscMaterials) {
        m.emissiveIntensity = brakeHeat * 1.9;
      }
      car.taillightMaterial.emissiveIntensity = brakeInput > 0.1 ? 3.4 : 1.0;
      const showFlame = backfire || nitroActive;
      car.exhaustFlames[0].visible = showFlame;
      car.exhaustFlames[1].visible = showFlame;
      const flameScaleY = nitroActive ? 1.85 : 1.0;
      const flameScaleW = nitroActive ? 1.25 : 1.0;
      car.exhaustFlames[0].scale.set(flameScaleW, flameScaleY, flameScaleW);
      car.exhaustFlames[1].scale.set(flameScaleW, flameScaleY, flameScaleW);
    }

    function tick() {
      if (disposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const curState = stateRef.current;
      const curPhase = curState.phase;

      // Hitstop freeze on heavy barrier impact
      if (hitstopTimer > 0) {
        hitstopTimer -= dt;
      } else if (curPhase === 'countdown') {
        orbitControls.enabled = false;
        countdownRemaining -= dt;

        // Allow player to rev engine on the grid!
        const input = readInputs();
        const spec = CHASSIS_SPECS[curState.vehicleConfig.chassis];
        const targetRpm = 1150 + input.throttle * (spec.redlineRpm * 0.72);
        playerPhysics.rpm = THREE.MathUtils.damp(playerPhysics.rpm, targetRpm, 12, dt);
        audio.updateTelemetry(
          playerPhysics.rpm,
          spec.redlineRpm,
          input.throttle,
          0,
          0,
          true,
          false,
          getAudioPitchScale(curState.vehicleConfig.chassis)
        );

        const sec = Math.ceil(countdownRemaining);
        if (sec < lastCountdownInt && sec >= 1 && sec <= 3) {
          lastCountdownInt = sec;
          curState.onCountdownTick(sec);
          audio.playCountdownTone(false);
          // Illuminate start gantry lights progressively
          const litCount = 5 - (sec - 1) * 2;
          trackEnv.startLights.forEach((m, idx) => {
            const mat = m.material as THREE.MeshStandardMaterial;
            if (idx < litCount) {
              mat.color.setHex(0xef4444);
              mat.emissive.setHex(0xef4444);
            }
          });
        }

        if (countdownRemaining <= 0) {
          trackEnv.startLights.forEach((m) => {
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.color.setHex(0x10b981);
            mat.emissive.setHex(0x10b981);
          });
          audio.playCountdownTone(true);
          curState.onCountdownTick('GO');
          curState.onRaceStart();
          window.setTimeout(() => {
            stateRef.current.onCountdownTick(null);
          }, 950);
        }
      } else if (curPhase === 'racing') {
        orbitControls.enabled = false;
        const input = readInputs();
        const prevGear = playerPhysics.gear;

        // Check Slipstream Drafting behind any active AI rival
        const fwdX = Math.sin(playerPhysics.yaw);
        const fwdZ = Math.cos(playerPhysics.yaw);
        const rightX = -fwdZ;
        const rightZ = fwdX;
        let isDrafting = false;
        for (const ai of aiRacers) {
          if (ai.eliminated) continue;
          const dx = ai.pos.x - playerPhysics.pos.x;
          const dz = ai.pos.z - playerPhysics.pos.z;
          const fwdDot = dx * fwdX + dz * fwdZ;
          const latDot = dx * rightX + dz * rightZ;
          if (fwdDot > 4.5 && fwdDot < 25 && Math.abs(latDot) < 2.15) {
            isDrafting = true;
            break;
          }
        }

        // Step physics in two substeps for crisp high-speed stability
        const subDt = dt * 0.5;
        stepCarPhysics(playerPhysics, input, curState.vehicleConfig, trackData, subDt, isDrafting);
        stepCarPhysics(playerPhysics, input, curState.vehicleConfig, trackData, subDt, isDrafting);

        if (playerPhysics.gear > prevGear) {
          audio.playShiftPop();
        }

        if (playerPhysics.collisionImpulse > 3.5) {
          audio.playImpact(playerPhysics.collisionImpulse);
          shakeIntensity = Math.min(0.65, playerPhysics.collisionImpulse * 0.028);
          if (playerPhysics.collisionImpulse > 14) {
            hitstopTimer = 0.04;
          }
          // Spawn collision sparks
          for (let s = 0; s < 8; s++) {
            spawnParticle(
              playerPhysics.pos.x + (Math.random() - 0.5) * 1.4,
              playerPhysics.pos.y + 0.45,
              playerPhysics.pos.z + (Math.random() - 0.5) * 1.4,
              (Math.random() - 0.5) * 14,
              2 + Math.random() * 5,
              (Math.random() - 0.5) * 14,
              true
            );
          }
        }

        // Persistent Tire Skidmarks & Tire Smoke on drift / lockup / off-track
        if (
          playerPhysics.speedKmh > 25 &&
          (playerPhysics.slipRatio > 0.36 ||
            input.handbrake ||
            playerPhysics.absActive ||
            playerPhysics.trackProj.offTrack)
        ) {
          if (!playerPhysics.trackProj.offTrack) {
            const wheelTrackHalf =
              CHASSIS_SPECS[curState.vehicleConfig.chassis].trackWidthM * 0.5;
            laySkidPair(
              playerPhysics.pos.x,
              playerPhysics.pos.y,
              playerPhysics.pos.z,
              playerPhysics.yaw,
              wheelTrackHalf
            );
          }
          const sinY = Math.sin(playerPhysics.yaw);
          const cosY = Math.cos(playerPhysics.yaw);
          spawnParticle(
            playerPhysics.pos.x - sinY * 1.3 + (Math.random() - 0.5) * 1.1,
            playerPhysics.pos.y + 0.2,
            playerPhysics.pos.z - cosY * 1.3 + (Math.random() - 0.5) * 1.1,
            (Math.random() - 0.5) * 2.5,
            0.8 + Math.random() * 1.4,
            (Math.random() - 0.5) * 2.5,
            false
          );
        }

        // Advance race clock & laps
        raceElapsedMs += dt * 1000;
        topSpeedKmh = Math.max(topSpeedKmh, playerPhysics.speedKmh);

        // Drift Attack Mode Scoring Logic (90s challenge)
        let modeEndedThisTick = false;
        if (curState.gameMode === 'drift') {
          if (driftStatusTimer > 0) {
            driftStatusTimer = Math.max(0, driftStatusTimer - dt);
            if (driftStatusTimer === 0 && driftCurrentPts === 0) {
              driftStatus = 'none';
            }
          }

          if (playerPhysics.collisionImpulse > 6.5 && driftCurrentPts > 20) {
            driftCurrentPts = 0;
            driftSlideTime = 0;
            driftMultiplier = 1;
            driftIdleTimer = 0;
            driftStatus = 'lost';
            driftStatusTimer = 1.6;
          } else if (
            playerPhysics.speedKmh > 32 &&
            playerPhysics.slipRatio > 0.34 &&
            !playerPhysics.trackProj.offTrack
          ) {
            driftIdleTimer = 0;
            driftSlideTime += dt;
            driftMultiplier = Math.min(5, 1 + Math.floor(driftSlideTime / 2.2) * 0.5);
            driftCurrentPts +=
              playerPhysics.speedKmh * 1.55 * Math.min(1.4, playerPhysics.slipRatio) * dt;
            driftStatus = 'sliding';
          } else if (driftCurrentPts > 0) {
            driftIdleTimer += dt;
            if (driftIdleTimer >= 1.45) {
              driftScore += Math.round(driftCurrentPts * driftMultiplier);
              driftCurrentPts = 0;
              driftSlideTime = 0;
              driftMultiplier = 1;
              driftIdleTimer = 0;
              driftStatus = 'banked';
              driftStatusTimer = 1.5;
              audio.playDriftBank();
            }
          }
        }

        // Record ghost trajectory (~8 Hz)
        if (raceElapsedMs / 1000 >= nextGhostRecordTime && recordedGhost.length < 580) {
          recordedGhost.push({
            t: Number((raceElapsedMs / 1000).toFixed(2)),
            x: Number(playerPhysics.pos.x.toFixed(2)),
            y: Number(playerPhysics.pos.y.toFixed(2)),
            z: Number(playerPhysics.pos.z.toFixed(2)),
            yaw: Number(playerPhysics.yaw.toFixed(3)),
            steer: Number(playerPhysics.steerAngle.toFixed(3)),
          });
          nextGhostRecordTime += 0.14;
        }

        // Record full racing session frame (~20 Hz) for multi-angle replay & export
        const elapsedSec = raceElapsedMs / 1000;
        if (elapsedSec >= nextReplayRecordTime && recordedFrames.length < 18000) {
          let ghostSnap: ReplayFrame['ghost'];
          if (ghostSamples && ghostSamples.length > 0) {
            const gPose = sampleGhostAtTime(ghostSamples, elapsedSec);
            if (gPose) {
              ghostSnap = {
                x: Number(gPose.x.toFixed(2)),
                y: Number(gPose.y.toFixed(2)),
                z: Number(gPose.z.toFixed(2)),
                yaw: Number(gPose.yaw.toFixed(3)),
                steer: Number(gPose.steer.toFixed(3)),
              };
            }
          }
          recordedFrames.push({
            t: Number(elapsedSec.toFixed(3)),
            player: {
              x: Number(playerPhysics.pos.x.toFixed(2)),
              y: Number(playerPhysics.pos.y.toFixed(2)),
              z: Number(playerPhysics.pos.z.toFixed(2)),
              yaw: Number(playerPhysics.yaw.toFixed(3)),
              pitch: Number(playerPhysics.pitch.toFixed(3)),
              roll: Number(playerPhysics.roll.toFixed(3)),
              slopePitch: Number(playerPhysics.slopePitch.toFixed(3)),
              steer: Number(playerPhysics.steerAngle.toFixed(3)),
              wheelSpin: Number(playerPhysics.wheelSpin.toFixed(2)),
              speedKmh: Math.round(playerPhysics.speedKmh),
              rpm: Math.round(playerPhysics.rpm),
              gear: playerPhysics.gear,
              throttle: Number(input.throttle.toFixed(2)),
              brake: Number(input.brake.toFixed(2)),
              brakeHeat: Number(playerPhysics.brakeHeat.toFixed(2)),
              backfire: playerPhysics.backfireTimer > 0,
              nitroActive: playerPhysics.nitroActive,
              slipRatio: Number(playerPhysics.slipRatio.toFixed(2)),
              offTrack: playerPhysics.trackProj.offTrack,
              lap:
                curState.gameMode === 'freeroam' ||
                curState.gameMode === 'drift' ||
                curState.gameMode === 'elimination'
                  ? currentLap
                  : Math.min(currentLap, trackData.spec.laps),
            },
            ai: aiRacers.map((a) => ({
              x: Number(a.pos.x.toFixed(2)),
              y: Number(a.pos.y.toFixed(2)),
              z: Number(a.pos.z.toFixed(2)),
              yaw: Number(a.yaw.toFixed(3)),
              steer: Number(a.steerAngle.toFixed(3)),
              wheelSpin: Number(a.wheelSpin.toFixed(2)),
              speedKmh: Math.round(a.speedMs * 3.6),
              eliminated: a.eliminated,
            })),
            ghost: ghostSnap,
          });
          nextReplayRecordTime += 0.05;
        }

        // Lap & Sector detection
        const newT = playerPhysics.trackProj.t;
        if (lastPlayerT > 0.85 && newT < 0.15) {
          if (!crossedStartLine) {
            crossedStartLine = true;
            currentLapStartMs = raceElapsedMs;
            playerTotalProgress = newT;
          } else {
            const lapDuration = raceElapsedMs - currentLapStartMs;
            if (lapDuration > 8000) {
              lastLapMs = lapDuration;
              lapSplitsMs.push(lapDuration);
              if (bestLapMs === null || lapDuration < bestLapMs) {
                bestLapMs = lapDuration;
              }
              currentLap += 1;
              currentLapStartMs = raceElapsedMs;
              sectorFlags = [false, false];

              if (curState.gameMode === 'race' && currentLap > trackData.spec.laps) {
                modeEndedThisTick = true;
                const finalBest = bestLapMs ?? lapDuration;
                const posRank =
                  1 + aiRacers.filter((a) => a.totalProgress > playerTotalProgress).length;
                const fullSession = buildFullSessionSnapshot(posRank, raceElapsedMs);
                audio.updateTelemetry(1150, 8500, 0, 0, 0, false);
                curState.onRaceFinish({
                  bestLapMs: Math.round(finalBest),
                  totalTimeMs: Math.round(raceElapsedMs),
                  topSpeedKmh: Math.round(topSpeedKmh),
                  position: posRank,
                  ghost: recordedGhost,
                  session: fullSession,
                });
              }
            }
          }
        } else if (!crossedStartLine) {
          playerTotalProgress = newT - 1;
        } else {
          playerTotalProgress = (currentLap - 1) + newT;
          const lapElapsed = raceElapsedMs - currentLapStartMs;
          if (!sectorFlags[0] && newT >= 0.333 && newT < 0.6) {
            sectorFlags[0] = true;
            sectorSplitsMs[0] = lapElapsed;
          } else if (!sectorFlags[1] && newT >= 0.666) {
            sectorFlags[1] = true;
            sectorSplitsMs[1] = lapElapsed - (sectorSplitsMs[0] || 0);
          }
        }
        lastPlayerT = newT;

        // Finish Drift Attack at 90s
        if (!modeEndedThisTick && curState.gameMode === 'drift' && elapsedSec >= DRIFT_DURATION_SEC) {
          modeEndedThisTick = true;
          if (driftCurrentPts > 0) {
            driftScore += Math.round(driftCurrentPts * driftMultiplier);
            driftCurrentPts = 0;
          }
          const finalDrift = Math.round(driftScore);
          const finalBest = bestLapMs ?? raceElapsedMs;
          const fullSession = buildFullSessionSnapshot(1, raceElapsedMs, finalDrift);
          audio.updateTelemetry(1150, 8500, 0, 0, 0, false);
          curState.onRaceFinish({
            bestLapMs: Math.round(finalBest),
            totalTimeMs: Math.round(raceElapsedMs),
            topSpeedKmh: Math.round(topSpeedKmh),
            position: 1,
            driftScore: finalDrift,
            ghost: recordedGhost,
            session: fullSession,
          });
        }

        // Knockout Elimination Mode Logic
        if (!modeEndedThisTick && curState.gameMode === 'elimination') {
          if (knockoutBannerTimer > 0) {
            knockoutBannerTimer = Math.max(0, knockoutBannerTimer - dt);
            if (knockoutBannerTimer === 0) knockoutBanner = null;
          }
          knockoutNextSec -= dt;
          if (knockoutNextSec <= 0) {
            const activeAis = aiRacers.filter((a) => !a.eliminated);
            const activeCount = 1 + activeAis.length;
            let lowestAi: AiRacerState | null = null;
            for (const ai of activeAis) {
              if (!lowestAi || ai.totalProgress < lowestAi.totalProgress) {
                lowestAi = ai;
              }
            }
            if (!lowestAi || playerTotalProgress < lowestAi.totalProgress) {
              // Player was in last place when timer hit zero -> Knocked Out!
              modeEndedThisTick = true;
              audio.playKnockoutAlert();
              const finalBest = bestLapMs ?? raceElapsedMs;
              const fullSession = buildFullSessionSnapshot(activeCount, raceElapsedMs);
              audio.updateTelemetry(1150, 8500, 0, 0, 0, false);
              curState.onRaceFinish({
                bestLapMs: Math.round(finalBest),
                totalTimeMs: Math.round(raceElapsedMs),
                topSpeedKmh: Math.round(topSpeedKmh),
                position: activeCount,
                ghost: recordedGhost,
                session: fullSession,
              });
            } else {
              lowestAi.eliminated = true;
              audio.playKnockoutAlert();
              knockoutBanner = `${lowestAi.name} Eliminated`;
              knockoutBannerTimer = 2.8;
              knockoutNextSec = 22;
              const remainingAis = activeAis.length - 1;
              if (remainingAis <= 0) {
                modeEndedThisTick = true;
                const finalBest = bestLapMs ?? raceElapsedMs;
                const fullSession = buildFullSessionSnapshot(1, raceElapsedMs);
                audio.updateTelemetry(1150, 8500, 0, 0, 0, false);
                curState.onRaceFinish({
                  bestLapMs: Math.round(finalBest),
                  totalTimeMs: Math.round(raceElapsedMs),
                  topSpeedKmh: Math.round(topSpeedKmh),
                  position: 1,
                  ghost: recordedGhost,
                  session: fullSession,
                });
              }
            }
          }
        }

        // Sync player car transform
        playerCar.root.position.copy(playerPhysics.pos);
        playerCar.root.rotation.y = playerPhysics.yaw;
        updateCarVisuals(
          playerCar,
          playerPhysics.steerAngle,
          playerPhysics.wheelSpin,
          playerPhysics.pitch,
          playerPhysics.roll,
          playerPhysics.slopePitch,
          playerPhysics.brakeHeat,
          input.brake,
          playerPhysics.backfireTimer > 0,
          playerPhysics.nitroActive
        );

        // Step AI pack racers + car-to-car bumper collisions
        for (let i = 0; i < aiRacers.length; i++) {
          const ai = aiRacers[i];
          stepAiRacer(ai, aiRacers, trackData, dt, raceElapsedMs);

          if (ai.eliminated && ai.speedMs < 0.8) {
            aiCars[i].root.visible = false;
            continue;
          }

          // Player <-> AI soft elastic collision
          if (!ai.eliminated) {
            const dx = playerPhysics.pos.x - ai.pos.x;
            const dz = playerPhysics.pos.z - ai.pos.z;
            const dist = Math.hypot(dx, dz);
            const minSep = 2.45;
            if (dist > 0.01 && dist < minSep) {
              const nx = dx / dist;
              const nz = dz / dist;
              const overlap = minSep - dist;
              playerPhysics.pos.x += nx * overlap * 0.6;
              playerPhysics.pos.z += nz * overlap * 0.6;
              ai.pos.x -= nx * overlap * 0.4;
              ai.pos.z -= nz * overlap * 0.4;
              playerPhysics.vel.x += nx * 5.5;
              playerPhysics.vel.z += nz * 5.5;
              shakeIntensity = Math.max(shakeIntensity, 0.25);
              audio.playImpact(6);
            }
          }

          aiCars[i].root.visible = true;
          aiCars[i].root.position.copy(ai.pos);
          aiCars[i].root.rotation.y = ai.yaw;
          updateCarVisuals(aiCars[i], ai.steerAngle, ai.wheelSpin, 0, 0, 0, 0, 0, false);
        }

        // Step Ghost Rival Replay
        let ghostProgressForHud: {
          x: number;
          z: number;
          yaw: number;
          progress: number;
        } | null = null;
        if (ghostCar && ghostSamples) {
          const gPose = sampleGhostAtTime(ghostSamples, raceElapsedMs / 1000);
          if (gPose) {
            ghostCar.root.visible = true;
            ghostCar.root.position.set(gPose.x, gPose.y, gPose.z);
            ghostCar.root.rotation.y = gPose.yaw;
            updateCarVisuals(ghostCar, gPose.steer, raceElapsedMs * 0.04, 0, 0, 0, 0, 0, false);
            ghostProgressForHud = {
              x: gPose.x,
              z: gPose.z,
              yaw: gPose.yaw,
              progress: 0,
            };
          }
        }

        // Audio Telemetry
        const spec = CHASSIS_SPECS[curState.vehicleConfig.chassis];
        if (!modeEndedThisTick) {
          audio.updateTelemetry(
            playerPhysics.rpm,
            spec.redlineRpm,
            input.throttle,
            playerPhysics.slipRatio,
            playerPhysics.speedKmh,
            true,
            playerPhysics.nitroActive,
            getAudioPitchScale(curState.vehicleConfig.chassis)
          );
        }

        // Wrong-way check
        const dotFwd =
          fwdX * playerPhysics.trackProj.tangent.x + fwdZ * playerPhysics.trackProj.tangent.z;
        const wrongWay = playerPhysics.speedKmh > 18 && dotFwd < -0.35;

        // Emit HUD telemetry at ~20 Hz so React stays super fast
        const nowMs = performance.now();
        if (nowMs - lastTelemetryEmit > 48) {
          lastTelemetryEmit = nowMs;
          const activeAis = aiRacers.filter((a) => !a.eliminated);
          const rank =
            1 + activeAis.filter((a) => a.totalProgress > playerTotalProgress).length;
          const activeRacersCount = 1 + activeAis.length;

          const rivalsHud = aiRacers.map((a) => ({
            id: a.id,
            name: a.name,
            x: a.pos.x,
            z: a.pos.z,
            yaw: a.yaw,
            color: a.config.primaryColor,
            isGhost: false,
            lapProgress: a.totalProgress,
            eliminated: a.eliminated,
          }));
          if (ghostProgressForHud && curState.activeGhost) {
            rivalsHud.push({
              id: 'ghost-rival',
              name: curState.activeGhost.driverName,
              x: ghostProgressForHud.x,
              z: ghostProgressForHud.z,
              yaw: ghostProgressForHud.yaw,
              color: '#22d3ee',
              isGhost: true,
              lapProgress: 0,
              eliminated: false,
            });
          }

          curState.onTelemetry({
            speedKmh: Math.round(playerPhysics.speedKmh),
            rpm: Math.round(playerPhysics.rpm),
            redlineRpm: spec.redlineRpm,
            gear: playerPhysics.gear,
            throttle: input.throttle,
            brake: input.brake,
            handbrake: input.handbrake,
            steerAngle: playerPhysics.steerAngle,
            slipRatio: playerPhysics.slipRatio,
            absActive: playerPhysics.absActive,
            offTrack: playerPhysics.trackProj.offTrack,
            wrongWay,
            nitroPct: Math.round(playerPhysics.nitroPct),
            nitroActive: playerPhysics.nitroActive,
            drafting: playerPhysics.drafting,
            driftScore: Math.round(driftScore),
            driftCurrentPts: Math.round(driftCurrentPts),
            driftMultiplier,
            driftTimeRemainingSec: Math.max(0, DRIFT_DURATION_SEC - elapsedSec),
            driftStatus,
            knockoutNextSec: Math.max(0, knockoutNextSec),
            activeRacersCount,
            knockoutWarning:
              curState.gameMode === 'elimination' &&
              activeRacersCount > 1 &&
              rank === activeRacersCount,
            knockoutBanner,
            lap:
              curState.gameMode === 'freeroam' ||
              curState.gameMode === 'drift' ||
              curState.gameMode === 'elimination'
                ? currentLap
                : Math.min(currentLap, trackData.spec.laps),
            totalLaps: trackData.spec.laps,
            position: rank,
            totalRacers: activeRacersCount,
            currentLapMs: crossedStartLine ? Math.max(0, raceElapsedMs - currentLapStartMs) : 0,
            bestLapMs,
            lastLapMs,
            totalRaceMs: raceElapsedMs,
            sectorSplitsMs,
            deltaBestMs:
              bestLapMs && lastLapMs ? lastLapMs - bestLapMs : null,
            topSpeedKmh: Math.round(topSpeedKmh),
            progressNorm: playerPhysics.trackProj.t,
            playerPos: {
              x: playerPhysics.pos.x,
              z: playerPhysics.pos.z,
              yaw: playerPhysics.yaw,
            },
            rivals: rivalsHud,
          });
        }
      } else if (curPhase === 'replay' && curState.replaySession) {
        orbitControls.enabled = false;
        const session = curState.replaySession;
        const durationSec =
          session.frames.length > 0
            ? session.frames[session.frames.length - 1].t
            : 0;

        if (curState.replayPlaying && durationSec > 0) {
          replayClockSec += dt * curState.replaySpeed;
          if (replayClockSec >= durationSec) {
            replayClockSec = durationSec;
            if (!replayEndedEmitted) {
              replayEndedEmitted = true;
              curState.onReplayEnd?.();
            }
          }
        }

        const frame = sampleReplayAtTime(session.frames, replayClockSec);
        if (frame) {
          const p = frame.player;
          playerCar.root.position.set(p.x, p.y, p.z);
          playerCar.root.rotation.y = p.yaw;
          updateCarVisuals(
            playerCar,
            p.steer,
            p.wheelSpin,
            p.pitch,
            p.roll,
            p.slopePitch ?? 0,
            p.brakeHeat,
            p.brake,
            p.backfire,
            Boolean(p.nitroActive)
          );

          for (let i = 0; i < replayCars.length; i++) {
            const aiSnap = frame.ai[i];
            if (!aiSnap || (aiSnap.eliminated && aiSnap.speedKmh < 3)) {
              replayCars[i].root.visible = false;
              continue;
            }
            replayCars[i].root.visible = true;
            replayCars[i].root.position.set(aiSnap.x, aiSnap.y, aiSnap.z);
            replayCars[i].root.rotation.y = aiSnap.yaw;
            updateCarVisuals(
              replayCars[i],
              aiSnap.steer,
              aiSnap.wheelSpin,
              0,
              0,
              0,
              0,
              0,
              false
            );
          }

          if (replayGhostCar && frame.ghost) {
            replayGhostCar.root.visible = true;
            replayGhostCar.root.position.set(frame.ghost.x, frame.ghost.y, frame.ghost.z);
            replayGhostCar.root.rotation.y = frame.ghost.yaw;
            updateCarVisuals(replayGhostCar, frame.ghost.steer, replayClockSec * 24, 0, 0, 0, 0, 0, false);
          } else if (replayGhostCar) {
            replayGhostCar.root.visible = false;
          }

          // Focus target (player = -1, or AI participant index)
          const focusIdx = curState.replayFocusIndex;
          const focusAi =
            focusIdx >= 0 && focusIdx < frame.ai.length ? frame.ai[focusIdx] : null;
          const focusPos = focusAi
            ? _vecA.set(focusAi.x, focusAi.y, focusAi.z)
            : _vecA.set(p.x, p.y, p.z);
          const focusYaw = focusAi ? focusAi.yaw : p.yaw;
          const focusSpeedKmh = focusAi ? focusAi.speedKmh : p.speedKmh;
          const focusSpec = focusAi && session.aiParticipants[focusIdx]
            ? CHASSIS_SPECS[session.aiParticipants[focusIdx].config.chassis]
            : CHASSIS_SPECS[session.vehicleConfig.chassis];
          const focusName = focusAi && session.aiParticipants[focusIdx]
            ? session.aiParticipants[focusIdx].name
            : session.driverName;

          // Tire smoke & skidmarks during replay
          if (curState.replayPlaying && p.speedKmh > 25 && (p.slipRatio > 0.36 || p.offTrack)) {
            if (!p.offTrack) {
              laySkidPair(
                p.x,
                p.y,
                p.z,
                p.yaw,
                CHASSIS_SPECS[session.vehicleConfig.chassis].trackWidthM * 0.5
              );
            }
            const sY = Math.sin(p.yaw);
            const cY = Math.cos(p.yaw);
            spawnParticle(
              p.x - sY * 1.3 + (Math.random() - 0.5) * 1.1,
              p.y + 0.2,
              p.z - cY * 1.3 + (Math.random() - 0.5) * 1.1,
              (Math.random() - 0.5) * 2.5,
              0.8 + Math.random() * 1.4,
              (Math.random() - 0.5) * 2.5,
              false
            );
          }

          // Audio during replay
          const playerSpec = CHASSIS_SPECS[session.vehicleConfig.chassis];
          audio.updateTelemetry(
            p.rpm,
            playerSpec.redlineRpm,
            p.throttle,
            p.slipRatio,
            p.speedKmh,
            curState.replayPlaying,
            Boolean(p.nitroActive),
            getAudioPitchScale(session.vehicleConfig.chassis)
          );

          // Move shadow frustum onto focus car
          keyLight.position.set(focusPos.x + 55, focusPos.y + 85, focusPos.z + 40);
          keyLight.target.position.copy(focusPos);
          keyLight.target.updateMatrixWorld();

          // Multi-Angle Replay Camera Choreography
          const sinY = Math.sin(focusYaw);
          const cosY = Math.cos(focusYaw);
          const rightX = -cosY;
          const rightZ = sinY;
          const speedNorm = Math.min(1, focusSpeedKmh / 245);
          const angle = curState.replayCameraAngle;

          if (angle === 'tv') {
            const anchors = trackEnv.tvCameraAnchors;
            if (anchors.length > 0) {
              let bestIdx = 0;
              let bestDist = Infinity;
              for (let a = 0; a < anchors.length; a++) {
                const dist = anchors[a].pos.distanceTo(focusPos);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestIdx = a;
                }
              }
              // Hysteresis so TV cameras cut cleanly instead of flickering at midpoint
              if (lastTvAnchorIdx >= 0 && lastTvAnchorIdx < anchors.length) {
                const prevDist = anchors[lastTvAnchorIdx].pos.distanceTo(focusPos);
                if (prevDist < bestDist + 14) {
                  bestIdx = lastTvAnchorIdx;
                  bestDist = prevDist;
                }
              }
              lastTvAnchorIdx = bestIdx;
              const anchor = anchors[bestIdx];
              camera.position.copy(anchor.pos);
              _camTarget.set(focusPos.x, focusPos.y + 0.85, focusPos.z);
              camera.lookAt(_camTarget);
              const targetFov = THREE.MathUtils.clamp(56 - bestDist * 0.24, 24, 54);
              camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 7, dt);
            }
          } else if (angle === 'hood') {
            camera.position.set(
              focusPos.x + sinY * 1.12,
              focusPos.y + 1.28,
              focusPos.z + cosY * 1.12
            );
            _camTarget.set(
              focusPos.x + sinY * 22,
              focusPos.y + 1.0,
              focusPos.z + cosY * 22
            );
            camera.lookAt(_camTarget);
            camera.fov = THREE.MathUtils.damp(camera.fov, 68 + speedNorm * 16, 7, dt);
          } else if (angle === 'bumper') {
            camera.position.set(
              focusPos.x + sinY * 2.15,
              focusPos.y + 0.46,
              focusPos.z + cosY * 2.15
            );
            _camTarget.set(
              focusPos.x + sinY * 26,
              focusPos.y + 0.48,
              focusPos.z + cosY * 26
            );
            camera.lookAt(_camTarget);
            camera.fov = THREE.MathUtils.damp(camera.fov, 74 + speedNorm * 18, 8, dt);
          } else if (angle === 'fender') {
            camera.position.set(
              focusPos.x - rightX * 1.38 + sinY * 0.15,
              focusPos.y + 0.68,
              focusPos.z - rightZ * 1.38 + cosY * 0.15
            );
            _camTarget.set(
              focusPos.x + sinY * 4.8 - rightX * 0.25,
              focusPos.y + 0.36,
              focusPos.z + cosY * 4.8 - rightZ * 0.25
            );
            camera.lookAt(_camTarget);
            camera.fov = THREE.MathUtils.damp(camera.fov, 60, 7, dt);
          } else if (angle === 'helicopter') {
            const heliAngle = replayClockSec * 0.16 + 0.4;
            _camDesired.set(
              focusPos.x + Math.sin(heliAngle) * 20,
              focusPos.y + 13.5,
              focusPos.z + Math.cos(heliAngle) * 20
            );
            camera.position.lerp(_camDesired, 1 - Math.exp(-5 * dt));
            _camTarget.set(
              focusPos.x + sinY * 4,
              focusPos.y + 0.8,
              focusPos.z + cosY * 4
            );
            camera.lookAt(_camTarget);
            camera.fov = THREE.MathUtils.damp(camera.fov, 50, 5, dt);
          } else {
            // Chase cam
            const distBack = 7.4 + speedNorm * 1.2;
            const heightUp = 2.65 + speedNorm * 0.25;
            _camDesired.set(
              focusPos.x - sinY * distBack,
              focusPos.y + heightUp,
              focusPos.z - cosY * distBack
            );
            camera.position.lerp(_camDesired, 1 - Math.exp(-10.5 * dt));
            _camTarget.set(
              focusPos.x + sinY * 7.5,
              focusPos.y + 1.05,
              focusPos.z + cosY * 7.5
            );
            camera.lookAt(_camTarget);
            camera.fov = THREE.MathUtils.damp(camera.fov, 58 + speedNorm * 18, 6, dt);
          }
          camera.updateProjectionMatrix();

          const nowMs = performance.now();
          if (nowMs - lastReplayTelemetryEmit > 48) {
            lastReplayTelemetryEmit = nowMs;
            curState.onReplayTelemetry?.({
              currentTimeSec: replayClockSec,
              durationSec,
              speedKmh: Math.round(focusSpeedKmh),
              rpm: focusAi ? Math.round(3200 + (focusSpeedKmh / 260) * 5200) : Math.round(p.rpm),
              redlineRpm: focusSpec.redlineRpm,
              gear: focusAi ? Math.max(1, Math.min(6, Math.ceil(focusSpeedKmh / 44))) : p.gear,
              lap: p.lap,
              throttle: focusAi ? (focusSpeedKmh > 20 ? 0.8 : 0) : p.throttle,
              brake: focusAi ? 0 : p.brake,
              offTrack: focusAi ? false : p.offTrack,
              focusName,
            });
          }
        }
      } else {
        // Title, Garage, Paused, Finished: silence engine synth
        audio.updateTelemetry(1150, 8500, 0, 0, 0, false);
      }

      // Update Particles
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particlePool[i];
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummyObj.position.set(0, -100, 0);
          _dummyObj.scale.setScalar(0.001);
          _dummyObj.updateMatrix();
          particleMesh.setMatrixAt(i, _dummyObj.matrix);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.isSpark) p.vy -= 18 * dt;
        const frac = p.life / p.maxLife;
        const s = p.isSpark ? p.scale * (1 - frac) : p.scale * (0.6 + frac * 1.4);
        _dummyObj.position.set(p.x, p.y, p.z);
        _dummyObj.scale.setScalar(Math.max(0.01, s));
        _dummyObj.updateMatrix();
        particleMesh.setMatrixAt(i, _dummyObj.matrix);
        particleMesh.setColorAt(
          i,
          tmpColor.setHex(p.isSpark ? 0xfbbf24 : 0xcbd5e1)
        );
      }
      particleMesh.instanceMatrix.needsUpdate = true;
      if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;

      // Update KeyLight Shadow Frustum & Showroom Softboxes (when not in replay; replay handles keyLight above)
      if (curPhase !== 'replay') {
        keyLight.position.set(
          playerPhysics.pos.x + 55,
          playerPhysics.pos.y + 85,
          playerPhysics.pos.z + 40
        );
        keyLight.target.position.copy(playerPhysics.pos);
        keyLight.target.updateMatrixWorld();
      }

      if (garageSoftboxA && garageSoftboxB) {
        if (curPhase === 'garage') {
          garageSoftboxA.intensity = 4.2;
          garageSoftboxA.position.set(playerPhysics.pos.x + 2.5, playerPhysics.pos.y + 4.2, playerPhysics.pos.z + 2.0);
          garageSoftboxA.lookAt(playerPhysics.pos.x, playerPhysics.pos.y + 0.6, playerPhysics.pos.z);
          garageSoftboxB.intensity = 3.2;
          garageSoftboxB.position.set(playerPhysics.pos.x - 3.2, playerPhysics.pos.y + 3.4, playerPhysics.pos.z - 2.4);
          garageSoftboxB.lookAt(playerPhysics.pos.x, playerPhysics.pos.y + 0.6, playerPhysics.pos.z);
        } else {
          garageSoftboxA.intensity = 0;
          garageSoftboxB.intensity = 0;
        }
      }

      // Update Camera Choreography (non-replay phases)
      shakeIntensity = THREE.MathUtils.damp(shakeIntensity, 0, 10, dt);

      if (curPhase === 'title') {
        orbitControls.enabled = false;
        titleOrbitAngle += dt * 0.22;
        const radius = 7.4;
        _camDesired.set(
          playerPhysics.pos.x + Math.sin(titleOrbitAngle) * radius,
          playerPhysics.pos.y + 2.35,
          playerPhysics.pos.z + Math.cos(titleOrbitAngle) * radius
        );
        camera.position.lerp(_camDesired, 1 - Math.exp(-4 * dt));
        _camTarget.set(playerPhysics.pos.x, playerPhysics.pos.y + 0.85, playerPhysics.pos.z);
        camera.lookAt(_camTarget);
        camera.fov = THREE.MathUtils.damp(camera.fov, 54, 6, dt);
        camera.updateProjectionMatrix();
      } else if (curPhase === 'garage') {
        if (!orbitControls.enabled) {
          orbitControls.enabled = true;
          orbitControls.target.set(
            playerPhysics.pos.x,
            playerPhysics.pos.y + 0.75,
            playerPhysics.pos.z
          );
          camera.position.set(
            playerPhysics.pos.x + 5.2,
            playerPhysics.pos.y + 2.1,
            playerPhysics.pos.z + 4.8
          );
          orbitControls.update();
        }
        orbitControls.target.set(
          playerPhysics.pos.x,
          playerPhysics.pos.y + 0.75,
          playerPhysics.pos.z
        );
        orbitControls.update();
        camera.fov = THREE.MathUtils.damp(camera.fov, 48, 6, dt);
        camera.updateProjectionMatrix();
      } else if (curPhase !== 'replay') {
        orbitControls.enabled = false;
        const sinY = Math.sin(playerPhysics.yaw);
        const cosY = Math.cos(playerPhysics.yaw);
        const speedNorm = Math.min(1, playerPhysics.speedKmh / 240);
        const mode = curState.cameraMode;

        if (mode === 'hood') {
          _camDesired.set(
            playerPhysics.pos.x + sinY * 1.15,
            playerPhysics.pos.y + 1.28,
            playerPhysics.pos.z + cosY * 1.15
          );
          _camTarget.set(
            playerPhysics.pos.x + sinY * 22,
            playerPhysics.pos.y + 1.0,
            playerPhysics.pos.z + cosY * 22
          );
          camera.position.copy(_camDesired);
          camera.lookAt(_camTarget);
          const targetFov = 68 + speedNorm * 16;
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 7, dt);
        } else if (mode === 'orbit') {
          _camDesired.set(
            playerPhysics.pos.x - sinY * 12.5 - cosY * 5.0,
            playerPhysics.pos.y + 6.4,
            playerPhysics.pos.z - cosY * 12.5 + sinY * 5.0
          );
          _camTarget.set(
            playerPhysics.pos.x + sinY * 4.5,
            playerPhysics.pos.y + 0.9,
            playerPhysics.pos.z + cosY * 4.5
          );
          camera.position.lerp(_camDesired, 1 - Math.exp(-7 * dt));
          camera.lookAt(_camTarget);
          camera.fov = THREE.MathUtils.damp(camera.fov, 56, 6, dt);
        } else {
          // Dynamic Chase Cam with speed FOV + lateral turn lead
          const distBack = 7.4 + speedNorm * 1.2;
          const heightUp = 2.65 + speedNorm * 0.25;
          _vecA.set(
            playerPhysics.pos.x - sinY * distBack,
            playerPhysics.pos.y + heightUp,
            playerPhysics.pos.z - cosY * distBack
          );
          const dampFactor = 1 - Math.exp(-10.5 * dt);
          camera.position.lerp(_vecA, dampFactor);

          _camTarget.set(
            playerPhysics.pos.x + sinY * 7.5,
            playerPhysics.pos.y + 1.05,
            playerPhysics.pos.z + cosY * 7.5
          );
          camera.lookAt(_camTarget);

          const targetFov = 58 + speedNorm * 18 + (playerPhysics.nitroActive ? 5.5 : 0);
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
        }

        // Apply collision shake
        if (shakeIntensity > 0.005) {
          camera.position.x += (Math.random() - 0.5) * shakeIntensity;
          camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.7;
        }
        camera.updateProjectionMatrix();
      }

      if (composer && !isSoftwareGl) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      orbitControls.dispose();
      playerCar.dispose();
      aiCars.forEach((c) => c.dispose());
      ghostCar?.dispose();
      clearReplayCars();
      trackEnv.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      skidGeo.dispose();
      skidMat.dispose();
      envTex.dispose();
      composer?.dispose();
      audio.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [touchInputRef]);

  // Sync Vehicle Customization live (disabled during replay playback so replay car stays authentic)
  useEffect(() => {
    if (stateRef.current.phase !== 'replay') {
      rebuildCarRef.current?.(vehicleConfig);
    }
  }, [vehicleConfig]);

  // Sync Track Switch live
  useEffect(() => {
    if (stateRef.current.phase !== 'replay') {
      rebuildTrackRef.current?.(trackId);
    }
  }, [trackId]);

  // Sync New Race Session / Restart
  useEffect(() => {
    if (raceSessionId > 0) {
      resetRaceRef.current?.();
    }
  }, [raceSessionId]);

  // Sync Reset Car on Track
  useEffect(() => {
    if (resetCarToken > 0) {
      recoverCarRef.current?.();
    }
  }, [resetCarToken]);

  // Sync Free Roam Traffic toggle
  useEffect(() => {
    if (stateRef.current.phase !== 'racing' && stateRef.current.phase !== 'replay') {
      syncAiPackRef.current?.();
    }
  }, [gameMode, freeRoamTraffic]);

  const wasInReplayRef = useRef(false);

  // Sync Replay Entry / Exit
  useEffect(() => {
    if (phase === 'replay' && replaySession) {
      wasInReplayRef.current = true;
      enterReplayRef.current?.(replaySession);
    } else if (phase !== 'replay' && wasInReplayRef.current) {
      wasInReplayRef.current = false;
      exitReplayRef.current?.();
    }
  }, [phase, replaySession]);

  // Sync Replay Seek
  useEffect(() => {
    if (replaySeekTarget && phase === 'replay') {
      seekReplayRef.current?.(replaySeekTarget.timeSec);
    }
  }, [replaySeekTarget, phase]);

  // Sync Ghost Rival
  useEffect(() => {
    syncGhostRef.current?.(activeGhost);
  }, [activeGhost]);

  // Sync Mute State
  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  // Ensure audio initializes when entering countdown/racing/replay
  useEffect(() => {
    if (phase === 'countdown' || phase === 'racing' || phase === 'replay') {
      audioRef.current?.init();
    }
  }, [phase]);

  return <div ref={mountRef} className="absolute inset-0 w-full h-full overflow-hidden" />;
};
