import React, { useEffect, useRef } from 'react';
import { FlapsSprites, loadFlapsSprites } from './spriteProcessor';
import { FlapsAudioEngine } from './audioEngine';
import { CharacterId, drawCharacterSprite } from './characters';
import {
  ActivePowerUpState,
  BOARD_SKINS,
  BoardSkinId,
  MissionEvent,
  POWERUP_DURATIONS,
  PowerUpType,
} from './progression';

export type GameState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER';

export const LOGICAL_WIDTH = 360;
export const LOGICAL_HEIGHT = 640;
export const WORLD_ZOOM = 1.14;
export const VIEW_WORLD_WIDTH = LOGICAL_WIDTH / WORLD_ZOOM;
export const VIEW_WORLD_HEIGHT = LOGICAL_HEIGHT / WORLD_ZOOM;

interface FlapsCanvasProps {
  gameState: GameState;
  isPaused: boolean;
  screenShake: boolean;
  runId: number;
  reviveId: number;
  characterId: CharacterId;
  customFaceImg?: HTMLImageElement | null;
  pendingDoubleSeconds: number;
  boardCharges: number;
  boardSkin: BoardSkinId;
  audio: FlapsAudioEngine;
  onScoreChange: (score: number) => void;
  onRunCoinsChange: (coins: number) => void;
  onPowerUpsChange: (timers: ActivePowerUpState) => void;
  onBoardConsumed: () => void;
  onConsumePendingDouble: () => void;
  onMissionEvent: (event: MissionEvent) => void;
  onGameOver: (finalScore: number, runCoins: number, baseScore: number) => void;
}

interface CloudEntity {
  spriteIdx: number;
  x: number;
  y: number;
  scale: number;
  speed: number;
  parallaxFactor: number;
  bobPhase: number;
  bobAmp: number;
  alpha: number;
  layer: 'far' | 'mid';
}

interface MonumentEntity {
  spriteIdx: number;
  worldX: number;
  y: number;
  drawW: number;
  drawH: number;
}

type FrameKind = 'normal' | 'crumbling' | 'moving_y' | 'moving_x';

interface GreenFrame {
  id: number;
  index: number;
  kind: FrameKind;
  baseX: number;
  x: number;
  baseY: number;
  y: number;
  width: number;
  height: number;
  openBottom: boolean;
  hasStairs: boolean;
  scored: boolean;
  // Timed-collapse crumbling state
  crumbleTriggered: boolean;
  crumbleTimer: number;
  crumbleMax: number;
  shattered: boolean;
  shatterAge: number;
  fallVy: number;
  // Moving state (vertical or horizontal)
  moveAmp: number;
  moveSpeed: number;
  movePhase: number;
  gapTier: 'short' | 'medium' | 'wide';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  square?: boolean;
}

