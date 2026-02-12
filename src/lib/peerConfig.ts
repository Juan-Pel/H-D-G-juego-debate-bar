import { Peer, DataConnection } from 'peerjs';
import { v4 as uuidv4 } from 'uuid';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  points: number;
  connected: boolean;
}

export interface GameState {
  phase: 'lobby' | 'role-assignment' | 'topic-reveal' | 'debate' | 'dice-roll' | 'verdict' | 'scores' | 'game-over';
  players: Player[];
  currentRound: number;
  currentTopic: string;
  currentRoles: {
    god: string | null;
    hitler: string[];
    gandhi: string[];
  };
  diceResult: 'logic' | 'speed' | 'satire' | null;
  winner: string | null;
  targetScore: number;
  customTopics: string[];
  timeLeft: number;
  debateActive: boolean;
}

export interface Message {
  type: string;
  payload: any;
  senderId: string;
  timestamp: number;
}

export const createRoomId = (): string => {
  return uuidv4().substring(0, 8).toUpperCase();
};

export const createPeer = (id?: string): Peer => {
  const config = {
    debug: 2,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
    },
  };

  if (id) {
    return new Peer(id, config);
  }
  return new Peer(config);
};

export const broadcastState = (
  connections: DataConnection[],
  state: GameState,
  senderId: string
): void => {
  connections.forEach((conn) => {
    if (conn.open) {
      conn.send({
        type: 'STATE_UPDATE',
        payload: state,
        senderId,
        timestamp: Date.now(),
      });
    }
  });
};

export const sendAction = (
  connection: DataConnection,
  actionType: string,
  payload: any,
  senderId: string
): void => {
  if (connection && connection.open) {
    connection.send({
      type: actionType,
      payload,
      senderId,
      timestamp: Date.now(),
    });
  }
};
