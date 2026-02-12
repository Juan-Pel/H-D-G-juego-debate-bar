// Tipos para el juego online

export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isConnected: boolean;
}

export interface GameState {
  phase: 'lobby' | 'roles' | 'topic' | 'debate' | 'dice' | 'sentence' | 'results' | 'gameover';
  players: Player[];
  currentRound: number;
  topic: string;
  godId: string | null;
  hitlerIds: string[];
  gandhiIds: string[];
  criterion: string | null;
  winner: 'hitler' | 'gandhi' | null;
  targetScore: number;
  timerRunning: boolean;
  timeLeft: number;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  isHost: boolean;
  myId: string;
  myName: string;
  connected: boolean;
  error: string | null;
}

// Mensajes P2P
export type MessageType = 
  | 'JOIN_REQUEST'
  | 'JOIN_ACCEPTED'
  | 'JOIN_REJECTED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'GAME_STATE'
  | 'START_GAME'
  | 'NEXT_PHASE'
  | 'ROLL_DICE'
  | 'SELECT_WINNER'
  | 'TIMER_UPDATE'
  | 'CHANGE_TOPIC';

export interface P2PMessage {
  type: MessageType;
  payload?: any;
  senderId?: string;
  senderName?: string;
}
