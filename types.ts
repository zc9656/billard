
export interface Player {
  id: string;
  name: string;
  color: string;
  earnings: number;
}

export type BetMode = '369' | '59' | '9';

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
  type: 'WIN' | 'FOUL' | 'BIG_CLEAR' | 'SMALL_CLEAR';
  ball?: number;
  winner?: string;
  sitter?: string;
  fouler?: string;
  amount: number;
  potUpdate?: number;
  isCollectAll?: boolean;
}

export enum GameState {
  MODE_SELECT = 'MODE_SELECT',
  BET_CONFIG = 'BET_CONFIG',
  SETUP = 'SETUP',
  PLAYING = 'PLAYING',
  SUMMARY = 'SUMMARY'
}
