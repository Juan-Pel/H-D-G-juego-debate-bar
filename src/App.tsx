import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { v4 as uuidv4 } from 'uuid';
import confetti from 'canvas-confetti';
import { getRandomTopic, getRandomCriterion, type Criterion } from './data/topics';

// ==================== TIPOS ====================
interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
}

type GamePhase = 'menu' | 'lobby' | 'roles' | 'topic' | 'dice' | 'debate' | 'sentence' | 'results' | 'gameover';

interface GameState {
  topicMode: TopicMode;
  customTopics: string[];
  phase: GamePhase;
  players: Player[];
  currentRound: number;
  topic: string;
  godId: string | null;
  hitlerIds: string[];
  gandhiIds: string[];
  criterion: Criterion | null;
  roundWinner: 'hitler' | 'gandhi' | null;
  targetScore: number;
  timeLeft: number;
  timerRunning: boolean;
  gameWinnerId: string | null;
}

interface P2PMessage {
  type: string;
  payload?: any;
}

// ==================== ESTADO INICIAL ====================
export type TopicMode = 'standard' | 'custom' | 'hybrid';

const initialTopicMode: TopicMode = 'standard';

const initialGameState: GameState = {
  topicMode: initialTopicMode,
  customTopics: [],
  phase: 'lobby',
  players: [],
  currentRound: 0,
  topic: '',
  godId: null,
  hitlerIds: [],
  gandhiIds: [],
  criterion: null,
  roundWinner: null,
  targetScore: 5,
  timeLeft: 60,
  timerRunning: false,
  gameWinnerId: null,
};

// ==================== UTILIDADES ====================
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function assignRoles(players: Player[], previousGodId: string | null): { godId: string; hitlerIds: string[]; gandhiIds: string[] } {
  const availableForGod = previousGodId 
    ? players.filter(p => p.id !== previousGodId)
    : players;
  
  const godPlayer = availableForGod.length > 0 
    ? availableForGod[Math.floor(Math.random() * availableForGod.length)]
    : players[Math.floor(Math.random() * players.length)];
  
  const others = players.filter(p => p.id !== godPlayer.id);
  const shuffled = [...others].sort(() => Math.random() - 0.5);
  const half = Math.ceil(shuffled.length / 2);
  
  return {
    godId: godPlayer.id,
    hitlerIds: shuffled.slice(0, half).map(p => p.id),
    gandhiIds: shuffled.slice(half).map(p => p.id),
  };
}

const parseCustomTopics = (input: string): string[] => {
  return input
    .split('\n')
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 5);
};

const getTopicForState = (state: GameState, exclude?: string): string => {
  const customTopics = state.customTopics.length ? state.customTopics : [];

  if (state.topicMode === 'standard') {
    return getRandomTopic(exclude);
  }

  if (state.topicMode === 'custom') {
    if (!customTopics.length) {
      return '🔥 Agrega temas personalizados al crear la sala';
    }
    let nextTopic = '';
    do {
      nextTopic = customTopics[Math.floor(Math.random() * customTopics.length)];
    } while (nextTopic === exclude && customTopics.length > 1);
    return nextTopic;
  }

  const standardTopic = getRandomTopic(exclude);
  if (!customTopics.length) {
    return standardTopic;
  }
  const customTopic = customTopics[Math.floor(Math.random() * customTopics.length)];
  return Math.random() > 0.5 ? standardTopic : customTopic;
};

