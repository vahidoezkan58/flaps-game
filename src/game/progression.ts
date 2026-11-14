import { CharacterId } from './characters';

export const POINTS_PER_EARNED_COIN = 25;
export const MISSION_REWARD_COINS = 150;
export const MISSION_DOUBLE_DURATION = 10.0;

// Fixed Level-1 durations for everyone (no permanent multiplier or upgrades)
export const POWERUP_DURATIONS = {
  magnet: 6.0,
  double: 7.0,
  boost: 3.0,
} as const;

export type PowerUpType = keyof typeof POWERUP_DURATIONS;

export interface ActivePowerUpState {
  magnet: number;
  double: number;
  boost: number;
}

export interface CharacterShopPrice {
  coins: number;
  eurLabel: string;
}

export const CHARACTER_PRICES: Record<CharacterId, CharacterShopPrice> = {
  bunny: { coins: 0, eurLabel: 'Gratis' },
  frog: { coins: 3000, eurLabel: '2,99 €' },
  chick: { coins: 4200, eurLabel: '3,99 €' },
  custom: { coins: 5500, eurLabel: '4,99 €' },
  david: { coins: 7000, eurLabel: '5,99 €' },
  cat: { coins: 10000, eurLabel: '7,99 €' },
  crown: { coins: 15000, eurLabel: '9,99 €' },
};

export type BoardSkinId = 'classic' | 'neon' | 'rocket' | 'gold';

export interface BoardSkinDef {
  id: BoardSkinId;
  name: string;
  tagline: string;
  priceCoins: number;
  primaryColor: string;
  accentColor: string;
}

export const BOARD_SKINS: BoardSkinDef[] = [
  {
    id: 'classic',
    name: 'Standard-Brett',
    tagline: 'Schützt vor 1 Absturz',
    priceCoins: 0,
    primaryColor: '#22C55E',
    accentColor: '#FFFFFF',
  },
  {
    id: 'neon',
    name: 'Neon-Pixel-Board',
    tagline: 'Cyber-Glow beim Retten',
    priceCoins: 2000,
    primaryColor: '#38BDF8',
    accentColor: '#A855F7',
  },
  {
    id: 'rocket',
    name: 'Raketen-Flügel',
    tagline: 'Heißer Turbo-Schub',
    priceCoins: 5500,
    primaryColor: '#F97316',
    accentColor: '#FEF08A',
  },
  {
    id: 'gold',
    name: 'Gold-Surfbrett',
    tagline: 'Königlicher Rettungsflug',
    priceCoins: 11000,
    primaryColor: '#FACC15',
    accentColor: '#FEF9C3',
  },
];

export const BOARD_CHARGE_PRICE_SINGLE = 300;
export const BOARD_CHARGE_PRICE_PACK5 = 1250;

export interface CoinPackageDef {
  id: string;
  name: string;
  coins: number;
  priceEur: string;
  bonusLabel?: string;
  badge?: string;
  highlightNote: string;
}

export const COIN_PACKAGES: CoinPackageDef[] = [
  {
    id: 'mini',
    name: 'Rettungs-Beutel',
    coins: 1000,
    priceEur: '0,99 €',
    highlightNote: '3 Rettungs-Boards',
  },
  {
    id: 'char_pack',
    name: 'Charakter-Pack',
    coins: 3200,
    priceEur: '2,99 €',
    badge: 'BELIEBT',
    highlightNote: 'Reicht für Pixel-Frosch + Board',
  },
  {
    id: 'sprinter',
    name: 'Sprinter-Truhe',
    coins: 6500,
    priceEur: '4,99 €',
    bonusLabel: '+18 % Bonus',
    highlightNote: 'Eigenes Foto oder Turbo-Küken',
  },
  {
    id: 'vault',
    name: 'Profi-Tresor',
    coins: 15000,
    priceEur: '9,99 €',
    bonusLabel: '+50 % Bonus',
    highlightNote: 'Cyber-Katze oder Gold-Krone',
  },
  {
    id: 'jackpot',
    name: 'Königs-Jackpot',
    coins: 38000,
    priceEur: '19,99 €',
    bonusLabel: '+90 % Bonus',
    badge: 'BESTER WERT',
    highlightNote: 'Riesiger Vorrat für alles im Shop',
  },
];

export type MissionKind = 'coins' | 'skips' | 'crumble' | 'score' | 'powerups';

export interface MissionDef {
  id: string;
  kind: MissionKind;
  label: string;
  target: number;
  progress: number;
}

export type MissionEvent =
  | { type: 'coin'; amount: number }
  | { type: 'skip'; amount: number }
  | { type: 'crumble'; amount: number }
  | { type: 'powerup'; amount: number }
  | { type: 'score'; score: number };

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  coins: number;
  characterId: CharacterId;
  multiplier?: number;
  createdAt: number;
}

export interface PlayerProgression {
  playerName: string;
  coins: number;
  boardCharges: number;
  equippedBoardSkin: BoardSkinId;
  unlockedCharacters: CharacterId[];
  unlockedBoardSkins: BoardSkinId[];
  pendingDoubleSeconds: number;
  missionSetIndex: number;
  missions: MissionDef[];
  leaderboard: LeaderboardEntry[];
}

const PROGRESSION_STORAGE_KEY = 'flaps_progression_v1';