interface SplashArc {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface FloatingBubble {
  x: number;
  y: number;
  r: number;
  speedY: number;
  phase: number;
  alpha: number;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface CoinEntity {
  id: number;
  x: number;
  y: number;
  baseY: number;
  phase: number;
  collected: boolean;
}

interface PowerUpEntity {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  baseY: number;
  phase: number;
  collected: boolean;
}

const PLAYER_RADIUS = 13;

export const FlapsCanvas: React.FC<FlapsCanvasProps> = ({
  gameState,
  isPaused,
  screenShake,
  runId,
  reviveId,
  characterId,
  customFaceImg,
  pendingDoubleSeconds,
  boardCharges,
  boardSkin,
  audio,
  onScoreChange,
  onRunCoinsChange,
  onPowerUpsChange,
  onBoardConsumed,
  onConsumePendingDouble,
  onMissionEvent,
  onGameOver,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logicalHeightRef = useRef<number>(LOGICAL_HEIGHT);
  const gameStateRef = useRef<GameState>(gameState);
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const screenShakeRef = useRef<boolean>(screenShake);
  screenShakeRef.current = screenShake;
  const characterIdRef = useRef<CharacterId>(characterId);
  characterIdRef.current = characterId;
  const customFaceImgRef = useRef<HTMLImageElement | null | undefined>(customFaceImg);
  customFaceImgRef.current = customFaceImg;
  const boardChargesRef = useRef(boardCharges);
  boardChargesRef.current = boardCharges;
  const boardSkinRef = useRef<BoardSkinId>(boardSkin);
  boardSkinRef.current = boardSkin;
  const spritesRef = useRef<FlapsSprites | null>(null);

  const onScoreChangeRef = useRef(onScoreChange);
  const onRunCoinsChangeRef = useRef(onRunCoinsChange);
  const onPowerUpsChangeRef = useRef(onPowerUpsChange);
  const onBoardConsumedRef = useRef(onBoardConsumed);
  const onConsumePendingDoubleRef = useRef(onConsumePendingDouble);
  const onMissionEventRef = useRef(onMissionEvent);
  const onGameOverRef = useRef(onGameOver);
  onScoreChangeRef.current = onScoreChange;
  onRunCoinsChangeRef.current = onRunCoinsChange;
  onPowerUpsChangeRef.current = onPowerUpsChange;
  onBoardConsumedRef.current = onBoardConsumed;
  onConsumePendingDoubleRef.current = onConsumePendingDouble;
  onMissionEventRef.current = onMissionEvent;
  onGameOverRef.current = onGameOver;

  const prevRunIdRef = useRef(runId);
  const prevReviveIdRef = useRef(reviveId);

  const pointerHeldRef = useRef(false);
  const keyHeldRef = useRef(false);

  const simRef = useRef({
    time: 0,
    score: 0,
    baseScore: 0,
    runCoins: 0,
    hasJumpedOnce: false,
    cameraX: 0,
    prevCameraX: 0,
    cameraY: 34,
    playerX: 96,
    playerY: 350 - PLAYER_RADIUS,
    playerVx: 0,
    playerVy: 0,
    onGround: true,
    hopPhase: 0,
    hopOffset: 0,
    coyoteTimer: 0,
    currentFrameId: 0,
    currentFrameIndex: 0,
    currentFrameBaseY: 350,
    usedHoldThisJump: false,
    airControlLocked: false,
    airRescueUsed: false,
    wasHoldingInAir: false,
    fallSoundPlayed: false,
    jumpBufferTimer: 0,
    squashX: 1,
    squashY: 1,
    hitstopTimer: 0,
    shakeTimer: 0,
    shakeIntensity: 0,
    flashAlpha: 0,
    nextFrameId: 1,
    nextCollectibleId: 1,
    magnetTimer: 0,
    doubleTimer: 0,
    boostTimer: 0,
    boardVisualTimer: 0,
    invulnTimer: 0,
    powerUpHudAcc: 0,
    frames: [] as GreenFrame[],
    coins: [] as CoinEntity[],
    powerUps: [] as PowerUpEntity[],
    particles: [] as Particle[],
    splashes: [] as SplashArc[],
    popups: [] as FloatingText[],
    clouds: [] as CloudEntity[],
    farMonuments: [] as MonumentEntity[],
    monuments: [] as MonumentEntity[],
    bubbles: [] as FloatingBubble[],
    initializedWorld: false,
  });

  const getViewMetrics = () => {
    const logicalH = logicalHeightRef.current;
    const viewWorldH = logicalH / WORLD_ZOOM;
    const extraWorldH = Math.max(0, viewWorldH - VIEW_WORLD_HEIGHT);
    const camCenterOffset = extraWorldH * 0.44;
    return {
      logicalH,
      viewWorldH,
      extraWorldH,
      camCenterOffset,
      baseTitleCamY: 34 - camCenterOffset,
      minCamY: -14 - camCenterOffset,
      maxCamY: 78 - camCenterOffset,
    };
  };

  const spawnCollectiblesForFrame = (
    prev: GreenFrame,
    curr: GreenFrame,
    coins: CoinEntity[],
    powerUps: PowerUpEntity[]
  ) => {
    const sim = simRef.current;
    // Skip first immediate screen frame so title screen stays clean
    if (curr.id <= 1) return;

    const r = Math.random();
    if (curr.gapTier !== 'short' && r < 0.34) {
      // Risky 3-coin jump arc across the gap!
      const startX = prev.baseX + prev.width + 12;
      const endX = curr.baseX - 12;
      const midY = Math.min(prev.baseY, curr.baseY) - 48;
      for (let k = 0; k < 3; k++) {
        const t = (k + 1) / 4;
        const cx = startX + (endX - startX) * t;
        const arcBump = Math.sin(t * Math.PI) * 28;
        const cy = midY - arcBump;
        coins.push({
          id: sim.nextCollectibleId++,
          x: cx,
          y: cy,
          baseY: cy,
          phase: k * 0.7,
          collected: false,
        });
      }
    } else if (r < 0.72) {
      // 1-2 coins hovering over the beam
      const count = Math.random() < 0.45 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const cx = curr.baseX + curr.width * (count === 1 ? 0.5 : k === 0 ? 0.32 : 0.68);
        const cy = curr.baseY - 30 - (curr.kind === 'moving_y' ? curr.moveAmp * 0.5 : 0);
        coins.push({
          id: sim.nextCollectibleId++,
          x: cx,
          y: cy,
          baseY: cy,
          phase: k * 0.9,
          collected: false,
        });
      }
    }

    // Spawn fixed Level-1 power-up every ~8 frames (weighted toward 2× Multiplikator-Coin)
    if (curr.id >= 4 && curr.id % 8 === 0) {
      const rPu = Math.random();
      const type: PowerUpType = rPu < 0.44 ? 'double' : rPu < 0.72 ? 'magnet' : 'boost';
      const px = curr.baseX + curr.width / 2;
      const py = curr.baseY - 58;
      powerUps.push({
        id: sim.nextCollectibleId++,
        type,
        x: px,
        y: py,
        baseY: py,
        phase: Math.random() * Math.PI * 2,
        collected: false,
      });
    }
  };

  const buildInitialFrames = () => {
    const frames: GreenFrame[] = [
      {
        id: 0,
        index: 0,
        kind: 'normal',
        baseX: 42,
        x: 42,
        baseY: 350,
        y: 350,
        width: 84,
        height: 132,
        openBottom: false,
        hasStairs: false,
        scored: true,
        shattered: false,
        shatterAge: 0,
        fallVy: 0,
        crumbleTriggered: false,
        crumbleTimer: 0.56,
        crumbleMax: 0.56,
        moveAmp: 0,
        moveSpeed: 0,
        movePhase: 0,
        gapTier: 'medium',
      },
    ];
    const coins: CoinEntity[] = [];
    const powerUps: PowerUpEntity[] = [];
    let nextId = 1;
    for (let i = 0; i < 8; i++) {
      const prev = frames[frames.length - 1];
      const next = generateNextFrame(prev, nextId++, i * 5);
      if (i === 0) {
        // Ensure the frame visible right beside the start platform on the title screen displays stairs
        next.hasStairs = true;
        next.baseY = 310;
        next.y = 310;
      }
      frames.push(next);
      spawnCollectiblesForFrame(prev, next, coins, powerUps);
    }
    return { frames, coins, powerUps, nextId };
  };

  const populateMonuments = (sprites: FlapsSprites) => {
    const sim = simRef.current;
    sim.farMonuments = [];
    sim.monuments = [];
    if (sprites.monuments.length === 0) return;

    // Far atmospheric staircase monument layer (fills gaps across the viewport)
    let farCursorX = -28;
    for (let i = 0; i < 6; i++) {
      const idx = (i + 1) % sprites.monuments.length;
      const sp = sprites.monuments[idx];
      const ratio = sp.width / Math.max(1, sp.height);
      const drawH = idx === 0 ? 545 : 565;
      const drawW = drawH * ratio;
      const y = idx === 0 ? 52 : 34;
      sim.farMonuments.push({
        spriteIdx: idx,
        worldX: farCursorX,
        y,
        drawW,
        drawH,
      });
      farCursorX += drawW * 0.56;
    }

    // Near main staircase monument layer (tightly overlapped so m[1] staircases fill screen at cameraX=0)
    let cursorX = -92;
    for (let i = 0; i < 6; i++) {
      const idx = i % sprites.monuments.length;
      const sp = sprites.monuments[idx];
      const ratio = sp.width / Math.max(1, sp.height);
      const drawH = idx === 0 ? 635 : 655;
      const drawW = drawH * ratio;
      const y = idx === 0 ? 20 : 6;
      sim.monuments.push({
        spriteIdx: idx,
        worldX: cursorX,
        y,
        drawW,
        drawH,
      });
      cursorX += drawW * 0.45;
    }
  };

  // Load & extract high-res transparent sprites from the two uploaded images
  useEffect(() => {
    let cancelled = false;
    loadFlapsSprites()
      .then((sprites) => {
        if (cancelled) return;
        spritesRef.current = sprites;
        populateMonuments(sprites);
      })
      .catch((err) => {
        console.warn('FLAPS sprite load failed, using fallback background:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getActiveForwardVx = (score: number) => {
    const progress = Math.min(1, score / 260);
    return 196 + progress * 48;
  };

  const triggerJump = () => {
    const sim = simRef.current;
    if (!sim.onGround && sim.coyoteTimer <= 0) return;
    // Sync currentFrameBaseY to the platform's exact current Y (important for moving/sinking stones!)
    const activeFrame = sim.frames.find((fr) => fr.id === sim.currentFrameId);
    if (activeFrame) {
      sim.currentFrameBaseY = activeFrame.y;
    }
    // Launch smoothly from current hop height with zero visual snap
    if (sim.onGround && sim.hopOffset > 0) {
      sim.playerY -= sim.hopOffset;
      sim.hopOffset = 0;
    }
    sim.onGround = false;
    sim.coyoteTimer = 0;
    sim.hasJumpedOnce = true;
    sim.playerVy = -375;
    sim.playerVx = getActiveForwardVx(sim.score);
    sim.usedHoldThisJump = false;
    sim.airControlLocked = false;
    sim.airRescueUsed = false;
    sim.wasHoldingInAir = true;
    sim.fallSoundPlayed = false;
    sim.jumpBufferTimer = 0;
    sim.squashX = 0.80;
    sim.squashY = 1.26;
    audio.playJump();
  };

  const rescuePlayerToSafeBeam = (reason: 'board' | 'ad') => {
    const sim = simRef.current;
    // Pick nearest non-shattered beam near or ahead of player
    let target =
      sim.frames.find((f) => !f.shattered && f.x + f.width >= sim.playerX - 18) ??
      sim.frames.find((f) => !f.shattered);

    if (!target) {
      const safeX = Math.round(sim.playerX - 36);
      target = {
        id: sim.nextFrameId++,
        index: sim.currentFrameIndex + 1,
        kind: 'normal',
        baseX: safeX,
        x: safeX,
        baseY: 320,
        y: 320,
        width: 84,
        height: 132,
        openBottom: false,
        hasStairs: false,
        scored: true,
        crumbleTriggered: false,
        crumbleTimer: 0.56,
        crumbleMax: 0.56,
        shattered: false,
        shatterAge: 0,
        fallVy: 0,
        moveAmp: 0,
        moveSpeed: 0,
        movePhase: 0,
        gapTier: 'medium',
      };
      sim.frames.push(target);
    }

    // Stabilize target beam if it was crumbling so rescue landing is always fair
    if (target.kind === 'crumbling') {
      target.kind = 'normal';
      target.crumbleTriggered = false;
      target.y = target.baseY;
    }

    sim.playerX = target.x + target.width / 2;
    sim.playerY = target.y - PLAYER_RADIUS - 68;
    sim.playerVx = 0;
    sim.playerVy = -140;
    sim.onGround = false;
    sim.coyoteTimer = 0;
    sim.airControlLocked = false;
    sim.airRescueUsed = false;
    sim.wasHoldingInAir = false;
    sim.fallSoundPlayed = false;
    sim.jumpBufferTimer = 0;
    sim.currentFrameBaseY = target.y;
    sim.boardVisualTimer = reason === 'board' ? 1.8 : 1.3;
    sim.invulnTimer = 1.3;
    sim.flashAlpha = 0.25;
    const { minCamY, maxCamY, camCenterOffset } = getViewMetrics();
    sim.cameraX = sim.playerX - 66;
    sim.cameraY = Math.max(minCamY, Math.min(maxCamY, sim.playerY - 248 - camCenterOffset));
    pointerHeldRef.current = false;
    keyHeldRef.current = false;
    audio.setHolding(false);
    audio.playBoardSave();

    sim.popups.push({
      x: LOGICAL_WIDTH / 2,
      y: 138,
      vy: -26,
      text: reason === 'board' ? 'BOARD SAVE!' : 'WEITER GEHT’S!',
      color: reason === 'board' ? '#38BDF8' : '#4ADE80',
      life: 0,
      maxLife: 1.15,
    });
  };

  // Reset run state on new run/menu OR revive mid-run when reviveId increments
  useEffect(() => {
    gameStateRef.current = gameState;
    const sim = simRef.current;

    if (gameState === 'PLAYING' && reviveId !== prevReviveIdRef.current) {
      prevReviveIdRef.current = reviveId;
      rescuePlayerToSafeBeam('ad');
      return;
    }

    if (gameState === 'TITLE_MENU' || (gameState === 'PLAYING' && runId !== prevRunIdRef.current)) {
      prevRunIdRef.current = runId;
      pointerHeldRef.current = false;
      keyHeldRef.current = false;
      audio.setHolding(false);
      sim.nextCollectibleId = 1;
      const { frames, coins, powerUps, nextId } = buildInitialFrames();
      sim.frames = frames;
      sim.coins = coins;
      sim.powerUps = powerUps;
      sim.nextFrameId = nextId;
      sim.score = 0;
      sim.baseScore = 0;
      sim.runCoins = 0;
      sim.magnetTimer = 0;
      sim.doubleTimer = 0;
      sim.boostTimer = 0;
      sim.boardVisualTimer = 0;
      sim.invulnTimer = 0;
      sim.powerUpHudAcc = 0;
      sim.hasJumpedOnce = false;
      const { baseTitleCamY } = getViewMetrics();
      sim.cameraX = 0;
      sim.prevCameraX = 0;
      sim.cameraY = baseTitleCamY;
      if (spritesRef.current) {
        populateMonuments(spritesRef.current);
      }
      sim.playerX = frames[0].x + frames[0].width / 2;
      sim.playerY = frames[0].y - PLAYER_RADIUS;
      sim.playerVx = 0;
      sim.playerVy = 0;
      sim.onGround = true;
      sim.hopPhase = 0;
      sim.hopOffset = 0;
      sim.coyoteTimer = 0;
      sim.currentFrameId = frames[0].id;
      sim.currentFrameIndex = 0;
      sim.currentFrameBaseY = frames[0].y;
      sim.usedHoldThisJump = false;
      sim.airControlLocked = false;
      sim.airRescueUsed = false;
      sim.wasHoldingInAir = false;
      sim.fallSoundPlayed = false;
      sim.jumpBufferTimer = 0;
      sim.squashX = 1;
      sim.squashY = 1;
      sim.particles = [];
      sim.splashes = [];
      sim.popups = [];
      sim.flashAlpha = 0;
      sim.shakeTimer = 0;
      sim.hitstopTimer = 0;
      onPowerUpsChangeRef.current({ magnet: 0, double: 0, boost: 0 });
      if (gameState === 'PLAYING') {
        onScoreChangeRef.current(0);
        onRunCoinsChangeRef.current(0);
      }
    } else if (gameState === 'GAME_OVER') {
      pointerHeldRef.current = false;
      keyHeldRef.current = false;
      audio.setHolding(false);
    }
  }, [gameState, runId, reviveId, audio]);

  // Apply short-duration 2× mission reward boost only while actively playing
  useEffect(() => {
    if (gameState !== 'PLAYING' || pendingDoubleSeconds <= 0) return;
    const sim = simRef.current;
    sim.doubleTimer = Math.max(sim.doubleTimer, pendingDoubleSeconds);
    sim.popups.push({
      x: LOGICAL_WIDTH / 2,
      y: 138,
      vy: -28,
      text: `2× BOOST (${Math.round(pendingDoubleSeconds)}s)!`,
      color: '#FACC15',
      life: 0,
      maxLife: 1.1,
    });
    onPowerUpsChangeRef.current({
      magnet: sim.magnetTimer,
      double: sim.doubleTimer,
      boost: sim.boostTimer,
    });
    onConsumePendingDoubleRef.current();
  }, [gameState, runId, reviveId, pendingDoubleSeconds]);

  // Release held inputs whenever paused
  useEffect(() => {
    if (isPaused) {
      pointerHeldRef.current = false;
      keyHeldRef.current = false;
      audio.setHolding(false);
    }
  }, [isPaused, audio]);

  // Global keyboard & blur listeners
  useEffect(() => {
    const startHoldInput = () => {
      if (gameStateRef.current !== 'PLAYING' || isPausedRef.current) return;
      const sim = simRef.current;
      if (sim.onGround || sim.coyoteTimer > 0) {
        triggerJump();
      } else {
        sim.jumpBufferTimer = 0.16;
      }
      audio.setHolding(true);
    };

    const stopHoldInput = () => {
      if (!pointerHeldRef.current && !keyHeldRef.current) {
        audio.setHolding(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (gameStateRef.current === 'PLAYING' && !isPausedRef.current) {
          e.preventDefault();
          if (!keyHeldRef.current) {
            keyHeldRef.current = true;
            startHoldInput();
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (keyHeldRef.current) {
          keyHeldRef.current = false;
          stopHoldInput();
        }
      }
    };

    const onGlobalPointerUp = () => {
      if (pointerHeldRef.current) {
        pointerHeldRef.current = false;
        stopHoldInput();
      }
    };

    const clearAllInputs = () => {
      pointerHeldRef.current = false;
      keyHeldRef.current = false;
      audio.setHolding(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerUp);
    window.addEventListener('blur', clearAllInputs);
    document.addEventListener('visibilitychange', clearAllInputs);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerUp);
      window.removeEventListener('blur', clearAllInputs);
      document.removeEventListener('visibilitychange', clearAllInputs);
    };
  }, [audio]);

  // Main 60fps requestAnimationFrame loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextLogicalH =
        rect.width > 0 && rect.height > 0
          ? Math.max(560, Math.min(960, Math.round(LOGICAL_WIDTH * (rect.height / rect.width))))
          : LOGICAL_HEIGHT;
      logicalHeightRef.current = nextLogicalH;
      const targetW = Math.round(LOGICAL_WIDTH * dpr);
      const targetH = Math.round(nextLogicalH * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };
    syncCanvasSize();

    const sim = simRef.current;
    if (!sim.initializedWorld) {
      sim.initializedWorld = true;
      const { frames, coins, powerUps, nextId } = buildInitialFrames();
      sim.frames = frames;
      sim.coins = coins;
      sim.powerUps = powerUps;
      sim.nextFrameId = nextId;
      sim.playerX = frames[0].x + frames[0].width / 2;
      sim.playerY = frames[0].y - PLAYER_RADIUS;

      const cloudPresets: Array<Omit<CloudEntity, 'bobPhase' | 'bobAmp'>> = [
        { spriteIdx: 2, x: -20, y: 42, scale: 0.34, speed: 32, parallaxFactor: 0.14, alpha: 0.80, layer: 'far' },
        { spriteIdx: 0, x: 190, y: 24, scale: 0.33, speed: 38, parallaxFactor: 0.16, alpha: 0.84, layer: 'far' },
        { spriteIdx: 1, x: 265, y: 270, scale: 0.36, speed: 44, parallaxFactor: 0.22, alpha: 0.72, layer: 'mid' },
        { spriteIdx: 4, x: 30, y: 475, scale: 0.44, speed: 48, parallaxFactor: 0.28, alpha: 0.86, layer: 'mid' },
        { spriteIdx: 2, x: 225, y: 505, scale: 0.40, speed: 40, parallaxFactor: 0.25, alpha: 0.84, layer: 'mid' },
        { spriteIdx: 3, x: -30, y: 365, scale: 0.38, speed: 52, parallaxFactor: 0.24, alpha: 0.78, layer: 'mid' },
        { spriteIdx: 0, x: 135, y: 550, scale: 0.42, speed: 36, parallaxFactor: 0.26, alpha: 0.82, layer: 'mid' },
      ];
      sim.clouds = cloudPresets.map((c, idx) => ({
        ...c,
        bobPhase: idx * 1.15,
        bobAmp: 3.5 + (idx % 3) * 1.4,
      }));

      for (let i = 0; i < 16; i++) {
        sim.bubbles.push({
          x: Math.random() * LOGICAL_WIDTH,
          y: Math.random() * logicalHeightRef.current,
          r: 4 + Math.random() * 13,
          speedY: 16 + Math.random() * 20,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.16 + Math.random() * 0.20,
        });
      }
    }

    let rafId = 0;
    let lastTime = performance.now();

    const spawnLandingSplash = (x: number, y: number) => {
      sim.splashes.push({ x, y, life: 0, maxLife: 0.32 });
      for (let i = 0; i < 8; i++) {
        const dir = i % 2 === 0 ? -1 : 1;
        sim.particles.push({
          x: x + dir * (4 + Math.random() * 6),
          y: y - 2,
          vx: dir * (30 + Math.random() * 48),
          vy: -25 - Math.random() * 45,
          size: 2.2 + Math.random() * 2.2,
          life: 0,
          maxLife: 0.28 + Math.random() * 0.14,
          color: 'rgba(255, 255, 255, 0.92)',
        });
      }
    };

    const spawnCrumbleDebris = (f: GreenFrame, count: number) => {
      const screenX = f.x - sim.cameraX;
      const retroColors = ['#22C55E', '#16A34A', '#4ADE80', '#0F3D20'];
      for (let i = 0; i < count; i++) {
        sim.particles.push({
          x: screenX + Math.random() * f.width,
          y: f.y + Math.random() * 26,
          vx: (Math.random() - 0.5) * 115,
          vy: -45 + Math.random() * 95,
          size: 3 + Math.floor(Math.random() * 2) * 3,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.28,
          color: retroColors[i % retroColors.length],
          square: true,
        });
      }
    };

    const spawnFallBurst = (x: number) => {
      const { viewWorldH } = getViewMetrics();
      const burstY = sim.cameraY + viewWorldH - 10;
      for (let i = 0; i < 14; i++) {
        const angle = -Math.PI + Math.random() * Math.PI;
        const spd = 65 + Math.random() * 110;
        sim.particles.push({
          x,
          y: burstY,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          size: 3 + Math.random() * 3.5,
          life: 0,
          maxLife: 0.4 + Math.random() * 0.2,
          color: i % 3 === 0 ? '#22C55E' : '#FFFFFF',
        });
      }
    };

    const triggerGameOver = () => {
      if (gameStateRef.current !== 'PLAYING') return;
      gameStateRef.current = 'GAME_OVER';
      pointerHeldRef.current = false;
      keyHeldRef.current = false;
      audio.playCrash(sim.fallSoundPlayed);
      sim.hitstopTimer = 0.04;
      sim.shakeTimer = 0.28;
      sim.shakeIntensity = 6.5;
      sim.flashAlpha = 0.34;
      spawnFallBurst(sim.playerX - sim.cameraX);
      onGameOverRef.current(sim.score, sim.runCoins, sim.baseScore);
    };

    const update = (dt: number) => {
      sim.time += dt;

      if (sim.flashAlpha > 0) {
        sim.flashAlpha = Math.max(0, sim.flashAlpha - dt * 2.6);
      }
      if (sim.shakeTimer > 0) {
        sim.shakeTimer = Math.max(0, sim.shakeTimer - dt);
      }

      if (sim.hitstopTimer > 0) {
        sim.hitstopTimer = Math.max(0, sim.hitstopTimer - dt);
        return;
      }

      const state = gameStateRef.current;
      const sprites = spritesRef.current;
      const camDelta = sim.cameraX - sim.prevCameraX;
      sim.prevCameraX = sim.cameraX;

      // Clouds always glide continuously right-to-left behind frames & character
      const cloudSprites = sprites?.clouds ?? [];
      for (let i = 0; i < sim.clouds.length; i++) {
        const c = sim.clouds[i];
        c.x -= c.speed * dt + camDelta * c.parallaxFactor;
        const sp = cloudSprites[c.spriteIdx % Math.max(1, cloudSprites.length)];
        const drawW = sp ? sp.width * c.scale : 180;
        if (c.x + drawW < -35) {
          c.x = LOGICAL_WIDTH + 25 + Math.random() * 70;
        }
      }

      const { logicalH, viewWorldH, baseTitleCamY, minCamY, maxCamY, camCenterOffset } =
        getViewMetrics();

      // Ambient rising soap bubbles
      for (let i = 0; i < sim.bubbles.length; i++) {
        const b = sim.bubbles[i];
        b.y -= b.speedY * dt;
        b.x -= camDelta * 0.15;
        if (b.x < -20) b.x = LOGICAL_WIDTH + 15;
        if (b.y + b.r < -15) {
          b.y = logicalH + b.r + 10;
          b.x = Math.random() * LOGICAL_WIDTH;
        }
      }

      // Particles
      for (let i = sim.particles.length - 1; i >= 0; i--) {
        const p = sim.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          sim.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
      }

      // Splash arcs
      for (let i = sim.splashes.length - 1; i >= 0; i--) {
        sim.splashes[i].life += dt;
        if (sim.splashes[i].life >= sim.splashes[i].maxLife) {
          sim.splashes.splice(i, 1);
        }
      }

      // Floating retro popups
      for (let i = sim.popups.length - 1; i >= 0; i--) {
        const pop = sim.popups[i];
        pop.life += dt;
        if (pop.life >= pop.maxLife) {
          sim.popups.splice(i, 1);
          continue;
        }
        pop.y += pop.vy * dt;
      }

      sim.squashX += (1 - sim.squashX) * Math.min(1, dt * 11);
      sim.squashY += (1 - sim.squashY) * Math.min(1, dt * 11);

      // Continuous in-place bunny hop whenever resting on a green frame
      if (sim.onGround && (state === 'TITLE_MENU' || state === 'PLAYING')) {
        sim.hopPhase = (sim.hopPhase + dt * 1.95) % 1;
        const arc = 4 * sim.hopPhase * (1 - sim.hopPhase); // 0 -> 1 -> 0 parabolic bounce
        sim.hopOffset = arc * 26;
      } else {
        sim.hopOffset = 0;
      }

      if (state === 'TITLE_MENU') {
        sim.cameraX = 0;
        sim.cameraY = baseTitleCamY;
        for (let i = 0; i < sim.frames.length; i++) {
          const f = sim.frames[i];
          if (f.kind === 'moving_y') {
            f.y = f.baseY + Math.sin(sim.time * f.moveSpeed + f.movePhase) * f.moveAmp;
          } else if (f.kind === 'moving_x') {
            f.x = f.baseX + Math.sin(sim.time * f.moveSpeed + f.movePhase) * f.moveAmp;
          }
        }
        return;
      }

      if (state === 'GAME_OVER') {
        return;
      }

      // Update frames (moving_y, moving_x, & timed-collapse crumbling frames)
      let currentFrame: GreenFrame | undefined;
      for (let i = 0; i < sim.frames.length; i++) {
        const f = sim.frames[i];
        if (f.id === sim.currentFrameId) {
          currentFrame = f;
        }

        if (f.kind === 'moving_y' && !f.shattered) {
          f.y = f.baseY + Math.sin(sim.time * f.moveSpeed + f.movePhase) * f.moveAmp;
        } else if (f.kind === 'moving_x' && !f.shattered) {
          const prevFx = f.x;
          f.x = f.baseX + Math.sin(sim.time * f.moveSpeed + f.movePhase) * f.moveAmp;
          if (sim.onGround && sim.currentFrameId === f.id) {
            sim.playerX += f.x - prevFx;
          }
        }

        if (f.kind === 'crumbling' && f.crumbleTriggered && !f.shattered) {
          // Drop fast right upon touch while still leaving ~0.42-0.54s to jump onto the next beam!
          f.fallVy = Math.min(440, f.fallVy + 680 * dt);
          f.y += f.fallVy * dt;
          f.crumbleTimer -= dt;
          if (Math.random() < dt * 26) {
            spawnCrumbleDebris(f, 1);
          }
          if (f.crumbleTimer <= 0) {
            f.shattered = true;
            f.fallVy = Math.max(f.fallVy, 360);
            audio.playCrumbleBreak();
            spawnCrumbleDebris(f, 16);
            if (sim.onGround && sim.currentFrameId === f.id) {
              sim.onGround = false;
              sim.coyoteTimer = 0.14;
              sim.playerVy = 45;
              sim.playerVx = 0;
            }
          }
        }

        if (f.shattered) {
          f.shatterAge += dt;
          f.fallVy += 920 * dt;
          f.y += f.fallVy * dt;
        }
      }

      // Keep grounded player locked onto moving / shaking frame Y
      if (sim.onGround && currentFrame && !currentFrame.shattered) {
        sim.playerY = currentFrame.y - PLAYER_RADIUS;
      }

      if (sim.coyoteTimer > 0) {
        sim.coyoteTimer = Math.max(0, sim.coyoteTimer - dt);
      }

      if (sim.jumpBufferTimer > 0) {
        sim.jumpBufferTimer = Math.max(0, sim.jumpBufferTimer - dt);
      }

      const isHolding = pointerHeldRef.current || keyHeldRef.current;

      // Update Power-Up timers (strictly fixed Level-1 durations)
      const prevAnyPu = sim.magnetTimer > 0 || sim.doubleTimer > 0 || sim.boostTimer > 0;
      if (sim.magnetTimer > 0) sim.magnetTimer = Math.max(0, sim.magnetTimer - dt);
      if (sim.doubleTimer > 0) sim.doubleTimer = Math.max(0, sim.doubleTimer - dt);
      if (sim.boostTimer > 0) sim.boostTimer = Math.max(0, sim.boostTimer - dt);
      if (sim.boardVisualTimer > 0) sim.boardVisualTimer = Math.max(0, sim.boardVisualTimer - dt);
      if (sim.invulnTimer > 0) sim.invulnTimer = Math.max(0, sim.invulnTimer - dt);

      sim.powerUpHudAcc += dt;
      const nowAnyPu = sim.magnetTimer > 0 || sim.doubleTimer > 0 || sim.boostTimer > 0;
      if (sim.powerUpHudAcc >= 0.1 || prevAnyPu !== nowAnyPu) {
        sim.powerUpHudAcc = 0;
        onPowerUpsChangeRef.current({
          magnet: sim.magnetTimer,
          double: sim.doubleTimer,
          boost: sim.boostTimer,
        });
      }

      // Base score multiplier is always 1×; only temporarily 2× while Multiplikator-Coin is active
      const activePointMul = sim.doubleTimer > 0 ? 2 : 1;

      if (!sim.onGround || sim.boostTimer > 0) {
        if (sim.boostTimer > 0) {
          // Raketen-Boost flight: zooms forward smoothly above beams & auto-scores passed frames
          sim.onGround = false;
          sim.airControlLocked = false;
          sim.fallSoundPlayed = false;
          sim.playerVx = 340;
          const targetBoostY = 230 + Math.sin(sim.time * 8) * 10;
          sim.playerY += (targetBoostY - sim.playerY) * Math.min(1, dt * 8);
          sim.playerVy = 0;
          sim.playerX += sim.playerVx * dt;

          if (Math.random() < dt * 36) {
            sim.particles.push({
              x: sim.playerX - sim.cameraX - 10,
              y: sim.playerY + (Math.random() - 0.5) * 10,
              vx: -110 - Math.random() * 60,
              vy: (Math.random() - 0.5) * 45,
              size: 4 + Math.random() * 3,
              life: 0,
              maxLife: 0.28,
              color: Math.random() < 0.5 ? '#F97316' : '#FEF08A',
            });
          }

          for (let i = 0; i < sim.frames.length; i++) {
            const f = sim.frames[i];
            if (!f.scored && sim.playerX >= f.x + f.width * 0.5) {
              f.scored = true;
              const pts = 5 * activePointMul;
              sim.baseScore += 5;
              sim.score += pts;
              sim.currentFrameIndex = Math.max(sim.currentFrameIndex, f.index);
              onScoreChangeRef.current(sim.score);
              onMissionEventRef.current({ type: 'score', score: sim.score });
            }
          }

          // When boost ends, gently aim onto the nearest beam ahead
          if (sim.boostTimer <= 0.05) {
            const safeAhead = sim.frames.find((f) => !f.shattered && f.x + f.width > sim.playerX);
            if (safeAhead) {
              sim.playerX = safeAhead.x + safeAhead.width / 2;
              sim.playerY = safeAhead.y - PLAYER_RADIUS - 32;
              sim.playerVx = 0;
              sim.playerVy = 20;
            }
          }
        } else {
          const prevX = sim.playerX;
          const prevY = sim.playerY;
          const prevBottom = prevY + PLAYER_RADIUS;

          // Track lowest nearby reachable platform top
          let maxAllowedTopY = sim.currentFrameBaseY;
          for (let i = 0; i < sim.frames.length; i++) {
            const f = sim.frames[i];
            if (f.shattered) continue;
            if (f.x + f.width >= sim.playerX - 20 && f.x <= sim.playerX + 340) {
              const effectiveY = f.kind === 'moving_y' ? f.baseY + f.moveAmp : f.y;
              if (effectiveY > maxAllowedTopY) {
                maxAllowedTopY = effectiveY;
              }
            }
          }

          let frameBelow = false;
          for (let i = 0; i < sim.frames.length; i++) {
            const f = sim.frames[i];
            if (f.shattered) continue;
            if (
              sim.playerX >= f.x - 8 &&
              sim.playerX <= f.x + f.width + 8 &&
              f.y >= sim.playerY
            ) {
              frameBelow = true;
              break;
            }
          }

          // Only lock out mid-air recovery once the player has clearly dropped past all reachable beams
          if (prevBottom > maxAllowedTopY + 46 && !frameBelow) {
            sim.airControlLocked = true;
          }

          // Play classic retro "piiiiuuuuh" sound right when falling past the beams into the abyss
          if (
            !sim.fallSoundPlayed &&
            sim.playerVy > 110 &&
            prevBottom > maxAllowedTopY + 26 &&
            !frameBelow
          ) {
            sim.fallSoundPlayed = true;
            audio.playFallPiuuh();
          }

          // Mid-air hold & rescue-jump physics:
          if (isHolding && !sim.airControlLocked) {
            if (!sim.wasHoldingInAir) {
              sim.wasHoldingInAir = true;
              if (!sim.airRescueUsed) {
                sim.airRescueUsed = true;
                sim.playerVy = Math.min(sim.playerVy, -165);
                sim.squashX = 0.86;
                sim.squashY = 1.18;
                audio.playJump();
              }
            }
            sim.usedHoldThisJump = true;
            sim.playerVx = getActiveForwardVx(sim.score);
            if (sim.playerVy > 72) {
              sim.playerVy = Math.max(72, sim.playerVy - 1600 * dt);
            } else {
              sim.playerVy += 500 * dt;
              if (sim.playerVy > 72) sim.playerVy = 72;
            }
            audio.setHolding(true);
          } else {
            if (!isHolding) {
              sim.wasHoldingInAir = false;
            }
            if (sim.playerVx > 0) {
              sim.playerVx *= Math.exp(-18 * dt);
              if (sim.playerVx < 4) sim.playerVx = 0;
            }
            if (sim.playerVy < -140) {
              sim.playerVy += 1900 * dt;
            } else {
              sim.playerVy += 1250 * dt;
            }
            if (sim.playerVy > 560) sim.playerVy = 560;
            audio.setHolding(false);
          }

          sim.playerX += sim.playerVx * dt;
          sim.playerY += sim.playerVy * dt;

          // Soft top boundary below HUD
          if (sim.playerY < 56) {
            sim.playerY = 56;
            if (sim.playerVy < 0) sim.playerVy = 0;
          }

          const currBottom = sim.playerY + PLAYER_RADIUS;

          // Solid collision against green frames (land ON TOP, never fly through sides/interior!)
          let landed = false;
          for (let i = 0; i < sim.frames.length; i++) {
            const f = sim.frames[i];
            if (f.shattered) continue;

            // 1. Check landing onto top edge of frame while descending
            const withinTopX = sim.playerX >= f.x - 7 && sim.playerX <= f.x + f.width + 7;
            if (sim.playerVy >= 0 && withinTopX && prevBottom <= f.y + 12 && currBottom >= f.y) {
              sim.playerY = f.y - PLAYER_RADIUS;
              sim.playerVy = 0;
              sim.playerVx = 0;
              sim.onGround = true;
              sim.hopPhase = 0;
              sim.hopOffset = 0;
              sim.coyoteTimer = 0;
              sim.airControlLocked = false;
              sim.airRescueUsed = false;
              sim.wasHoldingInAir = false;
              sim.fallSoundPlayed = false;
              sim.currentFrameId = f.id;
              sim.currentFrameBaseY = f.y;
              sim.squashX = 1.28;
              sim.squashY = 0.74;
              audio.setHolding(false);
              audio.playLand();
              spawnLandingSplash(sim.playerX - sim.cameraX, f.y);

              if (f.kind === 'crumbling' && !f.crumbleTriggered) {
                f.crumbleTriggered = true;
                const progress = Math.min(1, sim.score / 260);
                f.fallVy = 155 + progress * 55;
                audio.playCrackTick();
                spawnCrumbleDebris(f, 6);
                onMissionEventRef.current({ type: 'crumble', amount: 1 });
              }

              if (!f.scored) {
                const skippedCount = Math.max(0, f.index - sim.currentFrameIndex - 1);
                f.scored = true;
                const basePts = 5 + skippedCount * 5;
                const pts = basePts * activePointMul;
                sim.baseScore += basePts;
                sim.score += pts;
                onScoreChangeRef.current(sim.score);
                onMissionEventRef.current({ type: 'score', score: sim.score });

                if (skippedCount > 0) {
                  audio.playBonus();
                  onMissionEventRef.current({ type: 'skip', amount: skippedCount });
                  sim.popups.push({
                    x: LOGICAL_WIDTH / 2,
                    y: 116,
                    vy: -34,
                    text: skippedCount > 1 ? `+${pts} SKIP x${skippedCount}!` : `+${pts} SKIP!`,
                    color: '#FEF08A',
                    life: 0,
                    maxLife: 0.92,
                  });
                } else {
                  audio.playScore();
                  sim.popups.push({
                    x: LOGICAL_WIDTH / 2,
                    y: 116,
                    vy: -32,
                    text: `+${pts}`,
                    color: activePointMul > 1 ? '#FEF08A' : '#FFFFFF',
                    life: 0,
                    maxLife: 0.75,
                  });
                }
              }
              sim.currentFrameIndex = Math.max(sim.currentFrameIndex, f.index);

              if (sim.jumpBufferTimer > 0 && isHolding) {
                triggerJump();
              }
              landed = true;
              break;
            }

            // 2. Solid frame body / side / underside blocking (lock air control and fall straight down!)
            if (sim.invulnTimer <= 0) {
              const closestX = Math.max(f.x, Math.min(sim.playerX, f.x + f.width));
              const closestY = Math.max(f.y, Math.min(sim.playerY, f.y + f.height));
              const dx = sim.playerX - closestX;
              const dy = sim.playerY - closestY;
              if (dx * dx + dy * dy < PLAYER_RADIUS * PLAYER_RADIUS) {
                sim.airControlLocked = true;
                audio.setHolding(false);
                if (prevX + PLAYER_RADIUS <= f.x + 8) {
                  sim.playerX = f.x - PLAYER_RADIUS - 1;
                  sim.playerVx = -35;
                  sim.playerVy = Math.max(sim.playerVy, 70);
                } else if (prevY - PLAYER_RADIUS >= f.y + f.height - 10) {
                  sim.playerY = f.y + f.height + PLAYER_RADIUS + 1;
                  sim.playerVy = Math.max(80, -sim.playerVy * 0.35);
                  sim.playerVx = 0;
                } else {
                  sim.playerX = f.x - PLAYER_RADIUS - 1;
                  sim.playerVx = -25;
                  sim.playerVy = Math.max(sim.playerVy, 80);
                }
              }
            }
          }

          const visibleBottomWorldY = sim.cameraY + viewWorldH;
          if (!landed && sim.playerY - PLAYER_RADIUS > visibleBottomWorldY + 18) {
            if (boardChargesRef.current > 0) {
              boardChargesRef.current = Math.max(0, boardChargesRef.current - 1);
              onBoardConsumedRef.current();
              rescuePlayerToSafeBeam('board');
            } else {
              triggerGameOver();
              return;
            }
          }
        }
      } else {
        audio.setHolding(false);
      }

      // Coin magnet attraction & collection (1 Coin = +1 wallet Coin)
      const effectivePlayerY = sim.playerY - sim.hopOffset;
      for (let i = sim.coins.length - 1; i >= 0; i--) {
        const c = sim.coins[i];
        if (c.collected) {
          sim.coins.splice(i, 1);
          continue;
        }
        c.y = c.baseY + Math.sin(sim.time * 4.2 + c.phase) * 3.5;

        const dx = sim.playerX - c.x;
        const dy = effectivePlayerY - c.y;
        const dist = Math.hypot(dx, dy);

        if ((sim.magnetTimer > 0 || sim.boostTimer > 0) && dist < (sim.boostTimer > 0 ? 225 : 165)) {
          const pull = Math.min(1, dt * (sim.boostTimer > 0 ? 15.5 : 11.5));
          c.x += dx * pull;
          c.baseY += (effectivePlayerY - c.baseY) * pull;
          c.y = c.baseY;
        }

        if (dist < PLAYER_RADIUS + 12) {
          c.collected = true;
          sim.runCoins += 1;
          onRunCoinsChangeRef.current(sim.runCoins);
          onMissionEventRef.current({ type: 'coin', amount: 1 });
          audio.playCoin();

          for (let p = 0; p < 6; p++) {
            const ang = (p / 6) * Math.PI * 2;
            sim.particles.push({
              x: c.x - sim.cameraX,
              y: c.y,
              vx: Math.cos(ang) * 65,
              vy: Math.sin(ang) * 65 - 20,
              size: 2.6,
              life: 0,
              maxLife: 0.34,
              color: '#FDE047',
            });
          }
          sim.popups.push({
            x: Math.max(48, Math.min(LOGICAL_WIDTH - 48, (c.x - sim.cameraX) * WORLD_ZOOM)),
            y: Math.max(82, (c.y - sim.cameraY - 12) * WORLD_ZOOM),
            vy: -28,
            text: '+1 COIN',
            color: '#FDE047',
            life: 0,
            maxLife: 0.55,
          });
        } else if (c.x - sim.cameraX < -120) {
          sim.coins.splice(i, 1);
        }
      }

      // Power-Up pickup (strictly fixed Level-1 durations)
      for (let i = sim.powerUps.length - 1; i >= 0; i--) {
        const pu = sim.powerUps[i];
        if (pu.collected) {
          sim.powerUps.splice(i, 1);
          continue;
        }
        pu.y = pu.baseY + Math.sin(sim.time * 3.6 + pu.phase) * 4.5;
        const dist = Math.hypot(sim.playerX - pu.x, effectivePlayerY - pu.y);
        if (dist < PLAYER_RADIUS + 15) {
          pu.collected = true;
          audio.playPowerUp();
          onMissionEventRef.current({ type: 'powerup', amount: 1 });

          let label = 'POWER!';
          let color = '#38BDF8';
          if (pu.type === 'magnet') {
            sim.magnetTimer = POWERUP_DURATIONS.magnet;
            label = 'MAGNET 6s!';
            color = '#38BDF8';
          } else if (pu.type === 'double') {
            sim.doubleTimer = Math.max(sim.doubleTimer, POWERUP_DURATIONS.double);
            label = '2× MULTIPLIKATOR!';
            color = '#FACC15';
          } else {
            sim.boostTimer = POWERUP_DURATIONS.boost;
            label = 'RAKETEN-BOOST!';
            color = '#FB923C';
          }

          sim.popups.push({
            x: LOGICAL_WIDTH / 2,
            y: 138,
            vy: -28,
            text: label,
            color,
            life: 0,
            maxLife: 1.0,
          });
          onPowerUpsChangeRef.current({
            magnet: sim.magnetTimer,
            double: sim.doubleTimer,
            boost: sim.boostTimer,
          });
        } else if (pu.x - sim.cameraX < -120) {
          sim.powerUps.splice(i, 1);
        }
      }

      // Camera keeps player comfortably in left-center (~21% of 316px zoomed view) & smoothly follows vertically
      const targetCamX = sim.playerX - 66;
      sim.cameraX += (targetCamX - sim.cameraX) * Math.min(1, dt * 8.5);

      const targetCamY = Math.max(minCamY, Math.min(maxCamY, sim.playerY - 248 - camCenterOffset));
      sim.cameraY += (targetCamY - sim.cameraY) * Math.min(1, dt * 4.4);

      // Generate new frames & collectibles well ahead
      let rightmost = sim.frames[sim.frames.length - 1];
      while (rightmost && rightmost.x - sim.cameraX < VIEW_WORLD_WIDTH + 420) {
        const next = generateNextFrame(rightmost, sim.nextFrameId++, sim.score);
        sim.frames.push(next);
        spawnCollectiblesForFrame(rightmost, next, sim.coins, sim.powerUps);
        rightmost = next;
      }
      while (sim.frames.length > 0 && sim.frames[0].x + sim.frames[0].width - sim.cameraX < -240) {
        sim.frames.shift();
      }

      // Recycle parallax monuments seamlessly (far & near layers)
      if (sim.farMonuments.length > 0) {
        const farOffset = sim.cameraX * 0.16;
        let maxFarEnd = -Infinity;
        for (let i = 0; i < sim.farMonuments.length; i++) {
          const end = sim.farMonuments[i].worldX + sim.farMonuments[i].drawW * 0.56;
          if (end > maxFarEnd) maxFarEnd = end;
        }
        for (let i = 0; i < sim.farMonuments.length; i++) {
          const m = sim.farMonuments[i];
          if (m.worldX + m.drawW - farOffset < -120) {
            m.worldX = maxFarEnd;
            maxFarEnd = m.worldX + m.drawW * 0.56;
          }
        }
      }

      if (sim.monuments.length > 0) {
        const parallaxOffset = sim.cameraX * 0.36;
        let maxWorldEnd = -Infinity;
        for (let i = 0; i < sim.monuments.length; i++) {
          const end = sim.monuments[i].worldX + sim.monuments[i].drawW * 0.45;
          if (end > maxWorldEnd) maxWorldEnd = end;
        }
        for (let i = 0; i < sim.monuments.length; i++) {
          const m = sim.monuments[i];
          if (m.worldX + m.drawW - parallaxOffset < -120) {
            m.worldX = maxWorldEnd;
            maxWorldEnd = m.worldX + m.drawW * 0.45;
          }
        }
      }
    };

    const drawFrameHalf = (
      x: number,
      y: number,
      w: number,
      h: number,
      bar: number,
      depth: number,
      openBottom: boolean,
      side: 'left' | 'right' | 'full'
    ) => {
      const mainColor = '#22C55E';
      const darkColor = '#16A34A';
      const topHiColor = '#4ADE80';

      if (side === 'full') {
        ctx.fillStyle = darkColor;
        ctx.fillRect(x + bar, y + bar, depth, h - bar - (openBottom ? 0 : bar));
        ctx.fillRect(x + bar, y + bar, w - bar * 2, depth);
        if (!openBottom) {
          ctx.fillRect(x + bar, y + h - bar - depth, w - bar * 2, depth);
        }

        ctx.fillStyle = mainColor;
        ctx.fillRect(x, y, w, bar);
        ctx.fillRect(x, y, bar, h);
        ctx.fillRect(x + w - bar, y, bar, h);
        if (!openBottom) {
          ctx.fillRect(x, y + h - bar, w, bar);
        }

        ctx.fillStyle = topHiColor;
        ctx.fillRect(x, y, w, 2);
      } else if (side === 'left') {
        const hw = w / 2 - 1;
        ctx.fillStyle = darkColor;
        ctx.fillRect(x + bar, y + bar, depth, h - bar - (openBottom ? 0 : bar));
        ctx.fillRect(x + bar, y + bar, hw - bar, depth);
        ctx.fillStyle = mainColor;
        ctx.fillRect(x, y, hw, bar);
        ctx.fillRect(x, y, bar, h);
        if (!openBottom) ctx.fillRect(x, y + h - bar, hw, bar);
        ctx.fillStyle = topHiColor;
        ctx.fillRect(x, y, hw, 2);
      } else {
        const hw = w / 2 - 1;
        const rx = x + w / 2 + 1;
        ctx.fillStyle = darkColor;
        ctx.fillRect(rx, y + bar, hw - bar, depth);
        ctx.fillStyle = mainColor;
        ctx.fillRect(rx, y, hw, bar);
        ctx.fillRect(rx + hw - bar, y, bar, h);
        if (!openBottom) ctx.fillRect(rx, y + h - bar, hw, bar);
        ctx.fillStyle = topHiColor;
        ctx.fillRect(rx, y, hw, 2);
      }
    };

    const drawFrameStairs = (
      x: number,
      y: number,
      w: number,
      h: number,
      bar: number,
      openBottom: boolean
    ) => {
      const ix = x + bar;
      const iy = y + bar;
      const iw = w - bar * 2;
      const ih = h - bar - (openBottom ? 0 : bar);
      if (iw <= 8 || ih <= 20) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, iy, iw, ih);
      ctx.clip();

      // Diagonal recessed stone staircase descending left-to-right inside the green portal
      const steps = 9;
      const startY = iy + ih * 0.34;
      const endY = iy + ih + 2;
      const stepH = (endY - startY) / steps;
      const stepW = (iw * 0.92) / steps;

      // Solid stone triangle body beneath the stairs
      ctx.fillStyle = 'rgba(156, 166, 168, 0.86)';
      ctx.beginPath();
      ctx.moveTo(ix, iy + ih + 2);
      ctx.lineTo(ix, startY);
      for (let s = 0; s < steps; s++) {
        const sx = ix + s * stepW;
        const sy = startY + s * stepH;
        ctx.lineTo(sx + stepW, sy);
        ctx.lineTo(sx + stepW, sy + stepH);
      }
      ctx.lineTo(ix + iw, iy + ih + 2);
      ctx.closePath();
      ctx.fill();

      // Crisp 3D top treads and darker step risers matching the isometric monument stairs
      for (let s = 0; s < steps; s++) {
        const sx = ix + s * stepW;
        const sy = startY + s * stepH;
        // Light tread surface
        ctx.fillStyle = 'rgba(208, 214, 212, 0.88)';
        ctx.fillRect(sx, sy, stepW + 0.5, Math.min(3.5, stepH * 0.42));
        // Subtle darker vertical riser edge
        ctx.fillStyle = 'rgba(116, 126, 130, 0.55)';
        ctx.fillRect(sx + stepW - 1.5, sy, 1.5, stepH + 1);
      }

      // Soft inner shadow along top-left staircase wall
      ctx.fillStyle = 'rgba(88, 96, 102, 0.24)';
      ctx.fillRect(ix, startY, 3, ih);

      ctx.restore();
    };

    const drawRetroCrumblingFrame = (
      x: number,
      y: number,
      w: number,
      h: number,
      bar: number,
      depth: number,
      openBottom: boolean,
      triggered: boolean
    ) => {
      const px = Math.round(x);
      const py = Math.round(y);
      const pw = Math.round(w);
      const ph = Math.round(h);
      const p = 3; // 3px retro pixel grid unit

      ctx.save();

      // 1. Inner 3D pixel bevel shadow (stepped pixel shadow inside the opening)
      ctx.fillStyle = '#16A34A';
      ctx.fillRect(px + bar, py + bar, Math.round(depth), ph - bar - (openBottom ? 0 : bar));
      ctx.fillRect(px + bar, py + bar, pw - bar * 2, Math.round(depth));
      if (!openBottom) {
        ctx.fillRect(px + bar, py + ph - bar - Math.round(depth), pw - bar * 2, Math.round(depth));
      }

      // 2. Main stone body with retro pixel outer edge chips (missing corner/edge pixels so silhouette is pixelated!)
      ctx.fillStyle = '#22C55E';
      // Top bar (inset 2px at corners & segmented around top pixel notches)
      ctx.fillRect(px + p, py, Math.round(pw * 0.26) - p, bar);
      ctx.fillRect(px + Math.round(pw * 0.26), py + p, p * 2, bar - p); // top pixel notch cutout
      ctx.fillRect(px + Math.round(pw * 0.26) + p * 2, py, Math.round(pw * 0.40) - p * 2, bar);
      ctx.fillRect(px + Math.round(pw * 0.66), py + p, p * 2, bar - p); // 2nd top pixel notch cutout
      ctx.fillRect(px + Math.round(pw * 0.66) + p * 2, py, pw - Math.round(pw * 0.66) - p * 3, bar);
      ctx.fillRect(px + p, py + p, pw - p * 2, bar - p);

      // Left pillar with stepped pixel notch cutouts along left edge
      ctx.fillRect(px, py + p, bar, Math.round(ph * 0.28) - p);
      ctx.fillRect(px + p, py + Math.round(ph * 0.28), bar - p, p * 2);
      ctx.fillRect(px, py + Math.round(ph * 0.28) + p * 2, bar, Math.round(ph * 0.36));
      ctx.fillRect(px + p, py + Math.round(ph * 0.64) + p * 2, bar - p, p * 2);
      ctx.fillRect(
        px,
        py + Math.round(ph * 0.64) + p * 4,
        bar,
        ph - (Math.round(ph * 0.64) + p * 4) - (openBottom ? 0 : p)
      );

      // Right pillar with stepped pixel notch cutouts along right edge
      const rx = px + pw - bar;
      ctx.fillRect(rx, py + p, bar, Math.round(ph * 0.34) - p);
      ctx.fillRect(rx, py + Math.round(ph * 0.34), bar - p, p * 2);
      ctx.fillRect(rx, py + Math.round(ph * 0.34) + p * 2, bar, Math.round(ph * 0.36));
      ctx.fillRect(rx, py + Math.round(ph * 0.70) + p * 2, bar - p, p * 2);
      ctx.fillRect(
        rx,
        py + Math.round(ph * 0.70) + p * 4,
        bar,
        ph - (Math.round(ph * 0.70) + p * 4) - (openBottom ? 0 : p)
      );

      // Bottom bar (if closed) with bottom pixel notch
      if (!openBottom) {
        const by = py + ph - bar;
        ctx.fillRect(px + p, by, Math.round(pw * 0.42) - p, bar);
        ctx.fillRect(px + Math.round(pw * 0.42), by, p * 2, bar - p);
        ctx.fillRect(px + Math.round(pw * 0.42) + p * 2, by, pw - Math.round(pw * 0.42) - p * 3, bar);
      }

      // 3. Crisp 8-bit dark-green pixel border along edges + bright pixel highlight rim
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(px + p, py, Math.round(pw * 0.26) - p, 2);
      ctx.fillRect(px + Math.round(pw * 0.26) + p * 2, py, Math.round(pw * 0.40) - p * 2, 2);
      ctx.fillRect(px + Math.round(pw * 0.66) + p * 2, py, pw - Math.round(pw * 0.66) - p * 3, 2);
      ctx.fillRect(px, py + p, 2, Math.round(ph * 0.28) - p);

      // Retro stone brick/dither pixel flecks
      ctx.fillStyle = '#16A34A';
      const ditherBricks: Array<[number, number, number, number]> = [
        [px + 12, py + 3, 3, 3],
        [px + Math.round(pw * 0.52), py + 6, 3, 3],
        [px + 3, py + Math.round(ph * 0.18), 3, 3],
        [px + 6, py + Math.round(ph * 0.50), 3, 3],
        [px + 3, py + Math.round(ph * 0.85), 3, 3],
        [rx + 3, py + Math.round(ph * 0.22), 3, 3],
        [rx + 6, py + Math.round(ph * 0.55), 3, 3],
        [rx + 3, py + Math.round(ph * 0.88), 3, 3],
      ];
      for (let i = 0; i < ditherBricks.length; i++) {
        const [bx, by, bw, bh] = ditherBricks[i];
        ctx.fillRect(bx, by, bw, bh);
      }

      // 4. Stepped 8-bit pixel crack staircases on ALL 4 sides (both inner & outer edges!)
      ctx.fillStyle = triggered ? '#062814' : '#0F3D20';
      const crackPixels: Array<[number, number]> = [
        // Top bar pixel crack 1 (staircase down from top notch)
        [px + Math.round(pw * 0.26) + p, py + p],
        [px + Math.round(pw * 0.26) + p * 2, py + p * 2],
        [px + Math.round(pw * 0.26) + p, py + p * 3],
        // Top bar pixel crack 2 (staircase up from inner edge)
        [px + Math.round(pw * 0.48), py + bar - p],
        [px + Math.round(pw * 0.48) + p, py + bar - p * 2],
        [px + Math.round(pw * 0.48), py + bar - p * 3],
        // Top bar pixel crack 3 (right top notch)
        [px + Math.round(pw * 0.66) + p, py + p],
        [px + Math.round(pw * 0.66), py + p * 2],
        [px + Math.round(pw * 0.66) + p, py + p * 3],
        // Top-left & top-right pixel corner fractures
        [px + p, py + p],
        [px + p * 2, py + p * 2],
        [px + pw - p * 2, py + p],
        [px + pw - p * 3, py + p * 2],
        // Left pillar cracks (outer & inner edges)
        [px + p, py + Math.round(ph * 0.28) + p],
        [px + p * 2, py + Math.round(ph * 0.28) + p * 2],
        [px + bar - p, py + Math.round(ph * 0.44)],
        [px + bar - p * 2, py + Math.round(ph * 0.44) + p],
        [px + p, py + Math.round(ph * 0.44) + p],
        [px + p, py + Math.round(ph * 0.64) + p * 2],
        [px + p * 2, py + Math.round(ph * 0.64) + p * 3],
        // Right pillar cracks (outer & inner edges)
        [rx + p * 2, py + Math.round(ph * 0.34) + p],
        [rx + p, py + Math.round(ph * 0.34) + p * 2],
        [rx, py + Math.round(ph * 0.54)],
        [rx + p, py + Math.round(ph * 0.54) + p],
        [rx + p * 2, py + Math.round(ph * 0.54) + p],
        [rx + p * 2, py + Math.round(ph * 0.70) + p * 2],
        [rx + p, py + Math.round(ph * 0.70) + p * 3],
      ];

      if (!openBottom) {
        const by = py + ph - bar;
        crackPixels.push(
          [px + Math.round(pw * 0.42) + p, by + bar - p * 2],
          [px + Math.round(pw * 0.42), by + p],
          [px + Math.round(pw * 0.72), by],
          [px + Math.round(pw * 0.72) + p, by + p]
        );
      }

      for (let i = 0; i < crackPixels.length; i++) {
        ctx.fillRect(crackPixels[i][0], crackPixels[i][1], p, p);
      }

      // 5. Crisp 1-pixel pale-green retro highlight adjacent to main cracks
      ctx.fillStyle = '#86EFAC';
      ctx.fillRect(px + Math.round(pw * 0.26) + p * 2, py + p, 2, p);
      ctx.fillRect(px + Math.round(pw * 0.48) + p * 2, py + bar - p * 2, 2, p);
      ctx.fillRect(px + p * 2, py + Math.round(ph * 0.28) + p, 2, p);
      ctx.fillRect(rx + p, py + Math.round(ph * 0.34) + p, 2, p);

      // 6. Floating 3x3 pixel stone crumb beside the frame when crumbling or cracked
      ctx.fillStyle = '#16A34A';
      ctx.fillRect(px - 4, py + Math.round(ph * 0.30), p, p);
      ctx.fillRect(px + pw + 2, py + Math.round(ph * 0.36), p, p);

      ctx.restore();
    };

    const drawGreenFrame = (f: GreenFrame, screenX: number) => {
      let x = screenX;
      let y = f.y;
      const w = f.width;
      const h = f.height;
      const bar = 11;
      const depth = 4.5;

      if (f.shattered) {
        const splitOffset = f.shatterAge * 46;
        const rot = f.shatterAge * 1.45;
        const alpha = Math.max(0, 1 - f.shatterAge * 1.25);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + w * 0.25 - splitOffset, y + h * 0.2);
        ctx.rotate(-rot);
        drawFrameHalf(-w * 0.25, -h * 0.2, w, h, bar, depth, f.openBottom, 'left');
        // Retro pixel fracture marks on breaking left half
        ctx.fillStyle = '#0F3D20';
        ctx.fillRect(-w * 0.25 + 6, -h * 0.2 + 3, 3, 3);
        ctx.fillRect(-w * 0.25 + 3, -h * 0.2 + 24, 3, 3);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + w * 0.75 + splitOffset, y + h * 0.2);
        ctx.rotate(rot);
        drawFrameHalf(-w * 0.75, -h * 0.2, w, h, bar, depth, f.openBottom, 'right');
        ctx.fillStyle = '#0F3D20';
        ctx.fillRect(w * 0.25 - 9, -h * 0.2 + 6, 3, 3);
        ctx.fillRect(w * 0.25 - 6, -h * 0.2 + 30, 3, 3);
        ctx.restore();
        return;
      }

      if (f.kind === 'crumbling') {
        if (f.crumbleTriggered) {
          const urgency = 1 - Math.max(0, f.crumbleTimer / f.crumbleMax);
          x += Math.round((Math.random() - 0.5) * (3 + urgency * 4.5));
          y += Math.round((Math.random() - 0.5) * 2);
        }
        drawRetroCrumblingFrame(x, y, w, h, bar, depth, f.openBottom, f.crumbleTriggered);
        return;
      }

      if (f.hasStairs) {
        drawFrameStairs(x, y, w, h, bar, f.openBottom);
      }

      drawFrameHalf(x, y, w, h, bar, depth, f.openBottom, 'full');

      if (f.kind === 'moving_y') {
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        const cx = x + w / 2;
        const cy = y + 5.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 1);
        ctx.lineTo(cx, cy - 4);
        ctx.lineTo(cx + 5, cy - 1);
        ctx.moveTo(cx - 5, cy + 1);
        ctx.lineTo(cx, cy + 4);
        ctx.lineTo(cx + 5, cy + 1);
        ctx.fill();
        ctx.restore();
      } else if (f.kind === 'moving_x') {
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        const cx = x + w / 2;
        const cy = y + 5.5;
        ctx.beginPath();
        // Left chevron
        ctx.moveTo(cx - 2, cy - 3.5);
        ctx.lineTo(cx - 7, cy);
        ctx.lineTo(cx - 2, cy + 3.5);
        // Right chevron
        ctx.moveTo(cx + 2, cy - 3.5);
        ctx.lineTo(cx + 7, cy);
        ctx.lineTo(cx + 2, cy + 3.5);
        ctx.fill();
        ctx.restore();
      }
    };

    const drawCharacter = (
      screenX: number,
      y: number,
      sx: number,
      sy: number,
      onGround: boolean,
      hopPhase: number,
      hopOffset: number
    ) => {
      ctx.save();
      ctx.translate(screenX, y - hopOffset);
      // Cute squash at bounce contact & slight stretch at peak
      let hopSx = sx;
      let hopSy = sy;
      if (onGround) {
        if (hopPhase < 0.14 || hopPhase > 0.88) {
          hopSx *= 1.13;
          hopSy *= 0.86;
        } else {
          hopSx *= 0.94;
          hopSy *= 1.07;
        }
      }
      ctx.scale(hopSx, hopSy);
      drawCharacterSprite(ctx, characterIdRef.current, PLAYER_RADIUS, customFaceImgRef.current);
      ctx.restore();
    };

    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (sim.shakeTimer > 0 && screenShakeRef.current) {
        const mag = sim.shakeIntensity * (sim.shakeTimer / 0.28);
        ctx.translate((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
      }

      const { logicalH, viewWorldH, extraWorldH, baseTitleCamY } = getViewMetrics();
      const monScale = Math.max(1, viewWorldH / VIEW_WORLD_HEIGHT);

      // 1. Warm rose-pink gradient sky
      const bgGrad = ctx.createLinearGradient(0, 0, 0, logicalH);
      bgGrad.addColorStop(0, '#F4A9C1');
      bgGrad.addColorStop(0.55, '#E98DAB');
      bgGrad.addColorStop(1, '#DF7A9B');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(-12, -12, LOGICAL_WIDTH + 24, logicalH + 24);

      const sprites = spritesRef.current;

      // 2. Far drifting clouds (subtle vertical parallax in screen space)
      if (sprites && sprites.clouds.length > 0) {
        const cloudShiftY = -(sim.cameraY - baseTitleCamY) * 0.12;
        for (let i = 0; i < sim.clouds.length; i++) {
          const c = sim.clouds[i];
          if (c.layer !== 'far') continue;
          const sp = sprites.clouds[c.spriteIdx % sprites.clouds.length];
          const bobY = Math.sin(sim.time * 1.2 + c.bobPhase) * c.bobAmp;
          ctx.save();
          ctx.globalAlpha = c.alpha;
          ctx.drawImage(sp, c.x, c.y + bobY + cloudShiftY, sp.width * c.scale, sp.height * c.scale);
          ctx.restore();
        }
      }

      // 2b & 3. Zoomed Giant Isometric Pink Staircase Monuments with gentle vertical parallax
      ctx.save();
      ctx.scale(WORLD_ZOOM, WORLD_ZOOM);
      ctx.translate(0, -sim.cameraY * 0.45);

      if (sprites && sprites.monuments.length > 0) {
        const farParallaxX = sim.cameraX * 0.16;
        for (let i = 0; i < sim.farMonuments.length; i++) {
          const m = sim.farMonuments[i];
          const sx = m.worldX - farParallaxX;
          const drawW = m.drawW * monScale;
          const drawH = m.drawH * monScale;
          const drawY = m.y - extraWorldH * 0.10;
          if (sx + drawW < -60 || sx > VIEW_WORLD_WIDTH + 60) continue;
          const sp = sprites.monuments[m.spriteIdx % sprites.monuments.length];
          ctx.save();
          ctx.globalAlpha = 0.44;
          ctx.drawImage(sp, sx, drawY, drawW, drawH);
          ctx.restore();
        }
      }

      if (sprites && sprites.monuments.length > 0) {
        const parallaxX = sim.cameraX * 0.36;
        for (let i = 0; i < sim.monuments.length; i++) {
          const m = sim.monuments[i];
          const sx = m.worldX - parallaxX;
          const drawW = m.drawW * monScale;
          const drawH = m.drawH * monScale;
          const drawY = m.y - extraWorldH * 0.14;
          if (sx + drawW < -60 || sx > VIEW_WORLD_WIDTH + 60) continue;
          const sp = sprites.monuments[m.spriteIdx % sprites.monuments.length];
          ctx.save();
          ctx.globalAlpha = 0.96;
          ctx.drawImage(sp, sx, drawY, drawW, drawH);
          ctx.restore();
        }
      } else {
        // Immediate vector staircase backdrop while bitmap sprites finish decoding
        const parallaxX = (((sim.cameraX * 0.32) % 360) + 360) % 360;
        const fallbackBottom = Math.ceil(viewWorldH + 80);
        for (let rep = -1; rep <= 1; rep++) {
          const bx = rep * 360 - parallaxX;
          ctx.save();
          ctx.fillStyle = 'rgba(176, 70, 108, 0.42)';
          ctx.fillRect(bx + 24, 180, 92, fallbackBottom - 180);
          ctx.fillRect(bx + 230, 110, 104, fallbackBottom - 110);
          ctx.fillStyle = 'rgba(218, 128, 158, 0.5)';
          for (let s = 0; s < 10; s++) {
            ctx.fillRect(bx + 110 + s * 11, 410 - s * 14, 16, 14 + s * 14);
          }
          ctx.restore();
        }
      }
      ctx.restore();

      // 4. Mid drifting clouds (behind green frames & character)
      if (sprites && sprites.clouds.length > 0) {
        const midCloudShiftY = -(sim.cameraY - baseTitleCamY) * 0.20;
        for (let i = 0; i < sim.clouds.length; i++) {
          const c = sim.clouds[i];
          if (c.layer !== 'mid') continue;
          const sp = sprites.clouds[c.spriteIdx % sprites.clouds.length];
          const bobY = Math.sin(sim.time * 1.2 + c.bobPhase) * c.bobAmp;
          ctx.save();
          ctx.globalAlpha = c.alpha;
          ctx.drawImage(sp, c.x, c.y + bobY + midCloudShiftY, sp.width * c.scale, sp.height * c.scale);
          ctx.restore();
        }
      }

      // 5. Floating translucent pink soap bubbles
      for (let i = 0; i < sim.bubbles.length; i++) {
        const b = sim.bubbles[i];
        const bx = b.x + Math.sin(sim.time * 1.4 + b.phase) * 5;
        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.strokeStyle = '#FFE4EE';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bx, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.beginPath();
        ctx.arc(bx - b.r * 0.35, b.y - b.r * 0.35, Math.max(1, b.r * 0.18), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 6..9. Zoomed Gameplay World Layer (1.14x zoom + smooth vertical camera follow)
      ctx.save();
      ctx.scale(WORLD_ZOOM, WORLD_ZOOM);
      ctx.translate(0, -sim.cameraY);

      // 6. Neon-green 3D beveled frames & challenge stones
      for (let i = 0; i < sim.frames.length; i++) {
        const f = sim.frames[i];
        const sx = f.x - sim.cameraX;
        if (sx + f.width < -60 || sx > VIEW_WORLD_WIDTH + 60) continue;
        drawGreenFrame(f, sx);
      }

      // 6b. Spinning Golden Coins
      for (let i = 0; i < sim.coins.length; i++) {
        const c = sim.coins[i];
        const sx = c.x - sim.cameraX;
        if (sx < -24 || sx > VIEW_WORLD_WIDTH + 24) continue;
        const spinW = Math.max(0.28, Math.abs(Math.cos(sim.time * 4.8 + c.phase)));
        ctx.save();
        ctx.translate(sx, c.y);
        ctx.scale(spinW, 1);
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#B45309';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = '#FEF9C3';
        ctx.fillRect(-1.5, -4.5, 3, 9);
        ctx.restore();
      }

      // 6c. Power-Up Pickups (2× Multiplikator-Coin / Magnet / Raketen-Boost)
      for (let i = 0; i < sim.powerUps.length; i++) {
        const pu = sim.powerUps[i];
        const sx = pu.x - sim.cameraX;
        if (sx < -30 || sx > VIEW_WORLD_WIDTH + 30) continue;
        ctx.save();
        ctx.translate(sx, pu.y);
        const pulse = 1 + Math.sin(sim.time * 6 + pu.phase) * 0.08;
        ctx.scale(pulse, pulse);

        if (pu.type === 'double') {
          // Golden Multiplikator-Coin with subtle halo & bold 2×
          ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
          ctx.beginPath();
          ctx.arc(0, 0, 16.5, 0, Math.PI * 2);
          ctx.fill();

          const spinW = Math.max(0.72, Math.abs(Math.cos(sim.time * 3.4 + pu.phase)));
          ctx.scale(spinW, 1);

          ctx.fillStyle = '#FACC15';
          ctx.beginPath();
          ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#92400E';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.strokeStyle = '#FEF9C3';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#78350F';
          ctx.font = '900 10.5px "Outfit", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('2×', 0, 0.8);
        } else {
          const bgColor = pu.type === 'magnet' ? '#0284C7' : '#EA580C';
          const ringColor = pu.type === 'magnet' ? '#7DD3FC' : '#FED7AA';
          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 10px "Outfit", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pu.type === 'magnet' ? 'M' : '⚡', 0, 0.5);
        }
        ctx.restore();
      }

      // 7. Landing splash arcs
      for (let i = 0; i < sim.splashes.length; i++) {
        const s = sim.splashes[i];
        const t = s.life / s.maxLife;
        const spread = 10 + t * 18;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(s.x - spread, s.y - 2, 7, Math.PI * 1.05, Math.PI * 1.65);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x + spread, s.y - 2, 7, Math.PI * 1.35, Math.PI * 1.95);
        ctx.stroke();
        ctx.restore();
      }

      // 8. Particles
      for (let i = 0; i < sim.particles.length; i++) {
        const p = sim.particles[i];
        const t = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = p.color;
        if (p.square) {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 9. Player character (+ active Magnet ring / Rescue Board visual)
      const playerScreenX = sim.playerX - sim.cameraX;
      if (sim.playerY - PLAYER_RADIUS <= sim.cameraY + viewWorldH + 30) {
        if (sim.magnetTimer > 0 || sim.boostTimer > 0) {
          ctx.save();
          ctx.strokeStyle =
            sim.boostTimer > 0 ? 'rgba(251, 146, 60, 0.55)' : 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(
            playerScreenX,
            sim.playerY - sim.hopOffset,
            (sim.boostTimer > 0 ? 22 : 20) + Math.sin(sim.time * 10) * 3,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          ctx.restore();
        }

        if (sim.boardVisualTimer > 0 || sim.boostTimer > 0) {
          const skinDef = BOARD_SKINS.find((b) => b.id === boardSkinRef.current) ?? BOARD_SKINS[0];
          ctx.save();
          ctx.translate(playerScreenX, sim.playerY - sim.hopOffset + PLAYER_RADIUS + 3);
          ctx.fillStyle = sim.boostTimer > 0 ? '#F97316' : skinDef.primaryColor;
          ctx.beginPath();
          ctx.roundRect(-18, -3.5, 36, 7, 3.5);
          ctx.fill();
          ctx.strokeStyle = skinDef.accentColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        drawCharacter(
          playerScreenX,
          sim.playerY,
          sim.squashX,
          sim.squashY,
          sim.onGround,
          sim.hopPhase,
          sim.hopOffset
        );
      }

      ctx.restore();

      // 10. In-game initial jump hint
      if (gameStateRef.current === 'PLAYING' && !sim.hasJumpedOnce) {
        ctx.save();
        ctx.font = '800 17px "Outfit", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.shadowColor = 'rgba(130, 35, 70, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillText('Tippen & halten für', LOGICAL_WIDTH / 2, logicalH - 138);
        ctx.fillText('längere Sprünge', LOGICAL_WIDTH / 2, logicalH - 114);
        ctx.restore();
      }

      // 11. Retro pixel "+5" / "+10 SKIP!" popup
      for (let i = 0; i < sim.popups.length; i++) {
        const pop = sim.popups[i];
        const t = pop.life / pop.maxLife;
        const alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
        const scale = t < 0.18 ? 0.78 + (t / 0.18) * 0.28 : 1.06 - t * 0.08;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(pop.x, pop.y);
        ctx.scale(scale, scale);
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#4A0D25';
        ctx.fillText(pop.text, 2, 2);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, 0, 0);
        ctx.restore();
      }

      // 12. Impact flash
      if (sim.flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${sim.flashAlpha})`;
        ctx.fillRect(0, 0, LOGICAL_WIDTH, logicalH);
      }

      ctx.restore();
    };

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      if (!(isPausedRef.current && gameStateRef.current === 'PLAYING')) {
        update(dt);
      }
      render();
      rafId = requestAnimationFrame(tick);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => syncCanvasSize());
      resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', syncCanvasSize);
    window.visualViewport?.addEventListener('resize', syncCanvasSize);

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncCanvasSize);
      window.visualViewport?.removeEventListener('resize', syncCanvasSize);
    };
  }, [audio]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameStateRef.current !== 'PLAYING' || isPausedRef.current) return;
    e.preventDefault();
    pointerHeldRef.current = true;
    const sim = simRef.current;
    if (sim.onGround || sim.coyoteTimer > 0) {
      triggerJump();
    } else {
      sim.jumpBufferTimer = 0.16;
    }
    audio.setHolding(true);
  };

  const handlePointerUp = () => {
    pointerHeldRef.current = false;
    if (!keyHeldRef.current) {
      audio.setHolding(false);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      className="game-surface block h-full w-full cursor-pointer"
      aria-label="FLAPS Spielfläche"
    />
  );
};

// Physics-matched generator with silent, automatic score-driven progression:
function generateNextFrame(prev: GreenFrame, id: number, scoreHint: number): GreenFrame {
  const progress = Math.min(1, scoreHint / 260);

  // Pick varied frame kind randomly (special frames ramp up silently with score; never two moving_x back-to-back)
  let kind: FrameKind = 'normal';
  if (id >= 2) {
    const r = Math.random();
    const crumbleThreshold = 0.18 + progress * 0.18; // 18% -> 36%
    const moveYThreshold = 0.38 + progress * 0.22; // +20% -> +24%
    const moveXThreshold = 0.58 + progress * 0.24; // +20% -> +22%
    if (r < crumbleThreshold) {
      kind = 'crumbling';
    } else if (r < moveYThreshold) {
      kind = 'moving_y';
    } else if (prev.kind !== 'moving_x' && r < moveXThreshold) {
      kind = 'moving_x';
    }
  }

  // Truly random mix of tight (eng), medium (mittel), and wide (weit) gaps
  let gapTier: 'short' | 'medium' | 'wide';
  if (id === 1) {
    gapTier = 'medium';
  } else {
    const roll = Math.random();
    if (roll < 0.34) {
      gapTier = 'short';
    } else if (roll < 0.67) {
      gapTier = 'medium';
    } else {
      gapTier = 'wide';
    }
  }

  // Beam widths gradually narrow as the run progresses (72-86px early -> 50-66px later)
  const widthMin = Math.round(72 - progress * 22);
  const widthMax = Math.round(86 - progress * 20);
  const rawWidth = widthMin + Math.random() * Math.max(8, widthMax - widthMin);
  const width =
    kind === 'crumbling' && gapTier === 'short'
      ? Math.round(Math.max(widthMin, rawWidth))
      : Math.round(Math.max(widthMin, Math.min(widthMax, rawWidth)));
  const height = Math.round(115 + Math.random() * 46);

  // Stronger randomized height variations (bold climbs & deep drops, physics-verified)
  let dy: number;
  if (prev.kind === 'crumbling') {
    dy = -44 + Math.random() * 185; // -44px climb up to +141px drop
  } else if (kind === 'moving_x' || prev.kind === 'moving_x') {
    dy = -85 + Math.random() * 205; // -85px climb to +120px drop
  } else if (prev.baseY > 425) {
    dy = -124 + Math.random() * 82; // Climb strongly out of deep valleys
  } else if (prev.baseY < 225) {
    dy = 65 + Math.random() * 130; // Dive steeply down from high towers
  } else {
    dy =
      Math.random() < 0.48
        ? -(55 + Math.random() * 68) // Steep climb (-55..-123px)
        : 60 + Math.random() * 115; // Deep drop (+60..+175px)
  }

  // Keep wide leaps physically reachable without shrinking wide gaps back into medium!
  const maxClimbForGap = gapTier === 'wide' ? -68 : -112;
  let baseY = Math.round(Math.max(158, Math.min(512, prev.baseY + dy)));
  if (baseY - prev.baseY < maxClimbForGap) {
    baseY = prev.baseY + maxClimbForGap;
  }
  if (prev.kind === 'crumbling' && baseY < prev.baseY - 44) {
    baseY = prev.baseY - 44;
  }
  if (kind === 'crumbling' && baseY > 476) {
    baseY = 476;
  }

  const moveAmp =
    kind === 'moving_y'
      ? 44 + Math.random() * 18
      : kind === 'moving_x'
        ? 54 + Math.random() * 18
        : 0;

  if (kind === 'moving_y') {
    baseY = Math.round(Math.max(152 + moveAmp, Math.min(524 - moveAmp, baseY - 16)));
    if (baseY - prev.baseY < maxClimbForGap) {
      baseY = Math.round(Math.min(524 - moveAmp, prev.baseY + maxClimbForGap));
    }
  }

  // Compute distinct clear gaps for eng / mittel / weit while factoring in horizontal swing
  const prevRightExtent = prev.baseX + prev.width + (prev.kind === 'moving_x' ? prev.moveAmp : 0);
  const currLeftSwing = kind === 'moving_x' ? moveAmp : 0;

  let minClearGap: number;
  if (id === 1) {
    minClearGap = 114 + Math.random() * 24;
  } else if (kind === 'moving_x' || prev.kind === 'moving_x') {
    if (gapTier === 'short') {
      minClearGap = 42 + Math.random() * 16;
    } else if (gapTier === 'wide') {
      minClearGap = 98 + Math.random() * 28;
    } else {
      minClearGap = 66 + Math.random() * 24;
    }
  } else if (gapTier === 'short') {
    minClearGap = 50 + Math.random() * 26; // 50..76px: eng, aber mit sauberem Platz
  } else if (gapTier === 'wide') {
    minClearGap = 188 + progress * 10 + Math.random() * 28; // 188..226px: weit & physikalisch gut erreichbar
  } else {
    minClearGap = 112 + progress * 6 + Math.random() * 38; // 112..156px: mittel
  }

  const baseX = Math.round(prevRightExtent + minClearGap + currLeftSwing);
  const crumbleMax = 0.56 - progress * 0.28; // 0.56s early -> 0.28s later
  const speedMul = 0.92 + progress * 0.48;

  const moveSpeed =
    kind === 'moving_y'
      ? (2.9 + progress * 1.1 + Math.random() * 0.4) * speedMul
      : kind === 'moving_x'
        ? (1.8 + progress * 0.75 + Math.random() * 0.35) * speedMul
        : 0;

  const hasStairs =
    kind !== 'crumbling' && (prev.hasStairs ? Math.random() < 0.24 : Math.random() < 0.45);

  return {
    id,
    index: prev.index + 1,
    kind,
    baseX,
    x: baseX,
    baseY,
    y: baseY,
    width,
    height,
    openBottom: Math.random() < 0.36,
    hasStairs,
    scored: false,
    crumbleTriggered: false,
    crumbleTimer: crumbleMax,
    crumbleMax,
    shattered: false,
    shatterAge: 0,
    fallVy: 0,
    moveAmp,
    moveSpeed,
    movePhase: Math.random() * Math.PI * 2,
    gapTier,
  };
}
