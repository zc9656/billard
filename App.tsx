
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Player, RoundHistory, GameState, BetMode, BetConfig } from './types';
import { DEFAULT_COLORS, INITIAL_NAMES } from './constants';
import { 
  Trophy, RefreshCcw, UserPlus, Play, RotateCcw, 
  History, CheckCircle2, 
  ChevronRight, DollarSign, Settings2, AlertTriangle,
  Coins, User, ChevronDown, ChevronUp, BarChart3, Home as HomeIcon,
  ArrowLeft, Zap, Star, ShieldCheck, Link, Link2, Users, Users2, Copy, Check, PlusSquare, LogIn, Monitor
} from 'lucide-react';
import { Peer, DataConnection } from 'peerjs';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.HOME);
  const [betConfig, setBetConfig] = useState<BetConfig>({ 
    mode: '9', 
    amounts: { 9: 100 }, 
    foul: 50,
    bigClear: 300,
    smallClear: 200
  });
  const [players, setPlayers] = useState<Player[]>(
    INITIAL_NAMES.map((name, i) => ({ id: `p${i}`, name, color: DEFAULT_COLORS[i], earnings: 0 }))
  );
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
  const connectionsRef = useRef<DataConnection[]>([]);

  // Function to handle incoming data for both Host and Client
  const handleIncomingData = useCallback((data: any) => {
    if (data.type === 'STATE_UPDATE') {
      setGameState(data.state.gameState);
      setBetConfig(data.state.betConfig);
      setPlayers(data.state.players);
      setCurrentOrder(data.state.currentOrder);
      setHistory(data.state.history);
      setCommonPot(data.state.commonPot);
      setAvailableBalls(data.state.availableBalls);
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

  // Broadcaster for the Host
  const broadcastState = useCallback(() => {
    if (!isHost || connectionsRef.current.length === 0) return;
    const state = {
      type: 'STATE_UPDATE',
      state: { gameState, betConfig, players, currentOrder, history, commonPot, availableBalls }
    };
    connectionsRef.current.forEach(conn => conn.send(state));
  }, [gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, isHost]);

  useEffect(() => {
    if (isHost) broadcastState();
  }, [gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, broadcastState]);

  const initHostPeer = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const newPeer = new Peer(`billiard-room-${code}`);
    
    newPeer.on('open', () => {
      setRoomCode(code);
      setPeer(newPeer);
      setIsHost(true);
      setGameState(GameState.MODE_SELECT);
    });

    newPeer.on('connection', (conn) => {
      conn.on('open', () => {
        setConnections(prev => [...prev, conn]);
        connectionsRef.current = [...connectionsRef.current, conn];
        setIsConnected(true);
        // Initial state sync
        conn.send({
          type: 'STATE_UPDATE',
          state: { gameState, betConfig, players, currentOrder, history, commonPot, availableBalls }
        });
      });
      conn.on('data', handleIncomingData);
    });

    newPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Retry if code taken
        initHostPeer();
      } else {
        alert('建立球桌失敗，請重試');
      }
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
        alert('無法加入球桌，請檢查號碼是否正確');
        setIsConnecting(false);
        newPeer.destroy();
      });
    });
  };

  // --- Game Logic ---
  useEffect(() => {
    if (gameState === GameState.PLAYING || gameState === GameState.SETUP) {
      setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
    }
  }, [betConfig.mode, gameState]);

  const playerBalances = useMemo(() => {
    const balances: { [key: string]: number } = {};
    players.forEach(p => balances[p.id] = p.earnings);
    return balances;
  }, [players]);

  const requestAction = (actionData: any) => {
    if (isHost) {
      // Host handles it directly via specific functions below
    } else if (isConnected && connections[0]) {
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
      if (window.confirm('請求房主重置遊戲？')) requestAction({ action: 'RESET' });
      return;
    }
    if (force || window.confirm('確定要清除所有對局紀錄並回到首頁嗎？')) {
      setGameState(GameState.MODE_SELECT);
      setHistory([]);
      setCommonPot(0);
      setPlayers(prev => prev.map(p => ({ ...p, earnings: 0 })));
      setShowHistory(false);
    }
  };

  const handleReturnHome = () => {
    if (gameState === GameState.SUMMARY) performReset(true);
    else if (gameState === GameState.PLAYING) performReset(false);
    else setGameState(GameState.MODE_SELECT);
  };

  const handleFoul = (playerId: string) => {
    if (!isHost && isConnected) {
      requestAction({ action: 'FOUL', playerId });
      return;
    }
    const player = players.find(p => p.id === playerId)!;
    const foulAmount = betConfig.foul;
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, earnings: p.earnings - foulAmount } : p));
    setCommonPot(prev => prev + foulAmount);
    setHistory(prev => [{
      id: Date.now().toString(), timestamp: Date.now(), type: 'FOUL', fouler: player.name, amount: foulAmount, potUpdate: foulAmount
    }, ...prev]);
  };

  const triggerOrderChange = (winnerId: string) => {
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const winner = currentOrder[winnerIdx];
    const sitterIdx = (winnerIdx - 1 + 4) % 4;
    const sitter = currentOrder[sitterIdx];
    const sitterPredecessorIdx = (sitterIdx - 1 + 4) % 4;
    const sitterPredecessor = currentOrder[sitterPredecessorIdx];
    const bystander = currentOrder.find(p => p.id !== winner.id && p.id !== sitter.id && p.id !== sitterPredecessor.id)!;

    const nextOrder = [winner, sitter, bystander, sitterPredecessor];
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
        if (p.id === winner.id) return { ...p, earnings: p.earnings + (amount * 3) };
        return { ...p, earnings: p.earnings - amount };
      }));
    } else {
      const sitterIdx = (winnerIdx - 1 + 4) % 4;
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
      id: Date.now().toString(), timestamp: Date.now(), type: 'WIN', ball, winner: winner.name, sitter: isCollectAll ? '全體' : currentOrder[(winnerIdx - 1 + 4) % 4].name, amount: isCollectAll ? amount * 3 : amount, isCollectAll
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
      if (p.id === winner.id) return { ...p, earnings: p.earnings + (amount * 3) };
      return { ...p, earnings: p.earnings - amount };
    }));

    triggerOrderChange(winnerId);
    setHistory(prev => [{
      id: Date.now().toString(), timestamp: Date.now(), type: type, winner: winner.name, amount: amount * 3, isCollectAll: true
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

  // Render Logic
  if (gameState === GameState.HOME) {
    return (
      <div className="w-full max-w-4xl mx-auto min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="p-5 bg-emerald-500/10 rounded-3xl inline-block mb-6 border border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
            <Coins className="w-12 h-12 text-emerald-400" />
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-br from-white via-slate-300 to-slate-500 bg-clip-text text-transparent mb-2">
            撞球追分 Pro
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs">Multiplayer Rotation Tracker</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full animate-in zoom-in-95 duration-500 delay-150">
          <button 
            onClick={initHostPeer}
            className="group relative bg-slate-900/50 border border-slate-800 p-10 rounded-[3rem] hover:border-emerald-500/50 hover:bg-slate-900 transition-all text-left shadow-2xl active:scale-95 overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
              <PlusSquare className="w-24 h-24 text-emerald-500" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-500 transition-colors">
                <PlusSquare className="w-6 h-6 text-emerald-500 group-hover:text-white" />
              </div>
              <h2 className="text-2xl font-black mb-2">開桌</h2>
              <p className="text-slate-500 text-sm leading-relaxed">建立一個新的比賽房間，並獲得 4 位數球桌代碼讓好友加入。</p>
            </div>
          </button>

          <div className="bg-slate-900/50 border border-slate-800 p-10 rounded-[3rem] hover:border-indigo-500/50 hover:bg-slate-900 transition-all shadow-2xl">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
              <LogIn className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-black mb-4">加入球桌</h2>
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  maxLength={4} 
                  placeholder="輸入 4 位數代碼" 
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:outline-none font-mono text-xl tracking-[0.5em] text-center"
                />
              </div>
              <button 
                onClick={joinTable}
                disabled={inputCode.length !== 4 || isConnecting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-2xl font-black text-white transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95"
              >
                {isConnecting ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
                {isConnecting ? '連線中...' : '即刻連線'}
              </button>
            </div>
          </div>
        </div>

        <footer className="mt-20 opacity-30">
          <p className="text-[10px] font-black uppercase tracking-[0.5em]">P2P Synchronized Engine v3.0</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto min-h-screen flex flex-col p-4 md:p-8 lg:p-12 bg-slate-950 text-slate-100 font-sans transition-all duration-500">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
          <div className="flex items-center gap-4 cursor-pointer group transition-all" onClick={() => setGameState(GameState.HOME)}>
            <div className="p-3 bg-emerald-500/10 rounded-2xl group-hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
              <Coins className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
                撞球追分 Pro
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Table #{roomCode}</p>
                {isConnected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto justify-center sm:justify-end">
             {/* Room Info Badge */}
             <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">球桌號碼</span>
                  <span className="text-sm font-mono font-black text-emerald-400 tracking-widest">{roomCode}</span>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-black">{isHost ? connections.length + 1 : 2}</span>
                </div>
                {isHost && (
                  <button 
                    onClick={() => { navigator.clipboard.writeText(roomCode); alert('代碼已複製'); }}
                    className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                )}
             </div>

             {(gameState === GameState.PLAYING || gameState === GameState.SUMMARY) && (
              <div className="bg-slate-900 border border-slate-800 px-5 py-2 rounded-2xl flex items-center gap-3 shadow-xl">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest border-r border-slate-800 pr-3">公錢池</span>
                <span className="text-xl font-mono font-black text-amber-400">${commonPot}</span>
              </div>
             )}
             
             {gameState === GameState.PLAYING && isHost && (
               <button onClick={() => performReset(false)} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-2xl text-slate-500 hover:text-red-400 transition-all border border-slate-800 shadow-lg group">
                 <RotateCcw className="w-5 h-5 group-active:rotate-180 transition-transform duration-500" />
               </button>
             )}
          </div>
        </div>

        {gameState === GameState.PLAYING && (
          <div className="bg-slate-900/40 border border-slate-800/60 backdrop-blur-sm rounded-3xl p-5 flex items-center justify-center gap-3 shadow-2xl overflow-x-auto no-scrollbar">
            {currentOrder.map((p, i) => (
              <React.Fragment key={p.id}>
                <div className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all ${i === 0 ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-slate-950/40'}`}>
                  <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.1)] border-2 border-white/10" style={{ backgroundColor: p.color }} />
                  <span className={`text-sm font-black whitespace-nowrap ${i === 0 ? 'text-emerald-400' : 'text-slate-300'}`}>{p.name}</span>
                </div>
                {i < currentOrder.length - 1 && <ChevronRight className="w-5 h-5 text-slate-800 flex-shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        )}
      </header>

      <main className="flex-grow">
        {gameState === GameState.MODE_SELECT && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in zoom-in-95 duration-500 py-12">
            <div className="text-center space-y-2">
              <h2 className="text-slate-500 text-sm font-black uppercase tracking-[0.3em]">Game Mode Select</h2>
              <p className="text-slate-400 text-sm">選擇本局的得分球號規則</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { id: '369', label: '3, 6, 9 模式', desc: '適合高手對決' },
                { id: '59', label: '5, 9 模式', desc: '標準追分規則' },
                { id: '9', label: '單 9 模式', desc: '純技術比拚' }
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => handleBetModeSelect(mode.id as BetMode)}
                  disabled={!isHost && isConnected}
                  className="bg-slate-900/40 border border-slate-800/80 p-8 rounded-[2.5rem] flex flex-col items-center text-center gap-6 hover:border-emerald-500/40 hover:bg-slate-900 transition-all group active:scale-[0.97] shadow-2xl relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-16 h-16 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800 group-hover:border-emerald-500/30 transition-colors">
                    <Trophy className="w-8 h-8 text-slate-600 group-hover:text-emerald-500 transition-colors" />
                  </div>
                  <div>
                    <span className="block text-xl font-black text-slate-100 mb-2">{mode.label}</span>
                    <span className="block text-xs text-slate-500 font-bold uppercase tracking-wider">{mode.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === GameState.BET_CONFIG && (
          <div className="max-w-4xl mx-auto animate-in slide-in-from-right-8 duration-500">
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-indigo-500/10 rounded-2xl"><Settings2 className="w-6 h-6 text-indigo-400" /></div>
                <h2 className="text-xl font-black">賭注金額配置 {!isHost && isConnected && '(僅房主可修改)'}</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                   <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">進球賞金</h3>
                   {Object.keys(betConfig.amounts).map(ball => (
                    <div key={ball} className="bg-slate-950/60 border border-slate-800/50 rounded-3xl p-5 flex items-center gap-6 group">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center font-black border border-slate-800 text-slate-200 text-2xl shadow-inner group-hover:text-emerald-400">
                        {ball}
                      </div>
                      <div className="relative flex-grow">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-600" />
                        <input
                          type="number" readOnly={!isHost && isConnected}
                          value={betConfig.amounts[Number(ball)]}
                          onChange={(e) => setBetConfig({
                            ...betConfig, amounts: { ...betConfig.amounts, [Number(ball)]: Number(e.target.value) }
                          })}
                          className="w-full bg-transparent border-none py-3 pl-12 focus:ring-0 text-3xl font-mono font-black text-slate-100"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                   <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest px-2">摸球與罰金</h3>
                   <div className="grid grid-cols-1 gap-4">
                      <div className="bg-slate-950/60 border border-slate-800/50 rounded-3xl p-5 flex items-center gap-6 group">
                        <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center font-black border border-slate-800 text-slate-200 text-sm group-hover:text-amber-400">大摸</div>
                        <input type="number" readOnly={!isHost && isConnected} value={betConfig.bigClear} onChange={(e) => setBetConfig({...betConfig, bigClear: Number(e.target.value)})} className="w-full bg-transparent border-none py-3 focus:ring-0 text-3xl font-mono font-black text-slate-100" />
                      </div>
                      <div className="bg-slate-950/60 border border-slate-800/50 rounded-3xl p-5 flex items-center gap-6 group">
                        <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center font-black border border-slate-800 text-slate-200 text-sm group-hover:text-indigo-400">小摸</div>
                        <input type="number" readOnly={!isHost && isConnected} value={betConfig.smallClear} onChange={(e) => setBetConfig({...betConfig, smallClear: Number(e.target.value)})} className="w-full bg-transparent border-none py-3 focus:ring-0 text-3xl font-mono font-black text-slate-100" />
                      </div>
                      <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-5 flex items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
                        <input type="number" readOnly={!isHost && isConnected} value={betConfig.foul} onChange={(e) => setBetConfig({...betConfig, foul: Number(e.target.value)})} className="w-full bg-transparent border-none py-3 focus:ring-0 text-3xl font-mono font-black text-red-400" />
                      </div>
                   </div>
                </div>
              </div>
              
              <button 
                onClick={() => isHost || !isConnected ? setGameState(GameState.SETUP) : requestAction({action: 'GO_SETUP'})} 
                disabled={!isHost && isConnected}
                className="w-full bg-emerald-600 hover:bg-emerald-500 py-6 rounded-[2rem] font-black text-white transition-all shadow-xl shadow-emerald-600/20 active:scale-95 text-lg uppercase tracking-widest mt-8 disabled:opacity-50"
              >
                Continue to Players
              </button>
            </div>
          </div>
        )}

        {gameState === GameState.SETUP && (
          <div className="max-w-2xl mx-auto animate-in slide-in-from-right-8 duration-500">
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-emerald-500/10 rounded-2xl"><UserPlus className="w-6 h-6 text-emerald-400" /></div>
                <h2 className="text-xl font-black">設定球員名稱</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {players.map((p) => (
                  <div key={p.id} className="relative group">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ backgroundColor: p.color }} />
                    <input type="text" readOnly={!isHost && isConnected} value={p.name} onChange={(e) => updatePlayerName(p.id, e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-3xl py-6 pl-16 pr-6 focus:border-emerald-500/50 focus:bg-slate-900 focus:outline-none text-slate-100 font-black text-xl transition-all shadow-inner" />
                  </div>
                ))}
              </div>
              <button 
                onClick={startGame} 
                disabled={!isHost && isConnected}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-6 rounded-[2rem] font-black text-white transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-4 active:scale-95 text-lg uppercase tracking-widest"
              >
                <Play className="w-7 h-7 fill-current" /> Start Match
              </button>
            </div>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {currentOrder.map((p, i) => (
                <div key={p.id} className={`p-6 rounded-[2.5rem] border backdrop-blur-sm transition-all shadow-2xl flex flex-col justify-between min-h-[380px] ${i === 0 ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' : 'bg-slate-900/40 border-slate-800'}`}>
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${i === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</div>
                      <button onClick={() => handleFoul(p.id)} className="text-red-500/40 hover:text-red-500 p-2.5 rounded-2xl transition-all flex items-center gap-2 bg-red-500/5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Foul</span>
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xl font-black ${i === 0 ? 'text-emerald-400' : 'text-slate-100'}`}>{p.name}</span>
                        {i === 0 && <span className="text-[8px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">開球</span>}
                        {i === 1 && <span className="text-[8px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">第二</span>}
                      </div>
                      <div className="text-sm font-bold opacity-80"><MoneyDisplay val={playerBalances[p.id]} /></div>
                    </div>
                  </div>
                  <div className="space-y-3 mt-6">
                    {(i === 0 || i === 1) && (
                       <div className="mb-2">
                          {i === 0 && (
                             <button onClick={() => handleClearTableAction(p.id, 'BIG_CLEAR')} className="w-full py-4 rounded-xl text-[11px] font-black bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2">
                               <Star className="w-4 h-4 fill-current" /> 大摸 (${betConfig.bigClear * 3})
                             </button>
                          )}
                          {i === 1 && (
                             <button onClick={() => handleClearTableAction(p.id, 'SMALL_CLEAR')} className="w-full py-4 rounded-xl text-[11px] font-black bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2">
                               <Star className="w-4 h-4 fill-current" /> 小摸 (${betConfig.smallClear * 3})
                             </button>
                          )}
                       </div>
                    )}
                    <div className={`grid ${availableBalls.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                      {availableBalls.map(ball => (
                        <button key={ball} onClick={() => handleAction(p.id, ball, false)} className={`py-4 rounded-xl text-sm font-black border transition-all active:scale-[0.95] shadow-md flex items-center justify-center gap-1 ${ball === 9 ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500' : 'bg-slate-950/80 border-slate-700/50 text-slate-300 hover:bg-slate-800'}`}>
                          進 {ball}
                        </button>
                      ))}
                    </div>
                    {i === 0 && (
                      <div className={`grid ${availableBalls.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-2 border-t border-slate-800 pt-3`}>
                         {availableBalls.map(ball => (
                          <button key={`all-${ball}`} onClick={() => handleAction(p.id, ball, true)} className="py-3 rounded-xl text-[10px] font-black bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20 transition-all flex items-center justify-center gap-1">
                            <Zap className="w-3 h-3" /> {ball} 全收
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <button onClick={() => setShowHistory(!showHistory)} className="w-full flex items-center justify-between p-6 bg-slate-900/40 border border-slate-800/80 rounded-[2rem] hover:bg-slate-900 transition-all shadow-xl group">
                <div className="flex items-center gap-4 text-slate-400 group-hover:text-slate-200 transition-colors">
                  <History className="w-5 h-5" />
                  <span className="text-sm font-black uppercase tracking-widest">Match History ({history.length})</span>
                </div>
                {showHistory ? <ChevronDown className="w-5 h-5 text-slate-600" /> : <ChevronUp className="w-5 h-5 text-slate-600" />}
              </button>
              {showHistory && (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2 no-scrollbar animate-in slide-in-from-top-4 duration-500">
                  {history.length === 0 ? (
                    <div className="text-center py-10 text-slate-700 bg-slate-900/20 rounded-3xl border border-dashed border-slate-800"><p className="text-xs font-black uppercase tracking-widest italic opacity-50">No history yet</p></div>
                  ) : (
                    history.map(h => (
                      <div key={h.id} className="bg-slate-950/60 border border-slate-900/50 p-4 rounded-2xl flex justify-between items-center group transition-colors hover:bg-slate-900">
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${h.type === 'FOUL' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                          <div className="text-[11px] font-bold">
                            {h.type === 'FOUL' ? <span className="text-red-400/90">Penalty: {h.fouler}</span> : 
                             h.type === 'BIG_CLEAR' ? <span className="text-amber-400 font-black">大摸 by {h.winner}</span> :
                             h.type === 'SMALL_CLEAR' ? <span className="text-indigo-400 font-black">小摸 by {h.winner}</span> :
                             <span className="text-slate-300"><span className="text-emerald-400">{h.winner}</span> scored {h.ball} {h.isCollectAll && <span className="text-amber-500 font-black ml-1">[全收]</span>} <span className="text-slate-600 mx-1">/</span> {h.sitter}</span>}
                          </div>
                        </div>
                        <span className={`text-[11px] font-mono font-black ${h.type === 'FOUL' ? 'text-amber-500' : 'text-slate-500'}`}>{h.type === 'FOUL' ? `+${h.amount}` : `$${h.amount}`}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-6 mt-12">
              <button onClick={() => setGameState(GameState.SUMMARY)} className="flex-grow bg-slate-900 hover:bg-slate-800 border border-slate-800 py-6 rounded-[2rem] font-black text-slate-100 transition-all shadow-2xl flex items-center justify-center gap-4 active:scale-95 group">
                <BarChart3 className="w-7 h-7 text-indigo-400 group-hover:scale-110 transition-transform" /> <span className="uppercase tracking-[0.2em] text-sm">Match Statistics</span>
              </button>
              {isHost && (
                <button onClick={() => performReset(false)} className="flex-grow bg-red-600 hover:bg-red-500 py-6 rounded-[2rem] font-black text-white transition-all shadow-xl shadow-red-600/20 flex items-center justify-center gap-4 active:scale-95 group">
                  <HomeIcon className="w-7 h-7 group-hover:scale-110 transition-transform" /> <span className="uppercase tracking-[0.2em] text-sm">Finish Game</span>
                </button>
              )}
            </div>
          </div>
        )}

        {gameState === GameState.SUMMARY && (
          <div className="max-w-6xl mx-auto animate-in fade-in duration-700">
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl p-10 md:p-16 rounded-[4rem] space-y-12 shadow-2xl">
              <div className="text-center space-y-4">
                <div className="w-24 h-24 bg-amber-500/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 border border-amber-500/20 shadow-2xl shadow-amber-500/10"><Trophy className="w-12 h-12 text-amber-500" /></div>
                <h2 className="text-4xl font-black text-slate-100 tracking-tight">比賽結算統計</h2>
                <div className="flex justify-center gap-6">
                  <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] bg-slate-950 px-4 py-2 rounded-full border border-slate-800">{history.length} ACTIONS</span>
                  <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] bg-slate-950 px-4 py-2 rounded-full border border-slate-800">POOL: ${commonPot}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {playerStats.map((p) => (
                  <div key={p.id} className="bg-slate-950/80 border border-slate-800/50 rounded-[3rem] p-8 overflow-hidden relative shadow-2xl group hover:border-slate-700 transition-all">
                    <div className="absolute top-0 left-0 w-2 h-full opacity-50" style={{ backgroundColor: p.color }} />
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <span className="font-black text-2xl text-slate-100 block">{p.name}</span>
                        <div className="text-sm font-mono"><MoneyDisplay val={p.earnings} /></div>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 border-b border-slate-900 pb-4">
                          <div className="space-y-1"><span className="text-[9px] text-slate-600 uppercase font-black tracking-tighter block">大摸</span><span className="text-xl font-black text-amber-400">{p.bigClearCount}</span></div>
                          <div className="space-y-1"><span className="text-[9px] text-slate-600 uppercase font-black tracking-tighter block">小摸</span><span className="text-xl font-black text-indigo-400">{p.smallClearCount}</span></div>
                        </div>
                        {Object.keys(p.ballStats).map(ball => (
                          <div key={ball} className="grid grid-cols-2 gap-4 border-b border-slate-900 pb-4 last:border-0">
                            <div className="space-y-1"><span className="text-[9px] text-slate-600 uppercase font-black tracking-tighter">{ball} 贏</span><span className="text-xl font-black text-emerald-500">{p.ballStats[ball].win + p.ballStats[ball].all}</span></div>
                            <div className="space-y-1"><span className="text-[9px] text-slate-600 uppercase font-black tracking-tighter">{ball} 放</span><span className="text-xl font-black text-red-400">{p.ballStats[ball].sit}</span></div>
                          </div>
                        ))}
                        <div className="pt-2"><span className="text-[9px] text-slate-600 uppercase font-black tracking-tighter block mb-1">違規次數</span><span className="text-2xl font-black text-amber-500">{p.foulCount}</span></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-12 space-y-4 max-w-xl mx-auto">
                <button onClick={() => setGameState(GameState.PLAYING)} className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 py-6 rounded-[2rem] font-black text-slate-100 transition-all flex items-center justify-center gap-4 shadow-xl active:scale-95"><ArrowLeft className="w-6 h-6" /><span className="uppercase tracking-widest">Back to Match</span></button>
                {isHost && <button onClick={() => performReset(true)} className="w-full bg-indigo-600 hover:bg-indigo-500 py-6 rounded-[2rem] font-black text-white transition-all flex items-center justify-center gap-4 shadow-2xl shadow-indigo-600/20 active:scale-95"><HomeIcon className="w-6 h-6" /><span className="uppercase tracking-widest">Exit Game</span></button>}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-16 py-10 text-center border-t border-slate-900/50">
        <p className="text-[10px] text-slate-800 font-black uppercase tracking-[0.5em] hover:text-slate-700 transition-colors">Billiards Rotation Order Tracker Engine v3.0 (4-Digit Room Sync)</p>
      </footer>
    </div>
  );
};

export default App;
