
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Player, RoundHistory, GameState, BetMode, BetConfig } from './types';
import { DEFAULT_COLORS, INITIAL_NAMES } from './constants';
import { 
  Trophy, RefreshCcw, UserPlus, Play, RotateCcw, 
  History, CheckCircle2, 
  ChevronRight, DollarSign, Settings2, AlertTriangle,
  Coins, User, ChevronDown, ChevronUp, BarChart3, Home as HomeIcon,
  ArrowLeft, Zap, Star, ShieldCheck, Link, Link2, Users, Users2, Copy, Check, PlusSquare, LogIn, Monitor, UserCheck
} from 'lucide-react';
import { Peer, DataConnection } from 'peerjs';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.HOME);
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [betConfig, setBetConfig] = useState<BetConfig>({ 
    mode: '9', 
    amounts: { 9: 100 }, 
    foul: 50,
    bigClear: 300,
    smallClear: 200
  });
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Player[]>([]);
  const [history, setHistory] = useState<RoundHistory[]>([]);
  const [commonPot, setCommonPot] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [availableBalls, setAvailableBalls] = useState<number[]>([]);

  // --- Multiplayer State ---
  const [peer, setPeer] = useState<Peer | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [mySlotId, setMySlotId] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');
  const connectionsRef = useRef<DataConnection[]>([]);

  // Sync state broadcast logic
  const broadcastState = useCallback(() => {
    if (!isHost || connectionsRef.current.length === 0) return;
    const state = {
      type: 'STATE_UPDATE',
      state: { gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, playerCount }
    };
    connectionsRef.current.forEach(conn => conn.send(state));
  }, [gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, isHost, playerCount]);

  useEffect(() => {
    if (isHost) broadcastState();
  }, [gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, broadcastState]);

  const handleIncomingData = useCallback((data: any) => {
    if (data.type === 'STATE_UPDATE') {
      setGameState(data.state.gameState);
      setBetConfig(data.state.betConfig);
      setPlayers(data.state.players);
      setCurrentOrder(data.state.currentOrder);
      setHistory(data.state.history);
      setCommonPot(data.state.commonPot);
      setAvailableBalls(data.state.availableBalls);
      setPlayerCount(data.state.playerCount);
    } else if (data.type === 'ACTION_REQUEST' && isHost) {
      if (data.action === 'FOUL') handleFoul(data.playerId);
      if (data.action === 'WIN') handleAction(data.playerId, data.ball, data.isCollectAll);
      if (data.action === 'CLEAR') handleClearTableAction(data.playerId, data.clearType);
      if (data.action === 'RESET') performReset(true);
      if (data.action === 'START') startGame();
      if (data.action === 'MODE_SELECT') handleBetModeSelect(data.mode);
      if (data.action === 'UPDATE_NAME') updatePlayerName(data.playerId, data.name);
      if (data.action === 'GO_SETUP') setGameState(GameState.SETUP);
    }
  }, [isHost]);

  const initHostPeer = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const newPeer = new Peer(`billiard-room-${code}`);
    
    newPeer.on('open', () => {
      setRoomCode(code);
      setPeer(newPeer);
      setIsHost(true);
      
      // Initialize players based on selected count
      const initialPlayers = Array.from({ length: playerCount }, (_, i) => ({
        id: `p${i}`,
        name: `球員 ${String.fromCharCode(65 + i)}`,
        color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        earnings: 0
      }));
      setPlayers(initialPlayers);
      setGameState(GameState.MODE_SELECT);
    });

    newPeer.on('connection', (conn) => {
      conn.on('open', () => {
        setConnections(prev => [...prev, conn]);
        connectionsRef.current = [...connectionsRef.current, conn];
        setIsConnected(true);
        conn.send({
          type: 'STATE_UPDATE',
          state: { gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, playerCount }
        });
      });
      conn.on('data', handleIncomingData);
    });

    newPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') initHostPeer();
      else alert('建立球桌失敗');
    });
  };

  const joinTable = () => {
    if (inputCode.length !== 4) return;
    setIsConnecting(true);
    const newPeer = new Peer();
    
    newPeer.on('open', () => {
      setPeer(newPeer);
      const conn = newPeer.connect(`billiard-room-${inputCode}`);
      
      conn.on('open', () => {
        setRoomCode(inputCode);
        setConnections([conn]);
        connectionsRef.current = [conn];
        setIsConnected(true);
        setIsHost(false);
        setIsConnecting(false);
      });

      conn.on('data', handleIncomingData);
      
      conn.on('error', () => {
        alert('找不到球桌');
        setIsConnecting(false);
        newPeer.destroy();
      });
    });
  };

  const requestAction = (actionData: any) => {
    if (isHost) return; // Host executes directly
    if (isConnected && connections[0]) {
      connections[0].send({ type: 'ACTION_REQUEST', ...actionData });
    }
  };

  const updatePlayerName = (id: string, name: string) => {
    if (!isHost && isConnected) {
      requestAction({ action: 'UPDATE_NAME', playerId: id, name });
      return;
    }
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };

  const handleBetModeSelect = (mode: BetMode) => {
    if (!isHost && isConnected) {
      requestAction({ action: 'MODE_SELECT', mode });
      return;
    }
    let initialAmounts: { [key: number]: number } = { 9: 100 };
    if (mode === '369') initialAmounts = { 3: 50, 6: 50, 9: 100 };
    if (mode === '59') initialAmounts = { 5: 50, 9: 100 };
    
    setBetConfig({ mode, amounts: initialAmounts, foul: 50, bigClear: 300, smallClear: 200 });
    setGameState(GameState.BET_CONFIG);
  };

  const startGame = () => {
    if (!isHost && isConnected) {
      requestAction({ action: 'START' });
      return;
    }
    setCurrentOrder([...players]);
    setGameState(GameState.PLAYING);
  };

  const performReset = (force = false) => {
    if (!isHost && isConnected) {
      if (window.confirm('請求重置遊戲？')) requestAction({ action: 'RESET' });
      return;
    }
    if (force || window.confirm('確定重置嗎？')) {
      setGameState(GameState.MODE_SELECT);
      setHistory([]);
      setCommonPot(0);
      setPlayers(prev => prev.map(p => ({ ...p, earnings: 0 })));
    }
  };

  const handleFoul = (playerId: string) => {
    if (!isHost && isConnected) {
      requestAction({ action: 'FOUL', playerId });
      return;
    }
    const player = players.find(p => p.id === playerId)!;
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, earnings: p.earnings - betConfig.foul } : p));
    setCommonPot(prev => prev + betConfig.foul);
    setHistory(prev => [{
      id: Date.now().toString(), timestamp: Date.now(), type: 'FOUL', fouler: player.name, amount: betConfig.foul
    }, ...prev]);
  };

  const triggerOrderChange = (winnerId: string) => {
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const winner = currentOrder[winnerIdx];
    const sitterIdx = (winnerIdx - 1 + currentOrder.length) % currentOrder.length;
    const sitter = currentOrder[sitterIdx];
    
    // Rotation logic: Winner is 1st, Sitter is 2nd, others follow in original relative order
    const remaining = currentOrder.filter(p => p.id !== winner.id && p.id !== sitter.id);
    const nextOrder = [winner, sitter, ...remaining];
    
    setCurrentOrder(nextOrder);
    setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
  };

  const handleAction = (winnerId: string, ball: number, isCollectAll: boolean = false) => {
    if (!isHost && isConnected) {
      requestAction({ action: 'WIN', playerId: winnerId, ball, isCollectAll });
      return;
    }
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const winner = currentOrder[winnerIdx];
    const amount = betConfig.amounts[ball] || 0;

    if (isCollectAll) {
      setPlayers(prev => prev.map(p => {
        if (p.id === winner.id) return { ...p, earnings: p.earnings + (amount * (players.length - 1)) };
        return { ...p, earnings: p.earnings - amount };
      }));
    } else {
      const sitterIdx = (winnerIdx - 1 + currentOrder.length) % currentOrder.length;
      const sitter = currentOrder[sitterIdx];
      setPlayers(prev => prev.map(p => {
        if (p.id === winner.id) return { ...p, earnings: p.earnings + amount };
        if (p.id === sitter.id) return { ...p, earnings: p.earnings - amount };
        return p;
      }));
    }

    if (ball === 9) triggerOrderChange(winnerId);
    else setAvailableBalls(prev => prev.filter(b => b !== ball));

    setHistory(prev => [{
      id: Date.now().toString(), timestamp: Date.now(), type: 'WIN', ball, winner: winner.name, 
      sitter: isCollectAll ? '全體' : currentOrder[(winnerIdx - 1 + currentOrder.length) % currentOrder.length].name, 
      amount: isCollectAll ? amount * (players.length - 1) : amount, isCollectAll
    } as any, ...prev]);
  };

  const handleClearTableAction = (winnerId: string, type: 'BIG_CLEAR' | 'SMALL_CLEAR') => {
    if (!isHost && isConnected) {
      requestAction({ action: 'CLEAR', playerId: winnerId, clearType: type });
      return;
    }
    const winner = currentOrder.find(p => p.id === winnerId)!;
    const amount = type === 'BIG_CLEAR' ? betConfig.bigClear : betConfig.smallClear;

    setPlayers(prev => prev.map(p => {
      if (p.id === winner.id) return { ...p, earnings: p.earnings + (amount * (players.length - 1)) };
      return { ...p, earnings: p.earnings - amount };
    }));

    triggerOrderChange(winnerId);
    setHistory(prev => [{
      id: Date.now().toString(), timestamp: Date.now(), type: type, winner: winner.name, 
      amount: amount * (players.length - 1), isCollectAll: true
    } as any, ...prev]);
  };

  const MoneyDisplay = ({ val }: { val: number }) => (
    <span className={`font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {val >= 0 ? '+' : ''}{val}
    </span>
  );

  const playerStats = useMemo(() => {
    const scoringBalls = Object.keys(betConfig.amounts).map(Number);
    return players.map(p => {
      const ballStats: { [key: string]: { win: number, sit: number, all: number } } = {};
      scoringBalls.forEach(ball => {
        ballStats[ball] = {
          win: history.filter(h => h.type === 'WIN' && h.ball === ball && h.winner === p.name && !h.isCollectAll).length,
          sit: history.filter(h => h.type === 'WIN' && h.ball === ball && h.sitter === p.name).length,
          all: history.filter(h => h.type === 'WIN' && h.ball === ball && h.winner === p.name && h.isCollectAll).length,
        };
      });
      return {
        ...p, ballStats,
        bigClearCount: history.filter(h => h.type === 'BIG_CLEAR' && h.winner === p.name).length,
        smallClearCount: history.filter(h => h.type === 'SMALL_CLEAR' && h.winner === p.name).length,
        foulCount: history.filter(h => h.type === 'FOUL' && h.fouler === p.name).length
      };
    });
  }, [players, history, betConfig.amounts]);

  // --- Render Sections ---

  if (gameState === GameState.HOME) {
    return (
      <div className="w-full max-w-4xl mx-auto min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans">
        <div className="text-center mb-16">
          <div className="p-5 bg-emerald-500/10 rounded-3xl inline-block mb-6 border border-emerald-500/20 shadow-2xl">
            <Coins className="w-12 h-12 text-emerald-400" />
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent mb-2">
            撞球追分 Pro
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs">P2P Real-time Sync</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          <div className="bg-slate-900/50 border border-slate-800 p-10 rounded-[3rem] shadow-2xl space-y-8">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                 <PlusSquare className="w-6 h-6 text-emerald-500" />
               </div>
               <h2 className="text-2xl font-black">開桌</h2>
            </div>
            
            <div className="space-y-4">
               <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">選擇人數</label>
               <div className="grid grid-cols-5 gap-2">
                 {[2, 3, 4, 5, 6].map(num => (
                   <button 
                    key={num} 
                    onClick={() => setPlayerCount(num)}
                    className={`py-3 rounded-xl font-black transition-all border ${playerCount === num ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}
                   >
                     {num}
                   </button>
                 ))}
               </div>
               <button onClick={initHostPeer} className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-black text-white transition-all shadow-xl active:scale-95">
                 建立球桌
               </button>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-10 rounded-[3rem] shadow-2xl space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
                <LogIn className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-black">加入球桌</h2>
            </div>
            <div className="space-y-4">
              <input 
                type="text" maxLength={4} placeholder="輸入 4 位數代碼" value={inputCode}
                onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 focus:ring-2 focus:ring-indigo-500 font-mono text-xl tracking-[0.5em] text-center"
              />
              <button onClick={joinTable} disabled={inputCode.length !== 4 || isConnecting} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-4 rounded-2xl font-black text-white transition-all flex items-center justify-center gap-3">
                {isConnecting ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
                連線
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Lobby for Joiners to pick slot and set name
  if (!isHost && isConnected && !mySlotId && gameState !== GameState.PLAYING) {
    return (
      <div className="w-full max-w-2xl mx-auto min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100">
        <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[3rem] w-full shadow-2xl space-y-8 animate-in zoom-in-95">
          <div className="text-center">
            <h2 className="text-2xl font-black mb-2">準備加入比賽</h2>
            <p className="text-slate-500 text-sm">請填寫名稱並選擇您的位置</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">您的名稱</label>
              <input 
                type="text" placeholder="例如: 撞球高手" value={tempName} onChange={(e) => setTempName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 focus:border-emerald-500 text-xl font-bold"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">選擇位置</label>
              <div className="grid grid-cols-2 gap-4">
                {players.map(p => (
                  <button 
                    key={p.id} onClick={() => setMySlotId(p.id)}
                    className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${mySlotId === p.id ? 'bg-emerald-500/10 border-emerald-500 shadow-lg' : 'bg-slate-950 border-slate-800 opacity-60'}`}
                  >
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="font-bold">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <button 
              disabled={!tempName || !mySlotId}
              onClick={() => {
                if (mySlotId && tempName) {
                  updatePlayerName(mySlotId, tempName);
                  // If host has already started, we just jump in. Otherwise wait.
                }
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 py-6 rounded-2xl font-black text-white text-lg disabled:opacity-30 transition-all"
            >
              進入球場
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto min-h-screen flex flex-col p-4 md:p-8 bg-slate-950 text-slate-100 font-sans">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setGameState(GameState.HOME)}>
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <Coins className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">撞球追分 Pro</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Table #{roomCode}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
             <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-500 uppercase">球桌號碼</span>
                  <span className="text-sm font-mono font-black text-emerald-400">{roomCode}</span>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <Users className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-black">{isHost ? connections.length + 1 : "已同步"}</span>
             </div>

             {gameState === GameState.PLAYING && (
              <div className="bg-slate-900 border border-slate-800 px-5 py-2 rounded-2xl flex items-center gap-3 shadow-xl">
                <span className="text-[8px] font-black text-amber-500 uppercase border-r border-slate-800 pr-3">公錢池</span>
                <span className="text-xl font-mono font-black text-amber-400">${commonPot}</span>
              </div>
             )}
          </div>
        </div>

        {gameState === GameState.PLAYING && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 flex items-center justify-center gap-3 shadow-2xl overflow-x-auto no-scrollbar">
            {currentOrder.map((p, i) => (
              <React.Fragment key={p.id}>
                <div className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all ${i === 0 ? 'bg-emerald-500/10 ring-1 ring-emerald-500 shadow-md' : 'bg-slate-950/40 border border-slate-800'}`}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className={`text-sm font-black whitespace-nowrap ${i === 0 ? 'text-emerald-400' : 'text-slate-300'}`}>{p.name}</span>
                </div>
                {i < currentOrder.length - 1 && <ChevronRight className="w-4 h-4 text-slate-800 flex-shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        )}
      </header>

      <main className="flex-grow">
        {gameState === GameState.MODE_SELECT && (
          <div className="max-w-4xl mx-auto space-y-12 py-12">
            <div className="text-center space-y-2">
              <h2 className="text-slate-500 text-sm font-black uppercase tracking-widest">模式選擇</h2>
              <p className="text-slate-400 text-sm">由房主決定規則</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { id: '369', label: '3, 6, 9 模式' },
                { id: '59', label: '5, 9 模式' },
                { id: '9', label: '單 9 模式' }
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => handleBetModeSelect(mode.id as BetMode)}
                  disabled={!isHost && isConnected}
                  className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] flex flex-col items-center gap-4 hover:border-emerald-500/50 transition-all active:scale-[0.97] disabled:opacity-50"
                >
                  <Trophy className="w-10 h-10 text-slate-600 group-hover:text-emerald-500" />
                  <span className="text-xl font-black">{mode.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === GameState.BET_CONFIG && (
          <div className="max-w-4xl mx-auto animate-in slide-in-from-right-8">
            <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <div className="flex items-center gap-4">
                <Settings2 className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-black">賭注金額 {!isHost && '(僅房主可修)'}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                   {Object.keys(betConfig.amounts).map(ball => (
                    <div key={ball} className="bg-slate-950 border border-slate-800 rounded-3xl p-5 flex items-center gap-6">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-slate-200 text-2xl">{ball}</div>
                      <input type="number" readOnly={!isHost} value={betConfig.amounts[Number(ball)]} 
                        onChange={(e) => setBetConfig({ ...betConfig, amounts: { ...betConfig.amounts, [Number(ball)]: Number(e.target.value) } })}
                        className="w-full bg-transparent focus:ring-0 text-3xl font-mono font-black"
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-3xl p-5 flex items-center gap-6">
                    <span className="text-sm font-black">罰金</span>
                    <input type="number" readOnly={!isHost} value={betConfig.foul} onChange={(e) => setBetConfig({...betConfig, foul: Number(e.target.value)})} className="w-full bg-transparent text-3xl font-mono font-black text-red-400" />
                  </div>
                </div>
              </div>
              <button 
                onClick={() => isHost ? setGameState(GameState.SETUP) : requestAction({action: 'GO_SETUP'})} 
                disabled={!isHost && isConnected}
                className="w-full bg-emerald-600 py-6 rounded-[2rem] font-black text-white shadow-xl disabled:opacity-50"
              >
                下一步：球員設定
              </button>
            </div>
          </div>
        )}

        {gameState === GameState.SETUP && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <div className="flex items-center gap-4">
                <UserCheck className="w-6 h-6 text-emerald-400" />
                <h2 className="text-xl font-black">球員名稱</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {players.map((p) => (
                  <div key={p.id} className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <input 
                      type="text" readOnly={!isHost && mySlotId !== p.id} value={p.name} 
                      onChange={(e) => updatePlayerName(p.id, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-5 pl-14 pr-6 font-black text-lg focus:border-emerald-500"
                    />
                  </div>
                ))}
              </div>
              <button onClick={startGame} className="w-full bg-indigo-600 py-6 rounded-[2rem] font-black text-white flex items-center justify-center gap-4">
                <Play className="w-7 h-7 fill-current" /> 開始比賽
              </button>
            </div>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {currentOrder.map((p, i) => (
                <div key={p.id} className={`p-6 rounded-[2rem] border flex flex-col justify-between min-h-[350px] transition-all shadow-xl ${i === 0 ? 'bg-emerald-500/10 border-emerald-500' : 'bg-slate-900/40 border-slate-800'}`}>
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</div>
                      <button onClick={() => handleFoul(p.id)} className="text-red-500/50 hover:text-red-500 p-2 rounded-xl transition-all">
                        <AlertTriangle className="w-5 h-5" />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-xl font-black">{p.name}</h3>
                      {/* Fixed: replaced undefined 'playerBalances' with 'p.earnings' */}
                      <MoneyDisplay val={p.earnings} />
                    </div>
                  </div>
                  
                  <div className="space-y-2 mt-6">
                    {i === 0 && (
                      <button onClick={() => handleClearTableAction(p.id, 'BIG_CLEAR')} className="w-full py-4 rounded-xl text-xs font-black bg-amber-500 text-white shadow-lg mb-2">
                        大摸 (${betConfig.bigClear * (players.length - 1)})
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {availableBalls.map(ball => (
                        <button key={ball} onClick={() => handleAction(p.id, ball, false)} className="py-4 rounded-xl text-sm font-black border border-slate-700 bg-slate-950 hover:bg-slate-800 transition-all">
                          進 {ball}
                        </button>
                      ))}
                    </div>
                    {i === 0 && (
                      <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
                         {availableBalls.map(ball => (
                          <button key={`all-${ball}`} onClick={() => handleAction(p.id, ball, true)} className="py-3 rounded-xl text-[10px] font-black bg-amber-500/10 border border-amber-500/30 text-amber-500">
                            {ball} 全收
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-6 mt-12">
              <button onClick={() => setGameState(GameState.SUMMARY)} className="flex-grow bg-slate-900 py-6 rounded-[2rem] font-black flex items-center justify-center gap-4 shadow-xl">
                <BarChart3 className="w-7 h-7 text-indigo-400" /> 結算統計
              </button>
              {isHost && (
                <button onClick={() => performReset(false)} className="flex-grow bg-red-600 py-6 rounded-[2rem] font-black text-white flex items-center justify-center gap-4 shadow-xl">
                  <HomeIcon className="w-7 h-7" /> 結束球局
                </button>
              )}
            </div>
          </div>
        )}

        {gameState === GameState.SUMMARY && (
          <div className="max-w-6xl mx-auto py-8">
            <div className="bg-slate-900/40 border border-slate-800 p-10 md:p-16 rounded-[4rem] space-y-12">
              <div className="text-center space-y-4">
                <Trophy className="w-16 h-16 text-amber-500 mx-auto" />
                <h2 className="text-3xl font-black">比賽結算</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Fixed: use spread to avoid mutating original state with sort() */}
                {[...players].sort((a, b) => b.earnings - a.earnings).map((p) => (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative">
                    <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: p.color }} />
                    <h3 className="font-black text-2xl mb-2">{p.name}</h3>
                    <MoneyDisplay val={p.earnings} />
                  </div>
                ))}
              </div>
              <div className="pt-12 flex flex-col gap-4 max-w-md mx-auto">
                <button onClick={() => setGameState(GameState.PLAYING)} className="w-full bg-slate-900 py-6 rounded-[2rem] font-black flex items-center justify-center gap-4"><ArrowLeft className="w-6 h-6" /> 返回計分</button>
                {isHost && <button onClick={() => performReset(true)} className="w-full bg-indigo-600 py-6 rounded-[2rem] font-black flex items-center justify-center gap-4"><HomeIcon className="w-6 h-6" /> 回到大廳</button>}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 py-8 text-center border-t border-slate-900 text-[10px] text-slate-700 font-black uppercase tracking-widest">
        Billiards Rotation Engine v4.0 (Sync & Dynamic Players)
      </footer>
    </div>
  );
};

export default App;
