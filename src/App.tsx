import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Camera,
  Check,
  Coins,
  Crown,
  Home,
  Magnet,
  Music,
  Pause,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Tv,
  Upload,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { FlapsAudioEngine } from './game/audioEngine';
import { FlapsCanvas, GameState } from './game/FlapsCanvas';
import { CHARACTERS, CharacterId, drawCharacterSprite, isCharacterId } from './game/characters';
import {
  ActivePowerUpState,
  BOARD_CHARGE_PRICE_PACK5,
  BOARD_CHARGE_PRICE_SINGLE,
  BOARD_SKINS,
  BoardSkinId,
  CHARACTER_PRICES,
  COIN_PACKAGES,
  CoinPackageDef,
  MISSION_DOUBLE_DURATION,
  MISSION_REWARD_COINS,
  MissionEvent,
  POINTS_PER_EARNED_COIN,
  POWERUP_DURATIONS,
  GameSettings,
  PlayerProgression,
  buildMissionsForSet,
  createDefaultProgression,
  loadProgression,
  loadSettings,
  saveProgression,
  saveSettings,
} from './game/progression';

const HIGHSCORE_STORAGE_KEY = 'flaps_highscore';
const CHARACTER_STORAGE_KEY = 'flaps_character';
const CUSTOM_FACE_STORAGE_KEY = 'flaps_custom_face';

const MOTIVATING_CHALLENGES: string[] = [
  '90 % scheitern schon am 3. Stein. Zeig, ob du mehr draufhast!',
  'Traust du dich? Unter 100 Punkten zählt hier nur als Aufwärmen.',
  'Sieht leicht aus – bis der Boden unter dir wegbricht. Bereit?',
  'Kein Platz für Zögerer: Wer zu kurz hält, fällt gnadenlos!',
  'Rekordjäger gesucht – oder gibst du schon beim ersten Sprung auf?',
];

type ActiveModal = null | 'shop' | 'missions' | 'leaderboard' | 'settings';
type ShopTab = 'characters' | 'boards' | 'coins';

