import React, { useState } from 'react';
import {
  CAR_ROSTER,
  CarStatsScriptableObject,
  PlayerPrefsData,
  getComputedCarStats,
} from '../data/carData';
import { SoundEngine } from '../audio/SoundEngine';
import { CarThumbnailSvg } from './CarThumbnailSvg';

interface ShopAndRewardsModalProps {
  initialTab: 'garage' | 'shop' | 'rewards' | 'coins_pack';
  prefs: PlayerPrefsData;
  onUpdatePrefs: (updater: (prev: PlayerPrefsData) => PlayerPrefsData) => void;
  onSelectAndSpinCar: (carId: string) => void;
  onClose: () => void;
}

const DAILY_REWARDS = [
  { day: 1, label: 'Day 1', rewardType: 'coins' as const, amount: 15000 },
  { day: 2, label: 'Day 2', rewardType: 'coins' as const, amount: 25000 },
  { day: 3, label: 'Day 3', rewardType: 'diamonds' as const, amount: 150 },
  { day: 4, label: 'Day 4', rewardType: 'coins' as const, amount: 45000 },
  { day: 5, label: 'Day 5', rewardType: 'diamonds' as const, amount: 300 },
  { day: 6, label: 'Day 6', rewardType: 'coins' as const, amount: 80000 },
  { day: 7, label: 'Day 7 Jackpot', rewardType: 'diamonds' as const, amount: 650 },
];

