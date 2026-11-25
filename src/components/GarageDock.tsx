import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Compass, Flag, Flame, RotateCcw, Zap } from 'lucide-react';
import {
  CHASSIS_SPECS,
  ChassisId,
  DEFAULT_VEHICLE_CONFIG,
  GameMode,
  GearRatioSetup,
  LiveryPattern,
  PaintFinish,
  RimStyle,
  SuspensionSetup,
  TireCompound,
  VEHICLE_CLASS_LABELS,
  VehicleClass,
  VehicleConfig,
  WingStyle,
} from '../game/types';

interface GarageDockProps {
  config: VehicleConfig;
  gameMode: GameMode;
  onChange: (next: VehicleConfig) => void;
  onBack: () => void;
  onStartRace: () => void;
}

type GarageTab = 'chassis' | 'paint' | 'aero' | 'tune';

const PAINT_SWATCHES = [
  '#e63946',
  '#2563eb',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#f8fafc',
  '#1e293b',
  '#f43f5e',
];

const ACCENT_SWATCHES = ['#f8fafc', '#0f172a', '#fbbf24', '#38bdf8', '#ef4444'];

const RIM_SWATCHES = ['#cbd5e1', '#1e293b', '#d97706', '#f8fafc', '#94a3b8'];

const ALL_CHASSIS_IDS: ChassisId[] = [
  'valkyrie',
  'monza',
  'dominator',
  'outlaw',
  'kurogane',
  'stratos',
  'titan',
  'spectre',
  'formula_f1',
  'formula_jr',
];