function readStoredHighScore(): number {
  try {
    const raw = window.localStorage.getItem(HIGHSCORE_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeStoredHighScore(score: number): void {
  try {
    window.localStorage.setItem(HIGHSCORE_STORAGE_KEY, String(score));
  } catch {
    // Ignore storage quota errors
  }
}

function readStoredCharacter(unlocked: CharacterId[]): CharacterId {
  try {
    const raw = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    if (isCharacterId(raw) && unlocked.includes(raw)) return raw;
    return 'bunny';
  } catch {
    return 'bunny';
  }
}

function writeStoredCharacter(id: CharacterId): void {
  try {
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, id);
  } catch {
    // Ignore storage errors
  }
}

function readStoredCustomFace(): string | null {
  try {
    const raw = window.localStorage.getItem(CUSTOM_FACE_STORAGE_KEY);
    return raw && raw.startsWith('data:image/') ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredCustomFace(dataUrl: string | null): void {
  try {
    if (dataUrl) {
      window.localStorage.setItem(CUSTOM_FACE_STORAGE_KEY, dataUrl);
    } else {
      window.localStorage.removeItem(CUSTOM_FACE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function processFaceImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas context unavailable'));
          return;
        }
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = objectUrl;
  });
}

const CharacterPreview: React.FC<{
  characterId: CharacterId;
  customFaceImg?: HTMLImageElement | null;
  size?: number;
}> = ({ characterId, customFaceImg, size = 44 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2 + size * 0.08);
    drawCharacterSprite(ctx, characterId, size * 0.28, customFaceImg);
    ctx.restore();
  }, [characterId, customFaceImg, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="shrink-0"
      aria-hidden="true"
    />
  );
};

export default function App() {
  const audio = useMemo(() => new FlapsAudioEngine(), []);

  const [progression, setProgression] = useState<PlayerProgression>(() => loadProgression());
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [isPaused, setIsPaused] = useState(false);
  const [runId, setRunId] = useState(0);
  const [reviveId, setReviveId] = useState(0);
  const [score, setScore] = useState(0);
  const [runCoins, setRunCoins] = useState(0);
  const [lastScoreBonusCoins, setLastScoreBonusCoins] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => readStoredHighScore());
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [muted, setMuted] = useState(false);
  const [customTrackName, setCustomTrackName] = useState<string | null>(null);
  const [customFaceUrl, setCustomFaceUrl] = useState<string | null>(() => readStoredCustomFace());
  const [customFaceImg, setCustomFaceImg] = useState<HTMLImageElement | null>(null);
  const [characterId, setCharacterId] = useState<CharacterId>(() =>
    readStoredCharacter(loadProgression().unlockedCharacters)
  );

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [shopTab, setShopTab] = useState<ShopTab>('characters');
  const [pendingCoinPkg, setPendingCoinPkg] = useState<CoinPackageDef | null>(null);
  const [shopToast, setShopToast] = useState<string | null>(null);

  const [activePowerUps, setActivePowerUps] = useState<ActivePowerUpState>({
    magnet: 0,
    double: 0,
    boost: 0,
  });

  // Rewarded Ad continue state (max 1 ad continue per run)
  const [adContinueUsed, setAdContinueUsed] = useState(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState<number | null>(null);

  const [challengeIdx, setChallengeIdx] = useState(() =>
    Math.floor(Math.random() * MOTIVATING_CHALLENGES.length)
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const faceInputRef = useRef<HTMLInputElement | null>(null);
  const gameOverAtRef = useRef<number>(0);
  const creditedRunCoinsRef = useRef(0);
  const creditedBonusCoinsRef = useRef(0);
  const currentRunEntryIdRef = useRef<string | null>(null);

  // Persist progression whenever it changes
  useEffect(() => {
    saveProgression(progression);
  }, [progression]);

  // Persist & sync audio settings whenever they change
  useEffect(() => {
    saveSettings(settings);
    audio.setMusicMuted(settings.musicMuted);
    audio.setJumpSfxMuted(settings.jumpSfxMuted);
    audio.setSfxMuted(settings.sfxMuted);
  }, [settings, audio]);

  // Clear toast automatically
  useEffect(() => {
    if (!shopToast) return;
    const t = window.setTimeout(() => setShopToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [shopToast]);

  // Decode custom face Data URL into an HTMLImageElement
  useEffect(() => {
    if (!customFaceUrl) {
      setCustomFaceImg(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setCustomFaceImg(img);
    };
    img.src = customFaceUrl;
    return () => {
      cancelled = true;
    };
  }, [customFaceUrl]);

  useEffect(() => {
    return () => {
      audio.dispose();
    };
  }, [audio]);

  // Rewarded ad countdown timer
  useEffect(() => {
    if (adSecondsLeft === null || adSecondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setAdSecondsLeft((s) => (s !== null ? Math.max(0, s - 1) : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [adSecondsLeft]);

  const startGame = useCallback(() => {
    setActiveModal(null);
    setConfirmResetOpen(false);
    setPendingCoinPkg(null);
    setIsPaused(false);
    audio.setMusicPaused(false);
    creditedRunCoinsRef.current = 0;
    creditedBonusCoinsRef.current = 0;
    currentRunEntryIdRef.current = null;
    setScore(0);
    setRunCoins(0);
    setLastScoreBonusCoins(0);
    setIsNewRecord(false);
    setAdContinueUsed(false);
    setAdSecondsLeft(null);
    setActivePowerUps({ magnet: 0, double: 0, boost: 0 });
    setRunId((id) => id + 1);
    setGameState('PLAYING');
    audio.startMusic();
  }, [audio]);

  const handleTogglePause = useCallback(() => {
    if (gameState !== 'PLAYING' || adSecondsLeft !== null) return;
    setIsPaused((prev) => {
      const next = !prev;
      audio.setHolding(false);
      audio.setMusicPaused(next);
      return next;
    });
  }, [gameState, adSecondsLeft, audio]);

  const handleExitToMenu = useCallback(() => {
    setIsPaused(false);
    audio.setHolding(false);
    audio.setMusicPaused(false);
    audio.stopMusic();
    setGameState('TITLE_MENU');
  }, [audio]);

  const handleResetAllData = useCallback(() => {
    const fresh = createDefaultProgression();
    setProgression(fresh);
    setHighScore(0);
    writeStoredHighScore(0);
    setCharacterId('bunny');
    writeStoredCharacter('bunny');
    setConfirmResetOpen(false);
    setShopToast('Spielstand wurde zurückgesetzt');
  }, []);

  const handleStartAdContinue = useCallback(() => {
    setAdSecondsLeft(5);
  }, []);

  const handleFinishAdContinue = useCallback(() => {
    setAdSecondsLeft(null);
    setAdContinueUsed(true);
    setIsPaused(false);
    audio.setMusicPaused(false);
    setReviveId((id) => id + 1);
    setGameState('PLAYING');
    audio.startMusic();
  }, [audio]);

  const handleSelectCharacter = useCallback(
    (id: CharacterId) => {
      if (!progression.unlockedCharacters.includes(id)) return;
      setCharacterId(id);
      writeStoredCharacter(id);
    },
    [progression.unlockedCharacters]
  );

  const handleBuyOrSelectCharacter = useCallback(
    (id: CharacterId) => {
      const isUnlocked = progression.unlockedCharacters.includes(id);
      if (isUnlocked) {
        setCharacterId(id);
        writeStoredCharacter(id);
        return;
      }
      const price = CHARACTER_PRICES[id].coins;
      if (progression.coins < price) {
        setShopToast(`Noch ${(price - progression.coins).toLocaleString('de-DE')} Coins nötig!`);
        setShopTab('coins');
        return;
      }
      audio.playPowerUp();
      setProgression((prev) => ({
        ...prev,
        coins: prev.coins - price,
        unlockedCharacters: [...prev.unlockedCharacters, id],
      }));
      setCharacterId(id);
      writeStoredCharacter(id);
      setShopToast('Charakter freigeschaltet!');
    },
    [audio, progression.coins, progression.unlockedCharacters]
  );

  const handleBuyBoardCharge = useCallback(
    (amount: 1 | 5) => {
      const cost = amount === 1 ? BOARD_CHARGE_PRICE_SINGLE : BOARD_CHARGE_PRICE_PACK5;
      if (progression.coins < cost) {
        setShopToast(`Noch ${(cost - progression.coins).toLocaleString('de-DE')} Coins nötig!`);
        setShopTab('coins');
        return;
      }
      audio.playPowerUp();
      setProgression((prev) => ({
        ...prev,
        coins: prev.coins - cost,
        boardCharges: prev.boardCharges + amount,
      }));
      setShopToast(`+${amount} Rettungs-Board${amount > 1 ? 's' : ''} erhalten!`);
    },
    [audio, progression.coins]
  );

  const handleBuyOrEquipBoardSkin = useCallback(
    (skinId: BoardSkinId, priceCoins: number) => {
      if (progression.unlockedBoardSkins.includes(skinId)) {
        setProgression((prev) => ({ ...prev, equippedBoardSkin: skinId }));
        return;
      }
      if (progression.coins < priceCoins) {
        setShopToast(`Noch ${(priceCoins - progression.coins).toLocaleString('de-DE')} Coins nötig!`);
        setShopTab('coins');
        return;
      }
      audio.playPowerUp();
      setProgression((prev) => ({
        ...prev,
        coins: prev.coins - priceCoins,
        unlockedBoardSkins: [...prev.unlockedBoardSkins, skinId],
        equippedBoardSkin: skinId,
      }));
      setShopToast('Board-Design freigeschaltet!');
    },
    [audio, progression.coins, progression.unlockedBoardSkins]
  );

  const handleConfirmTestCoinPurchase = useCallback(
    (pkg: CoinPackageDef) => {
      audio.playMissionComplete();
      setProgression((prev) => ({
        ...prev,
        coins: prev.coins + pkg.coins,
      }));
      setPendingCoinPkg(null);
      setShopToast(`+${pkg.coins.toLocaleString('de-DE')} Coins gutgeschrieben (Testmodus)`);
    },
    [audio]
  );

  const handleBoardConsumed = useCallback(() => {
    setProgression((prev) => ({
      ...prev,
      boardCharges: Math.max(0, prev.boardCharges - 1),
    }));
  }, []);

  const handleConsumePendingDouble = useCallback(() => {
    setProgression((prev) =>
      prev.pendingDoubleSeconds > 0 ? { ...prev, pendingDoubleSeconds: 0 } : prev
    );
  }, []);

  const handleMissionEvent = useCallback(
    (ev: MissionEvent) => {
      setProgression((prev) => {
        let changed = false;
        const updatedMissions = prev.missions.map((m) => {
          if (m.progress >= m.target) return m;
          let nextProg = m.progress;
          if (ev.type === 'coin' && m.kind === 'coins') {
            nextProg = Math.min(m.target, m.progress + ev.amount);
          } else if (ev.type === 'skip' && m.kind === 'skips') {
            nextProg = Math.min(m.target, m.progress + ev.amount);
          } else if (ev.type === 'crumble' && m.kind === 'crumble') {
            nextProg = Math.min(m.target, m.progress + ev.amount);
          } else if (ev.type === 'powerup' && m.kind === 'powerups') {
            nextProg = Math.min(m.target, m.progress + ev.amount);
          } else if (ev.type === 'score' && m.kind === 'score') {
            nextProg = Math.min(m.target, Math.max(m.progress, ev.score));
          }
          if (nextProg !== m.progress) {
            changed = true;
            return { ...m, progress: nextProg };
          }
          return m;
        });

        if (!changed) return prev;

        const allDone = updatedMissions.every((m) => m.progress >= m.target);
        if (allDone) {
          audio.playMissionComplete();
          const nextSet = prev.missionSetIndex + 1;
          setShopToast(
            `3er-Mission komplett! +${MISSION_REWARD_COINS} Coins & ${MISSION_DOUBLE_DURATION}s 2× Boost!`
          );
          return {
            ...prev,
            coins: prev.coins + MISSION_REWARD_COINS,
            pendingDoubleSeconds: Math.max(prev.pendingDoubleSeconds, MISSION_DOUBLE_DURATION),
            missionSetIndex: nextSet,
            missions: buildMissionsForSet(nextSet),
          };
        }

        return {
          ...prev,
          missions: updatedMissions,
        };
      });
    },
    [audio]
  );

  const handleGameOver = useCallback(
    (finalScore: number, collectedCoins: number, baseScore: number) => {
      gameOverAtRef.current = performance.now();
      setScore(finalScore);
      setRunCoins(collectedCoins);

      const totalBonusFromPoints = Math.floor(baseScore / POINTS_PER_EARNED_COIN);
      setLastScoreBonusCoins(totalBonusFromPoints);

      const deltaLevelCoins = Math.max(0, collectedCoins - creditedRunCoinsRef.current);
      const deltaBonusCoins = Math.max(0, totalBonusFromPoints - creditedBonusCoinsRef.current);
      creditedRunCoinsRef.current = collectedCoins;
      creditedBonusCoinsRef.current = totalBonusFromPoints;
      const deltaCoinsEarned = deltaLevelCoins + deltaBonusCoins;
      const totalRunCoinsEarned = collectedCoins + totalBonusFromPoints;

      setHighScore((prev) => {
        if (finalScore > prev) {
          setIsNewRecord(true);
          writeStoredHighScore(finalScore);
          return finalScore;
        }
        setIsNewRecord(false);
        return prev;
      });

      setProgression((prev) => {
        let nextLeaderboard = prev.leaderboard;
        if (finalScore > 0) {
          const entryId =
            currentRunEntryIdRef.current ??
            `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          currentRunEntryIdRef.current = entryId;
          const updatedEntry = {
            id: entryId,
            name: prev.playerName,
            score: finalScore,
            coins: totalRunCoinsEarned,
            characterId,
            createdAt: Date.now(),
          };
          nextLeaderboard = [
            ...prev.leaderboard.filter((e) => e.id !== entryId),
            updatedEntry,
          ]
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        }

        return {
          ...prev,
          coins: prev.coins + deltaCoinsEarned,
          leaderboard: nextLeaderboard,
        };
      });

      setIsPaused(false);
      audio.setMusicPaused(false);
      setGameState('GAME_OVER');
    },
    [audio, characterId]
  );

  // Keyboard shortcuts for Start / Restart / Pause / Escape / Mute
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && activeModal) {
        setActiveModal(null);
        setConfirmResetOpen(false);
        setPendingCoinPkg(null);
        return;
      }

      if (
        (e.code === 'KeyP' || e.code === 'Escape') &&
        gameState === 'PLAYING' &&
        !activeModal &&
        adSecondsLeft === null
      ) {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      if (e.code === 'KeyM' && !activeModal) {
        const nextMuted = audio.toggleMute();
        setMuted(nextMuted);
        return;
      }

      if (activeModal || adSecondsLeft !== null || isPaused) return;

      if (gameState === 'TITLE_MENU' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startGame();
      } else if (
        gameState === 'GAME_OVER' &&
        (e.code === 'Enter' || e.code === 'Space') &&
        performance.now() - gameOverAtRef.current > 320
      ) {
        e.preventDefault();
        startGame();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal, adSecondsLeft, audio, gameState, handleTogglePause, isPaused, startGame]);

  const handleToggleMute = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    const nextMuted = audio.toggleMute();
    setMuted(nextMuted);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const name = audio.setCustomTrack(file);
    setCustomTrackName(name);
    if (gameState === 'PLAYING') {
      audio.startMusic();
    }
    e.target.value = '';
  };

  const handleClearCustomTrack = (e: React.MouseEvent) => {
    e.stopPropagation();
    audio.setCustomTrack(null);
    setCustomTrackName(null);
  };

  const handleFaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await processFaceImage(file);
      setCustomFaceUrl(dataUrl);
      writeStoredCustomFace(dataUrl);
      if (progression.unlockedCharacters.includes('custom')) {
        handleSelectCharacter('custom');
      }
    } catch {
      // Ignore invalid image files silently
    }
  };

  const handleClearCustomFace = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomFaceUrl(null);
    setCustomFaceImg(null);
    writeStoredCustomFace(null);
    if (characterId === 'custom') {
      handleSelectCharacter('bunny');
    }
  };

  const completedMissionCount = progression.missions.filter((m) => m.progress >= m.target).length;
  const totalRunCoins = runCoins + lastScoreBonusCoins;

  return (
    <main className="fixed inset-0 overflow-hidden bg-gradient-to-b from-[#F4A9C1] via-[#E98DAB] to-[#DF7A9B] sm:static sm:flex sm:h-[100dvh] sm:w-screen sm:items-center sm:justify-center sm:bg-[#121015] sm:bg-none sm:p-4">
      {/* Edge-to-edge fullscreen on mobile phones, proportional 9:16 arcade shell on desktop */}
      <div className="relative h-full w-full overflow-hidden bg-[#F4A9C1] sm:aspect-[9/16] sm:h-[min(92dvh,820px)] sm:w-auto sm:max-w-[92vw] sm:rounded-[28px] sm:shadow-[0_24px_64px_rgba(0,0,0,0.65)] sm:ring-1 sm:ring-white/10">
        {/* Isolated 60fps Game Canvas */}
        <FlapsCanvas
          gameState={gameState}
          isPaused={isPaused}
          screenShake={settings.screenShake}
          runId={runId}
          reviveId={reviveId}
          characterId={characterId}
          customFaceImg={customFaceImg}
          pendingDoubleSeconds={progression.pendingDoubleSeconds}
          boardCharges={progression.boardCharges}
          boardSkin={progression.equippedBoardSkin}
          audio={audio}
          onScoreChange={setScore}
          onRunCoinsChange={setRunCoins}
          onPowerUpsChange={setActivePowerUps}
          onBoardConsumed={handleBoardConsumed}
          onConsumePendingDouble={handleConsumePendingDouble}
          onMissionEvent={handleMissionEvent}
          onGameOver={handleGameOver}
        />

        {/* Toast Notification */}
        {shopToast && (
          <div className="pointer-events-none absolute inset-x-4 top-16 z-50 flex justify-center">
            <div className="rounded-xl bg-[#111111]/92 px-3.5 py-2 text-center text-[11.5px] font-bold text-white shadow-lg">
              {shopToast}
            </div>
          </div>
        )}

        {/* Top HUD Overlay (3-column grid keeps Score mathematically centered with zero overlap) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-start gap-1.5 px-3.5 pt-[max(14px,env(safe-area-inset-top))]">
          {/* Top Left: Coin Wallet (Menu) OR Multiplier + Rescue Boards (In-Game) */}
          {gameState === 'TITLE_MENU' ? (
            <div className="pointer-events-auto flex items-center gap-1.5 justify-self-start">
              <button
                type="button"
                onClick={() => {
                  setShopTab('coins');
                  setActiveModal('shop');
                }}
                className="flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-white/92 pr-1.5 pl-2.5 text-[#111111] shadow-[0_4px_14px_rgba(20,15,22,0.14)] transition-transform hover:scale-105 active:scale-95"
                title="Coins kaufen"
              >
                <Coins className="h-4 w-4 text-[#D97706]" />
                <span className="font-display tabular-nums text-[13px] font-black">
                  {progression.coins.toLocaleString('de-DE')}
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E] text-white">
                  <Plus className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              </button>

              {progression.pendingDoubleSeconds > 0 && (
                <div
                  className="flex h-9 items-center gap-1 whitespace-nowrap rounded-full bg-[#CA8A04] px-2.5 text-[10.5px] font-black text-white shadow-sm"
                  title="Nächster Lauf startet mit 2× Multiplikator"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>2× ({Math.round(progression.pendingDoubleSeconds)}s)</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-1 justify-self-start">
              <div className="flex items-center gap-1.5">
                {activePowerUps.double > 0 ? (
                  <div className="flex h-7 items-center gap-0.5 whitespace-nowrap rounded-lg bg-[#CA8A04] px-2 font-retro text-[9px] text-white shadow-sm">
                    ×2
                  </div>
                ) : (
                  <div
                    className="flex h-7 items-center whitespace-nowrap rounded-lg bg-[#111111]/75 px-2 font-retro text-[9px] text-white/90 shadow-sm"
                    title="Normaler Punkte-Multiplikator"
                  >
                    ×1
                  </div>
                )}
                <div className="flex h-7 items-center gap-1 whitespace-nowrap rounded-lg bg-white/90 px-2 text-[11px] font-extrabold text-[#111111] shadow-sm">
                  <Shield className="h-3.5 w-3.5 text-[#16A34A]" />
                  <span className="tabular-nums">{progression.boardCharges}</span>
                </div>
              </div>

              {/* Active Level-1 Power-Up Timer Pills */}
              {(activePowerUps.double > 0 ||
                activePowerUps.magnet > 0 ||
                activePowerUps.boost > 0) && (
                <div className="flex flex-col gap-1">
                  {activePowerUps.double > 0 && (
                    <div className="flex items-center gap-1 whitespace-nowrap rounded-md bg-[#CA8A04]/95 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                      <Sparkles className="h-3 w-3" />
                      <span className="tabular-nums">2× {activePowerUps.double.toFixed(1)}s</span>
                    </div>
                  )}
                  {activePowerUps.magnet > 0 && (
                    <div className="flex items-center gap-1 whitespace-nowrap rounded-md bg-[#0284C7]/90 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                      <Magnet className="h-3 w-3" />
                      <span className="tabular-nums">{activePowerUps.magnet.toFixed(1)}s</span>
                    </div>
                  )}
                  {activePowerUps.boost > 0 && (
                    <div className="flex items-center gap-1 whitespace-nowrap rounded-md bg-[#EA580C]/95 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                      <Rocket className="h-3 w-3" />
                      <span className="tabular-nums">{activePowerUps.boost.toFixed(1)}s</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Score Bar (Top Center, Retro Arcade Pixel Style) */}
          {gameState !== 'TITLE_MENU' ? (
            <div
              className="retro-score-box justify-self-center flex min-w-[92px] sm:min-w-[112px] items-center justify-center bg-gradient-to-b from-[#E5588E] via-[#CC3970] to-[#AE2357] px-3.5 py-1.5 sm:px-4 sm:py-2"
              aria-live="polite"
            >
              <span className="font-retro tabular-nums text-[13.5px] sm:text-[14px] leading-none tracking-wider text-white drop-shadow-[0_2px_0_#6B1032]">
                {score}
              </span>
            </div>
          ) : (
            <div aria-hidden="true" />
          )}

          {/* Top Right: Menu = Mute + Settings | In-Game = Run Coins + Pause Button */}
          <div className="pointer-events-auto flex items-center gap-1.5 justify-self-end">
            {gameState !== 'TITLE_MENU' && (
              <div className="flex h-8 items-center gap-1 whitespace-nowrap rounded-full bg-white/90 px-2.5 text-[11.5px] font-black text-[#111111] shadow-sm">
                <Coins className="h-3.5 w-3.5 text-[#D97706]" />
                <span className="tabular-nums">+{runCoins}</span>
              </div>
            )}

            {gameState === 'PLAYING' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePause();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/92 text-[#111111] shadow-[0_4px_14px_rgba(20,15,22,0.14)] transition-transform duration-150 hover:scale-105 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                aria-label={isPaused ? 'Spiel fortsetzen' : 'Spiel pausieren'}
                title={isPaused ? 'Fortsetzen (P / Esc)' : 'Pause (P / Esc)'}
              >
                {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/90 text-[#111111] shadow-[0_4px_14px_rgba(20,15,22,0.14)] transition-transform duration-150 hover:scale-105 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                  aria-label={muted ? 'Alle Töne einschalten' : 'Alle Töne stummschalten'}
                  title={muted ? 'Ton einschalten (M)' : 'Ton stummschalten (M)'}
                >
                  {muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
                </button>
                {gameState === 'TITLE_MENU' && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmResetOpen(false);
                      setActiveModal('settings');
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white/92 px-3 text-[11.5px] font-extrabold text-[#111111] shadow-[0_4px_14px_rgba(20,15,22,0.14)] transition-transform duration-150 hover:scale-105 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                    aria-label="Einstellungen öffnen"
                    title="Einstellungen"
                  >
                    <Settings className="h-4 w-4 text-[#111111]" />
                    <span>Einstellungen</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* TITLE SCREEN OVERLAY */}
        {gameState === 'TITLE_MENU' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-5 pt-[calc(max(12px,env(safe-area-inset-top))+42px)] pb-[max(14px,env(safe-area-inset-bottom))]">
            <div className="flex h-full max-h-[520px] w-full max-w-[336px] flex-col items-center justify-between">
              {/* Title Lockup + Challenge */}
              <div className="flex flex-col items-center text-center">
                <svg
                  viewBox="0 0 240 68"
                  className="h-[46px] w-[178px] drop-shadow-[0_4px_0_rgba(255,255,255,0.65)]"
                  role="img"
                  aria-label="FLAPS"
                >
                  <text
                    x="120"
                    y="52"
                    textAnchor="middle"
                    fill="#111111"
                    fontFamily="Outfit, system-ui, sans-serif"
                    fontWeight="900"
                    fontSize="58"
                    letterSpacing="-2"
                  >
                    FLAPS
                  </text>
                </svg>

                <p className="mt-0.5 text-[12.5px] font-bold text-[#111111] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]">
                  Tippen & halten für längere Sprünge
                </p>

                {/* Motivating Challenge Banner */}
                <div className="mt-1.5 w-full max-w-[320px] rounded-xl border border-white/80 bg-[#121015]/75 px-3 py-1.5 text-center shadow-[0_4px_0_rgba(17,17,17,0.2)] backdrop-blur-[2px]">
                  <div className="font-retro text-[7.5px] tracking-widest text-[#4ADE80]">
                    CHALLENGE
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug font-bold text-white">
                    {MOTIVATING_CHALLENGES[challengeIdx]}
                  </p>
                </div>
              </div>

              {/* Bottom Action Cluster */}
              <div className="pointer-events-auto flex w-full max-w-[320px] flex-col items-center gap-1.5">
              {highScore > 0 && (
                <div className="rounded-full bg-white/80 px-3 py-0.5 text-[11.5px] font-bold tracking-tight text-[#111111] tabular-nums backdrop-blur-[2px]">
                  Bestleistung: {highScore} · {progression.boardCharges} Boards
                </div>
              )}

              <button
                type="button"
                onClick={startGame}
                className="font-display flex w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-[#111111] px-6 py-2.5 text-[18px] font-black tracking-wide text-white shadow-[0_10px_24px_rgba(17,17,17,0.28)] transition-transform duration-150 hover:scale-[1.02] hover:bg-[#1E1A24] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] whitespace-nowrap"
              >
                <Play className="h-4.5 w-4.5 fill-current" />
                <span>PLAY</span>
              </button>

              {/* 3-Tile Subway Surfers Style Navigation Dock */}
              <div className="grid w-full grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShopTab('characters');
                    setActiveModal('shop');
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[13px] bg-white/92 py-1.5 text-[#111111] shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <div className="flex items-center gap-1">
                    <CharacterPreview
                      characterId={characterId}
                      customFaceImg={customFaceImg}
                      size={20}
                    />
                    <ShoppingBag className="h-3.5 w-3.5 text-[#16A34A]" />
                  </div>
                  <span className="text-[10.5px] font-extrabold">Shop</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('missions')}
                  className="relative flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[13px] bg-white/92 py-1.5 text-[#111111] shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <Target className="h-4.5 w-4.5 text-[#EA580C]" />
                  <span className="text-[10.5px] font-extrabold">
                    Missionen ({completedMissionCount}/3)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('leaderboard')}
                  className="flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[13px] bg-white/92 py-1.5 text-[#111111] shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <Trophy className="h-4.5 w-4.5 text-[#D97706]" />
                  <span className="text-[10.5px] font-extrabold">Score-Liste</span>
                </button>
              </div>

              {/* Custom MP3 / Built-in Breakbeat Selector */}
              <div className="flex w-full flex-col items-center gap-0.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {customTrackName ? (
                  <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/85 px-3 py-1 text-[11.5px] font-semibold text-[#111111] shadow-sm">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Music className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                      <span className="truncate">{customTrackName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearCustomTrack}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#111111]/70 transition-colors hover:bg-black/10 hover:text-[#111111]"
                      aria-label="Eigene MP3 entfernen"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white/80 px-3 py-1 text-[11.5px] font-bold text-[#111111] shadow-sm transition-colors duration-150 hover:bg-white whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    <span>Eigene MP3 wählen</span>
                  </button>
                )}

                <span className="text-[10px] font-semibold text-[#111111]/65">
                  Maus · Touch · Leertaste
                </span>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* SHOP MODAL (Charaktere, Rettungs-Boards, Coins kaufen) */}
        {gameState === 'TITLE_MENU' && activeModal === 'shop' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121015]/58 px-3.5">
            <div className="flex max-h-[580px] w-full max-w-[330px] flex-col rounded-[24px] bg-white p-4 text-[#111111] shadow-[0_24px_60px_rgba(17,17,17,0.45)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-[19px] leading-tight font-black">FLAPS Shop</h2>
                  <div className="mt-0.5 flex items-center gap-1 text-[12px] font-extrabold text-[#B45309]">
                    <Coins className="h-3.5 w-3.5 text-[#D97706]" />
                    <span className="tabular-nums">
                      {progression.coins.toLocaleString('de-DE')} Coins
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setPendingCoinPkg(null);
                  }}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#111111]/8 text-[#111111] hover:bg-[#111111]/15"
                  aria-label="Schließen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Shop Tabs */}
              <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-[#FFF0F5] p-1">
                {(
                  [
                    ['characters', 'Charaktere'],
                    ['boards', 'Boards'],
                    ['coins', 'Coins'],
                  ] as const
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => {
                      setShopTab(tabId);
                      setPendingCoinPkg(null);
                    }}
                    className={`cursor-pointer rounded-lg py-1.5 text-[11.5px] font-extrabold transition-all ${
                      shopTab === tabId
                        ? 'bg-[#111111] text-white shadow-sm'
                        : 'text-[#111111]/65 hover:text-[#111111]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <input
                ref={faceInputRef}
                type="file"
                accept="image/*"
                onChange={handleFaceFileChange}
                className="hidden"
              />

              {/* Shop Tab Content */}
              <div className="mt-2.5 flex flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                {shopTab === 'characters' && (
                  <>
                    {/* Custom Face Upload Card (unlockable for 5.500 Coins / 4,99 €) */}
                    {(() => {
                      const customUnlocked = progression.unlockedCharacters.includes('custom');
                      const customSelected = characterId === 'custom';
                      const customPrice = CHARACTER_PRICES.custom;
                      return (
                        <div
                          className={`flex items-center justify-between rounded-2xl border-2 px-2.5 py-2 ${
                            customSelected
                              ? 'border-[#22C55E] bg-[#F0FDF4]'
                              : 'border-dashed border-[#E98DAB] bg-[#FFF5F8]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#F4A9C1] to-[#E98DAB]">
                              {customFaceImg ? (
                                <CharacterPreview
                                  characterId="custom"
                                  customFaceImg={customFaceImg}
                                  size={38}
                                />
                              ) : (
                                <Camera className="h-5 w-5 text-white" />
                              )}
                            </div>
                            <div className="leading-tight">
                              <div className="font-display text-[13.5px] font-black">
                                Dein Gesicht
                              </div>
                              <div className="text-[10.5px] font-semibold text-[#111111]/60">
                                {customUnlocked
                                  ? customFaceUrl
                                    ? 'Eigenes Foto bereit'
                                    : 'Foto hochladen'
                                  : `Wert ${customPrice.eurLabel}`}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {customUnlocked ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => faceInputRef.current?.click()}
                                  className="cursor-pointer rounded-lg bg-[#111111]/8 px-2 py-1 text-[10.5px] font-bold hover:bg-[#111111]/15"
                                >
                                  {customFaceUrl ? 'Foto' : 'Laden'}
                                </button>
                                {customFaceUrl && (
                                  <button
                                    type="button"
                                    onClick={handleClearCustomFace}
                                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-[#111111]/55 hover:bg-red-100 hover:text-red-600"
                                    title="Foto löschen"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!customFaceUrl) {
                                      faceInputRef.current?.click();
                                    } else {
                                      handleSelectCharacter('custom');
                                    }
                                  }}
                                  className={`cursor-pointer rounded-lg px-2 py-1 text-[10.5px] font-extrabold ${
                                    customSelected
                                      ? 'bg-[#22C55E] text-white'
                                      : 'bg-[#111111] text-white'
                                  }`}
                                >
                                  {customSelected ? 'Aktiv' : 'Wählen'}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleBuyOrSelectCharacter('custom')}
                                className="flex cursor-pointer items-center gap-1 rounded-xl bg-[#111111] px-2.5 py-1.5 text-[11px] font-black text-[#FDE047] transition-transform hover:scale-105"
                              >
                                <Coins className="h-3 w-3" />
                                <span>{customPrice.coins.toLocaleString('de-DE')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {CHARACTERS.map((char) => {
                      const unlocked = progression.unlockedCharacters.includes(char.id);
                      const selected = characterId === char.id;
                      const priceInfo = CHARACTER_PRICES[char.id];
                      return (
                        <div
                          key={char.id}
                          className={`flex items-center justify-between rounded-2xl border-2 px-2.5 py-1.5 ${
                            selected
                              ? 'border-[#22C55E] bg-[#F0FDF4]'
                              : 'border-black/8 bg-[#FFF5F8]/70'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#F4A9C1] to-[#E98DAB]">
                              <CharacterPreview characterId={char.id} size={38} />
                            </div>
                            <div className="leading-tight">
                              <div className="flex items-center gap-1 font-display text-[13.5px] font-black">
                                <span>{char.name}</span>
                                {char.id === 'crown' && (
                                  <Crown className="h-3.5 w-3.5 text-[#D97706]" />
                                )}
                              </div>
                              <div className="text-[10.5px] font-semibold text-[#111111]/60">
                                {unlocked ? char.tagline : `Wert ${priceInfo.eurLabel}`}
                              </div>
                            </div>
                          </div>

                          {unlocked ? (
                            <button
                              type="button"
                              onClick={() => handleSelectCharacter(char.id)}
                              className={`flex cursor-pointer items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold ${
                                selected
                                  ? 'bg-[#22C55E] text-white'
                                  : 'bg-[#111111] text-white hover:bg-[#1E1A24]'
                              }`}
                            >
                              {selected && <Check className="h-3 w-3 stroke-[3]" />}
                              <span>{selected ? 'Aktiv' : 'Wählen'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleBuyOrSelectCharacter(char.id)}
                              className="flex cursor-pointer items-center gap-1 rounded-xl bg-[#111111] px-2.5 py-1.5 text-[11px] font-black text-[#FDE047] transition-transform hover:scale-105"
                            >
                              <Coins className="h-3 w-3" />
                              <span>{priceInfo.coins.toLocaleString('de-DE')}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {shopTab === 'boards' && (
                  <>
                    {/* Rescue Board Charges */}
                    <div className="rounded-2xl border-2 border-[#22C55E]/35 bg-[#F0FDF4] p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-5 w-5 text-[#16A34A]" />
                          <div>
                            <div className="font-display text-[13.5px] font-black">
                              Rettungs-Boards: {progression.boardCharges}×
                            </div>
                            <div className="text-[10.5px] font-semibold text-[#111111]/65">
                              Rettet dich automatisch 1× vor dem Absturz!
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleBuyBoardCharge(1)}
                          className="flex cursor-pointer items-center justify-center gap-1 rounded-xl bg-[#111111] py-2 text-[11px] font-black text-[#FDE047] hover:bg-[#1E1A24]"
                        >
                          <span>1× Board ·</span>
                          <Coins className="h-3 w-3" />
                          <span>{BOARD_CHARGE_PRICE_SINGLE}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBuyBoardCharge(5)}
                          className="flex cursor-pointer items-center justify-center gap-1 rounded-xl bg-[#16A34A] py-2 text-[11px] font-black text-white hover:bg-[#15803D]"
                        >
                          <span>5er-Pack ·</span>
                          <Coins className="h-3 w-3" />
                          <span>{BOARD_CHARGE_PRICE_PACK5.toLocaleString('de-DE')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Permanent Board Skins */}
                    {BOARD_SKINS.map((skin) => {
                      const unlocked = progression.unlockedBoardSkins.includes(skin.id);
                      const equipped = progression.equippedBoardSkin === skin.id;
                      return (
                        <div
                          key={skin.id}
                          className={`flex items-center justify-between rounded-2xl border-2 px-3 py-2 ${
                            equipped
                              ? 'border-[#22C55E] bg-[#F0FDF4]'
                              : 'border-black/8 bg-[#FFF5F8]/70'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl border-2"
                              style={{
                                backgroundColor: skin.primaryColor,
                                borderColor: skin.accentColor,
                              }}
                            >
                              <Zap className="h-4 w-4 text-white drop-shadow" />
                            </div>
                            <div className="leading-tight">
                              <div className="font-display text-[13px] font-black">{skin.name}</div>
                              <div className="text-[10.5px] font-semibold text-[#111111]/60">
                                {skin.tagline}
                              </div>
                            </div>
                          </div>

                          {unlocked ? (
                            <button
                              type="button"
                              onClick={() => handleBuyOrEquipBoardSkin(skin.id, skin.priceCoins)}
                              className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold ${
                                equipped ? 'bg-[#22C55E] text-white' : 'bg-[#111111] text-white'
                              }`}
                            >
                              {equipped ? 'Aktiv' : 'Ausrüsten'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleBuyOrEquipBoardSkin(skin.id, skin.priceCoins)}
                              className="flex cursor-pointer items-center gap-1 rounded-xl bg-[#111111] px-2.5 py-1.5 text-[11px] font-black text-[#FDE047]"
                            >
                              <Coins className="h-3 w-3" />
                              <span>{skin.priceCoins.toLocaleString('de-DE')}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {shopTab === 'coins' && (
                  <>
                    {pendingCoinPkg ? (
                      <div className="rounded-2xl border-2 border-[#111111] bg-[#FFF5F8] p-4 text-center">
                        <div className="font-retro text-[8px] text-[#CC3970]">
                          TEST-CHECKOUT
                        </div>
                        <h3 className="font-display mt-1.5 text-[18px] font-black">
                          {pendingCoinPkg.name}
                        </h3>
                        <p className="mt-1 text-[13px] font-extrabold text-[#B45309]">
                          +{pendingCoinPkg.coins.toLocaleString('de-DE')} Coins ({pendingCoinPkg.priceEur})
                        </p>
                        <p className="mt-2 rounded-xl bg-white p-2 text-[10.5px] font-semibold text-[#111111]/70">
                          Demo-Modus ohne echte Abbuchung (bereit für Stripe oder App-Store-Billing).
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingCoinPkg(null)}
                            className="cursor-pointer rounded-xl bg-black/10 py-2 text-[12px] font-bold"
                          >
                            Abbrechen
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmTestCoinPurchase(pendingCoinPkg)}
                            className="cursor-pointer rounded-xl bg-[#16A34A] py-2 text-[12px] font-black text-white"
                          >
                            Test-Kauf
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-xl bg-[#FFF0F5] px-3 py-1.5 text-center text-[10.5px] font-bold text-[#111111]/70">
                          Münzen im Level sammeln · 25 Basis-Pkt = 1 Bonus-Coin
                        </div>
                        {COIN_PACKAGES.map((pkg) => (
                          <div
                            key={pkg.id}
                            className={`relative flex items-center justify-between rounded-2xl border-2 px-3 py-2.5 ${
                              pkg.badge === 'BELIEBT'
                                ? 'border-[#22C55E] bg-[#F0FDF4]'
                                : pkg.badge === 'BESTER WERT'
                                  ? 'border-[#F59E0B] bg-[#FFFBEB]'
                                  : 'border-black/8 bg-white'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-display text-[13.5px] font-black">
                                  {pkg.name}
                                </span>
                                {pkg.badge && (
                                  <span className="rounded-md bg-[#111111] px-1.5 py-0.5 text-[8.5px] font-black text-[#FDE047]">
                                    {pkg.badge}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-extrabold text-[#B45309]">
                                <Coins className="h-3.5 w-3.5 text-[#D97706]" />
                                <span>{pkg.coins.toLocaleString('de-DE')} Coins</span>
                                {pkg.bonusLabel && (
                                  <span className="text-[10px] font-bold text-[#16A34A]">
                                    ({pkg.bonusLabel})
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-semibold text-[#111111]/60">
                                {pkg.highlightNote}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setPendingCoinPkg(pkg)}
                              className="cursor-pointer rounded-xl bg-[#111111] px-3 py-2 text-[12px] font-black text-white transition-transform hover:scale-105"
                            >
                              {pkg.priceEur}
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MISSIONS MODAL (3er-Missionen + temporärer 2× Boost) */}
        {gameState === 'TITLE_MENU' && activeModal === 'missions' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121015]/58 px-4">
            <div className="w-full max-w-[320px] rounded-[24px] bg-white p-4 text-[#111111] shadow-[0_24px_60px_rgba(17,17,17,0.45)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-[19px] leading-tight font-black">
                    Missionen & Boni
                  </h2>
                  <p className="text-[11px] font-semibold text-[#111111]/60">
                    Alle 3 erfüllen → +{MISSION_REWARD_COINS} Coins & {MISSION_DOUBLE_DURATION}s 2× Multiplikator
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#111111]/8"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#111111] px-3.5 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-[#FDE047]" />
                  <div className="leading-tight">
                    <div className="text-[12px] font-bold">Multiplikator-Coin (2×)</div>
                    <div className="text-[10px] text-white/70">
                      Verdoppelt alle Scores für {POWERUP_DURATIONS.double}s, danach wieder ×1
                    </div>
                  </div>
                </div>
                <span className="font-retro text-[12px] text-[#FDE047]">×1→×2</span>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {progression.missions.map((m) => {
                  const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
                  const done = m.progress >= m.target;
                  return (
                    <div
                      key={m.id}
                      className={`rounded-2xl border-2 p-2.5 ${
                        done ? 'border-[#22C55E] bg-[#F0FDF4]' : 'border-black/8 bg-[#FFF5F8]/70'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[12px] font-extrabold">
                        <span>{m.label}</span>
                        <span className="tabular-nums text-[#16A34A]">
                          {m.progress}/{m.target}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/10">
                        <div
                          className="h-full rounded-full bg-[#22C55E] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Transparent Fixed Power-Up Rules */}
              <div className="mt-3 rounded-2xl bg-[#FFF0F5] p-2.5 text-[10.5px] font-semibold text-[#111111]/75">
                <div className="font-extrabold text-[#111111]">
                  Power-Ups im Level (kurze Dauer, für alle gleich):
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>Magnet: {POWERUP_DURATIONS.magnet}s</span>
                  <span>Multiplikator-Coin (2×): {POWERUP_DURATIONS.double}s</span>
                  <span>Raketen-Boost: {POWERUP_DURATIONS.boost}s</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCORE-LISTE / LEADERBOARD MODAL */}
        {gameState === 'TITLE_MENU' && activeModal === 'leaderboard' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121015]/58 px-4">
            <div className="flex max-h-[560px] w-full max-w-[320px] flex-col rounded-[24px] bg-white p-4 text-[#111111] shadow-[0_24px_60px_rgba(17,17,17,0.45)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-[19px] leading-tight font-black">
                    Score-Liste (Top 10)
                  </h2>
                  <p className="text-[11px] font-semibold text-[#111111]/60">
                    Deine besten Läufe auf diesem Gerät
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#111111]/8"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-[#FFF0F5] px-3 py-1.5">
                <span className="text-[11px] font-bold text-[#111111]/65">Name:</span>
                <input
                  type="text"
                  maxLength={16}
                  value={progression.playerName}
                  onChange={(e) =>
                    setProgression((prev) => ({
                      ...prev,
                      playerName: e.target.value.slice(0, 16),
                    }))
                  }
                  className="w-full bg-transparent text-[12.5px] font-extrabold text-[#111111] outline-none"
                  placeholder="Spielername"
                />
              </div>

              <div className="mt-2.5 flex flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
                {progression.leaderboard.length === 0 ? (
                  <div className="rounded-2xl bg-[#FFF5F8] p-5 text-center text-[12px] font-semibold text-[#111111]/60">
                    Noch keine Läufe eingetragen. Starte deinen ersten Run!
                  </div>
                ) : (
                  progression.leaderboard.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 ${
                        idx === 0
                          ? 'bg-[#FEF9C3]'
                          : idx === 1
                            ? 'bg-slate-100'
                            : idx === 2
                              ? 'bg-orange-50'
                              : 'bg-[#FFF5F8]/70'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-retro w-6 text-[10px] text-[#111111]/70">
                          #{idx + 1}
                        </span>
                        <CharacterPreview
                          characterId={entry.characterId}
                          customFaceImg={entry.characterId === 'custom' ? customFaceImg : null}
                          size={26}
                        />
                        <div className="leading-tight">
                          <div className="text-[12px] font-extrabold">{entry.name || 'Spieler'}</div>
                          <div className="text-[10px] font-semibold text-[#111111]/55">
                            +{entry.coins} Coins
                          </div>
                        </div>
                      </div>
                      <span className="font-display tabular-nums text-[16px] font-black">
                        {entry.score}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* EINSTELLUNGEN MODAL (Audio, Steuerung & Spieloptionen) */}
        {gameState === 'TITLE_MENU' && activeModal === 'settings' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121015]/58 px-4">
            <div className="flex max-h-[572px] w-full max-w-[324px] flex-col rounded-[24px] bg-white p-4 text-[#111111] shadow-[0_24px_60px_rgba(17,17,17,0.45)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-[19px] leading-tight font-black">
                    Einstellungen
                  </h2>
                  <p className="text-[11px] font-semibold text-[#111111]/60">
                    Audio, Steuerung & Spieloptionen
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setConfirmResetOpen(false);
                  }}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#111111]/8"
                  aria-label="Einstellungen schließen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
                {/* Sektion 1: Audio & Sound */}
                <section className="rounded-2xl bg-[#FFF5F8] p-3">
                  <div className="text-[10.5px] font-black tracking-wide text-[#CC3970] uppercase">
                    Audio & Sound
                  </div>

                  <div className="mt-2 flex flex-col gap-2.5">
                    {/* Hintergrundmusik */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="leading-tight">
                        <div className="text-[12.5px] font-extrabold">Hintergrundmusik</div>
                        <div className="text-[10px] font-semibold text-[#111111]/60">
                          Breakbeat-Soundtrack oder eigene MP3
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!settings.musicMuted}
                        onClick={() =>
                          setSettings((prev) => ({ ...prev, musicMuted: !prev.musicMuted }))
                        }
                        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                          !settings.musicMuted ? 'bg-[#22C55E]' : 'bg-black/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                            !settings.musicMuted ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Sprung- & Gleitton */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="leading-tight">
                        <div className="text-[12.5px] font-extrabold">Sprung- & Gleitgeräusche</div>
                        <div className="text-[10px] font-semibold text-[#111111]/60">
                          Sprung-Signal und Gleit-Ton beim Halten
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!settings.jumpSfxMuted}
                        onClick={() =>
                          setSettings((prev) => ({ ...prev, jumpSfxMuted: !prev.jumpSfxMuted }))
                        }
                        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                          !settings.jumpSfxMuted ? 'bg-[#22C55E]' : 'bg-black/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                            !settings.jumpSfxMuted ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Alle Soundeffekte (SFX) */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="leading-tight">
                        <div className="text-[12.5px] font-extrabold">Soundeffekte (SFX)</div>
                        <div className="text-[10px] font-semibold text-[#111111]/60">
                          Münzen, Power-Ups, Landung & Kollision
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!settings.sfxMuted}
                        onClick={() =>
                          setSettings((prev) => ({ ...prev, sfxMuted: !prev.sfxMuted }))
                        }
                        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                          !settings.sfxMuted ? 'bg-[#22C55E]' : 'bg-black/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                            !settings.sfxMuted ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Musik-Quelle */}
                    <div className="mt-0.5 flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Music className="h-3.5 w-3.5 shrink-0 text-[#CC3970]" />
                        <span className="truncate text-[11px] font-bold text-[#111111]/80">
                          {customTrackName ?? 'Standard: Breakbeat (164 BPM)'}
                        </span>
                      </div>
                      {customTrackName ? (
                        <button
                          type="button"
                          onClick={handleClearCustomTrack}
                          className="shrink-0 cursor-pointer rounded-lg bg-black/8 px-2 py-1 text-[10px] font-extrabold text-[#111111]"
                        >
                          Standard
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="shrink-0 cursor-pointer rounded-lg bg-[#111111] px-2.5 py-1 text-[10px] font-extrabold text-white"
                        >
                          MP3 wählen
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Sektion 2: Gameplay & Profil */}
                <section className="rounded-2xl bg-[#FFF5F8] p-3">
                  <div className="text-[10.5px] font-black tracking-wide text-[#CC3970] uppercase">
                    Gameplay & Profil
                  </div>

                  <div className="mt-2 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="leading-tight">
                        <div className="text-[12.5px] font-extrabold">Kamera-Erschütterung</div>
                        <div className="text-[10px] font-semibold text-[#111111]/60">
                          Dynamisches Wackeln bei Kollision & Rettung
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.screenShake}
                        onClick={() =>
                          setSettings((prev) => ({ ...prev, screenShake: !prev.screenShake }))
                        }
                        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                          settings.screenShake ? 'bg-[#22C55E]' : 'bg-black/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                            settings.screenShake ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-1.5">
                      <span className="shrink-0 text-[11px] font-bold text-[#111111]/65">
                        Spielername:
                      </span>
                      <input
                        type="text"
                        maxLength={16}
                        value={progression.playerName}
                        onChange={(e) =>
                          setProgression((prev) => ({
                            ...prev,
                            playerName: e.target.value.slice(0, 16),
                          }))
                        }
                        className="w-full bg-transparent text-right text-[12px] font-extrabold text-[#111111] outline-none"
                        placeholder="Spieler"
                      />
                    </div>
                  </div>
                </section>

                {/* Sektion 3: Steuerung */}
                <section className="rounded-2xl bg-[#FFF5F8] p-3">
                  <div className="text-[10.5px] font-black tracking-wide text-[#CC3970] uppercase">
                    Steuerung
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-y-1 text-[11px]">
                    <span className="font-semibold text-[#111111]/65">Kurzer Sprung</span>
                    <span className="text-right font-extrabold">Tippen / Leertaste</span>
                    <span className="font-semibold text-[#111111]/65">Weit gleiten</span>
                    <span className="text-right font-extrabold">Gedrückt halten</span>
                    <span className="font-semibold text-[#111111]/65">Pause / Ton aus</span>
                    <span className="text-right font-extrabold">P / Esc · M</span>
                  </div>
                </section>

                {/* Sektion 4: Speicherdaten */}
                <section className="rounded-2xl border border-black/8 bg-white p-3">
                  {confirmResetOpen ? (
                    <div className="text-center">
                      <div className="text-[11.5px] font-extrabold text-[#DC2626]">
                        Highscore, Coins & Shop-Daten löschen?
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmResetOpen(false)}
                          className="cursor-pointer rounded-xl bg-black/8 py-1.5 text-[11px] font-bold"
                        >
                          Abbrechen
                        </button>
                        <button
                          type="button"
                          onClick={handleResetAllData}
                          className="cursor-pointer rounded-xl bg-[#DC2626] py-1.5 text-[11px] font-extrabold text-white"
                        >
                          Ja, löschen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold text-[#111111]/60">
                        FLAPS · Arcade Edition
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmResetOpen(true)}
                        className="cursor-pointer text-[11px] font-extrabold text-[#DC2626] hover:underline"
                      >
                        Spielstand zurücksetzen
                      </button>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {/* IN-GAME PAUSE OVERLAY */}
        {gameState === 'PLAYING' && isPaused && adSecondsLeft === null && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121015]/52 px-5 backdrop-blur-[2px]">
            <div className="w-full max-w-[292px] rounded-[24px] bg-white p-5 text-center text-[#111111] shadow-[0_20px_50px_rgba(17,17,17,0.38)]">
              <div className="font-retro text-[9px] tracking-widest text-[#CC3970]">
                PAUSIERT
              </div>
              <h2 className="font-display mt-1 text-[24px] leading-tight font-black">
                Kurze Verschnaufpause
              </h2>

              <div className="mt-3 grid grid-cols-2 divide-x divide-black/10 rounded-2xl bg-[#FFF0F4] py-2.5">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-[#111111]/60">Aktueller Score</span>
                  <span className="font-display tabular-nums text-[22px] leading-tight font-black">
                    {score}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-[#111111]/60">Gesammelte Coins</span>
                  <span className="font-display tabular-nums text-[22px] leading-tight font-black text-[#B45309]">
                    +{runCoins}
                  </span>
                </div>
              </div>

              {/* Schnelle Audio-Umschalter während der Pause */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, musicMuted: !prev.musicMuted }))
                  }
                  className={`cursor-pointer rounded-xl py-1.5 text-[10.5px] font-extrabold transition-colors ${
                    !settings.musicMuted
                      ? 'bg-[#DCFCE7] text-[#166534]'
                      : 'bg-black/8 text-[#111111]/55'
                  }`}
                >
                  Musik {!settings.musicMuted ? 'An' : 'Aus'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, jumpSfxMuted: !prev.jumpSfxMuted }))
                  }
                  className={`cursor-pointer rounded-xl py-1.5 text-[10.5px] font-extrabold transition-colors ${
                    !settings.jumpSfxMuted
                      ? 'bg-[#DCFCE7] text-[#166534]'
                      : 'bg-black/8 text-[#111111]/55'
                  }`}
                >
                  Sprung {!settings.jumpSfxMuted ? 'An' : 'Aus'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, sfxMuted: !prev.sfxMuted }))
                  }
                  className={`cursor-pointer rounded-xl py-1.5 text-[10.5px] font-extrabold transition-colors ${
                    !settings.sfxMuted
                      ? 'bg-[#DCFCE7] text-[#166534]'
                      : 'bg-black/8 text-[#111111]/55'
                  }`}
                >
                  SFX {!settings.sfxMuted ? 'An' : 'Aus'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleTogglePause}
                className="font-display mt-3.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[15px] bg-[#22C55E] py-3 text-[15.5px] font-black text-white shadow-[0_8px_18px_rgba(34,197,94,0.28)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>WEITERSPIELEN</span>
              </button>

              <button
                type="button"
                onClick={startGame}
                className="font-display mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[15px] bg-[#111111] py-2.5 text-[14px] font-black text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Neu starten</span>
              </button>

              <button
                type="button"
                onClick={handleExitToMenu}
                className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 py-1.5 text-[12px] font-bold text-[#111111]/65 transition-colors hover:text-[#111111]"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Zurück zum Hauptmenü</span>
              </button>
            </div>
          </div>
        )}

        {/* REWARDED AD PLACEHOLDER OVERLAY */}
        {adSecondsLeft !== null && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0D0B12] px-6 text-center text-white">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#22C55E]/20 text-[#4ADE80]">
              <Tv className="h-7 w-7" />
            </div>
            <div className="mt-3 font-retro text-[9px] tracking-widest text-[#4ADE80]">
              WERBESPOT
            </div>
            <h3 className="font-display mt-2 text-[22px] font-black">
              {adSecondsLeft > 0 ? `Noch ${adSecondsLeft} Sekunden …` : 'Belohnung bereit!'}
            </h3>
            <p className="mt-1.5 max-w-[250px] text-[12px] text-white/70">
              {adSecondsLeft > 0
                ? 'Danach steigst du direkt mit deinen aktuellen Punkten wieder ein.'
                : 'Du kannst deinen Lauf jetzt direkt fortsetzen!'}
            </p>
            <div className="mt-4 h-2 w-56 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full bg-[#22C55E] transition-all duration-1000"
                style={{ width: `${((5 - adSecondsLeft) / 5) * 100}%` }}
              />
            </div>

            {adSecondsLeft === 0 && (
              <button
                type="button"
                onClick={handleFinishAdContinue}
                className="font-display mt-6 w-56 cursor-pointer rounded-2xl bg-[#22C55E] py-3 text-[16px] font-black text-white shadow-lg transition-transform hover:scale-105"
              >
                WEITERSPIELEN!
              </button>
            )}
          </div>
        )}

        {/* GAME OVER MODAL */}
        {gameState === 'GAME_OVER' && adSecondsLeft === null && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#121015]/42 px-5">
            <div className="w-full max-w-[300px] rounded-[24px] bg-white p-5 text-center text-[#111111] shadow-[0_20px_50px_rgba(17,17,17,0.34)]">
              <h2 className="font-display text-[28px] leading-tight font-black tracking-tight text-[#111111]">
                GAME OVER
              </h2>

              <p className="mt-1 text-[12.5px] font-bold text-[#111111]/65">
                {isNewRecord
                  ? 'Neuer persönlicher Rekord!'
                  : highScore > score
                    ? `Nur noch ${highScore - score} Pkt bis zu deinem Rekord!`
                    : 'Weiter versuchen!'}
              </p>

              <div className="mt-3.5 grid grid-cols-2 divide-x divide-black/10 rounded-2xl bg-[#FFF0F4] py-3">
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10.5px] font-bold text-[#111111]/60">Punkte</span>
                  <span className="font-display tabular-nums mt-0.5 text-[26px] leading-none font-black text-[#111111]">
                    {score}
                  </span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10.5px] font-bold text-[#111111]/60">Highscore</span>
                  <span className="font-display tabular-nums mt-0.5 text-[26px] leading-none font-black text-[#111111]">
                    {highScore}
                  </span>
                </div>
              </div>

              {/* Coins Earned Breakdown */}
              <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#FFFBEB] px-3 py-2 text-[11px] font-bold text-[#92400E]">
                <div className="flex items-center gap-1.5">
                  <Coins className="h-4 w-4 text-[#D97706]" />
                  <span>
                    +{runCoins} Level + {lastScoreBonusCoins} Bonus
                  </span>
                </div>
                <span className="font-black text-[#B45309]">+{totalRunCoins} Coins</span>
              </div>

              {/* Rewarded Ad Continue (1x per run) */}
              {!adContinueUsed && (
                <button
                  type="button"
                  onClick={handleStartAdContinue}
                  className="font-display mt-3.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[15px] bg-gradient-to-r from-[#16A34A] to-[#22C55E] px-4 py-3 text-[14.5px] font-black text-white shadow-[0_8px_18px_rgba(22,163,74,0.28)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Tv className="h-4 w-4 shrink-0" />
                  <span>Werbung schauen & Weiterspielen</span>
                </button>
              )}

              {/* Fresh Restart labeled "PLAY" */}
              <button
                type="button"
                onClick={startGame}
                className="font-display mt-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[15px] bg-[#111111] px-5 py-3 text-[16px] font-black tracking-wide text-white shadow-[0_8px_20px_rgba(17,17,17,0.24)] transition-transform duration-150 hover:scale-[1.02] hover:bg-[#1E1A24] active:scale-[0.98]"
              >
                <Play className="h-4 w-4 fill-current shrink-0" />
                <span>PLAY</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  audio.setHolding(false);
                  setChallengeIdx((prev) => (prev + 1) % MOTIVATING_CHALLENGES.length);
                  setGameState('TITLE_MENU');
                }}
                className="mt-2 w-full cursor-pointer py-1 text-[12.5px] font-bold text-[#111111]/60 transition-colors hover:text-[#111111]"
              >
                Zurück zum Start (Shop & Score-Liste)
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
