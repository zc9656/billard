
export interface Player {
  id: string;
  name: string;
  color: string;
  earnings: number;
  foulCount: number;
  totalFoulPaid: number;
  won5Count: number;
  lost5Count: number;
  won9Count: number;
  lost9Count: number;
}

export type BetMode = '369' | '59' | '9' | 'SEQUENCE';

export interface BetConfig {
  mode: BetMode;
  amounts: { [key: number]: number };
  foul: number;
  bigClear: number;
  smallClear: number;
}

export interface RoundHistory {
  id: string;
  timestamp: number;
  type: 'WIN' | 'FOUL' | 'BIG_CLEAR' | 'SMALL_CLEAR' | 'COLLECT_ALL';
  ball?: number;
  winnerName?: string;
  foulerName?: string;
  amount: number;
  playerBalances?: { [playerId: string]: number };
}

export interface GameSnapshot {
  players: Player[];
  currentOrder: Player[];
  commonPot: number;
  availableBalls: number[];
  vsMatrix: { [key: string]: { [key: string]: number } };
  currentRound: number;
  history: RoundHistory[];
}

export enum GameState {
  MODE_SELECT = 'MODE_SELECT',
  BET_CONFIG = 'BET_CONFIG',
  SETUP = 'SETUP',
  PLAYING = 'PLAYING',
  SUMMARY = 'SUMMARY'
}