export const GarageDock: React.FC<GarageDockProps> = ({
  config,
  gameMode,
  onChange,
  onBack,
  onStartRace,
}) => {
  const [tab, setTab] = useState<GarageTab>('chassis');
  const [classFilter, setClassFilter] = useState<'all' | VehicleClass>('all');
  const [collapsed, setCollapsed] = useState(false);

  const spec = CHASSIS_SPECS[config.chassis];
  const powerKw = Math.round(spec.basePowerKw * config.engineMap);
  const gripScore = (
    (config.tires === 'slick' ? 1.32 : config.tires === 'semislick' ? 1.18 : 1.04) *
    (config.wing === 'timeattack' ? 1.08 : config.wing === 'gt' ? 1.04 : 1.0) *
    (spec.vehicleClass === 'formula' ? 1.35 : 1.0)
  ).toFixed(2);
  const estTopSpeed = Math.round(
    235 +
      (config.engineMap - 1) * 95 +
      (config.gearRatio === 'topspeed' ? 18 : config.gearRatio === 'accel' ? -14 : 0) -
      (config.wing === 'timeattack' ? 10 : config.wing === 'gt' ? 4 : 0) +
      (spec.vehicleClass === 'hypercar'
        ? 28
        : spec.vehicleClass === 'formula'
          ? 24
          : spec.vehicleClass === 'muscle'
            ? -4
            : spec.vehicleClass === 'rally'
              ? -12
              : 4)
  );

  const filteredChassis = ALL_CHASSIS_IDS.filter(
    (id) => classFilter === 'all' || CHASSIS_SPECS[id].vehicleClass === classFilter
  );

  const update = (patch: Partial<VehicleConfig>) => {
    onChange({ ...config, ...patch });
  };

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-5">
      {/* Minimal Top Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="pointer-events-auto flex items-center gap-3 bg-[#0a0d14]/88 border border-white/12 rounded-lg px-4 py-2.5">
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Back
          </button>
          <span aria-hidden="true" className="text-slate-600">/</span>
          <span className="font-display font-bold text-sm text-white whitespace-nowrap">
            Vehicle Garage
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            {VEHICLE_CLASS_LABELS[spec.vehicleClass]} · {spec.drivetrain.toUpperCase()}
          </span>
        </div>

        {/* Spec Readout + Launch Button */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-4 bg-[#0a0d14]/88 border border-white/12 rounded-lg px-4 py-2 text-xs font-mono-tabular">
            <div>
              <span className="text-slate-400 mr-1.5">PWR</span>
              <span className="text-white font-semibold">{powerKw} kW</span>
            </div>
            <div>
              <span className="text-slate-400 mr-1.5">MASS</span>
              <span className="text-white font-semibold">{spec.massKg} kg</span>
            </div>
            <div>
              <span className="text-slate-400 mr-1.5">GRIP</span>
              <span className="text-emerald-400 font-semibold">{gripScore} G</span>
            </div>
            <div>
              <span className="text-slate-400 mr-1.5">VMAX</span>
              <span className="text-amber-300 font-semibold">{estTopSpeed} km/h</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChange(DEFAULT_VEHICLE_CONFIG)}
            title="Reset to default build"
            className="p-2.5 rounded-lg bg-[#0a0d14]/88 border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onStartRace}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-display font-bold text-sm tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              gameMode === 'freeroam'
                ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                : gameMode === 'drift'
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                  : gameMode === 'elimination'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {gameMode === 'freeroam' ? (
              <Compass className="w-4 h-4" />
            ) : gameMode === 'drift' ? (
              <Flame className="w-4 h-4" />
            ) : gameMode === 'elimination' ? (
              <Zap className="w-4 h-4" />
            ) : (
              <Flag className="w-4 h-4" />
            )}
            <span>
              {gameMode === 'freeroam'
                ? 'Free Roam Build'
                : gameMode === 'drift'
                  ? 'Drift Build'
                  : gameMode === 'elimination'
                    ? 'Knockout Build'
                    : 'Race Build'}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Bottom Control Dock (Zero Center Occlusion) */}
      <div
        className="pointer-events-auto fixed left-1/2 bottom-5 -translate-x-1/2 w-[min(940px,94vw)] transition-transform duration-200 ease-out"
        style={{
          transform: collapsed
            ? 'translate(-50%, calc(100% - 26px))'
            : 'translate(-50%, 0)',
        }}
      >
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-1 rounded-t-lg bg-[#0a0d14]/92 border border-b-0 border-white/15 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            {collapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[#0a0d14]/92 border border-white/15 rounded-xl p-4 shadow-[0_14px_40px_rgba(0,0,0,0.65)]">
          {/* Category Tabs */}
          <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/10 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              {(
                [
                  ['chassis', 'Cars (10 Unlocked)'],
                  ['paint', 'Paint & Livery'],
                  ['aero', 'Aero & Wheels'],
                  ['tune', 'Performance Tune'],
                ] as Array<[GarageTab, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    tab === id
                      ? 'bg-red-600 text-white'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.09] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-400 whitespace-nowrap hidden sm:inline">
              {spec.name}
            </span>
          </div>

          {/* Tab Panels */}
          {tab === 'chassis' && (
            <div className="space-y-3">
              {/* Class Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    ['all', 'All Classes'],
                    ['gt', 'GT'],
                    ['muscle', 'Muscle'],
                    ['rally', 'Rally'],
                    ['hypercar', 'Hypercar'],
                    ['formula', 'Formula'],
                  ] as Array<['all' | VehicleClass, string]>
                ).map(([cls, label]) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setClassFilter(cls)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      classFilter === cls
                        ? 'bg-white text-slate-900'
                        : 'bg-white/[0.05] text-slate-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Scrollable / Grid Car Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[178px] overflow-y-auto pr-1">
                {filteredChassis.map((id) => {
                  const c = CHASSIS_SPECS[id];
                  const active = config.chassis === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ chassis: id })}
                      className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-white/10 border-red-500 text-white'
                          : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-sm truncate">
                          {c.name}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                          {VEHICLE_CLASS_LABELS[c.vehicleClass]} · {c.drivetrain.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                        {c.basePowerKw} kW · {c.massKg} kg · {c.redlineRpm} RPM
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{c.tagline}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'paint' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div>
                <div className="text-xs text-slate-400 mb-2">Primary Paint</div>
                <div className="flex flex-wrap gap-2">
                  {PAINT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => update({ primaryColor: hex })}
                      aria-label={`Color ${hex}`}
                      className={`w-7 h-7 rounded-md border-2 transition-transform cursor-pointer ${
                        config.primaryColor === hex
                          ? 'border-white scale-110'
                          : 'border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Finish & Accent</div>
                <div className="flex items-center gap-1.5 mb-2">
                  {(['metallic', 'matte', 'pearl'] as PaintFinish[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => update({ paintFinish: f })}
                      className={`px-2.5 py-1 rounded text-xs font-medium capitalize cursor-pointer ${
                        config.paintFinish === f
                          ? 'bg-white text-slate-900'
                          : 'bg-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {ACCENT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => update({ accentColor: hex })}
                      aria-label={`Accent ${hex}`}
                      className={`w-6 h-6 rounded border cursor-pointer ${
                        config.accentColor === hex ? 'border-red-400 scale-110' : 'border-white/20'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Livery & Number</span>
                  <span className="font-mono-tabular text-slate-200">#{config.racingNumber}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(['clean', 'stripe', 'apex', 'checker'] as LiveryPattern[]).map((liv) => (
                    <button
                      key={liv}
                      type="button"
                      onClick={() => update({ livery: liv })}
                      className={`px-2.5 py-1 rounded text-xs font-medium capitalize cursor-pointer ${
                        config.livery === liv
                          ? 'bg-white text-slate-900'
                          : 'bg-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {liv}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={1}
                  max={99}
                  value={config.racingNumber}
                  onChange={(e) => update({ racingNumber: Number(e.target.value) })}
                  className="w-full accent-red-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {tab === 'aero' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-slate-400 mb-2">Rear Aero Wing</div>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      ['lip', 'Low-Drag Lip Spoiler'],
                      ['gt', 'GT Carbon Wing'],
                      ['timeattack', 'Time-Attack Dual Plane'],
                    ] as Array<[WingStyle, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ wing: id })}
                      className={`text-left px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
                        config.wing === id
                          ? 'bg-white text-slate-900'
                          : 'bg-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Wheel Rim Design</div>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      ['forged5', '5-Spoke Forged'],
                      ['mesh', '8-Spoke Track Mesh'],
                      ['turbofan', 'Aero Turbofan'],
                    ] as Array<[RimStyle, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ rims: id })}
                      className={`text-left px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
                        config.rims === id
                          ? 'bg-white text-slate-900'
                          : 'bg-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Rim Finish</div>
                <div className="flex flex-wrap gap-2">
                  {RIM_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => update({ rimColor: hex })}
                      aria-label={`Rim color ${hex}`}
                      className={`w-8 h-8 rounded-md border-2 cursor-pointer ${
                        config.rimColor === hex ? 'border-red-500 scale-105' : 'border-white/20'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'tune' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>ECU Power Map</span>
                  <span className="font-mono-tabular text-amber-300">
                    {Math.round(config.engineMap * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={1.3}
                  step={0.05}
                  value={config.engineMap}
                  onChange={(e) => update({ engineMap: Number(e.target.value) })}
                  className="w-full accent-red-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>Stock</span>
                  <span>Stage 3</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Tire Compound</div>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      ['sport', 'Street Sport'],
                      ['semislick', 'Semi-Slick'],
                      ['slick', 'Track Slick'],
                    ] as Array<[TireCompound, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ tires: id })}
                      className={`text-left px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                        config.tires === id
                          ? 'bg-white text-slate-900'
                          : 'bg-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Suspension</div>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      ['soft', 'Compliant / Curb'],
                      ['track', 'Balanced Track'],
                      ['stiff', 'Stiff Aero'],
                    ] as Array<[SuspensionSetup, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ suspension: id })}
                      className={`text-left px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                        config.suspension === id
                          ? 'bg-white text-slate-900'
                          : 'bg-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Final Drive Gear</div>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      ['accel', 'Short Acceleration'],
                      ['balanced', 'Balanced'],
                      ['topspeed', 'Tall Top Speed'],
                    ] as Array<[GearRatioSetup, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ gearRatio: id })}
                      className={`text-left px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                        config.gearRatio === id
                          ? 'bg-white text-slate-900'
                          : 'bg-white/[0.06] text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
