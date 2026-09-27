import React, { useEffect, useRef, useState } from 'react';
import { GraphicsQuality, PlayerPrefs, PlayerPrefsData } from '../data/carData';
import { SoundEngine } from '../audio/SoundEngine';

interface SettingsModalProps {
  prefs: PlayerPrefsData;
  onUpdatePrefs: (updater: (prev: PlayerPrefsData) => PlayerPrefsData) => void;
  onClose: () => void;
  onOpenUnityScripts: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  prefs,
  onUpdatePrefs,
  onClose,
  onOpenUnityScripts,
}) => {
  const latestRawYRef = useRef<number>(0);
  const [liveRawY, setLiveRawY] = useState<number>(0);
  const [calibratedToast, setCalibratedToast] = useState<string | null>(null);

  useEffect(() => {
    let hasMotion = false;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (acc && acc.y !== null && acc.y !== undefined) {
        hasMotion = true;
        const rawY = Math.max(-1, Math.min(1, acc.y / 9.81));
        latestRawYRef.current = rawY;
        setLiveRawY(rawY);
      }
    };
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (hasMotion) return;
      if (e.beta !== null && e.beta !== undefined) {
        // In 16:9 LandscapeLeft, portrait Y-axis tilt corresponds to beta (-90..90 deg)
        const rawY = Math.max(-1, Math.min(1, -e.beta / 45));
        latestRawYRef.current = rawY;
        setLiveRawY(rawY);
      }
    };
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, []);

  const requestSensorPermissionIfNeeded = () => {
    try {
      const dm = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof dm?.requestPermission === 'function') {
        dm.requestPermission().catch(() => {});
      }
      const doEvt = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof doEvt?.requestPermission === 'function') {
        doEvt.requestPermission().catch(() => {});
      }
    } catch {
      // Ignore on standard Android/Desktop browsers
    }
  };

  const setControlMode = (mode: 'wheel' | 'buttons' | 'tilt') => {
    SoundEngine.playUiClick();
    if (mode === 'tilt') {
      requestSensorPermissionIfNeeded();
    }
    onUpdatePrefs((prev) => ({
      ...prev,
      steeringWheel: mode === 'wheel',
      buttons: mode === 'buttons',
      tilt: mode === 'tilt',
    }));
  };

  const toggleTiltOnOff = () => {
    SoundEngine.playUiClick();
    const nextTilt = !prefs.tilt;
    if (nextTilt) {
      requestSensorPermissionIfNeeded();
    }
    onUpdatePrefs((prev) => ({
      ...prev,
      tilt: nextTilt,
      steeringWheel: nextTilt ? false : !prev.buttons,
      buttons: nextTilt ? false : prev.buttons,
    }));
  };

  const handleCalibrateTilt = () => {
    SoundEngine.playStuntBonus();
    requestSensorPermissionIfNeeded();
    const centerY = Number(latestRawYRef.current.toFixed(4));
    onUpdatePrefs((prev) => ({
      ...prev,
      tiltCalibrationOffsetY: centerY,
    }));
    setCalibratedToast(`Tilt Calibrated! Current 16:9 phone position (${centerY >= 0 ? '+' : ''}${centerY.toFixed(2)}) saved as 0 Center.`);
    window.setTimeout(() => setCalibratedToast(null), 2800);
  };

  const handleClose = () => {
    SoundEngine.playUiClick();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-backdrop-dim"
      onClick={handleClose}
    >
      <div
        className="panel-glass rounded-2xl w-full max-w-xl p-5 sm:p-6 border border-slate-500/50 shadow-2xl animate-popup-open max-h-[90vh] overflow-y-auto car-strip-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Top-Left BACK Button + Title + Top-Right X Button */}
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
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-wider uppercase">
              Settings
            </h2>
          </div>

          <button
            onClick={handleClose}
            className="btn-punch w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/80 flex items-center justify-center text-sm font-bold text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Row 1: Sound ON/OFF Toggle & Vibration ON/OFF Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/85 border border-white/10">
              <div>
                <span className="text-xs sm:text-sm font-hud font-bold text-white block">
                  Sound ON/OFF
                </span>
                <span className="text-[10px] text-slate-400">Engine, Nitro & Screech</span>
              </div>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  onUpdatePrefs((p) => {
                    const next = !p.soundOn;
                    SoundEngine.setConfig(next, p.musicOn);
                    return { ...p, soundOn: next };
                  });
                }}
                className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                  prefs.soundOn ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    prefs.soundOn ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/85 border border-white/10">
              <div>
                <span className="text-xs sm:text-sm font-hud font-bold text-white block">
                  Vibration ON/OFF
                </span>
                <span className="text-[10px] text-slate-400">Crash & Shift Haptics</span>
              </div>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  onUpdatePrefs((p) => ({ ...p, vibrationOn: !p.vibrationOn }));
                }}
                className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                  prefs.vibrationOn ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    prefs.vibrationOn ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Row 2: Music ON/OFF Slider */}
          <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-hud font-bold text-white">
                  Music ON/OFF & Volume
                </span>
                <button
                  onClick={() => {
                    SoundEngine.playUiClick();
                    onUpdatePrefs((p) => {
                      const next = !p.musicOn;
                      SoundEngine.setConfig(p.soundOn, next);
                      return { ...p, musicOn: next, musicVolume: next ? Math.max(25, p.musicVolume) : 0 };
                    });
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-hud font-bold uppercase cursor-pointer ${
                    prefs.musicOn ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {prefs.musicOn ? 'ON' : 'OFF'}
                </button>
              </div>
              <span className="text-xs font-hud font-bold text-sky-400">
                {prefs.musicOn ? `${prefs.musicVolume}%` : '0%'}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={prefs.musicOn ? prefs.musicVolume : 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                onUpdatePrefs((p) => ({
                  ...p,
                  musicVolume: val,
                  musicOn: val > 0,
                }));
              }}
              className="w-full h-1.5 bg-slate-700 rounded-lg accent-sky-400 cursor-pointer"
            />
          </div>

          {/* Row 3: Graphics Quality (Low / Med / High) */}
          <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-sm font-hud font-bold text-white">
                Graphics Quality (Low / Med / High)
              </span>
              <span className="text-xs font-hud text-sky-400 font-bold">
                {prefs.graphicsQuality} (60 FPS)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['Low', 'Med', 'High'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    SoundEngine.playUiClick();
                    onUpdatePrefs((p) => ({ ...p, graphicsQuality: q }));
                  }}
                  className={`btn-punch py-2 rounded-lg font-hud font-bold text-xs tracking-wider uppercase transition-all cursor-pointer ${
                    prefs.graphicsQuality === q
                      ? 'bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Control Type -> Tilt Toggle ON/OFF + 16:9 Sensitivity (Default 65%) + Calibrate Tilt */}
          <div className="p-3.5 rounded-xl bg-slate-900/85 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs sm:text-sm font-hud font-bold text-white block">
                  Control Type (16:9 LandscapeLeft)
                </span>
                <span className="text-[10px] text-slate-400">
                  {prefs.tilt
                    ? 'TILT ON: steerInput = tiltSteer ONLY (-rawY * 2.0f, Wheel/Buttons Hidden)'
                    : 'TILT OFF: steerInput = buttonSteer ONLY (Input.acceleration Ignored = 0)'}
                </span>
              </div>
              <span className="text-xs font-hud text-emerald-400 font-bold">
                {prefs.tilt ? 'TILT MODE ON' : prefs.steeringWheel ? 'Steering Wheel' : 'Buttons'}
              </span>
            </div>

            {/* Dedicated Tilt Toggle ON/OFF Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-sky-400/30">
              <div>
                <span className="text-xs font-hud font-extrabold text-sky-300 uppercase block">
                  Tilt Toggle ON / OFF
                </span>
                <span className="text-[10px] text-slate-400">
                  {prefs.tilt
                    ? 'ON: 16:9 Y-Axis Tilt Active • Steering Wheel Hidden'
                    : 'OFF: Phone Tilt Ignored (0) • Steering Wheel / Buttons Active'}
                </span>
              </div>
              <button
                onClick={toggleTiltOnOff}
                className={`px-3.5 py-1.5 rounded-lg font-hud font-black text-xs uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  prefs.tilt
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_14px_rgba(16,185,129,0.6)]'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                <span>TILT: {prefs.tilt ? 'ON' : 'OFF'}</span>
                <div className="w-8 h-4 rounded-full bg-black/30 p-0.5 flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      prefs.tilt ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setControlMode('wheel')}
                className={`btn-punch py-2 rounded-lg font-hud font-bold text-xs uppercase transition-all cursor-pointer ${
                  !prefs.tilt && prefs.steeringWheel
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Steering Wheel
              </button>
              <button
                onClick={() => setControlMode('buttons')}
                className={`btn-punch py-2 rounded-lg font-hud font-bold text-xs uppercase transition-all cursor-pointer ${
                  !prefs.tilt && prefs.buttons
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Buttons
              </button>
              <button
                onClick={() => setControlMode('tilt')}
                className={`btn-punch py-2 rounded-lg font-hud font-bold text-xs uppercase transition-all cursor-pointer ${
                  prefs.tilt
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Tilt (16:9)
              </button>
            </div>

            {/* Tilt Sensitivity 0-100% (Default 65%) */}
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Tilt Sensitivity (0–100%, Default 65%)</span>
                <span className="font-hud font-bold text-sky-400">
                  {prefs.tiltSensitivity}% ({((prefs.tiltSensitivity ?? 65) / 50).toFixed(2)}x)
                </span>
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
            </div>

            {/* 5) Calibration Button: "Calibrate Tilt" */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
              <div className="text-[11px] text-slate-300">
                <span className="font-hud font-bold text-white block">
                  16:9 Tilt Center Calibration
                </span>
                <span className="text-[10px] text-slate-400">
                  Saved Center Offset Y:{' '}
                  <strong className="text-amber-300">
                    {(prefs.tiltCalibrationOffsetY ?? 0).toFixed(2)}
                  </strong>{' '}
                  • Live Y:{' '}
                  <strong className="text-sky-300">
                    {(liveRawY - (prefs.tiltCalibrationOffsetY ?? 0)).toFixed(2)}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(prefs.tiltCalibrationOffsetY ?? 0) !== 0 && (
                  <button
                    onClick={() => {
                      SoundEngine.playUiClick();
                      onUpdatePrefs((p) => ({ ...p, tiltCalibrationOffsetY: 0 }));
                    }}
                    className="btn-punch px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/15 font-hud font-bold text-[10px] text-slate-300 uppercase cursor-pointer"
                  >
                    Reset 0
                  </button>
                )}
                <button
                  onClick={handleCalibrateTilt}
                  className="btn-punch px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-hud font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.5)] cursor-pointer"
                >
                  Calibrate Tilt (Set 0 Center)
                </button>
              </div>
            </div>

            {calibratedToast && (
              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-hud font-bold text-[11px] text-center">
                {calibratedToast}
              </div>
            )}
          </div>

          {/* Footer Action Buttons: Reset to Default | Unity C# Scripts | Save & Close */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
            <button
              onClick={() => {
                SoundEngine.playUiClick();
                onUpdatePrefs((curr) => PlayerPrefs.resetControllerDefaults(curr));
              }}
              className="btn-punch py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 font-hud font-bold text-xs text-slate-200 uppercase cursor-pointer"
            >
              Reset to Default
            </button>

            <button
              onClick={() => {
                SoundEngine.playUiClick();
                onClose();
                onOpenUnityScripts();
              }}
              className="btn-punch py-2.5 px-4 rounded-xl bg-indigo-600/85 hover:bg-indigo-500 border border-indigo-400/40 font-hud font-bold text-xs text-white uppercase cursor-pointer"
            >
              UIManager & Physics C#
            </button>

            <button
              onClick={() => {
                SoundEngine.playCoinCollect();
                PlayerPrefs.save(prefs);
                onClose();
              }}
              className="btn-punch flex-1 py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-display font-black text-xs text-slate-950 tracking-wider uppercase shadow-[0_0_16px_rgba(16,185,129,0.5)] cursor-pointer"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
