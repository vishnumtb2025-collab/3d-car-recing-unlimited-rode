import React, { useRef, useState } from 'react';
import {
  CustomButtonPosition,
  DEFAULT_BUTTON_LAYOUT,
  PlayerPrefs,
  PlayerPrefsData,
} from '../data/carData';
import { SoundEngine } from '../audio/SoundEngine';

interface CustomControlsModalProps {
  prefs: PlayerPrefsData;
  onUpdatePrefs: (updater: (prev: PlayerPrefsData) => PlayerPrefsData) => void;
  onClose: () => void;
}

const DRAGGABLE_BUTTONS: { key: string; label: string; color: string }[] = [
  { key: 'left', label: '◀ LEFT', color: 'border-sky-400 bg-slate-800/90' },
  { key: 'right', label: 'RIGHT ▶', color: 'border-sky-400 bg-slate-800/90' },
  { key: 'brake', label: 'BRAKE', color: 'border-rose-400 bg-rose-950/80' },
  { key: 'accel', label: 'GAS', color: 'border-emerald-400 bg-emerald-950/80' },
  { key: 'nitro', label: 'NITRO', color: 'border-cyan-400 bg-cyan-950/80' },
  { key: 'horn', label: 'HORN !', color: 'border-amber-400 bg-amber-950/80' },
];

