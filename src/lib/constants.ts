export const MESSAGE_TYPES = {
  // Conexión
  JOIN_REQUEST: 'JOIN_REQUEST',
  JOIN_RESPONSE: 'JOIN_RESPONSE',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  
  // Estado del juego
  STATE_UPDATE: 'STATE_UPDATE',
  GAME_START: 'GAME_START',
  
  // Acciones del juego
  ROLL_DICE: 'ROLL_DICE',
  SET_VERDICT: 'SET_VERDICT',
  NEXT_ROUND: 'NEXT_ROUND',
  END_GAME: 'END_GAME',
  TOPIC_CHANGE: 'TOPIC_CHANGE',
  
  // Control
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  RESET: 'RESET',
  
  // Errores
  ERROR: 'ERROR',
  DISCONNECT: 'DISCONNECT',
} as const;

export const ROLES = {
  GOD: 'Dios',
  HITLER: 'Hitler',
  GANDHI: 'Gandhi',
} as const;

export const DICE_CRITERIA = {
  LOGIC: 'Lógica',
  SPEED: 'Rapidez',
  SATIRE: 'Sátira',
} as const;

export const PHASES = {
  LOBBY: 'lobby',
  ROLE_ASSIGNMENT: 'role-assignment',
  TOPIC_REVEAL: 'topic-reveal',
  DEBATE: 'debate',
  DICE_ROLL: 'dice-roll',
  VERDICT: 'verdict',
  SCORES: 'scores',
  GAME_OVER: 'game-over',
} as const;

export const DEBATE_TIME = 60; // segundos

export const DEFAULT_TARGET_SCORES = [3, 5, 7, 10];

export const PEER_CONFIG = {
  host: '0.peerjs.com',
  port: 443,
  secure: true,
  path: '/',
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  },
};