export function buildMissionsForSet(setIndex: number): MissionDef[] {
  const tier = Math.max(0, setIndex);
  const templates: Array<() => MissionDef> = [
    () => {
      const target = 8 + tier * 5;
      return {
        id: `m-${tier}-coins`,
        kind: 'coins',
        label: `Sammle ${target} Münzen`,
        target,
        progress: 0,
      };
    },
    () => {
      const target = 2 + Math.floor(tier * 1.2);
      return {
        id: `m-${tier}-skips`,
        kind: 'skips',
        label: `Schaffe ${target} SKIP-Sprünge`,
        target,
        progress: 0,
      };
    },
    () => {
      const target = 3 + tier * 2;
      return {
        id: `m-${tier}-crumble`,
        kind: 'crumble',
        label: `Lande ${target}× auf bröckelnden Steinen`,
        target,
        progress: 0,
      };
    },
    () => {
      const target = 40 + tier * 25;
      return {
        id: `m-${tier}-score`,
        kind: 'score',
        label: `Erreiche ${target} Punkte in einem Lauf`,
        target,
        progress: 0,
      };
    },
    () => {
      const target = 2 + Math.floor(tier * 0.8);
      return {
        id: `m-${tier}-powerups`,
        kind: 'powerups',
        label: `Aktiviere ${target} Power-Ups`,
        target,
        progress: 0,
      };
    },
  ];

  const picked: MissionDef[] = [];
  for (let i = 0; i < 3; i++) {
    const fn = templates[(tier * 2 + i) % templates.length];
    picked.push(fn());
  }
  return picked;
}

export function createDefaultProgression(): PlayerProgression {
  return {
    playerName: 'Spieler',
    coins: 0,
    boardCharges: 1, // 1 free starter rescue board so players feel the Subway Surfers save right away!
    equippedBoardSkin: 'classic',
    unlockedCharacters: ['bunny'],
    unlockedBoardSkins: ['classic'],
    pendingDoubleSeconds: 0,
    missionSetIndex: 0,
    missions: buildMissionsForSet(0),
    leaderboard: [],
  };
}

export function loadProgression(): PlayerProgression {
  const fallback = createDefaultProgression();
  try {
    const raw = window.localStorage.getItem(PROGRESSION_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayerProgression>;
    const unlockedCharacters = Array.isArray(parsed.unlockedCharacters)
      ? Array.from(new Set<CharacterId>(['bunny', ...parsed.unlockedCharacters]))
      : fallback.unlockedCharacters;
    const unlockedBoardSkins = Array.isArray(parsed.unlockedBoardSkins)
      ? Array.from(new Set<BoardSkinId>(['classic', ...parsed.unlockedBoardSkins]))
      : fallback.unlockedBoardSkins;
    const missions =
      Array.isArray(parsed.missions) && parsed.missions.length === 3
        ? parsed.missions
        : buildMissionsForSet(parsed.missionSetIndex ?? 0);

    return {
      playerName:
        typeof parsed.playerName === 'string' && parsed.playerName.trim()
          ? parsed.playerName.trim().slice(0, 16)
          : fallback.playerName,
      coins: typeof parsed.coins === 'number' && parsed.coins >= 0 ? Math.floor(parsed.coins) : 0,
      boardCharges:
        typeof parsed.boardCharges === 'number' && parsed.boardCharges >= 0
          ? Math.floor(parsed.boardCharges)
          : fallback.boardCharges,
      equippedBoardSkin:
        parsed.equippedBoardSkin && unlockedBoardSkins.includes(parsed.equippedBoardSkin)
          ? parsed.equippedBoardSkin
          : 'classic',
      unlockedCharacters,
      unlockedBoardSkins,
      pendingDoubleSeconds:
        typeof parsed.pendingDoubleSeconds === 'number' && parsed.pendingDoubleSeconds > 0
          ? Math.min(30, parsed.pendingDoubleSeconds)
          : 0,
      missionSetIndex:
        typeof parsed.missionSetIndex === 'number' && parsed.missionSetIndex >= 0
          ? Math.floor(parsed.missionSetIndex)
          : 0,
      missions,
      leaderboard: Array.isArray(parsed.leaderboard) ? parsed.leaderboard.slice(0, 10) : [],
    };
  } catch {
    return fallback;
  }
}

export function saveProgression(prog: PlayerProgression): void {
  try {
    window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(prog));
  } catch {
    // Ignore storage quota errors
  }
}

export interface GameSettings {
  musicMuted: boolean;
  jumpSfxMuted: boolean;
  sfxMuted: boolean;
  screenShake: boolean;
}

const SETTINGS_STORAGE_KEY = 'flaps_settings_v1';

export function createDefaultSettings(): GameSettings {
  return {
    musicMuted: false,
    jumpSfxMuted: false,
    sfxMuted: false,
    screenShake: true,
  };
}

export function loadSettings(): GameSettings {
  const fallback = createDefaultSettings();
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      musicMuted: Boolean(parsed.musicMuted),
      jumpSfxMuted: Boolean(parsed.jumpSfxMuted),
      sfxMuted: Boolean(parsed.sfxMuted),
      screenShake: typeof parsed.screenShake === 'boolean' ? parsed.screenShake : true,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

