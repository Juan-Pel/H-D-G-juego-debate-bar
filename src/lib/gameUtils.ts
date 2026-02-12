import { v4 as uuidv4 } from 'uuid';
import { GameState, Player } from './peerConfig';
import { ROLES, PHASES, DEBATE_TIME } from './constants';
import { getRandomTopic, shuffleTopics } from './topics';

export const createInitialGameState = (
  playerNames: string[],
  targetScore: number,
  customTopics: string[] = []
): GameState => {
  const players: Player[] = playerNames.map((name, index) => ({
    id: uuidv4(),
    name: name.trim(),
    isHost: index === 0,
    points: 0,
    connected: true,
  }));

  return {
    phase: PHASES.LOBBY,
    players,
    currentRound: 0,
    currentTopic: '',
    currentRoles: {
      god: null,
      hitler: [],
      gandhi: [],
    },
    diceResult: null,
    winner: null,
    targetScore,
    customTopics,
    timeLeft: DEBATE_TIME,
    debateActive: false,
  };
};

export const assignRoles = (state: GameState): GameState => {
  const players = [...state.players];
  const numPlayers = players.length;

  if (numPlayers < 3) return state;

  // Seleccionar Dios (rotatorio)
  const godIndex = state.currentRound % numPlayers;
  const godPlayer = players[godIndex];

  // Resto de jugadores
  const otherPlayers = players.filter((_, i) => i !== godIndex);

  // Dividir entre Hitler y Gandhi
  const halfIndex = Math.ceil(otherPlayers.length / 2);
  const hitlerPlayers = otherPlayers.slice(0, halfIndex);
  const gandhiPlayers = otherPlayers.slice(halfIndex);

  return {
    ...state,
    currentRoles: {
      god: godPlayer.id,
      hitler: hitlerPlayers.map(p => p.id),
      gandhi: gandhiPlayers.map(p => p.id),
    },
  };
};

export const selectTopic = (state: GameState): GameState => {
  const allTopics = shuffleTopics([
    ...state.customTopics,
    ...getRandomTopic([]).split('\n'),
  ].filter(t => t.length > 10));

  const topic = allTopics[Math.floor(Math.random() * allTopics.length)] || 
               "¿Deberían los perros tener derecho al voto?";

  return {
    ...state,
    currentTopic: topic,
  };
};

export const rollDice = (state: GameState): GameState => {
  const criteria = ['logic', 'speed', 'satire'] as const;
  const result = criteria[Math.floor(Math.random() * criteria.length)];

  return {
    ...state,
    diceResult: result,
  };
};

export const awardPoint = (state: GameState, winningTeam: 'hitler' | 'gandhi'): GameState => {
  const godId = state.currentRoles.god;
  if (!godId) return state;

  const updatedPlayers = state.players.map(player => {
    if (winningTeam === 'hitler' && state.currentRoles.hitler.includes(player.id)) {
      return { ...player, points: player.points + 1 };
    }
    if (winningTeam === 'gandhi' && state.currentRoles.gandhi.includes(player.id)) {
      return { ...player, points: player.points + 1 };
    }
    return player;
  });

  const winner = updatedPlayers
    .filter(p => p.points >= state.targetScore)
    .sort((a, b) => b.points - a.points)[0];

  return {
    ...state,
    players: updatedPlayers,
    winner: winner?.id || null,
    phase: winner ? PHASES.GAME_OVER : PHASES.SCORES,
  };
};

export const nextRound = (state: GameState): GameState => {
  const nextRoundNumber = state.currentRound + 1;

  return {
    ...state,
    currentRound: nextRoundNumber,
    phase: PHASES.ROLE_ASSIGNMENT,
    currentTopic: '',
    currentRoles: {
      god: null,
      hitler: [],
      gandhi: [],
    },
    diceResult: null,
    winner: null,
    timeLeft: DEBATE_TIME,
    debateActive: false,
  };
};

export const startTimer = (state: GameState): GameState => {
  return {
    ...state,
    debateActive: true,
    timeLeft: DEBATE_TIME,
  };
};

export const decrementTimer = (state: GameState): GameState => {
  if (state.timeLeft <= 0) {
    return {
      ...state,
      debateActive: false,
      timeLeft: 0,
    };
  }

  return {
    ...state,
    timeLeft: state.timeLeft - 1,
  };
};

export const stopTimer = (state: GameState): GameState => {
  return {
    ...state,
    debateActive: false,
  };
};

export const addCustomTopic = (state: GameState, topic: string): GameState => {
  if (!topic.trim() || topic.length < 5) return state;

  return {
    ...state,
    customTopics: [...state.customTopics, topic.trim()],
  };
};

export const addPlayer = (state: GameState, playerName: string): GameState => {
  if (state.players.length >= 8) return state;
  if (!playerName.trim()) return state;

  const newPlayer: Player = {
    id: uuidv4(),
    name: playerName.trim(),
    isHost: state.players.length === 0,
    points: 0,
    connected: true,
  };

  return {
    ...state,
    players: [...state.players, newPlayer],
  };
};

export const removePlayer = (state: GameState, playerId: string): GameState => {
  const updatedPlayers = state.players.filter(p => p.id !== playerId);
  
  // Asegurar que haya al menos un host
  if (updatedPlayers.length > 0 && !updatedPlayers.some(p => p.isHost)) {
    updatedPlayers[0].isHost = true;
  }

  return {
    ...state,
    players: updatedPlayers,
  };
};

export const setPhase = (state: GameState, phase: string): GameState => {
  return {
    ...state,
    phase: phase as any,
  };
};

export const getLeaderboard = (state: GameState): Player[] => {
  return [...state.players].sort((a, b) => b.points - a.points);
};

export const getRoleName = (playerId: string, state: GameState): string => {
  if (state.currentRoles.god === playerId) return ROLES.GOD;
  if (state.currentRoles.hitler.includes(playerId)) return ROLES.HITLER;
  if (state.currentRoles.gandhi.includes(playerId)) return ROLES.GANDHI;
  return '';
};

export const getTeamName = (playerId: string, state: GameState): string => {
  if (state.currentRoles.hitler.includes(playerId)) return 'Hitler';
  if (state.currentRoles.gandhi.includes(playerId)) return 'Gandhi';
  if (state.currentRoles.god === playerId) return 'Dios';
  return 'Espectador';
};

export const resetGame = (state: GameState): GameState => {
  return {
    ...state,
    phase: PHASES.LOBBY,
    currentRound: 0,
    currentTopic: '',
    currentRoles: {
      god: null,
      hitler: [],
      gandhi: [],
    },
    diceResult: null,
    winner: null,
    timeLeft: DEBATE_TIME,
    debateActive: false,
    players: state.players.map(p => ({ ...p, points: 0 })),
  };
};
