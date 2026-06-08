export interface Participant {
  id: string;
  nickname: string;
  zone: 'A' | 'B' | 'C';
  num: number; // 1 to 4 lucky/lucky point index
  joinedAt: number;
  isBot?: boolean;
  score?: number; // point integrity
}

export interface GameState {
  participants: Participant[];
  currentRound: number; // 0 = lobby, 1, 2, 3 = rounds, 4 = finished
  step: 'INTRO' | 'VOTING' | 'EJECTION' | 'TRADE_TIME' | 'FINISHED';
  timerStartTimestamp: number | null;
  timerDuration: number;
  timerActive: boolean;
  leaders: { A?: string; B?: string; C?: string };
  votes: { A?: 'BLUE' | 'RED'; B?: 'BLUE' | 'RED'; C?: 'BLUE' | 'RED' };
  ejected: { A?: string; B?: string; C?: string };
  transitionLogs: string[];
  systemSerialNum: number;
}
