import React, { useEffect, useState } from 'react';
import {
  CAR_ROSTER,
  CarUpgradeLevels,
  DEFAULT_RIGIDBODY_SETUP,
  PlayerPrefs,
  PlayerPrefsData,
  getStatPercentage,
  getUpgradeCost,
} from './data/carData';
import { SoundEngine } from './audio/SoundEngine';
import { GarageScene } from './three/GarageScene';
import { HighwayRaceScene } from './three/HighwayRaceScene';
import { SettingsModal } from './components/SettingsModal';
import { ShopAndRewardsModal } from './components/ShopAndRewardsModal';
import { CustomControlsModal } from './components/CustomControlsModal';
import { UnityScriptsModal } from './components/UnityScriptsModal';
import { MultiplayerLobbyModal } from './components/MultiplayerLobbyModal';

type ActivePopup =
  | null
  | 'garage'
  | 'settings'
  | 'shop'
  | 'rewards'
  | 'coins_pack'
  | 'custom_controls'
  | 'unity_scripts'
  | 'multiplayer'
  | 'main_menu';

export default function App() {
  const [prefs, setPrefs] = useState<PlayerPrefsData>(() => PlayerPrefs.load());
  const [screen, setScreen] = useState<'garage' | 'race'>('garage');
  const [isMultiplayerRace, setIsMultiplayerRace] = useState<boolean>(false);
  const [activePopup, setActivePopup] = useState<ActivePopup>(null);
  const [showUpgradePanel, setShowUpgradePanel] = useState<boolean>(true);
  const [upgradeAnimKey, setUpgradeAnimKey] = useState<number>(0);
  const [spinTriggerCount, setSpinTriggerCount] = useState<number>(0);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  useEffect(() => {
    PlayerPrefs.save(prefs);
  }, [prefs]);

  // Fix 1: Set Screen.orientation = LandscapeLeft (1920x1080 16:9 Landscape Only)
  useEffect(() => {
    try {
      const scr = window.screen as Screen & {
        orientation?: { lock?: (mode: string) => Promise<void> };
      };
      if (scr.orientation && typeof scr.orientation.lock === 'function') {
        scr.orientation.lock('landscape-primary').catch(() => {});
      }
    } catch {
      // Ignore on desktop browsers that don't require orientation lock
    }
  }, []);

  const updatePrefs = (updater: (prev: PlayerPrefsData) => PlayerPrefsData) => {
    setPrefs((prev) => {
      const next = updater(prev);
      PlayerPrefs.save(next);
      return next;
    });
  };

  const triggerToast = (msg: string) => {
    setStatusToast(msg);
    window.setTimeout(() => {
      setStatusToast((curr) => (curr === msg ? null : curr));
    }, 2200);
  };

  const selectedCar = CAR_ROSTER.find((c) => c.id === prefs.selectedCarId) || CAR_ROSTER[0];
  const currentUpgrades: CarUpgradeLevels =
    prefs.upgrades[selectedCar.id] || selectedCar.defaultUpgrades;
  const isSelectedCarOwned = prefs.ownedCarIds.includes(selectedCar.id);

  // UIManager.OpenPanel equivalent
  const openPanel = (panel: ActivePopup) => {
    SoundEngine.playUiClick();
    setActivePopup(panel);
  };

  // UIManager.ClosePanel equivalent
  const closePanel = () => {
    SoundEngine.playUiClick();
    setActivePopup(null);
  };

  // Top-Left BACK Button Logic:
  // If any popup is open, close it. If in Garage with no popup open, open Main Menu popup.
  const handleTopLeftBack = () => {
    SoundEngine.playUiClick();
    if (activePopup !== null) {
      setActivePopup(null);
      return;
    }
    setActivePopup('main_menu');
  };

  const handleSelectAndSpinCar = (carId: string) => {
    SoundEngine.playStuntBonus();
    const targetCar = CAR_ROSTER.find((c) => c.id === carId);
    if (!targetCar) return;
    updatePrefs((prev) => ({ ...prev, selectedCarId: carId }));
    setSpinTriggerCount((c) => c + 1);
    triggerToast(`${targetCar.name} (${targetCar.realModelName} • ${targetCar.numberPlate})`);
  };

  const handleUpgradeStat = (stat: keyof CarUpgradeLevels) => {
    const curLv = currentUpgrades[stat];
    if (curLv >= 10) {
      SoundEngine.playUiClick();
      triggerToast(`${stat.toUpperCase()} is at MAX Lv.10!`);
      return;
    }

    const cost = getUpgradeCost(curLv);
    if (prefs.coins < cost.coins) {
      SoundEngine.playCrash();
      triggerToast(`Not enough coins! Need ${cost.coins.toLocaleString()} Coins.`);
      setActivePopup('coins_pack');
      return;
    }
    if (prefs.diamonds < cost.diamonds) {
      SoundEngine.playCrash();
      triggerToast(`Need ${cost.diamonds} Diamonds for Lv.${curLv + 1}!`);
      setActivePopup('coins_pack');
      return;
    }

    SoundEngine.playCoinCollect();
    updatePrefs((prev) => {
      const carUpgrades = prev.upgrades[selectedCar.id] || { ...selectedCar.defaultUpgrades };
      return {
        ...prev,
        coins: prev.coins - cost.coins,
        diamonds: prev.diamonds - cost.diamonds,
        upgrades: {
          ...prev.upgrades,
          [selectedCar.id]: {
            ...carUpgrades,
            [stat]: curLv + 1,
          },
        },
      };
    });
    triggerToast(
      `Upgraded ${selectedCar.name} ${stat.toUpperCase()} to Lv.${curLv + 1}/10 (-${cost.coins.toLocaleString()} Coins)!`
    );
  };

  const handleStartRace = () => {
    SoundEngine.playUiClick();
    if (!isSelectedCarOwned) {
      openPanel('garage');
      triggerToast(`Unlock ${selectedCar.name} to race, or select an equipped car!`);
      return;
    }
    setIsMultiplayerRace(false);
    setScreen('race');
  };

  const handleOpenMultiplayer = () => {
    SoundEngine.playUiClick();
    if (!isSelectedCarOwned) {
      openPanel('garage');
      triggerToast(`Unlock ${selectedCar.name} first, or select an owned car for Multiplayer!`);
      return;
    }
    openPanel('multiplayer');
  };

  if (screen === 'race') {
    return (
      <div className="w-screen h-screen bg-slate-950 overflow-hidden relative">
        <HighwayRaceScene
          car={selectedCar}
          upgrades={currentUpgrades}
          prefs={prefs}
          isMultiplayer={isMultiplayerRace}
          onUpdatePrefs={updatePrefs}
          onExitToGarage={() => {
            setIsMultiplayerRace(false);
            setScreen('garage');
          }}
          onRematchLobby={() => {
            setIsMultiplayerRace(false);
            setScreen('garage');
            setActivePopup('multiplayer');
          }}
          onOpenSettings={() => openPanel('settings')}
        />
        {activePopup === 'settings' && (
          <SettingsModal
            prefs={prefs}
            onUpdatePrefs={updatePrefs}
            onClose={closePanel}
            onOpenUnityScripts={() => openPanel('unity_scripts')}
          />
        )}
        {activePopup === 'unity_scripts' && (
          <UnityScriptsModal onClose={closePanel} />
        )}
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden select-none">
      {/* ==================== 3D DAYTIME PREMIUM GARAGE (80% CLEAN FRAME FOR REALISTIC CARS) ==================== */}
      <div className="absolute inset-0 z-0">
        <GarageScene
          selectedCarId={prefs.selectedCarId}
          graphicsQuality={prefs.graphicsQuality}
          displayMode={prefs.garageDisplayMode || 'single360'}
          spinTriggerCount={spinTriggerCount}
          isPopupOpen={activePopup !== null}
          onSelectCar={handleSelectAndSpinCar}
        />
      </div>

      {/* ==================== TOP BAR (HEIGHT 8% — ALWAYS VISIBLE BACK BUTTON + LV28 + COINS 230500 + DIAMOND 1240) ==================== */}
      <header className="absolute inset-x-0 top-0 h-[8%] min-h-[46px] max-h-[62px] z-30 bg-slate-950/80 backdrop-blur-md border-b border-white/15 flex items-center justify-between px-3 sm:px-5">
        {/* Left Zone: BACK Button (Scale 0.9 on Click) + LV28 Badge + Coins 230500 + Diamond 1240 */}
        <div className="flex items-center gap-2 sm:gap-3.5">
          {/* Top-Left BACK Button (Closes any open popup or opens Main Menu) */}
          <button
            onClick={handleTopLeftBack}
            className="btn-back-punch flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/95 hover:bg-slate-700 border border-amber-400/40 text-white font-hud font-bold text-xs sm:text-sm tracking-wider uppercase shadow cursor-pointer"
          >
            <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            <span>BACK</span>
          </button>

          {/* LV28 Badge */}
          <button
            onClick={() => openPanel('main_menu')}
            className="btn-punch flex items-center cursor-pointer"
            title="Driver Profile & Level"
          >
            <div className="relative z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 p-0.5 shadow-[0_0_10px_rgba(245,158,11,0.5)] flex items-center justify-center rotate-45 border border-yellow-100">
              <div className="w-full h-full bg-slate-900 rounded-md flex items-center justify-center -rotate-45">
                <div className="w-3 h-3 bg-gradient-to-b from-yellow-300 to-amber-500 rotate-45 rounded-xs" />
              </div>
            </div>
            <div className="-ml-2 pl-3.5 pr-3 py-0.5 bg-slate-900/95 border border-amber-400/50 rounded-r-md skew-x-[-14deg] shadow">
              <span className="block skew-x-[14deg] font-hud font-extrabold italic text-xs sm:text-base text-white tracking-wider">
                LV{prefs.level}
              </span>
            </div>
          </button>

          {/* Gold Coins 230500 -> Opens Shop with Coins Pack */}
          <button
            onClick={() => openPanel('coins_pack')}
            title="Click to Open Shop Coin Packs"
            className="btn-punch flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-amber-400/30 shadow cursor-pointer"
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600 border border-yellow-100 flex items-center justify-center shadow-[0_0_8px_rgba(250,204,21,0.5)]">
              <span className="font-display font-black text-[10px] text-amber-950">G</span>
            </div>
            <span className="font-hud font-extrabold text-sm sm:text-lg text-amber-400 tabular-nums tracking-wide">
              {prefs.coins}
            </span>
            <span className="text-amber-300 font-bold text-xs">+</span>
          </button>

          {/* Diamond 1240 -> Opens Shop with Coins/Diamonds Pack */}
          <button
            onClick={() => openPanel('coins_pack')}
            title="Click to Open Shop Diamond Packs"
            className="btn-punch flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-cyan-400/30 shadow cursor-pointer"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6 drop-shadow-[0_0_6px_rgba(56,189,248,0.75)]" viewBox="0 0 24 24" fill="none">
              <polygon points="12,2 22,9 12,22 2,9" fill="#38bdf8" />
              <polygon points="12,2 17,9 12,22 7,9" fill="#7dd3fc" />
              <polygon points="2,9 22,9 17,4 7,4" fill="#bae6fd" />
            </svg>
            <span className="font-hud font-extrabold text-sm sm:text-lg text-cyan-400 tabular-nums tracking-wide">
              {prefs.diamonds}
            </span>
            <span className="text-cyan-300 font-bold text-xs">+</span>
          </button>
        </div>

        {/* Center Active Car Real-World Badge & Indian Number Plate Pill + Showroom View Toggle */}
        <div className="hidden xl:flex items-center gap-2">
          <button
            onClick={() => handleSelectAndSpinCar(selectedCar.id)}
            className="btn-punch flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/90 border border-white/15 cursor-pointer"
            title="Click to Spin 3D Car in Showroom"
          >
            <span className="font-display font-bold text-xs text-white">
              {selectedCar.realModelName}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-white text-slate-950 font-hud font-black text-[10px]">
              IND {selectedCar.numberPlate}
            </span>
          </button>

          <button
            onClick={() => {
              SoundEngine.playUiClick();
              updatePrefs((p) => ({
                ...p,
                garageDisplayMode: p.garageDisplayMode === 'single360' ? 'lineup5' : 'single360',
              }));
            }}
            className="btn-punch px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 font-hud font-bold text-[11px] text-sky-300 cursor-pointer"
          >
            {prefs.garageDisplayMode === 'single360' ? 'View: 1-Car 360°' : 'View: 5-Car Lineup'}
          </button>
        </div>

        {/* Top Right: C# Code + Settings Gear + Bell (Daily Rewards) + Profile */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => openPanel('unity_scripts')}
            title="View UIManager.cs & RealisticCarPhysicsController.cs"
            className="btn-punch hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 border border-indigo-400/50 text-[11px] font-hud font-bold text-white uppercase cursor-pointer"
          >
            <span>UIManager C#</span>
          </button>

          {/* Settings Gear */}
          <button
            onClick={() => openPanel('settings')}
            title="Settings"
            className="btn-punch w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-white/20 flex items-center justify-center text-slate-200 shadow cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>

          {/* Bell Icon (Daily Rewards) */}
          <button
            onClick={() => openPanel('rewards')}
            title="Daily Rewards Calendar"
            className="btn-punch relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-white/20 flex items-center justify-center text-slate-200 shadow cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
            <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400" />
          </button>

          {/* Profile Icon */}
          <button
            onClick={() => openPanel('main_menu')}
            title="Driver Profile"
            className="btn-punch w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-white/20 flex items-center justify-center text-slate-200 shadow cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {statusToast && (
        <div className="fixed top-[9.5%] left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-xl bg-emerald-500/95 text-slate-950 font-hud font-extrabold text-xs shadow-[0_0_25px_rgba(16,185,129,0.8)] border border-white/40 animate-popup-open">
          {statusToast}
        </div>
      )}

      {/* ==================== LEFT SIDE SLIDE-IN UPGRADE PANEL + COMPACT CONTROLLER PANEL (WIDTH 18%) ==================== */}
      <aside
        className={`absolute left-2 top-[9.2%] bottom-[11.2%] w-[18%] min-w-[195px] max-w-[255px] z-20 flex flex-col justify-between gap-2 ${
          activePopup !== null ? 'pointer-events-none opacity-45' : 'pointer-events-auto'
        }`}
      >
        {/* 1. SLIDE-IN LEFT UPGRADE PANEL (Engine Lv.4, Turbo Lv.3, Tires Lv.3, Nitro Lv.2 with Cost, Progress Bar & + Button) */}
        {showUpgradePanel && (
          <div
            key={upgradeAnimKey}
            className="animate-slide-left bg-slate-950/80 backdrop-blur-md border border-white/15 rounded-xl p-2.5 flex flex-col justify-between shadow-xl"
          >
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                </svg>
                <span className="font-hud font-extrabold text-xs sm:text-sm tracking-wider text-white uppercase">
                  UPGRADE
                </span>
              </div>
              <span className="text-[10px] font-hud font-bold text-amber-400 truncate max-w-[95px]">
                {selectedCar.name}
              </span>
            </div>

            <div className="space-y-1.5">
              {(
                [
                  { key: 'engine', label: 'Engine' },
                  { key: 'turbo', label: 'Turbo' },
                  { key: 'tires', label: 'Tires' },
                  { key: 'nitro', label: 'Nitro' },
                ] as const
              ).map((stat) => {
                const lv = currentUpgrades[stat.key];
                const pct = getStatPercentage(stat.key, lv);
                const cost = getUpgradeCost(lv);
                return (
                  <div
                    key={stat.key}
                    className="px-2 py-1.5 rounded-lg bg-slate-900/80 border border-white/10"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="font-hud font-bold text-xs text-white tracking-wide">
                          {stat.label} <span className="text-amber-400">Lv.{lv}</span>
                        </span>
                        <span className="block font-hud text-[9px] text-slate-400">
                          {lv >= 10 ? 'MAX LEVEL' : `Cost: ${(cost.coins / 1000).toFixed(1)}K 🪙`}
                        </span>
                      </div>
                      <button
                        onClick={() => handleUpgradeStat(stat.key)}
                        disabled={lv >= 10}
                        title={
                          lv >= 10
                            ? 'Max Level Reached'
                            : `Upgrade ${stat.label} (${cost.coins.toLocaleString()} Coins)`
                        }
                        className={`btn-punch w-6 h-6 rounded-md flex items-center justify-center font-hud font-black text-sm cursor-pointer ${
                          lv >= 10
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-gradient-to-b from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-[0_0_8px_rgba(249,115,22,0.6)]'
                        }`}
                      >
                        +
                      </button>
                    </div>

                    {/* Orange Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden p-0.5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Physics Summary Pill */}
            <button
              onClick={() => openPanel('unity_scripts')}
              className="btn-punch mt-2 w-full px-2 py-1 rounded bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-400/30 flex items-center justify-between text-[9px] font-hud text-indigo-200 cursor-pointer"
            >
              <span>Mass {DEFAULT_RIGIDBODY_SETUP.mass} | CoM {DEFAULT_RIGIDBODY_SETUP.centerOfMass.y}</span>
              <span className="text-amber-300 font-bold">Spring 18.5K</span>
            </button>
          </div>
        )}

        {/* 2. BOTTOM LEFT SMALL CUSTOM CONTROLLER SETTINGS PANEL */}
        <div className="bg-slate-950/80 backdrop-blur-md border border-white/15 rounded-xl p-2.5 shadow-xl">
          <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-white/10">
            <span className="font-hud font-bold text-[10px] tracking-wider text-white uppercase truncate">
              Custom Controller
            </span>
            <button
              onClick={() => openPanel('custom_controls')}
              className="btn-punch text-[9px] font-hud font-bold text-sky-400 hover:underline cursor-pointer"
            >
              Edit Layout ↗
            </button>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-200">Steering Wheel</span>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  updatePrefs((p) => ({
                    ...p,
                    steeringWheel: true,
                    buttons: false,
                    tilt: false,
                  }));
                }}
                className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                  !prefs.tilt && prefs.steeringWheel ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${
                    !prefs.tilt && prefs.steeringWheel ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-200">Buttons</span>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  updatePrefs((p) => ({
                    ...p,
                    buttons: true,
                    steeringWheel: false,
                    tilt: false,
                  }));
                }}
                className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                  !prefs.tilt && prefs.buttons ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${
                    !prefs.tilt && prefs.buttons ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sky-300 font-semibold">Tilt (16:9)</span>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  updatePrefs((p) => {
                    const nextTilt = !p.tilt;
                    return {
                      ...p,
                      tilt: nextTilt,
                      steeringWheel: nextTilt ? false : !p.buttons,
                      buttons: nextTilt ? false : p.buttons,
                    };
                  });
                }}
                className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
                  prefs.tilt ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${
                    prefs.tilt ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-slate-300">Tilt Sensitivity</span>
                <span className="font-hud font-bold text-sky-400">{prefs.tiltSensitivity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={prefs.tiltSensitivity}
                onChange={(e) =>
                  updatePrefs((p) => ({ ...p, tiltSensitivity: Number(e.target.value) }))
                }
                className="w-full h-1 bg-slate-700 rounded-lg accent-sky-400 cursor-pointer"
              />
            </div>

            <button
              onClick={() => {
                SoundEngine.playStuntBonus();
                updatePrefs((p) => ({ ...p, tiltCalibrationOffsetY: 0 }));
                triggerToast('Calibrate Tilt: Current 16:9 Phone Position Saved as 0 Center!');
              }}
              className="btn-punch w-full py-1 px-2 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-hud font-bold text-[10px] uppercase tracking-wider cursor-pointer"
            >
              Calibrate Tilt (0 Center)
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== BOTTOM CENTER: [ SINGLE PLAYER / PLAY ] & [ MULTIPLAYER ] BUTTONS SIDE-BY-SIDE ==================== */}
      <div
        className={`absolute left-[58%] -translate-x-1/2 bottom-[10.8%] z-20 flex items-center gap-2.5 ${
          activePopup !== null ? 'pointer-events-none opacity-45' : 'pointer-events-auto'
        }`}
      >
        <button
          onClick={handleStartRace}
          title="Single Player Mode (200m Overtake Highway)"
          className="btn-punch green-play-btn px-5 sm:px-6 py-2 rounded-xl border-2 border-emerald-200 flex items-center gap-2 text-slate-950 font-display font-black text-xs sm:text-sm tracking-wider uppercase cursor-pointer whitespace-nowrap"
        >
          <svg className="w-4 h-4 text-slate-950 fill-current shrink-0" viewBox="0 0 24 24">
            <polygon points="6,4 20,12 6,20" />
          </svg>
          <span>{isSelectedCarOwned ? 'SINGLE PLAYER' : 'UNLOCK TO PLAY'}</span>
        </button>

        <button
          onClick={handleOpenMultiplayer}
          title="Real Multiplayer 1-5 Players (4-Digit Room Code • 2000m Race)"
          className="btn-punch px-5 sm:px-6 py-2 rounded-xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 border-2 border-sky-200 shadow-[0_0_24px_rgba(56,189,248,0.75)] flex items-center gap-2 text-white font-display font-black text-xs sm:text-sm tracking-wider uppercase cursor-pointer whitespace-nowrap"
        >
          <svg className="w-4 h-4 text-amber-300 fill-current shrink-0" viewBox="0 0 24 24">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
          <span>MULTIPLAYER (1–5P)</span>
        </button>
      </div>

      {/* ==================== BOTTOM MENU BAR (HEIGHT 10% — ALL 6 LABELS 100% VISIBLE, NO TRUNCATION) ==================== */}
      <footer className="absolute inset-x-0 bottom-0 h-[10%] min-h-[50px] max-h-[68px] z-30 bg-slate-950/90 backdrop-blur-md border-t border-white/15 px-2 sm:px-4 flex items-center justify-center">
        <div className="w-full max-w-6xl grid grid-cols-6 gap-1.5 sm:gap-2.5">
          {/* 1. Garage Button */}
          <button
            onClick={() => openPanel('garage')}
            className={`btn-punch py-2 px-1.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1.5 font-hud font-bold text-[10px] sm:text-xs text-white whitespace-nowrap cursor-pointer ${
              activePopup === 'garage'
                ? 'bg-sky-600 border-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.6)]'
                : 'bg-slate-900/90 hover:bg-slate-800 border-sky-400/50'
            }`}
          >
            <svg className="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3L2 12h3v8h14v-8h3L12 3zm5 15H7v-6h10v6z" />
            </svg>
            <span>Garage</span>
          </button>

          {/* 2. Settings Button */}
          <button
            onClick={() => openPanel('settings')}
            className={`btn-punch py-2 px-1.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1.5 font-hud font-bold text-[10px] sm:text-xs text-white whitespace-nowrap cursor-pointer ${
              activePopup === 'settings'
                ? 'bg-sky-600 border-sky-300 shadow'
                : 'bg-slate-900/90 hover:bg-slate-800 border-white/15'
            }`}
          >
            <svg className="w-4 h-4 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            <span>Settings</span>
          </button>

          {/* 3. Shop Button */}
          <button
            onClick={() => openPanel('shop')}
            className={`btn-punch py-2 px-1.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1.5 font-hud font-bold text-[10px] sm:text-xs text-white whitespace-nowrap cursor-pointer ${
              activePopup === 'shop'
                ? 'bg-amber-500 text-slate-950 border-amber-300 shadow'
                : 'bg-slate-900/90 hover:bg-slate-800 border-white/15'
            }`}
          >
            <svg className="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
            <span>Shop</span>
          </button>

          {/* 4. Daily Rewards Button */}
          <button
            onClick={() => openPanel('rewards')}
            className={`btn-punch py-2 px-1.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1.5 font-hud font-bold text-[10px] sm:text-xs text-white whitespace-nowrap cursor-pointer ${
              activePopup === 'rewards'
                ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                : 'bg-slate-900/90 hover:bg-slate-800 border-white/15'
            }`}
          >
            <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2z" />
            </svg>
            <span>Daily Rewards</span>
          </button>

          {/* 5. Upgrade Button -> Slides in Left UPGRADE Panel */}
          <button
            onClick={() => {
              SoundEngine.playUiClick();
              setActivePopup(null);
              setShowUpgradePanel(true);
              setUpgradeAnimKey((k) => k + 1);
              triggerToast('Left UPGRADE Panel Active — Click + on Engine, Turbo, Tires, or Nitro!');
            }}
            className="btn-punch py-2 px-1.5 sm:px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/15 flex items-center justify-center gap-1.5 font-hud font-bold text-[10px] sm:text-xs text-white whitespace-nowrap cursor-pointer"
          >
            <svg className="w-4 h-4 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
            </svg>
            <span>Upgrade</span>
          </button>

          {/* 6. Custom Controls Button (Full text visible!) */}
          <button
            onClick={() => openPanel('custom_controls')}
            className={`btn-punch py-2 px-1.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1.5 font-hud font-bold text-[10px] sm:text-xs text-white whitespace-nowrap cursor-pointer ${
              activePopup === 'custom_controls'
                ? 'bg-sky-600 border-sky-300 shadow'
                : 'bg-slate-900/90 hover:bg-slate-800 border-white/15'
            }`}
          >
            <svg className="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
            </svg>
            <span>Custom Controls</span>
          </button>
        </div>
      </footer>

      {/* ==================== POPUP MODALS (Scale 0.8 -> 1.0 in 0.2s easeOutBack, Backdrop Dim 0.7) ==================== */}
      {activePopup === 'settings' && (
        <SettingsModal
          prefs={prefs}
          onUpdatePrefs={updatePrefs}
          onClose={closePanel}
          onOpenUnityScripts={() => openPanel('unity_scripts')}
        />
      )}

      {(activePopup === 'garage' ||
        activePopup === 'shop' ||
        activePopup === 'rewards' ||
        activePopup === 'coins_pack') && (
        <ShopAndRewardsModal
          initialTab={activePopup}
          prefs={prefs}
          onUpdatePrefs={updatePrefs}
          onSelectAndSpinCar={handleSelectAndSpinCar}
          onClose={closePanel}
        />
      )}

      {activePopup === 'custom_controls' && (
        <CustomControlsModal
          prefs={prefs}
          onUpdatePrefs={updatePrefs}
          onClose={closePanel}
        />
      )}

      {activePopup === 'unity_scripts' && (
        <UnityScriptsModal onClose={closePanel} />
      )}

      {activePopup === 'multiplayer' && (
        <MultiplayerLobbyModal
          selectedCar={selectedCar}
          prefs={prefs}
          onClose={closePanel}
          onStartMultiplayerRace={() => {
            setActivePopup(null);
            setIsMultiplayerRace(true);
            setScreen('race');
          }}
          onOpenUnityScripts={() => openPanel('unity_scripts')}
        />
      )}

      {/* Main Menu / Profile Popup (Opened when clicking Top-Left BACK in Garage with no other popup open) */}
      {activePopup === 'main_menu' && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-backdrop-dim"
          onClick={closePanel}
        >
          <div
            className="panel-glass rounded-2xl w-full max-w-md p-6 border border-sky-400/40 text-center animate-popup-open"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display font-black text-xl text-white uppercase tracking-wider">
              City Night Rush
            </h2>
            <p className="text-xs font-hud text-sky-400 font-bold uppercase tracking-widest mt-0.5 mb-4">
              Ultimate Edition • Level {prefs.level} Driver
            </p>

            <div className="p-3 rounded-xl bg-slate-900/85 border border-white/10 mb-4 text-left text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Equipped Vehicle:</span>
                <span className="font-hud font-bold text-white">{selectedCar.realModelName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Registration Plate:</span>
                <span className="font-hud font-bold text-amber-400">{selectedCar.numberPlate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cars Unlocked:</span>
                <span className="font-hud font-bold text-emerald-400">
                  {prefs.ownedCarIds.length} / {CAR_ROSTER.length}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    closePanel();
                    handleStartRace();
                  }}
                  className="btn-punch py-3 px-2 rounded-xl green-play-btn text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  ▶ SINGLE PLAYER
                </button>

                <button
                  onClick={() => {
                    openPanel('multiplayer');
                  }}
                  className="btn-punch py-3 px-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 border border-sky-300 text-white font-display font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg"
                >
                  👥 MULTIPLAYER (1–5P)
                </button>
              </div>

              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  updatePrefs((p) => ({
                    ...p,
                    garageDisplayMode: p.garageDisplayMode === 'single360' ? 'lineup5' : 'single360',
                  }));
                  closePanel();
                }}
                className="btn-punch w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-hud font-bold text-xs uppercase cursor-pointer"
              >
                Switch Garage View ({prefs.garageDisplayMode === 'single360' ? '5-Car Lineup' : '1-Car 360° Turntable'})
              </button>

              <button
                onClick={closePanel}
                className="btn-punch w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-hud font-bold text-xs uppercase cursor-pointer"
              >
                Return to Garage Showroom
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