export const ShopAndRewardsModal: React.FC<ShopAndRewardsModalProps> = ({
  initialTab,
  prefs,
  onUpdatePrefs,
  onSelectAndSpinCar,
  onClose,
}) => {
  const [tab, setTab] = useState<'garage' | 'shop' | 'rewards' | 'coins_pack'>(initialTab);
  const [shopFilter, setShopFilter] = useState<'locked' | 'all'>(
    initialTab === 'shop' ? 'locked' : 'all'
  );
  const [notEnoughPopup, setNotEnoughPopup] = useState<{
    carName: string;
    missingCoins: number;
    missingDiamonds: number;
  } | null>(null);
  const [coinBurstMessage, setCoinBurstMessage] = useState<string | null>(null);

  const triggerCoinAnimation = (msg: string) => {
    setCoinBurstMessage(msg);
    setTimeout(() => setCoinBurstMessage(null), 2200);
  };

  const handleClose = () => {
    SoundEngine.playUiClick();
    onClose();
  };

  const handleCardClick = (car: CarStatsScriptableObject) => {
    SoundEngine.playUiClick();
    onSelectAndSpinCar(car.id);
  };

  const handleBuyOrEquip = (e: React.MouseEvent, car: CarStatsScriptableObject) => {
    e.stopPropagation();
    const isOwned = prefs.ownedCarIds.includes(car.id);

    if (isOwned) {
      SoundEngine.playUiClick();
      onSelectAndSpinCar(car.id);
      triggerCoinAnimation(`EQUIPPED ${car.name} (${car.realModelName})!`);
      return;
    }

    // Check diamond or coin price
    if (car.priceDiamonds > 0 && car.priceCoins === 0) {
      if (prefs.diamonds < car.priceDiamonds) {
        SoundEngine.playCrash();
        setNotEnoughPopup({
          carName: car.name,
          missingCoins: 0,
          missingDiamonds: car.priceDiamonds - prefs.diamonds,
        });
        return;
      }
      SoundEngine.playStuntBonus();
      onUpdatePrefs((prev) => ({
        ...prev,
        diamonds: prev.diamonds - car.priceDiamonds,
        ownedCarIds: [...prev.ownedCarIds, car.id],
        selectedCarId: car.id,
      }));
      onSelectAndSpinCar(car.id);
      triggerCoinAnimation(`UNLOCKED & EQUIPPED ${car.name}!`);
    } else {
      if (prefs.coins < car.priceCoins) {
        SoundEngine.playCrash();
        setNotEnoughPopup({
          carName: car.name,
          missingCoins: car.priceCoins - prefs.coins,
          missingDiamonds: 0,
        });
        return;
      }
      SoundEngine.playStuntBonus();
      onUpdatePrefs((prev) => ({
        ...prev,
        coins: prev.coins - car.priceCoins,
        ownedCarIds: [...prev.ownedCarIds, car.id],
        selectedCarId: car.id,
      }));
      onSelectAndSpinCar(car.id);
      triggerCoinAnimation(`UNLOCKED & EQUIPPED ${car.name}!`);
    }
  };

  const handleClaimDailyReward = () => {
    const nextDayIdx = prefs.lastClaimedDay;
    if (nextDayIdx >= 7) {
      triggerCoinAnimation('All 7 Daily Login Rewards Claimed! Resetting Streak...');
      onUpdatePrefs((p) => ({ ...p, lastClaimedDay: 0 }));
      return;
    }
    const item = DAILY_REWARDS[nextDayIdx];
    SoundEngine.playCoinCollect();
    onUpdatePrefs((prev) => ({
      ...prev,
      coins: item.rewardType === 'coins' ? prev.coins + item.amount : prev.coins,
      diamonds: item.rewardType === 'diamonds' ? prev.diamonds + item.amount : prev.diamonds,
      lastClaimedDay: prev.lastClaimedDay + 1,
    }));
    triggerCoinAnimation(
      `+${item.amount.toLocaleString()} ${item.rewardType === 'coins' ? 'GOLD COINS' : 'DIAMONDS'} CLAIMED!`
    );
  };

  const displayedCars =
    tab === 'shop' && shopFilter === 'locked'
      ? CAR_ROSTER.filter((c) => !prefs.ownedCarIds.includes(c.id))
      : CAR_ROSTER;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-backdrop-dim"
      onClick={handleClose}
    >
      <div
        className="panel-glass rounded-2xl w-full max-w-5xl max-h-[88vh] flex flex-col border border-slate-500/50 shadow-2xl overflow-hidden animate-popup-open relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Flying Coins Celebration Banner */}
        {coinBurstMessage && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-display font-black text-xs sm:text-sm shadow-[0_0_30px_rgba(250,204,21,0.9)] flex items-center gap-2 animate-popup-open">
            <span>🪙</span>
            <span>{coinBurstMessage}</span>
            <span>🪙</span>
          </div>
        )}

        {/* "Not Enough Coins" Popup Alert */}
        {notEnoughPopup && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-backdrop-dim">
            <div className="panel-glass rounded-2xl max-w-md w-full p-5 border-2 border-rose-500/70 text-center animate-popup-open">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-400 flex items-center justify-center mx-auto mb-3 text-2xl">
                ⚠️
              </div>
              <h3 className="font-display font-black text-lg text-white uppercase">
                Not Enough {notEnoughPopup.missingDiamonds > 0 ? 'Diamonds' : 'Coins'}!
              </h3>
              <p className="text-xs text-slate-300 mt-1.5 mb-4">
                You need{' '}
                <span className="font-hud font-bold text-amber-400">
                  {notEnoughPopup.missingDiamonds > 0
                    ? `${notEnoughPopup.missingDiamonds.toLocaleString()} more Diamonds`
                    : `${notEnoughPopup.missingCoins.toLocaleString()} more Gold Coins`}
                </span>{' '}
                to unlock <span className="text-white font-semibold">{notEnoughPopup.carName}</span>.
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setNotEnoughPopup(null)}
                  className="btn-punch flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-hud font-bold text-slate-200 uppercase cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    SoundEngine.playCoinCollect();
                    onUpdatePrefs((p) => ({
                      ...p,
                      coins: p.coins + 50000,
                      diamonds: p.diamonds + 200,
                    }));
                    setNotEnoughPopup(null);
                    triggerCoinAnimation('+50,000 COINS & +200 DIAMONDS ADDED!');
                  }}
                  className="btn-punch flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-hud font-extrabold text-slate-950 uppercase shadow cursor-pointer"
                >
                  +50K Free Coins Pack
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top Bar with BACK Button + Tabs + Currency + Close X */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3.5 border-b border-white/15 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="btn-back-punch flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/20 text-white font-hud font-bold text-xs uppercase cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
              <span>BACK</span>
            </button>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  setTab('garage');
                }}
                className={`btn-punch px-3 py-1.5 rounded-lg font-hud font-bold text-xs uppercase cursor-pointer ${
                  tab === 'garage'
                    ? 'bg-sky-500 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Garage (10 Cars)
              </button>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  setTab('shop');
                }}
                className={`btn-punch px-3 py-1.5 rounded-lg font-hud font-bold text-xs uppercase cursor-pointer ${
                  tab === 'shop'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Car Shop
              </button>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  setTab('rewards');
                }}
                className={`btn-punch px-3 py-1.5 rounded-lg font-hud font-bold text-xs uppercase cursor-pointer ${
                  tab === 'rewards'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Daily Rewards (7 Days)
              </button>
              <button
                onClick={() => {
                  SoundEngine.playUiClick();
                  setTab('coins_pack');
                }}
                className={`btn-punch px-3 py-1.5 rounded-lg font-hud font-bold text-xs uppercase cursor-pointer ${
                  tab === 'coins_pack'
                    ? 'bg-purple-500 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Coin Packs
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-amber-400/30">
              <span className="font-hud font-extrabold text-amber-400 text-sm">
                🪙 {prefs.coins.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-cyan-400/30">
              <span className="font-hud font-extrabold text-cyan-400 text-sm">
                💎 {prefs.diamonds.toLocaleString()}
              </span>
            </div>
            <button
              onClick={handleClose}
              className="btn-punch w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/80 flex items-center justify-center text-white font-bold text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ==================== TAB 1 & 2: GARAGE (10 CARS HORIZONTAL SCROLL) & SHOP (LOCKED CARS) ==================== */}
        {(tab === 'garage' || tab === 'shop') && (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-sm sm:text-base text-white uppercase">
                  {tab === 'garage'
                    ? 'Garage Car Selection — Click Any Card to Spin 3D Car in Showroom'
                    : 'Vehicle Dealership — Buy Locked Real-World Cars'}
                </h3>
                <p className="text-xs text-slate-400">
                  Showing {displayedCars.length} vehicles • Authentic Indian HSRP Number Plates & Real Specs
                </p>
              </div>

              {tab === 'shop' && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShopFilter('locked')}
                    className={`px-3 py-1 rounded-lg font-hud font-bold text-xs cursor-pointer ${
                      shopFilter === 'locked'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Locked Cars Only ({CAR_ROSTER.filter((c) => !prefs.ownedCarIds.includes(c.id)).length})
                  </button>
                  <button
                    onClick={() => setShopFilter('all')}
                    className={`px-3 py-1 rounded-lg font-hud font-bold text-xs cursor-pointer ${
                      shopFilter === 'all'
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    All 10 Cars
                  </button>
                </div>
              )}
            </div>

            {displayedCars.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900/70 border border-white/10">
                <p className="font-display font-bold text-base text-emerald-400">
                  All 10 Vehicles Unlocked!
                </p>
                <button
                  onClick={() => setShopFilter('all')}
                  className="mt-3 px-4 py-2 rounded-xl bg-sky-500 text-white font-hud font-bold text-xs uppercase cursor-pointer"
                >
                  Show All 10 Cars
                </button>
              </div>
            ) : (
              /* Horizontal Scrollable 10-Car Cards */
              <div className="flex items-stretch gap-3.5 overflow-x-auto car-strip-scroll pb-3 pt-1">
                {displayedCars.map((car) => {
                  const isOwned = prefs.ownedCarIds.includes(car.id);
                  const isEquipped = prefs.selectedCarId === car.id;
                  const upgrades = prefs.upgrades[car.id] || car.defaultUpgrades;
                  const computed = getComputedCarStats(car, upgrades);

                  const speedPct = Math.min(100, Math.round((computed.topSpeedKmh / 430) * 100));
                  const boostPct = Math.min(100, Math.round((computed.acceleration / 12) * 100));
                  const handlingPct = Math.min(100, Math.round((computed.handling / 11) * 100));

                  return (
                    <div
                      key={car.id}
                      onClick={() => handleCardClick(car)}
                      className={`btn-punch shrink-0 w-64 sm:w-68 rounded-2xl p-3.5 flex flex-col justify-between border-2 transition-all cursor-pointer ${
                        isEquipped
                          ? 'bg-sky-950/50 border-sky-400 shadow-[0_0_22px_rgba(56,189,248,0.45)]'
                          : 'bg-slate-900/85 border-white/15 hover:border-white/35'
                      }`}
                    >
                      <div>
                        {/* Header: Name + Real Model + Category */}
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <h4 className="font-display font-black text-sm text-white uppercase">
                              {car.name}
                            </h4>
                            <p className="text-[11px] font-semibold text-sky-300">
                              {car.realModelName}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/10 font-hud font-bold text-[9px] text-slate-300 uppercase">
                            {car.category}
                          </span>
                        </div>

                        {/* Authentic Indian Number Plate Tag */}
                        <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white text-slate-950 border border-slate-400 shadow-xs">
                          <span className="px-1 rounded-xs bg-blue-700 text-white font-bold text-[8px]">
                            IND
                          </span>
                          <span className="font-hud font-black text-[10px] tracking-wider">
                            {car.numberPlate}
                          </span>
                        </div>

                        {/* Car Visual Preview */}
                        <div className="w-full h-24 my-1.5 flex items-center justify-center bg-slate-950/60 rounded-xl p-2 border border-white/5">
                          <CarThumbnailSvg car={car} />
                        </div>

                        {/* 3 Requested Stats on Card: Top Speed, Boost, Handling */}
                        <div className="space-y-1.5 text-[11px] mt-1">
                          <div>
                            <div className="flex justify-between font-hud">
                              <span className="text-slate-400">TOP SPEED</span>
                              <span className="text-white font-bold">{computed.topSpeedKmh} KM/H</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                              <div
                                className="h-full bg-sky-400 rounded-full"
                                style={{ width: `${speedPct}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between font-hud">
                              <span className="text-slate-400">BOOST</span>
                              <span className="text-amber-400 font-bold">{computed.acceleration}s</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                              <div
                                className="h-full bg-amber-400 rounded-full"
                                style={{ width: `${boostPct}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between font-hud">
                              <span className="text-slate-400">HANDLING</span>
                              <span className="text-emerald-400 font-bold">{computed.handling}/10</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                              <div
                                className="h-full bg-emerald-400 rounded-full"
                                style={{ width: `${handlingPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* BUY xxxx COINS or EQUIPPED Button */}
                      <button
                        onClick={(e) => handleBuyOrEquip(e, car)}
                        className={`btn-punch mt-3 w-full py-2 rounded-xl font-hud font-extrabold text-xs uppercase tracking-wider cursor-pointer ${
                          isOwned
                            ? isEquipped
                              ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.6)]'
                              : 'bg-sky-600 hover:bg-sky-500 text-white'
                            : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.5)]'
                        }`}
                      >
                        {isOwned
                          ? isEquipped
                            ? '✓ EQUIPPED'
                            : 'EQUIP CAR'
                          : car.priceDiamonds > 0 && car.priceCoins === 0
                            ? `BUY ${car.priceDiamonds} DIAMONDS`
                            : `BUY ${car.priceCoins.toLocaleString()} COINS`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 3: DAILY REWARDS 7-DAY CALENDAR ==================== */}
        {tab === 'rewards' && (
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-white uppercase">
                  Daily Login Rewards — 7-Day Calendar
                </h3>
                <p className="text-xs text-slate-400">
                  Claim daily Gold Coins and Diamonds to unlock and upgrade your supercars!
                </p>
              </div>
              <span className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 font-hud font-bold text-xs text-emerald-300">
                Streak: Day {Math.min(7, prefs.lastClaimedDay + 1)} of 7
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {DAILY_REWARDS.map((item, idx) => {
                const isClaimed = idx < prefs.lastClaimedDay;
                const isCurrent = idx === prefs.lastClaimedDay;
                return (
                  <div
                    key={item.day}
                    className={`rounded-2xl p-3 border-2 flex flex-col items-center justify-between text-center transition-all ${
                      isClaimed
                        ? 'bg-slate-900/50 border-emerald-500/40 opacity-70'
                        : isCurrent
                          ? 'bg-gradient-to-b from-amber-500/25 to-slate-900 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)] scale-[1.02]'
                          : 'bg-slate-900/80 border-white/10'
                    }`}
                  >
                    <span className="font-hud font-bold text-xs uppercase text-slate-300">
                      {item.label}
                    </span>

                    <div className="my-3 text-3xl">
                      {item.rewardType === 'coins' ? '🪙' : '💎'}
                    </div>

                    <div>
                      <div
                        className={`font-hud font-extrabold text-sm ${
                          item.rewardType === 'coins' ? 'text-amber-400' : 'text-cyan-400'
                        }`}
                      >
                        +{item.amount.toLocaleString()}
                      </div>
                      <span className="text-[10px] uppercase text-slate-400 font-hud">
                        {item.rewardType}
                      </span>
                    </div>

                    <div className="mt-2.5 w-full">
                      {isClaimed ? (
                        <span className="block py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-hud font-bold text-[10px] uppercase">
                          ✓ Claimed
                        </span>
                      ) : isCurrent ? (
                        <button
                          onClick={handleClaimDailyReward}
                          className="btn-punch w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-hud font-extrabold text-xs uppercase shadow cursor-pointer"
                        >
                          CLAIM
                        </button>
                      ) : (
                        <span className="block py-1 rounded-lg bg-slate-800 text-slate-500 font-hud font-bold text-[10px] uppercase">
                          Locked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center pt-2">
              <button
                onClick={handleClaimDailyReward}
                className="btn-punch px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-display font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(16,185,129,0.6)] cursor-pointer"
              >
                Claim Today&apos;s Reward
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: COIN & DIAMOND PACKS (OPENED WHEN CLICKING TOP BAR COINS/DIAMONDS) ==================== */}
        {tab === 'coins_pack' && (
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            <div>
              <h3 className="font-display font-bold text-base text-white uppercase">
                Treasury Vault — Instant Gold Coin & Diamond Packs
              </h3>
              <p className="text-xs text-slate-400">
                Top up your garage balance to unlock all 10 vehicles and max out Lv.10 upgrades.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {[
                {
                  title: 'Street Racer Pack',
                  coins: 50000,
                  diamonds: 100,
                  tag: 'INSTANT BONUS',
                },
                {
                  title: 'Pro Showroom Vault',
                  coins: 150000,
                  diamonds: 400,
                  tag: 'MOST POPULAR',
                },
                {
                  title: 'Ultimate Hypercar Chest',
                  coins: 500000,
                  diamonds: 1200,
                  tag: 'MEGA VALUE',
                },
              ].map((pack) => (
                <div
                  key={pack.title}
                  className="rounded-2xl p-4 bg-slate-900/85 border border-amber-400/30 flex flex-col justify-between text-center"
                >
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-hud font-bold text-[10px] mx-auto">
                    {pack.tag}
                  </span>
                  <h4 className="font-display font-bold text-sm text-white mt-2">
                    {pack.title}
                  </h4>
                  <div className="my-3 space-y-1">
                    <div className="font-hud font-extrabold text-lg text-amber-400">
                      🪙 +{pack.coins.toLocaleString()} Coins
                    </div>
                    <div className="font-hud font-extrabold text-sm text-cyan-400">
                      💎 +{pack.diamonds.toLocaleString()} Diamonds
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      SoundEngine.playCoinCollect();
                      onUpdatePrefs((p) => ({
                        ...p,
                        coins: p.coins + pack.coins,
                        diamonds: p.diamonds + pack.diamonds,
                      }));
                      triggerCoinAnimation(
                        `+${pack.coins.toLocaleString()} COINS & +${pack.diamonds} DIAMONDS ADDED!`
                      );
                    }}
                    className="btn-punch w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-hud font-extrabold text-xs uppercase cursor-pointer"
                  >
                    Claim Pack (Free)
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
