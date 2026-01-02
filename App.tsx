
import React, { useState, useCallback, useEffect } from 'react';
import { Player, RoundHistory, GameState, BetMode, BetConfig, GameSnapshot } from './types';
import { DEFAULT_COLORS, INITIAL_NAMES } from './constants';
import { 
  Trophy, UserPlus, Play, RotateCcw, 
  ChevronRight, Settings2, AlertTriangle,
  Coins, BarChart3, Home, Undo2,
  ArrowLeft, Star, ListOrdered, Target, Users, Layers, Sparkles, Hash,
  Wallet, Receipt, History, Clock, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MODE_SELECT);
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [currentRound, setCurrentRound] = useState<number>(1);
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
  const [availableBalls, setAvailableBalls] = useState<number[]>([]);
  const [vsMatrix, setVsMatrix] = useState<{[key: string]: {[key: string]: number}}>({});
  
  // 用於恢復上一動的快照堆疊
  const [snapshotStack, setSnapshotStack] = useState<GameSnapshot[]>([]);

  const isSequenceMode = betConfig.mode === 'SEQUENCE';

  // 初始化
  useEffect(() => {
    if (gameState === GameState.MODE_SELECT) {
      const initialPlayers = Array.from({ length: playerCount }, (_, i) => ({
        id: `p${i}`,
        name: INITIAL_NAMES[i] || `球員 ${String.fromCharCode(65 + i)}`,
        color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        earnings: 0,
        foulCount: 0,
        totalFoulPaid: 0,
        won5Count: 0,
        lost5Count: 0,
        won9Count: 0,
        lost9Count: 0
      }));
      setPlayers(initialPlayers);
      setCurrentRound(1);
      setHistory([]);
      setSnapshotStack([]);
      
      const initialMatrix: any = {};
      initialPlayers.forEach(p1 => {
        initialMatrix[p1.id] = {};
        initialPlayers.forEach(p2 => {
          if (p1.id !== p2.id) initialMatrix[p1.id][p2.id] = 0;
        });
      });
      setVsMatrix(initialMatrix);
    }
  }, [playerCount, gameState]);

  useEffect(() => {
    if (!isSequenceMode && (gameState === GameState.PLAYING || gameState === GameState.SETUP || gameState === GameState.BET_CONFIG)) {
      setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
    }
  }, [betConfig.mode, gameState, isSequenceMode]);

  const saveSnapshot = () => {
    const snapshot: GameSnapshot = {
      players: JSON.parse(JSON.stringify(players)),
      currentOrder: JSON.parse(JSON.stringify(currentOrder)),
      commonPot,
      availableBalls: [...availableBalls],
      vsMatrix: JSON.parse(JSON.stringify(vsMatrix)),
      currentRound,
      history: [...history]
    };
    setSnapshotStack(prev => [...prev, snapshot]);
  };

  const handleUndo = () => {
    if (snapshotStack.length === 0) return;
    const lastSnapshot = snapshotStack[snapshotStack.length - 1];
    setPlayers(lastSnapshot.players);
    setCurrentOrder(lastSnapshot.currentOrder);
    setCommonPot(lastSnapshot.commonPot);
    setAvailableBalls(lastSnapshot.availableBalls);
    setVsMatrix(lastSnapshot.vsMatrix);
    setCurrentRound(lastSnapshot.currentRound);
    setHistory(lastSnapshot.history);
    setSnapshotStack(prev => prev.slice(0, -1));
  };

  const updatePlayerName = (id: string, name: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };

  const handleModeSelect = (mode: BetMode) => {
    if (mode === 'SEQUENCE') {
      setBetConfig({ mode, amounts: {}, foul: 0, bigClear: 0, smallClear: 0 });
      setGameState(GameState.SETUP);
    } else {
      let initialAmounts: { [key: number]: number } = { 9: 100 };
      if (mode === '369') initialAmounts = { 3: 50, 6: 50, 9: 100 };
      if (mode === '59') initialAmounts = { 5: 50, 9: 100 };
      setBetConfig({ mode, amounts: initialAmounts, foul: 50, bigClear: 300, smallClear: 200 });
      setGameState(GameState.BET_CONFIG);
    }
  };

  const startGame = () => {
    setCurrentOrder([...players]);
    setGameState(GameState.PLAYING);
  };

  const performReset = (force = false) => {
    if (force || window.confirm('確定要回到首頁嗎？目前的進度將消失。')) {
      setGameState(GameState.MODE_SELECT);
    }
  };

  const updateVsMatrix = (winnerId: string, loserIds: string[], amount: number) => {
    setVsMatrix(prev => {
      const next = { ...prev };
      loserIds.forEach(loserId => {
        if (next[winnerId] && next[winnerId][loserId] !== undefined) {
          next[winnerId][loserId] += amount;
        }
      });
      return next;
    });
  };

  const triggerOrderChange = (winnerId: string) => {
    const currentOrderWithFreshData = currentOrder.map(co => players.find(p => p.id === co.id) || co);
    const winnerIdx = currentOrderWithFreshData.findIndex(p => p.id === winnerId);
    const winner = currentOrderWithFreshData[winnerIdx];
    const sitterIdx = (winnerIdx - 1 + playerCount) % playerCount;
    const sitter = currentOrderWithFreshData[sitterIdx];
    const others = currentOrderWithFreshData.filter(p => p.id !== winner.id && p.id !== sitter.id);
    const nextOrder = [winner, sitter, ...others];
    
    setCurrentOrder(nextOrder);
    setCurrentRound(prev => prev + 1);
    if (!isSequenceMode) {
      setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
    }
  };

  const handleAction = (winnerId: string, ball: number, isCollectAll: boolean = false) => {
    saveSnapshot();
    const winner = players.find(p => p.id === winnerId)!;
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const sitter = players.find(p => p.id === currentOrder[(winnerIdx - 1 + playerCount) % playerCount].id)!;

    if (!isSequenceMode) {
      const amount = betConfig.amounts[ball] || 0;
      const otherIds = currentOrder.filter(p => p.id !== winner.id).map(p => p.id);

      setPlayers(prev => prev.map(p => {
        if (p.id === winner.id) {
          const stats = ball === 9 || isCollectAll ? { won9Count: p.won9Count + 1 } : { won5Count: p.won5Count + 1 };
          return { ...p, earnings: p.earnings + (isCollectAll ? amount * (playerCount - 1) : amount), ...stats };
        }
        if (isCollectAll || p.id === sitter.id) {
          const stats = ball === 9 || isCollectAll ? { lost9Count: p.lost9Count + 1 } : { lost5Count: p.lost5Count + 1 };
          return { ...p, earnings: p.earnings - amount, ...stats };
        }
        return p;
      }));

      updateVsMatrix(winner.id, isCollectAll ? otherIds : [sitter.id], amount);
      
      setHistory(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        type: isCollectAll ? 'COLLECT_ALL' : 'WIN',
        ball,
        winnerName: winner.name,
        amount: isCollectAll ? amount * (playerCount - 1) : amount
      }, ...prev]);
    }

    if (ball === 9 || isSequenceMode) {
      triggerOrderChange(winnerId);
    } else {
      setAvailableBalls(prev => prev.filter(b => b !== ball));
    }
  };

  const handleFoul = (playerId: string) => {
    if (isSequenceMode) return;
    saveSnapshot();
    const fouler = players.find(p => p.id === playerId)!;
    setPlayers(prev => prev.map(p => 
      p.id === playerId ? { 
        ...p, 
        earnings: p.earnings - betConfig.foul, 
        foulCount: p.foulCount + 1,
        totalFoulPaid: p.totalFoulPaid + betConfig.foul
      } : p
    ));
    setCommonPot(prev => prev + betConfig.foul);
    setHistory(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type: 'FOUL',
      foulerName: fouler.name,
      amount: betConfig.foul
    }, ...prev]);
  };

  const handleClearTableAction = (winnerId: string, type: 'BIG_CLEAR' | 'SMALL_CLEAR') => {
    if (isSequenceMode) return;
    saveSnapshot();
    const winner = players.find(p => p.id === winnerId)!;
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const amount = type === 'BIG_CLEAR' ? betConfig.bigClear : betConfig.smallClear;
    const sitterId = currentOrder[(winnerIdx - 1 + playerCount) % playerCount].id;
    const otherIds = currentOrder.filter(p => p.id !== winner.id).map(p => p.id);

    setPlayers(prev => prev.map(p => {
      if (type === 'BIG_CLEAR') {
        if (p.id === winner.id) return { ...p, earnings: p.earnings + (amount * (playerCount - 1)), won9Count: p.won9Count + 1 };
        return { ...p, earnings: p.earnings - amount, lost9Count: p.lost9Count + 1 };
      } else {
        if (p.id === winner.id) return { ...p, earnings: p.earnings + amount, won9Count: p.won9Count + 1 };
        if (p.id === sitterId) return { ...p, earnings: p.earnings - amount, lost9Count: p.lost9Count + 1 };
        return p;
      }
    }));

    updateVsMatrix(winner.id, type === 'BIG_CLEAR' ? otherIds : [sitterId], amount);
    setHistory(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type,
      winnerName: winner.name,
      amount: type === 'BIG_CLEAR' ? amount * (playerCount - 1) : amount
    }, ...prev]);
    triggerOrderChange(winnerId);
  };

  return (
    <div className="w-full max-w-7xl mx-auto min-h-screen flex flex-col p-4 md:p-8 bg-slate-950 text-slate-100">
      <header className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => performReset(true)}>
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <Coins className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                撞球順序 Pro
              </h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {isSequenceMode ? 'Pure Rotation' : `${betConfig.mode} Mode`} • {playerCount}P
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!isSequenceMode && (gameState === GameState.PLAYING || gameState === GameState.SUMMARY) && (
              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest border-r border-slate-800 pr-3">公池</span>
                <span className="text-xl font-mono font-black text-amber-400">${commonPot}</span>
              </div>
            )}
            {gameState === GameState.PLAYING && (
              <div className="flex gap-2">
                <button 
                  onClick={handleUndo} 
                  disabled={snapshotStack.length === 0}
                  className={`p-3 rounded-xl border transition-all ${snapshotStack.length > 0 ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400 hover:bg-indigo-600/40' : 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed'}`}
                >
                  <Undo2 className="w-5 h-5" />
                </button>
                <button onClick={() => performReset(false)} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-red-400 transition-all border border-slate-800">
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {gameState === GameState.PLAYING && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 flex items-center gap-3 shadow-2xl overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 bg-slate-950 px-4 py-3 rounded-2xl border border-slate-800 shrink-0">
               <Hash className="w-4 h-4 text-emerald-500" />
               <span className="font-black text-emerald-500">第 {currentRound} 局</span>
            </div>
            <div className="w-[1px] h-8 bg-slate-800 mx-2 shrink-0" />
            {currentOrder.map((op, i) => {
              const p = players.find(player => player.id === op.id) || op;
              return (
                <React.Fragment key={p.id}>
                  <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-500 ${i === 0 ? 'bg-emerald-500/20 ring-2 ring-emerald-500/50 scale-105 shadow-lg' : 'bg-slate-950/40 opacity-50'}`}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className={`text-base font-black whitespace-nowrap ${i === 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {p.name}
                    </span>
                  </div>
                  {i < currentOrder.length - 1 && <ChevronRight className="w-4 h-4 text-slate-800" />}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </header>

      <main className="flex-grow">
        {gameState === GameState.MODE_SELECT && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in zoom-in-95 py-12">
            <div className="text-center space-y-6">
              <h2 className="text-slate-500 text-sm font-black uppercase tracking-widest mb-1">Step 1: 選擇人數</h2>
              <div className="inline-flex bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-inner">
                {[3, 4].map(num => (
                  <button key={num} onClick={() => setPlayerCount(num)} className={`px-12 py-4 rounded-xl font-black text-lg transition-all flex items-center gap-3 ${playerCount === num ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Users className="w-5 h-5" /> {num} 人制
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-center text-slate-500 text-sm font-black uppercase tracking-widest mb-1">Step 2: 選擇紀錄模式</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onClick={() => handleModeSelect('SEQUENCE')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-indigo-500 transition-all shadow-xl group"><ListOrdered className="w-8 h-8 text-indigo-400" /><span className="text-xl font-black">純順序</span></button>
                <button onClick={() => handleModeSelect('9')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-emerald-500 transition-all shadow-xl group"><Target className="w-8 h-8 text-emerald-400" /><span className="text-xl font-black">9 號模式</span></button>
                <button onClick={() => handleModeSelect('59')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-emerald-500 transition-all shadow-xl group"><Layers className="w-8 h-8 text-emerald-400" /><span className="text-xl font-black">5-9 模式</span></button>
                <button onClick={() => handleModeSelect('369')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-emerald-500 transition-all shadow-xl group"><Trophy className="w-8 h-8 text-emerald-400" /><span className="text-xl font-black">3-6-9 模式</span></button>
              </div>
            </div>
          </div>
        )}

        {gameState === GameState.BET_CONFIG && (
          <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-8 pb-12">
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <h2 className="text-2xl font-black flex items-center gap-3"><Settings2 className="text-emerald-500" /> 設定獎金金額</h2>
              <div className="space-y-4">
                 {Object.keys(betConfig.amounts).map(ball => (
                  <div key={ball} className="bg-slate-950 p-5 rounded-3xl flex items-center justify-between border border-slate-800">
                    <span className="text-xl font-black text-slate-400">{ball} 號球獎金</span>
                    <input type="number" value={betConfig.amounts[Number(ball)]} onChange={(e) => setBetConfig({...betConfig, amounts: {...betConfig.amounts, [Number(ball)]: Number(e.target.value)}})} className="bg-transparent text-right text-3xl font-mono font-black text-emerald-400 outline-none w-32" />
                  </div>
                ))}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-amber-500/5 p-5 rounded-3xl flex items-center justify-between border border-amber-500/10">
                    <span className="text-lg font-black text-amber-500/80">大摸賞金</span>
                    <input type="number" value={betConfig.bigClear} onChange={(e) => setBetConfig({...betConfig, bigClear: Number(e.target.value)})} className="bg-transparent text-right text-2xl font-mono font-black text-amber-500 outline-none w-24" />
                  </div>
                  <div className="bg-amber-500/5 p-5 rounded-3xl flex items-center justify-between border border-amber-500/10">
                    <span className="text-lg font-black text-amber-500/80">小摸賞金</span>
                    <input type="number" value={betConfig.smallClear} onChange={(e) => setBetConfig({...betConfig, smallClear: Number(e.target.value)})} className="bg-transparent text-right text-2xl font-mono font-black text-amber-500 outline-none w-24" />
                  </div>
                </div>
              </div>
              <button onClick={() => setGameState(GameState.SETUP)} className="w-full bg-emerald-600 py-6 rounded-3xl font-black text-xl shadow-lg hover:bg-emerald-500 transition-all">確認並繼續</button>
            </div>
          </div>
        )}

        {gameState === GameState.SETUP && (
          <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-8">
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <h2 className="text-2xl font-black flex items-center gap-3"><UserPlus className="text-emerald-500" /> 球員名稱</h2>
              <div className="grid grid-cols-1 gap-4">
                {players.map((p) => (
                  <div key={p.id} className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                    <input type="text" value={p.name} onChange={(e) => updatePlayerName(p.id, e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-3xl py-6 pl-16 pr-6 text-xl font-black focus:border-emerald-500 outline-none transition-all" />
                  </div>
                ))}
              </div>
              <button onClick={startGame} className="w-full bg-emerald-600 py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-4 hover:bg-emerald-500 transition-all shadow-xl">開始比賽</button>
            </div>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="space-y-8 animate-in slide-in-from-bottom-8">
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${playerCount === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`}>
              {currentOrder.map((op, i) => {
                const p = players.find(player => player.id === op.id) || op;
                return (
                  <div key={p.id} className={`p-6 rounded-[2.5rem] border flex flex-col justify-between min-h-[480px] transition-all relative ${i === 0 ? 'bg-emerald-500/10 border-emerald-500 shadow-2xl shadow-emerald-500/10' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg ${i === 0 ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</div>
                        {!isSequenceMode && (
                          <div className="flex flex-col items-center">
                             <button onClick={() => handleFoul(p.id)} className="text-red-500 p-3 hover:bg-red-500/10 rounded-2xl transition-all border border-transparent hover:border-red-500/20"><AlertTriangle className="w-5 h-5" /></button>
                             <span className="text-[10px] font-black text-red-500/60 mt-1">{p.foulCount} 次犯規</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="text-xl font-black truncate">{p.name}</h3>
                        {!isSequenceMode && (
                          <div className={`text-2xl mt-1 tracking-tighter font-mono font-bold ${p.earnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {p.earnings >= 0 ? '+' : ''}{p.earnings}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 mt-6">
                      {isSequenceMode ? (
                        <button onClick={() => handleAction(p.id, 9)} className="w-full py-10 bg-indigo-600 hover:bg-indigo-500 rounded-3xl font-black text-xl flex flex-col items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">進 9 號球</button>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {i === 0 && (
                              <button onClick={() => handleClearTableAction(p.id, 'BIG_CLEAR')} className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl font-black text-[11px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-slate-950"><Star className="w-3 h-3 fill-slate-950" /> 大摸 (${betConfig.bigClear * (playerCount - 1)})</button>
                            )}
                            {i === 1 && (
                              <button onClick={() => handleClearTableAction(p.id, 'SMALL_CLEAR')} className="w-full py-4 bg-amber-600 hover:bg-amber-500 rounded-2xl font-black text-[11px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-white"><Sparkles className="w-3 h-3 fill-white" /> 小摸 (${betConfig.smallClear})</button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {availableBalls.map(ball => (
                              <button key={ball} onClick={() => handleAction(p.id, ball)} className={`py-4 rounded-xl font-black border transition-all active:scale-95 flex flex-col items-center justify-center ${ball === 9 ? 'bg-emerald-600 border-emerald-400 hover:bg-emerald-500' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                                <span className="text-lg">進 {ball}</span>
                                <span className="text-[9px] opacity-50">${betConfig.amounts[ball]}</span>
                              </button>
                            ))}
                          </div>
                          {i === 0 && (
                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/50">
                               {availableBalls.map(ball => (
                                 <button key={`all-${ball}`} onClick={() => handleAction(p.id, ball, true)} className="py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl text-[9px] font-black hover:bg-amber-500/20">全收 {ball}</button>
                               ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 即時動態 */}
            {!isSequenceMode && history.length > 0 && (
              <div className="max-w-2xl mx-auto bg-slate-900/40 border border-slate-800 rounded-3xl p-6">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Clock className="w-3 h-3" /> 最近動態
                </h4>
                <div className="space-y-3">
                  {history.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 animate-in slide-in-from-left-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${item.type === 'FOUL' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          {item.type === 'FOUL' ? <AlertTriangle className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
                        </div>
                        <div className="text-sm font-bold">
                          {item.type === 'FOUL' ? (
                            <span className="text-slate-300">{item.foulerName} 犯規</span>
                          ) : (
                            <span className="text-slate-300">{item.winnerName} {item.type === 'BIG_CLEAR' ? '大摸' : item.type === 'SMALL_CLEAR' ? '小摸' : `進 ${item.ball} 號`}</span>
                          )}
                        </div>
                      </div>
                      <div className={`text-sm font-black font-mono ${item.type === 'FOUL' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {item.type === 'FOUL' ? '-' : '+'}${item.amount}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-6 max-w-2xl mx-auto mt-12">
               {!isSequenceMode && (
                 <button onClick={() => setGameState(GameState.SUMMARY)} className="flex-grow bg-slate-900 border border-slate-800 py-6 rounded-3xl font-black flex items-center justify-center gap-4 hover:bg-slate-800 transition-all shadow-xl shadow-emerald-500/5"><BarChart3 className="text-indigo-400" /> 結算成績</button>
               )}
               <button onClick={() => performReset(false)} className="flex-grow bg-red-600/10 text-red-500 py-6 rounded-3xl font-black flex items-center justify-center gap-4 hover:bg-red-600 hover:text-white transition-all shadow-xl"><Home /> 回到首頁</button>
            </div>
          </div>
        )}

        {gameState === GameState.SUMMARY && !isSequenceMode && (
          <div className="max-w-6xl mx-auto space-y-12 animate-in zoom-in-95 pb-20">
            <div className="text-center space-y-2">
               <h2 className="text-4xl font-black bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">終極戰報</h2>
               <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">共進行了 {currentRound - 1} 局比賽</p>
            </div>

            {/* 個人數據卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {players.map((p) => {
                const pureEarnings = p.earnings + p.totalFoulPaid;
                return (
                  <div key={p.id} className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group shadow-2xl">
                    <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: p.color }} />
                    
                    <div className="flex justify-between items-start mb-6">
                      <h3 className="text-2xl font-black truncate">{p.name}</h3>
                      <div className={`text-2xl font-mono font-black ${p.earnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                         ${p.earnings}
                      </div>
                    </div>

                    <div className="space-y-4 mb-6">
                      <div className="flex items-center justify-between bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-tighter">
                          <Wallet className="w-3 h-3 text-indigo-400" /> 純打球損益
                        </div>
                        <span className={`text-sm font-mono font-black ${pureEarnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pureEarnings >= 0 ? '+' : ''}{pureEarnings}
                        </span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-tighter">
                          <Receipt className="w-3 h-3 text-red-400" /> 犯規總支出
                        </div>
                        <span className="text-sm font-mono font-black text-red-400">
                          -${p.totalFoulPaid}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-slate-800 pt-4">
                       <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-500 uppercase">進球次數 (5 / 9)</span><span className="text-emerald-400">{p.won5Count} / {p.won9Count}</span></div>
                       <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-500 uppercase">失球次數 (5 / 9)</span><span className="text-red-400">{p.lost5Count} / {p.lost9Count}</span></div>
                       <div className="flex justify-between text-[10px] font-bold"><span className="text-slate-500 uppercase">犯規次數</span><span className="text-red-500">{p.foulCount} 次</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 歷史對局回顧 */}
            <div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 space-y-8 shadow-2xl">
               <h3 className="text-2xl font-black flex items-center gap-3"><History className="text-amber-500" /> 歷史賽程回顧</h3>
               <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 no-scrollbar">
                  {history.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-6 p-4 bg-slate-950/50 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
                       <div className="text-slate-600 font-black text-sm w-12 shrink-0">#{history.length - idx}</div>
                       <div className={`p-3 rounded-xl ${item.type === 'FOUL' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          {item.type === 'FOUL' ? <AlertTriangle className="w-5 h-5" /> : item.type === 'BIG_CLEAR' ? <Star className="w-5 h-5" /> : <Trophy className="w-5 h-5" />}
                       </div>
                       <div className="flex-grow">
                          <div className="font-black text-slate-200">
                             {item.type === 'FOUL' ? (
                               <span>{item.foulerName} 發生犯規，支付公池金額</span>
                             ) : item.type === 'BIG_CLEAR' ? (
                               <span>{item.winnerName} 完成大摸，全收對手賞金</span>
                             ) : item.type === 'SMALL_CLEAR' ? (
                               <span>{item.winnerName} 完成小摸，拿走上家賞金</span>
                             ) : (
                               <span>{item.winnerName} 進了 {item.ball} 號球</span>
                             )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                             {new Date(item.timestamp).toLocaleTimeString()}
                          </div>
                       </div>
                       <div className={`text-lg font-mono font-black flex items-center gap-2 ${item.type === 'FOUL' ? 'text-red-400' : 'text-emerald-400'}`}>
                          {item.type === 'FOUL' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                          ${item.amount}
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* 誰剋誰矩陣 */}
            <div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 space-y-8 shadow-2xl">
               <h3 className="text-2xl font-black flex items-center gap-3"><Users className="text-indigo-400" /> 誰剋誰 (對戰金額矩陣)</h3>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead>
                     <tr className="border-b border-slate-800">
                       <th className="py-4 px-4 text-slate-500 font-black uppercase text-xs">玩家 (贏 \ 輸)</th>
                       {players.map(p => <th key={p.id} className="py-4 px-4 font-black text-sm" style={{ color: p.color }}>{p.name}</th>)}
                     </tr>
                   </thead>
                   <tbody>
                     {players.map(p1 => (
                       <tr key={p1.id} className="border-b border-slate-800/50 hover:bg-white/5 transition-colors">
                         <td className="py-6 px-4 font-black" style={{ color: p1.color }}>{p1.name}</td>
                         {players.map(p2 => {
                           if (p1.id === p2.id) return <td key={p2.id} className="py-6 px-4 text-slate-800 font-black">-</td>;
                           const balance = (vsMatrix[p1.id][p2.id] || 0) - (vsMatrix[p2.id][p1.id] || 0);
                           return (
                             <td key={p2.id} className={`py-6 px-4 font-mono font-black ${balance > 0 ? 'text-emerald-400' : balance < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                               {balance > 0 ? `贏 $${balance}` : balance < 0 ? `輸 $${Math.abs(balance)}` : '$0'}
                             </td>
                           );
                         })}
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center">* 數值代表縱軸玩家對橫軸玩家的淨勝負金額 (已自動排除公池犯規金額)</p>
            </div>

            <button onClick={() => setGameState(GameState.PLAYING)} className="w-full py-6 bg-slate-800 hover:bg-slate-700 rounded-3xl font-black text-xl flex items-center justify-center gap-4 transition-all shadow-xl shadow-indigo-500/10"><ArrowLeft /> 返回計分介面</button>
          </div>
        )}
      </main>

      <footer className="mt-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900/50 rounded-full border border-slate-800">
           <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">Billiards Tracker Pro v3.8</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