export const CustomControlsModal: React.FC<CustomControlsModalProps> = ({
  prefs,
  onUpdatePrefs,
  onClose,
}) => {
  const layoutBoxRef = useRef<HTMLDivElement | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const layout: Record<string, CustomButtonPosition> = {
    ...DEFAULT_BUTTON_LAYOUT,
    ...(prefs.customButtonLayout || {}),
  };

  const handleClose = () => {
    SoundEngine.playUiClick();
    onClose();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingKey || !layoutBoxRef.current) return;
    const rect = layoutBoxRef.current.getBoundingClientRect();
    const xPct = Math.max(8, Math.min(92, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const yPct = Math.max(15, Math.min(88, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

    onUpdatePrefs((prev) => ({
      ...prev,
      customButtonLayout: {
        ...(prev.customButtonLayout || DEFAULT_BUTTON_LAYOUT),
        [draggingKey]: { x: xPct, y: yPct },
      },
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-backdrop-dim"
      onClick={handleClose}
    >
      <div
        className="panel-glass rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto car-strip-scroll p-5 border border-sky-400/40 shadow-2xl animate-popup-open"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar with BACK Button + Title + Close X */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/15">
          <button
            onClick={handleClose}
            className="btn-back-punch flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/20 text-white font-hud font-bold text-xs uppercase cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            <span>BACK</span>
          </button>

          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
            </svg>
            <h2 className="font-display font-bold text-base sm:text-lg text-white uppercase tracking-wider">
              Custom Controller Settings & Layout Editor
            </h2>
          </div>

          <button
            onClick={handleClose}
            className="btn-punch w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/80 flex items-center justify-center text-white font-bold text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left 5 Cols: Toggles & Sliders */}
          <div className="lg:col-span-5 space-y-3">
            {/* Steering Wheel Toggle ON/OFF */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/85 border border-white/10">
              <span className="text-xs font-hud font-bold text-white uppercase">
                Steering Wheel Toggle
              </span>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  onUpdatePrefs((p) => ({
                    ...p,
                    steeringWheel: true,
                    buttons: false,
                    tilt: false,
                  }));
                }}
                className={`w-11 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer ${
                  !prefs.tilt && prefs.steeringWheel ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
                    !prefs.tilt && prefs.steeringWheel ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Arrow Buttons Toggle ON/OFF */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/85 border border-white/10">
              <span className="text-xs font-hud font-bold text-white uppercase">
                Buttons Toggle
              </span>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  onUpdatePrefs((p) => ({
                    ...p,
                    buttons: true,
                    steeringWheel: false,
                    tilt: false,
                  }));
                }}
                className={`w-11 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer ${
                  !prefs.tilt && prefs.buttons ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
                    !prefs.tilt && prefs.buttons ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Tilt Control Toggle ON/OFF */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/85 border border-sky-400/30">
              <div>
                <span className="text-xs font-hud font-bold text-sky-300 uppercase block">
                  Tilt Toggle (16:9 Landscape)
                </span>
                <span className="text-[10px] text-slate-400">
                  {prefs.tilt
                    ? 'ON: tiltSteer ONLY (-rawY * 2.0f)'
                    : 'OFF: buttonSteer ONLY (Tilt Ignored)'}
                </span>
              </div>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  onUpdatePrefs((p) => {
                    const nextTilt = !p.tilt;
                    return {
                      ...p,
                      tilt: nextTilt,
                      steeringWheel: nextTilt ? false : !p.buttons,
                      buttons: nextTilt ? false : p.buttons,
                    };
                  });
                }}
                className={`w-11 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer ${
                  prefs.tilt ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
                    prefs.tilt ? 'translate-x-5.5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Sliders: Tilt Sensitivity, Steering Sensitivity, Button Size */}
            <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10 space-y-2.5">
              <div>
                <div className="flex justify-between text-xs font-hud mb-1">
                  <span className="text-slate-300">Tilt Sensitivity (Default 65%)</span>
                  <span className="text-sky-400 font-bold">{prefs.tiltSensitivity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.tiltSensitivity}
                  onChange={(e) =>
                    onUpdatePrefs((p) => ({ ...p, tiltSensitivity: Number(e.target.value) }))
                  }
                  className="w-full h-1.5 bg-slate-700 rounded-lg accent-sky-400 cursor-pointer"
                />
                <button
                  onClick={() => {
                    SoundEngine.playStuntBonus();
                    onUpdatePrefs((p) => ({ ...p, tiltCalibrationOffsetY: 0 }));
                  }}
                  className="btn-punch mt-2 w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-hud font-bold text-[11px] uppercase tracking-wider cursor-pointer"
                >
                  Calibrate Tilt (Save Current Position = 0 Center)
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs font-hud mb-1">
                  <span className="text-slate-300">Steering Sensitivity</span>
                  <span className="text-amber-400 font-bold">{prefs.steeringSensitivity}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={prefs.steeringSensitivity}
                  onChange={(e) =>
                    onUpdatePrefs((p) => ({ ...p, steeringSensitivity: Number(e.target.value) }))
                  }
                  className="w-full h-1.5 bg-slate-700 rounded-lg accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-hud mb-1">
                  <span className="text-slate-300">Button Size</span>
                  <span className="text-emerald-400 font-bold">{prefs.buttonSize}%</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={140}
                  value={prefs.buttonSize}
                  onChange={(e) =>
                    onUpdatePrefs((p) => ({ ...p, buttonSize: Number(e.target.value) }))
                  }
                  className="w-full h-1.5 bg-slate-700 rounded-lg accent-emerald-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right 7 Cols: Drag to Reposition Buttons on Screen (Custom Layout Canvas) */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-hud font-bold text-xs text-sky-300 uppercase">
                Drag to Reposition Buttons on Screen (Custom Layout)
              </span>
              <span className="text-[11px] text-slate-400">
                Click & Drag any control button below
              </span>
            </div>

            <div
              ref={layoutBoxRef}
              onPointerMove={handlePointerMove}
              onPointerUp={() => setDraggingKey(null)}
              onPointerLeave={() => setDraggingKey(null)}
              className="relative w-full aspect-16/9 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-2 border-dashed border-sky-400/35 overflow-hidden select-none"
            >
              {/* Simulated Highway Perspective Lines */}
              <div className="absolute inset-0 opacity-20 pointer-events-none flex items-center justify-center">
                <span className="font-display font-bold text-xs text-slate-400 uppercase tracking-widest">
                  16:9 In-Race HUD Custom Layout Preview
                </span>
              </div>

              {/* Center Tachometer Preview */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded-t-full bg-slate-900/90 border border-white/15 text-center pointer-events-none">
                <span className="font-hud font-black text-xs text-white">145 KM/h</span>
              </div>

              {DRAGGABLE_BUTTONS.map((btn) => {
                const pos = layout[btn.key] || DEFAULT_BUTTON_LAYOUT[btn.key];
                const scale = (prefs.buttonSize || 100) / 100;
                return (
                  <div
                    key={btn.key}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      SoundEngine.playUiClick();
                      setDraggingKey(btn.key);
                    }}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: `translate(-50%, -50%) scale(${scale})`,
                    }}
                    className={`absolute px-3 py-2 rounded-xl border-2 font-hud font-bold text-[11px] text-white shadow-lg cursor-grab active:cursor-grabbing transition-shadow ${
                      btn.color
                    } ${draggingKey === btn.key ? 'ring-2 ring-white z-20' : 'z-10'}`}
                  >
                    {btn.label}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions: Reset to Default & Save */}
            <div className="flex items-center justify-between gap-3 mt-3">
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  onUpdatePrefs((curr) => PlayerPrefs.resetControllerDefaults(curr));
                }}
                className="btn-punch py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 font-hud font-bold text-xs text-slate-200 uppercase cursor-pointer"
              >
                Reset to Default
              </button>

              {savedNotice && (
                <span className="font-hud font-bold text-xs text-emerald-400">
                  ✓ Saved to PlayerPrefs!
                </span>
              )}

              <button
                onClick={() => {
                  SoundEngine.playCoinCollect();
                  PlayerPrefs.save(prefs);
                  setSavedNotice(true);
                  setTimeout(() => {
                    setSavedNotice(false);
                    onClose();
                  }, 450);
                }}
                className="btn-punch flex-1 py-2.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-display font-black text-xs text-slate-950 uppercase tracking-wider shadow-[0_0_18px_rgba(16,185,129,0.5)] cursor-pointer"
              >
                Save & Apply Layout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