// ==================== COMPONENTE PRINCIPAL ====================
export default function App() {
  // Estado de conexión
  const [screen, setScreen] = useState<'menu' | 'create' | 'join' | 'game' | 'rules'>('menu');
  const [myId, setMyId] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [connecting, setConnecting] = useState<boolean>(false);

  // Estado del juego
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [customTopicsInput, setCustomTopicsInput] = useState<string>('');
  const [selectedTopicMode, setSelectedTopicMode] = useState<TopicMode>('standard');

  // Referencias P2P
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ==================== FUNCIONES P2P ====================
  
  // Broadcast a todos los clientes (solo HOST)
  const broadcast = useCallback((message: P2PMessage) => {
    console.log('📤 Broadcasting:', message.type, 'to', connectionsRef.current.size, 'clients');
    connectionsRef.current.forEach((conn, peerId) => {
      if (conn.open) {
        conn.send(message);
        console.log('  → Sent to:', peerId);
      }
    });
  }, []);

  // Nota: sendToHost se implementará cuando los clientes envíen acciones al host
  void connectionsRef; // Usar la referencia para evitar warning

  // Sincronizar estado (HOST envía a todos)
  const syncState = useCallback((newState: GameState) => {
    setGameState(newState);
    if (isHost) {
      broadcast({ type: 'SYNC_STATE', payload: newState });
    }
  }, [isHost, broadcast]);

  const sendToHost = useCallback((payload: any) => {
    if (isHost) return;
    const conn = connectionsRef.current.get('host');
    if (conn?.open) {
      conn.send({ type: 'CLIENT_ACTION', payload: { ...payload, senderId: myId } });
    }
  }, [isHost, myId]);

  // ==================== CREAR SALA (HOST) ====================
  const createRoom = useCallback(() => {
    if (!myName.trim()) {
      setError('Ingresa tu nombre');
      return;
    }

    setConnecting(true);
    setError('');
    
    const odNewRoomCode = generateRoomCode();
    const odMyId = uuidv4();
    const topicModeToUse = selectedTopicMode;
    const parsedCustomTopics = parseCustomTopics(customTopicsInput);
    
    console.log('🏠 Creating room:', odNewRoomCode, 'My ID:', odMyId);
    
    const peer = new Peer(odNewRoomCode, {
      debug: 2,
    });

    peer.on('open', (id) => {
      console.log('✅ Peer opened with ID:', id);
      setRoomCode(id);
      setMyId(odMyId);
      setIsHost(true);
      setConnected(true);
      setConnecting(false);
      setScreen('game');
      
      // Crear jugador host
      const hostPlayer: Player = {
        id: odMyId,
        name: myName.trim(),
        score: 0,
        isHost: true,
      };
      
      setGameState({
        ...initialGameState,
        topicMode: topicModeToUse,
        customTopics: parsedCustomTopics,
        players: [hostPlayer],
      });
    });

    peer.on('connection', (conn) => {
      console.log('📥 New connection from:', conn.peer);
      
      conn.on('open', () => {
        console.log('✅ Connection opened with:', conn.peer);
      });
      
      conn.on('data', (data) => {
        const message = data as P2PMessage;
        console.log('📩 Received from', conn.peer, ':', message.type);
        
        if (message.type === 'JOIN_REQUEST') {
          const { playerId, playerName } = message.payload;
          console.log('👤 Join request from:', playerName);
          
          // Guardar conexión
          connectionsRef.current.set(playerId, conn);
          
          // Añadir jugador
          setGameState(prev => {
            const newPlayer: Player = {
              id: playerId,
              name: playerName,
              score: 0,
              isHost: false,
            };
            
            const newPlayers = [...prev.players, newPlayer];
            const newState = { ...prev, players: newPlayers };
            
            // Enviar confirmación al nuevo jugador
            conn.send({ type: 'JOIN_ACCEPTED', payload: newState });
            
            // Notificar a todos los demás
            connectionsRef.current.forEach((c, id) => {
              if (id !== playerId && c.open) {
                c.send({ type: 'SYNC_STATE', payload: newState });
              }
            });
            
            return newState;
          });
        }
        
        // Manejar otras acciones del cliente
        if (message.type === 'CLIENT_ACTION') {
          handleClientAction(message.payload, conn);
        }
      });
      
      conn.on('close', () => {
        console.log('❌ Connection closed:', conn.peer);
        // Remover jugador
        setGameState(prev => {
          const playerId = Array.from(connectionsRef.current.entries())
            .find(([, c]) => c === conn)?.[0];
          
          if (playerId) {
            connectionsRef.current.delete(playerId);
            const newPlayers = prev.players.filter(p => p.id !== playerId);
            const newState = { ...prev, players: newPlayers };
            broadcast({ type: 'SYNC_STATE', payload: newState });
            return newState;
          }
          return prev;
        });
      });
    });

    peer.on('error', (err) => {
      console.error('❌ Peer error:', err);
      setError('Error de conexión: ' + err.message);
      setConnecting(false);
    });

    peerRef.current = peer;
  }, [myName, broadcast]);

  // ==================== UNIRSE A SALA (CLIENTE) ====================
  const joinRoom = useCallback(() => {
    if (!myName.trim()) {
      setError('Ingresa tu nombre');
      return;
    }
    if (!joinCode.trim()) {
      setError('Ingresa el código de sala');
      return;
    }

    setConnecting(true);
    setError('');
    
    const odMyId = uuidv4();
    console.log('🔗 Joining room:', joinCode, 'My ID:', odMyId);
    
    const peer = new Peer(odMyId, {
      debug: 2,
    });

    peer.on('open', () => {
      console.log('✅ My peer opened, connecting to host...');
      
      const conn = peer.connect(joinCode.toUpperCase(), {
        reliable: true,
      });
      
      conn.on('open', () => {
        console.log('✅ Connected to host!');
        connectionsRef.current.set('host', conn);
        
        // Enviar solicitud de unión
        conn.send({
          type: 'JOIN_REQUEST',
          payload: {
            playerId: odMyId,
            playerName: myName.trim(),
          },
        });
      });
      
      conn.on('data', (data) => {
        const message = data as P2PMessage;
        console.log('📩 Received from host:', message.type);
        
        if (message.type === 'JOIN_ACCEPTED') {
          console.log('✅ Join accepted!');
          setMyId(odMyId);
          setRoomCode(joinCode.toUpperCase());
          setIsHost(false);
          setConnected(true);
          setConnecting(false);
          setScreen('game');
          setGameState(message.payload);
        }
        
        if (message.type === 'SYNC_STATE') {
          console.log('🔄 State synced');
          setGameState(message.payload);
          if (message.payload?.customTopics?.length) {
            setCustomTopicsInput(message.payload.customTopics.join('\n'));
          }
        }
      });
      
      conn.on('close', () => {
        console.log('❌ Disconnected from host');
        setError('Desconectado del host');
        setConnected(false);
      });
      
      conn.on('error', (err) => {
        console.error('❌ Connection error:', err);
        setError('Error de conexión');
        setConnecting(false);
      });
    });

    peer.on('error', (err) => {
      console.error('❌ Peer error:', err);
      setError('Error: ' + err.message);
      setConnecting(false);
    });

    peerRef.current = peer;
  }, [myName, joinCode]);

  // ==================== ACCIONES DEL JUEGO ====================
  
  const handleClientAction = useCallback((action: any, _conn: DataConnection) => {
    console.log('🎮 Client action:', action.type);

    setGameState((prev) => {
      let newState = prev;

      switch (action.type) {
        case 'ROLL_DICE': {
          if (prev.phase !== 'dice' || prev.criterion) return prev;
          const criterion = getRandomCriterion();
          newState = { ...prev, criterion };
          break;
        }
        case 'CHANGE_TOPIC': {
          if (prev.phase !== 'topic') return prev;
          const topic = getTopicForState(prev, prev.topic);
          newState = { ...prev, topic };
          break;
        }
        case 'NEXT_PHASE': {
          let updated = { ...prev };
          switch (prev.phase) {
            case 'roles':
              updated.phase = 'topic';
              updated.topic = getTopicForState(prev, prev.topic);
              break;
            case 'topic':
              updated.phase = 'dice';
              updated.criterion = null;
              break;
            case 'dice':
              if (prev.criterion) {
                updated.phase = 'debate';
                updated.timeLeft = 60;
                updated.timerRunning = true;
              }
              break;
            case 'debate':
              updated.phase = 'sentence';
              updated.timerRunning = false;
              break;
            case 'sentence':
              updated.phase = 'results';
              break;
            case 'results': {
              const winner = prev.players.find(p => p.score >= prev.targetScore);
              if (winner) {
                updated.phase = 'gameover';
                updated.gameWinnerId = winner.id;
              } else {
                const roles = assignRoles(prev.players, prev.godId);
                updated = {
                  ...updated,
                  phase: 'roles',
                  currentRound: prev.currentRound + 1,
                  ...roles,
                  topic: '',
                  criterion: null,
                  roundWinner: null,
                };
              }
              break;
            }
          }
          newState = updated;
          break;
        }
        case 'SELECT_WINNER': {
          if (prev.phase !== 'sentence') return prev;
          const winner = action.winner as 'hitler' | 'gandhi';
          const winnerIds = winner === 'hitler' ? prev.hitlerIds : prev.gandhiIds;
          const newPlayers = prev.players.map(p =>
            winnerIds.includes(p.id) ? { ...p, score: p.score + 1 } : p
          );
          newState = { ...prev, players: newPlayers, roundWinner: winner };
          break;
        }
        case 'START_GAME': {
          if (prev.players.length < 3) return prev;
          const roles = assignRoles(prev.players, null);
          newState = { ...prev, phase: 'roles', currentRound: 1, ...roles };
          break;
        }
        case 'SET_TARGET_SCORE': {
          newState = { ...prev, targetScore: action.value };
          break;
        }
        case 'RESTART_GAME': {
          const resetPlayers = prev.players.map(p => ({ ...p, score: 0 }));
          newState = { ...initialGameState, players: resetPlayers, phase: 'lobby', topicMode: prev.topicMode, customTopics: prev.customTopics };
          break;
        }
      }

      if (newState !== prev && isHost) {
        broadcast({ type: 'SYNC_STATE', payload: newState });
      }
      return newState;
    });
  }, [broadcast, isHost]);

  // Iniciar juego (solo HOST)
  const startGame = useCallback(() => {
    if (isHost) {
      if (gameState.players.length < 3) return;
      const roles = assignRoles(gameState.players, null);
      const newState: GameState = {
        ...gameState,
        phase: 'roles',
        currentRound: 1,
        ...roles,
      };
      syncState(newState);
    }
  }, [isHost, gameState, syncState]);

  // Siguiente fase
  const nextPhase = useCallback(() => {
    const isGod = gameState.godId === myId;
    if (isHost || isGod) {
      setGameState(prev => {
        let newState = { ...prev };
        
        switch (prev.phase) {
          case 'roles':
            newState.phase = 'topic';
            newState.topic = getTopicForState(prev, prev.topic);
            break;
          case 'topic':
            newState.phase = 'dice';
            newState.criterion = null;
            break;
          case 'dice':
            if (prev.criterion) {
              newState.phase = 'debate';
              newState.timeLeft = 60;
              newState.timerRunning = true;
            }
            break;
          case 'debate':
            newState.phase = 'sentence';
            newState.timerRunning = false;
            break;
          case 'sentence':
            newState.phase = 'results';
            break;
          case 'results':
            // Verificar si alguien ganó
            const winner = prev.players.find(p => p.score >= prev.targetScore);
            if (winner) {
              newState.phase = 'gameover';
              newState.gameWinnerId = winner.id;
            } else {
              // Nueva ronda
              const roles = assignRoles(prev.players, prev.godId);
              newState = {
                ...newState,
                phase: 'roles',
                currentRound: prev.currentRound + 1,
                ...roles,
                topic: '',
                criterion: null,
                roundWinner: null,
              };
            }
            break;
        }
        
        broadcast({ type: 'SYNC_STATE', payload: newState });
        return newState;
      });
    } else {
      sendToHost({ type: 'NEXT_PHASE' });
    }
  }, [isHost, broadcast, sendToHost, gameState.godId, myId]);

  // Tirar dado
  const rollDice = useCallback(() => {
    const isGod = gameState.godId === myId;
    if (isHost || isGod) {
      const criterion = getRandomCriterion();
      const newState = { ...gameState, criterion };
      syncState(newState);
    } else {
      sendToHost({ type: 'ROLL_DICE' });
    }
  }, [isHost, gameState, syncState, sendToHost, myId]);

  // Cambiar tema
  const changeTopic = useCallback(() => {
    const isGod = gameState.godId === myId;
    if (isHost || isGod) {
      const topic = getTopicForState(gameState, gameState.topic);
      const newState = { ...gameState, topic };
      syncState(newState);
    } else {
      sendToHost({ type: 'CHANGE_TOPIC' });
    }
  }, [isHost, gameState, syncState, sendToHost, myId]);

  // Seleccionar ganador de la ronda
  const selectWinner = useCallback((winner: 'hitler' | 'gandhi') => {
    if (isHost) {
      const winnerIds = winner === 'hitler' ? gameState.hitlerIds : gameState.gandhiIds;
      const newPlayers = gameState.players.map(p => 
        winnerIds.includes(p.id) ? { ...p, score: p.score + 1 } : p
      );
      
      const newState = {
        ...gameState,
        players: newPlayers,
        roundWinner: winner,
      };
      
      syncState(newState);
      
      // Ir a resultados después de un momento
      setTimeout(() => {
        nextPhase();
      }, 1500);
    } else {
      sendToHost({ type: 'SELECT_WINNER', winner });
    }
  }, [isHost, gameState, syncState, nextPhase, sendToHost]);

  // Reiniciar juego
  const restartGame = useCallback(() => {
    if (isHost) {
      const resetPlayers = gameState.players.map(p => ({ ...p, score: 0 }));
      const newState: GameState = {
        ...initialGameState,
        topicMode: gameState.topicMode,
        customTopics: gameState.customTopics,
        players: resetPlayers,
        phase: 'lobby',
      };
      
      syncState(newState);
    } else {
      sendToHost({ type: 'RESTART_GAME' });
    }
  }, [isHost, gameState, syncState, sendToHost]);

  // Timer para el debate
  useEffect(() => {
    if (gameState.timerRunning && gameState.timeLeft > 0 && isHost) {
      timerRef.current = setTimeout(() => {
        const newState = { ...gameState, timeLeft: gameState.timeLeft - 1 };
        if (newState.timeLeft === 0) {
          newState.timerRunning = false;
        }
        syncState(newState);
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState.timerRunning, gameState.timeLeft, isHost, gameState, syncState]);

  // Confetti al ganar
  useEffect(() => {
    if (gameState.phase === 'gameover') {
      confetti({
        particleCount: 200,
        spread: 90,
        origin: { x: 0.5, y: 0.6 },
      });
    }
  }, [gameState.phase]);

  // Cleanup
  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
      connectionsRef.current.clear();
    };
  }, []);

  // ==================== HELPERS DE RENDER ====================
  const getMyRole = (): 'god' | 'hitler' | 'gandhi' | null => {
    if (gameState.godId === myId) return 'god';
    if (gameState.hitlerIds.includes(myId)) return 'hitler';
    if (gameState.gandhiIds.includes(myId)) return 'gandhi';
    return null;
  };
  const getGodPlayer = () => gameState.players.find(p => p.id === gameState.godId);
  const getHitlerPlayers = () => gameState.players.filter(p => gameState.hitlerIds.includes(p.id));
  const getGandhiPlayers = () => gameState.players.filter(p => gameState.gandhiIds.includes(p.id));

  // ==================== RENDERIZADO ====================
  
  // Pantalla de menú
  if (screen === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-500 mb-4">
            DIOS, HITLER Y GANDHI
          </h1>
          <h2 className="text-xl md:text-2xl text-gray-300 mb-12">
            entran en un Bar... 🍺
          </h2>
          
          <div className="space-y-4">
            <button
              onClick={() => setScreen('create')}
              className="w-64 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xl font-bold rounded-xl shadow-lg transform hover:scale-105 transition-all"
            >
              🎮 CREAR SALA
            </button>
            
            <button
              onClick={() => setScreen('join')}
              className="w-64 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xl font-bold rounded-xl shadow-lg transform hover:scale-105 transition-all"
            >
              🔗 UNIRSE A SALA
            </button>

            <button
              onClick={() => setScreen('rules')}
              className="w-64 py-2 text-sm bg-gray-800/80 hover:bg-gray-700 text-gray-200 font-medium rounded-xl border border-gray-700/80"
            >
              📖 Ver reglas del juego
            </button>
          </div>
          
          <p className="mt-12 text-gray-500 text-sm">
            Party game de debate extremo • 3-8 jugadores
          </p>
        </div>
      </div>
    );
  }

  // Pantalla de reglas
  if (screen === 'rules') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl p-6 md:p-8 max-w-3xl w-full text-left space-y-4 text-gray-100 animate-fadeIn">
          <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            ¿Cómo se juega?
          </h2>
          <p className="text-sm md:text-base text-gray-300">
            "Dios, Hitler y Gandhi entran en un Bar..." es un party game de debate extremo. El azar decide qué postura defiendes, no tus valores reales. La idea es reírse, exagerar y despolarizar opiniones.
          </p>

          <ol className="list-decimal list-inside space-y-2 text-sm md:text-base">
            <li><span className="font-semibold text-yellow-300">Crear sala online:</span> una persona crea la sala y comparte el código. El resto se une con ese código.</li>
            <li><span className="font-semibold text-yellow-300">Roles:</span> en cada ronda se elige al azar a un <span className="text-yellow-300 font-semibold">Dios</span> (juez), un equipo <span className="text-red-400 font-semibold">Hitler</span> (atacan) y un equipo <span className="text-green-400 font-semibold">Gandhi</span> (defienden).</li>
            <li><span className="font-semibold text-yellow-300">Tema:</span> se revela un tema polémico/absurdo. No importa lo que pienses en realidad, defiende el rol que te tocó.</li>
            <li><span className="font-semibold text-yellow-300">Dado:</span> Dios tira el dado para elegir el criterio: <span className="font-semibold">Lógica</span>, <span className="font-semibold">Rapidez</span> o <span className="font-semibold">Sátira</span>.</li>
            <li><span className="font-semibold text-yellow-300">Debate:</span> equipos discuten durante ~60 segundos según el criterio.</li>
            <li><span className="font-semibold text-yellow-300">Sentencia:</span> Dios golpea el "martillo" (elige un equipo) y ellos ganan la ronda.</li>
          </ol>

          <p className="text-xs md:text-sm text-gray-400">
            Consejo: no hables como en Twitter. Exagera, sé irónico, usa humor negro si tu grupo está cómodo y recuerda que es un juego, no un debate serio.
          </p>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setScreen('menu')}
              className="px-5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm md:text-base text-gray-100"
            >
              ← Volver al menú
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla de crear sala
  if (screen === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 w-full max-w-md space-y-4">
          <h2 className="text-2xl font-bold text-white text-center">Crear Sala</h2>
          
          <input
            type="text"
            placeholder="Tu nombre"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
            maxLength={20}
          />

          {/* Modo de temas */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-sm text-gray-300 mb-2 font-semibold">Modo de temas</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {([
                { value: 'standard', label: 'Estándar' },
                { value: 'custom', label: 'Personalizado' },
                { value: 'hybrid', label: 'Híbrido' },
              ] as { value: TopicMode; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedTopicMode(opt.value)}
                  className={`py-2 px-2 rounded-lg font-semibold transition-all ${
                    selectedTopicMode === opt.value
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black'
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1 text-left">
              Estándar: temas del juego · Personalizado: solo los que escribas · Híbrido: mezcla de ambos
            </p>
          </div>

          {/* Temas personalizados (uno por línea) */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Temas personalizados (uno por línea)</label>
            <textarea
              value={customTopicsInput}
              onChange={(e) => setCustomTopicsInput(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-gray-700 text-sm text-gray-100 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-green-500/70 placeholder:text-gray-500"
              placeholder={"Ej:\n· Los perros deberían votar\n· Cancelar a alguien es justicia social"}
            />
          </div>
          
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          
          <button
            onClick={createRoom}
            disabled={connecting}
            className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl"
          >
            {connecting ? '⏳ Creando...' : '✨ Crear Sala'}
          </button>
          
          <button
            onClick={() => setScreen('menu')}
            className="w-full py-3 mt-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  // Pantalla de unirse a sala
  if (screen === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 w-full max-w-md">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Unirse a Sala</h2>
          
          <input
            type="text"
            placeholder="Tu nombre"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={20}
          />
          
          <input
            type="text"
            placeholder="Código de sala"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
            maxLength={6}
          />
          
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}
          
          <button
            onClick={joinRoom}
            disabled={connecting}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl"
          >
            {connecting ? '⏳ Conectando...' : '🔗 Unirse'}
          </button>
          
          <button
            onClick={() => setScreen('menu')}
            className="w-full py-3 mt-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  // ==================== PANTALLA DEL JUEGO ====================
  
  // Lobby - Esperando jugadores
  if (gameState.phase === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-block bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold px-6 py-2 rounded-full text-xl mb-4">
              CÓDIGO: {roomCode}
            </div>
            <p className="text-gray-400">Comparte este código con tus amigos</p>
          </div>
          
          {/* Jugadores */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6">
            <h3 className="text-xl font-bold text-white mb-4">
              Jugadores ({gameState.players.length}/8)
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-xl ${
                    player.id === myId 
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600' 
                      : 'bg-gray-700'
                  }`}
                >
                  <span className="text-white font-medium">
                    {player.name}
                    {player.isHost && ' 👑'}
                    {player.id === myId && ' (Tú)'}
                  </span>
                </div>
              ))}
              
              {/* Slots vacíos */}
              {Array.from({ length: Math.max(0, 3 - gameState.players.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="p-3 rounded-xl bg-gray-700/30 border-2 border-dashed border-gray-600">
                  <span className="text-gray-500">Esperando...</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Configuración (solo host) */}
          {isHost && (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6">
              <h3 className="text-lg font-bold text-white mb-4">Puntos para ganar</h3>
              <div className="flex gap-2">
                {[3, 5, 7, 10].map((score) => (
                  <button
                    key={score}
                    onClick={() => syncState({ ...gameState, targetScore: score })}
                    className={`flex-1 py-2 rounded-xl font-bold transition-all ${
                      gameState.targetScore === score
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black'
                        : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Botón de iniciar */}
          {isHost ? (
            <button
              onClick={startGame}
              disabled={gameState.players.length < 3}
              className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xl font-bold rounded-xl shadow-lg"
            >
              {gameState.players.length < 3 
                ? `Necesitas ${3 - gameState.players.length} jugador(es) más`
                : '🚀 INICIAR JUEGO'
              }
            </button>
          ) : (
            <div className="text-center text-gray-400">
              ⏳ Esperando que el host inicie el juego...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fase de roles
  if (gameState.phase === 'roles') {
    const myRole = getMyRole();
    const god = getGodPlayer();
    const hitlers = getHitlerPlayers();
    const gandhis = getGandhiPlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-2xl text-gray-400 mb-2">Ronda {gameState.currentRound}</h2>
          
          {/* Mi rol */}
          <div className={`text-6xl mb-4 ${
            myRole === 'god' ? 'animate-pulse' : ''
          }`}>
            {myRole === 'god' ? '⚖️' : myRole === 'hitler' ? '😈' : '🕊️'}
          </div>
          
          <h1 className={`text-4xl font-black mb-8 ${
            myRole === 'god' 
              ? 'text-yellow-400' 
              : myRole === 'hitler' 
                ? 'text-red-500' 
                : 'text-green-400'
          }`}>
            {myRole === 'god' ? '¡ERES DIOS!' : myRole === 'hitler' ? 'EQUIPO HITLER' : 'EQUIPO GANDHI'}
          </h1>
          
          <p className="text-gray-300 text-lg mb-8">
            {myRole === 'god' 
              ? 'Serás el juez de este debate. Tu palabra es ley.'
              : myRole === 'hitler'
                ? 'Debes ATACAR y OPONERTE al tema.'
                : 'Debes DEFENDER y APOYAR el tema.'
            }
          </p>
          
          {/* Todos los roles */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-yellow-500/20 rounded-xl p-4">
              <div className="text-2xl mb-2">⚖️</div>
              <div className="text-yellow-400 font-bold">DIOS</div>
              <div className="text-white">{god?.name}</div>
            </div>
            
            <div className="bg-red-500/20 rounded-xl p-4">
              <div className="text-2xl mb-2">😈</div>
              <div className="text-red-400 font-bold">HITLER</div>
              {hitlers.map(p => (
                <div key={p.id} className="text-white text-sm">{p.name}</div>
              ))}
            </div>
            
            <div className="bg-green-500/20 rounded-xl p-4">
              <div className="text-2xl mb-2">🕊️</div>
              <div className="text-green-400 font-bold">GANDHI</div>
              {gandhis.map(p => (
                <div key={p.id} className="text-white text-sm">{p.name}</div>
              ))}
            </div>
          </div>
          
          {isHost && (
            <button
              onClick={nextPhase}
              className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-xl font-bold rounded-xl shadow-lg"
            >
              Ver Tema →
            </button>
          )}
        </div>
      </div>
    );
  }

  // Fase de tema
  if (gameState.phase === 'topic') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-2xl text-gray-400 mb-8">El tema de debate es...</h2>
          
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-2xl p-8 mb-8 border border-yellow-500/30">
            <p className="text-3xl font-bold text-white leading-relaxed">
              "{gameState.topic}"
            </p>
          </div>
          
          <div className="flex gap-4 justify-center">
            {isHost && (
              <>
                <button
                  onClick={changeTopic}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl"
                >
                  🔄 Cambiar tema
                </button>
                <button
                  onClick={nextPhase}
                  className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold rounded-xl"
                >
                  Tirar Dado →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fase del dado
  if (gameState.phase === 'dice') {
    const isGod = gameState.godId === myId;
    const god = getGodPlayer();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-2xl text-gray-400 mb-4">Criterio de Victoria</h2>
          
          {!gameState.criterion ? (
            <>
              <div className="text-8xl mb-8 animate-bounce">🎲</div>
              
              {/* El HOST siempre puede tirar el dado (como backup/control) */}
              {isHost && (
                <div className="mb-4">
                  <button
                    onClick={rollDice}
                    className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black text-xl font-bold rounded-xl shadow-lg animate-pulse"
                  >
                    🎲 ¡TIRAR DADO!
                  </button>
                  {!isGod && (
                    <p className="text-xs text-gray-500 mt-2">(Tirando en nombre de {god?.name})</p>
                  )}
                </div>
              )}
              
              {/* Si NO eres host, muestra mensaje de espera */}
              {!isHost && (
                <p className="text-gray-400">
                  {isGod 
                    ? '⏳ El anfitrión tirará el dado por ti...' 
                    : `⏳ Esperando que ${god?.name} (Dios) tire el dado...`}
                </p>
              )}
            </>
          ) : (
            <>
              <div className={`text-8xl mb-4 ${
                gameState.criterion === 'LÓGICA' ? '🧠' :
                gameState.criterion === 'RAPIDEZ' ? '⚡' : '🎭'
              }`}>
                {gameState.criterion === 'LÓGICA' ? '🧠' :
                 gameState.criterion === 'RAPIDEZ' ? '⚡' : '🎭'}
              </div>
              
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-4">
                {gameState.criterion}
              </h1>
              
              <p className="text-gray-300 text-lg mb-8">
                {gameState.criterion === 'LÓGICA' && 'Gana el argumento mejor estructurado'}
                {gameState.criterion === 'RAPIDEZ' && 'Gana quien responda más rápido y ágil'}
                {gameState.criterion === 'SÁTIRA' && 'Gana el argumento más gracioso o absurdo'}
              </p>
              
              {isHost && (
                <button
                  onClick={nextPhase}
                  className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-xl font-bold rounded-xl shadow-lg"
                >
                  ¡COMENZAR DEBATE! →
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Fase de debate
  if (gameState.phase === 'debate') {
    const myRole = getMyRole();
    const progress = (gameState.timeLeft / 60) * 100;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Timer */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400">Tiempo restante</span>
              <span className={`text-3xl font-bold ${
                gameState.timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white'
              }`}>
                {gameState.timeLeft}s
              </span>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${
                  gameState.timeLeft <= 10 ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Criterio */}
          <div className="text-center mb-6">
            <span className="bg-yellow-500/20 text-yellow-400 px-4 py-2 rounded-full font-bold">
              Criterio: {gameState.criterion}
            </span>
          </div>

          {/* Tema */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 text-center">
            <p className="text-2xl font-bold text-white">"{gameState.topic}"</p>
          </div>

          {/* Equipos */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className={`rounded-2xl p-6 ${
              myRole === 'hitler' ? 'bg-red-500/30 ring-2 ring-red-500' : 'bg-red-500/20'
            }`}>
              <h3 className="text-xl font-bold text-red-400 mb-2">😈 HITLER - Atacan</h3>
              <p className="text-gray-300 text-sm mb-3">Argumentan EN CONTRA</p>
              {getHitlerPlayers().map(p => (
                <div key={p.id} className="text-white">{p.name}</div>
              ))}
            </div>
            
            <div className={`rounded-2xl p-6 ${
              myRole === 'gandhi' ? 'bg-green-500/30 ring-2 ring-green-500' : 'bg-green-500/20'
            }`}>
              <h3 className="text-xl font-bold text-green-400 mb-2">🕊️ GANDHI - Defienden</h3>
              <p className="text-gray-300 text-sm mb-3">Argumentan A FAVOR</p>
              {getGandhiPlayers().map(p => (
                <div key={p.id} className="text-white">{p.name}</div>
              ))}
            </div>
          </div>

          {/* Mi rol */}
          <div className="text-center">
            <p className={`text-lg ${
              myRole === 'god' ? 'text-yellow-400' :
              myRole === 'hitler' ? 'text-red-400' : 'text-green-400'
            }`}>
              {myRole === 'god' 
                ? '⚖️ Eres el juez. Escucha los argumentos...'
                : myRole === 'hitler'
                  ? '😈 ¡Ataca el tema! Argumenta en contra.'
                  : '🕊️ ¡Defiende el tema! Argumenta a favor.'
              }
            </p>
          </div>

          {/* Botón para terminar debate */}
          {isHost && gameState.timeLeft === 0 && (
            <button
              onClick={nextPhase}
              className="w-full mt-6 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-xl font-bold rounded-xl"
            >
              ⚖️ IR A SENTENCIA
            </button>
          )}
        </div>
      </div>
    );
  }

  // Fase de sentencia
  if (gameState.phase === 'sentence') {
    const isGod = gameState.godId === myId;
    const god = getGodPlayer();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-yellow-900/20 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-2xl">
          <div className="text-6xl mb-4">⚖️</div>
          <h1 className="text-4xl font-black text-yellow-400 mb-4">LA SENTENCIA</h1>
          
          <p className="text-gray-300 text-lg mb-2">
            Criterio: <span className="text-yellow-400 font-bold">{gameState.criterion}</span>
          </p>
          
          <p className="text-gray-400 mb-8">
            {isGod 
              ? '¡Tú decides quién gana esta ronda!' 
              : isHost 
                ? `Elige el ganador en nombre de ${god?.name} (Dios)`
                : `${god?.name} está deliberando...`}
          </p>
          
          {/* El HOST siempre puede elegir ganador (control del juego) */}
          {isHost ? (
            <div className="grid grid-cols-2 gap-6">
              <button
                onClick={() => selectWinner('hitler')}
                className="p-8 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 rounded-2xl transition-all transform hover:scale-105"
              >
                <div className="text-5xl mb-2">😈</div>
                <div className="text-2xl font-bold text-white">HITLER</div>
                <div className="text-red-200 text-sm">Ganan los atacantes</div>
              </button>
              
              <button
                onClick={() => selectWinner('gandhi')}
                className="p-8 bg-gradient-to-br from-green-600 to-green-800 hover:from-green-500 hover:to-green-700 rounded-2xl transition-all transform hover:scale-105"
              >
                <div className="text-5xl mb-2">🕊️</div>
                <div className="text-2xl font-bold text-white">GANDHI</div>
                <div className="text-green-200 text-sm">Ganan los defensores</div>
              </button>
            </div>
          ) : (
            <div className="animate-pulse text-gray-400">
              ⏳ Esperando la sentencia de {god?.name}...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fase de resultados
  if (gameState.phase === 'results') {
    const winnerTeam = gameState.roundWinner;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-2xl">
          <div className="text-8xl mb-4">
            {winnerTeam === 'hitler' ? '😈' : '🕊️'}
          </div>
          
          <h1 className={`text-4xl font-black mb-4 ${
            winnerTeam === 'hitler' ? 'text-red-500' : 'text-green-400'
          }`}>
            ¡GANA {winnerTeam === 'hitler' ? 'HITLER' : 'GANDHI'}!
          </h1>
          
          {/* Puntuaciones */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">Puntuaciones</h3>
            <div className="space-y-3">
              {gameState.players
                .sort((a, b) => b.score - a.score)
                .map((player, index) => (
                  <div key={player.id} className="flex items-center justify-between bg-gray-700/50 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''}
                      </span>
                      <span className="text-white font-medium">{player.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-yellow-400">{player.score}</span>
                      <span className="text-gray-400">/ {gameState.targetScore}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
          
          {isHost && (
            <button
              onClick={nextPhase}
              className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-xl font-bold rounded-xl shadow-lg"
            >
              Siguiente Ronda →
            </button>
          )}
        </div>
      </div>
    );
  }

  // Fase de game over
  if (gameState.phase === 'gameover') {
    const winner = gameState.players.find(p => p.id === gameState.gameWinnerId);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-yellow-900/30 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-2xl">
          <div className="text-8xl mb-4">🏆</div>
          
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-4">
            ¡{winner?.name.toUpperCase()} GANA!
          </h1>
          
          <p className="text-gray-300 text-xl mb-8">
            Con {winner?.score} puntos después de {gameState.currentRound} rondas
          </p>
          
          {/* Puntuaciones finales */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">Clasificación Final</h3>
            <div className="space-y-3">
              {gameState.players
                .sort((a, b) => b.score - a.score)
                .map((player, index) => (
                  <div key={player.id} className={`flex items-center justify-between rounded-xl p-4 ${
                    index === 0 ? 'bg-gradient-to-r from-yellow-500/30 to-orange-500/30 ring-2 ring-yellow-500' : 'bg-gray-700/50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </span>
                      <span className="text-white font-bold text-lg">{player.name}</span>
                    </div>
                    <span className="text-3xl font-black text-yellow-400">{player.score}</span>
                  </div>
                ))}
            </div>
          </div>
          
          {isHost && (
            <button
              onClick={restartGame}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white text-xl font-bold rounded-xl shadow-lg"
            >
              🔄 JUGAR DE NUEVO
            </button>
          )}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-white">Cargando...</p>
    </div>
  );
}
