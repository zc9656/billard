
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Player, RoundHistory, GameState, BetMode, BetConfig } from './types';
import { DEFAULT_COLORS, INITIAL_NAMES } from './constants';
import { 
  Trophy, UserPlus, Play, RotateCcw, 
  ChevronRight, Settings2, AlertTriangle,
  Coins, BarChart3, Home,
  ArrowLeft, Star, ListOrdered, Target, Users, Layers, Sparkles
} from 'lucide-react';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MODE_SELECT);
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
  const [availableBalls, setAvailableBalls] = useState<number[]>([]);

  const isSequenceMode = betConfig.mode === 'SEQUENCE';

  // 初始化球員資料
  useEffect(() => {
    if (gameState === GameState.MODE_SELECT) {
      const initialPlayers = Array.from({ length: playerCount }, (_, i) => ({
        id: `p${i}`,
        name: INITIAL_NAMES[i] || `球員 ${String.fromCharCode(65 + i)}`,
        color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        earnings: 0
      }));
      setPlayers(initialPlayers);
    }
  }, [playerCount, gameState]);

  // 初始化可用球號
  useEffect(() => {
    if (!isSequenceMode && (gameState === GameState.PLAYING || gameState === GameState.SETUP || gameState === GameState.BET_CONFIG)) {
      setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
    }
  }, [betConfig.mode, gameState, isSequenceMode]);

  const updatePlayerName = (id: string, name: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };

  const handleModeSelect = (mode: BetMode) => {
    if (mode === 'SEQUENCE') {
      setBetConfig({ 
        mode, 
        amounts: {}, 
        foul: 0, 
        bigClear: 0, 
        smallClear: 0 
      });
      setGameState(GameState.SETUP);
    } else {
      let initialAmounts: { [key: number]: number } = { 9: 100 };
      if (mode === '369') initialAmounts = { 3: 50, 6: 50, 9: 100 };
      if (mode === '59') initialAmounts = { 5: 50, 9: 100 };
      
      setBetConfig({ 
        mode, 
        amounts: initialAmounts, 
        foul: 50,
        bigClear: 300,
        smallClear: 200
      });
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
      setHistory([]);
      setCommonPot(0);
      setPlayers(prev => prev.map(p => ({ ...p, earnings: 0 })));
    }
  };

  const triggerOrderChange = (winnerId: string) => {
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const winner = currentOrder[winnerIdx];
    
    // 放水者 (Sitter) 是當前輪次中贏家的前一位
    const sitterIdx = (winnerIdx - 1 + playerCount) % playerCount;
    const sitter = currentOrder[sitterIdx];

    // 其他人保持原有的相對順序
    const others = currentOrder.filter(p => p.id !== winner.id && p.id !== sitter.id);

    // 規則：贏家第一、放水者第二、其餘依序排列
    const nextOrder = [winner, sitter, ...others];
    
    setCurrentOrder(nextOrder);
    
    if (!isSequenceMode) {
      setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
    }
  };

  const handleAction = (winnerId: string, ball: number, isCollectAll: boolean = false) => {
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const winner = currentOrder[winnerIdx];

    if (!isSequenceMode) {
      const amount = betConfig.amounts[ball] || 0;
      if (isCollectAll) {
        setPlayers(prev => prev.map(p => {
          if (p.id === winner.id) return { ...p, earnings: p.earnings + (amount * (playerCount - 1)) };
          return { ...p, earnings: p.earnings - amount };
        }));
      } else {
        const sitterIdx = (winnerIdx - 1 + playerCount) % playerCount;
        const sitter = currentOrder[sitterIdx];
        setPlayers(prev => prev.map(p => {
          if (p.id === winner.id) return { ...p, earnings: p.earnings + amount };
          if (p.id === sitter.id) return { ...p, earnings: p.earnings - amount };
          return p;
        }));
      }
    }

    // 進 9 號球或在純順序模式下才更換順序
    if (ball === 9 || isSequenceMode) {
      triggerOrderChange(winnerId);
    } else {
      setAvailableBalls(prev => prev.filter(b => b !== ball));
    }

    setHistory(prev => [{
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: 'WIN',
      ball: isSequenceMode ? 9 : ball,
      winner: winner.name,
      amount: 0,
      isCollectAll
    } as any, ...prev]);
  };

  const handleFoul = (playerId: string) => {
    if (isSequenceMode) return;
    const player = players.find(p => p.id === playerId)!;
    setPlayers(prev => prev.map(p => 
      p.id === playerId ? { ...p, earnings: p.earnings - betConfig.foul } : p
    ));
    setCommonPot(prev => prev + betConfig.foul);
    setHistory(prev => [{
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: 'FOUL',
      fouler: player.name,
      amount: betConfig.foul
    } as any, ...prev]);
  };

  const handleClearTableAction = (winnerId: string, type: 'BIG_CLEAR' | 'SMALL_CLEAR') => {
    if (isSequenceMode) return;
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const winner = currentOrder[winnerIdx];
    const amount = type === 'BIG_CLEAR' ? betConfig.bigClear : betConfig.smallClear;
    const sitterIdx = (winnerIdx - 1 + playerCount) % playerCount;
    const sitter = currentOrder[sitterIdx];

    setPlayers(prev => prev.map(p => {
      if (type === 'BIG_CLEAR') {
        // 大摸：所有人付給贏家
        if (p.id === winner.id) return { ...p, earnings: p.earnings + (amount * (playerCount - 1)) };
        return { ...p, earnings: p.earnings - amount };
      } else {
        // 小摸：僅上家（放水者）付給贏家
        if (p.id === winner.id) return { ...p, earnings: p.earnings + amount };
        if (p.id === sitter.id) return { ...p, earnings: p.earnings - amount };
        return p;
      }
    }));

    triggerOrderChange(winnerId);
    setHistory(prev => [{
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: type,
      winner: winner.name,
      amount: type === 'BIG_CLEAR' ? amount * (playerCount - 1) : amount
    } as any, ...prev]);
  };

  return (
    <div className="w-full max-w-7xl mx-auto min-h-screen flex flex-col p-4 md:p-8 bg-slate-950 text-slate-100">
      <header className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => performReset(true)}>
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
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
              <button onClick={() => performReset(false)} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-red-400 transition-all border border-slate-800">
                <RotateCcw className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {gameState === GameState.PLAYING && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 flex items-center justify-center gap-3 shadow-2xl overflow-x-auto no-scrollbar">
            {currentOrder.map((p, i) => (
              <React.Fragment key={p.id}>
                <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-500 ${i === 0 ? 'bg-emerald-500/20 ring-2 ring-emerald-500/50 scale-110 shadow-lg' : 'bg-slate-950/40 opacity-50'}`}>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className={`text-lg font-black whitespace-nowrap ${i === 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {p.name}
                  </span>
                </div>
                {i < currentOrder.length - 1 && <ChevronRight className="w-5 h-5 text-slate-800" />}
              </React.Fragment>
            ))}
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
                  <button
                    key={num}
                    onClick={() => setPlayerCount(num)}
                    className={`px-12 py-4 rounded-xl font-black text-lg transition-all flex items-center gap-3 ${playerCount === num ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Users className="w-5 h-5" /> {num} 人制
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-center text-slate-500 text-sm font-black uppercase tracking-widest mb-1">Step 2: 選擇紀錄模式</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* 純順序模式 */}
                <button onClick={() => handleModeSelect('SEQUENCE')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-indigo-500 transition-all group shadow-xl">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20">
                    <ListOrdered className="w-8 h-8 text-indigo-400" />
                  </div>
                  <div className="text-center">
                    <span className="block text-xl font-black mb-1">純順序</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">不計獎金</span>
                  </div>
                </button>

                {/* 9 號模式 */}
                <button onClick={() => handleModeSelect('9')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-emerald-500 transition-all group shadow-xl">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20">
                    <Target className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <span className="block text-xl font-black mb-1">9 號模式</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">只計 9 號球</span>
                  </div>
                </button>

                {/* 5-9 模式 */}
                <button onClick={() => handleModeSelect('59')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-emerald-500 transition-all group shadow-xl">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20">
                    <Layers className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <span className="block text-xl font-black mb-1">5-9 模式</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">計 5, 9 號球</span>
                  </div>
                </button>

                {/* 3-6-9 模式 */}
                <button onClick={() => handleModeSelect('369')} className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col items-center gap-4 hover:border-emerald-500 transition-all group shadow-xl">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20">
                    <Trophy className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <span className="block text-xl font-black mb-1">3-6-9 模式</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase">計 3, 6, 9 號球</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {gameState === GameState.BET_CONFIG && (
          <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-8 pb-12">
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <Settings2 className="text-emerald-500" /> 設定獎金金額
              </h2>
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

                <div className="bg-red-500/5 p-5 rounded-3xl flex items-center justify-between border border-red-500/10">
                  <div className="flex flex-col">
                    <span className="text-lg font-black text-red-500/80">犯規罰金</span>
                    <span className="text-[10px] text-slate-600 font-bold">歸入公池</span>
                  </div>
                  <input type="number" value={betConfig.foul} onChange={(e) => setBetConfig({...betConfig, foul: Number(e.target.value)})} className="bg-transparent text-right text-3xl font-mono font-black text-red-400 outline-none w-32" />
                </div>
              </div>
              <button onClick={() => setGameState(GameState.SETUP)} className="w-full bg-emerald-600 py-6 rounded-3xl font-black text-xl shadow-lg hover:bg-emerald-500 transition-all">確認並繼續</button>
            </div>
          </div>
        )}

        {gameState === GameState.SETUP && (
          <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-8">
            <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-8 shadow-2xl">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <UserPlus className="text-emerald-500" /> 球員名稱
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {players.map((p) => (
                  <div key={p.id} className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-transform group-focus-within:scale-150" style={{ backgroundColor: p.color }} />
                    <input type="text" value={p.name} onChange={(e) => updatePlayerName(p.id, e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-3xl py-6 pl-16 pr-6 text-xl font-black focus:border-emerald-500 outline-none transition-all" />
                  </div>
                ))}
              </div>
              <button onClick={startGame} className="w-full bg-emerald-600 py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-4 hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/20">
                <Play className="fill-current" /> 開始比賽
              </button>
            </div>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="space-y-8 animate-in slide-in-from-bottom-8">
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${playerCount === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`}>
              {currentOrder.map((p, i) => (
                <div key={p.id} className={`p-8 rounded-[2.5rem] border flex flex-col justify-between min-h-[440px] transition-all relative ${i === 0 ? 'bg-emerald-500/10 border-emerald-500 shadow-2xl shadow-emerald-500/10' : 'bg-slate-900 border-slate-800'}`}>
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${i === 0 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40' : 'bg-slate-800 text-slate-500'}`}>{i + 1}</div>
                      {!isSequenceMode && <button onClick={() => handleFoul(p.id)} className="text-red-500 p-3 hover:bg-red-500/10 rounded-2xl transition-all border border-transparent hover:border-red-500/20" title="犯規罰金"><AlertTriangle /></button>}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black flex items-center gap-2">
                        {p.name}
                        {i === 0 && <span className="text-[10px] bg-emerald-500 text-white px-2 py-1 rounded-full uppercase tracking-tighter">打家</span>}
                        {i === 1 && <span className="text-[10px] bg-indigo-500 text-white px-2 py-1 rounded-full uppercase tracking-tighter">二家</span>}
                      </h3>
                      {!isSequenceMode && (
                        <div className={`text-3xl mt-1 tracking-tighter font-mono font-bold ${p.earnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.earnings >= 0 ? '+' : ''}{p.earnings}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 mt-8">
                    {isSequenceMode ? (
                      <button onClick={() => handleAction(p.id, 9)} className="w-full py-10 bg-indigo-600 hover:bg-indigo-500 rounded-3xl font-black text-2xl flex flex-col items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                        <Target className="w-8 h-8" />
                        <span>進 9 號球</span>
                        <span className="text-[10px] opacity-50 font-bold uppercase">下局打家</span>
                      </button>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {i === 0 && (
                            <button onClick={() => handleClearTableAction(p.id, 'BIG_CLEAR')} className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl font-black text-[12px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-slate-950">
                              <Star className="w-4 h-4 fill-slate-950" /> 大摸 (${betConfig.bigClear * (playerCount - 1)})
                            </button>
                          )}
                          {i === 1 && (
                            <button onClick={() => handleClearTableAction(p.id, 'SMALL_CLEAR')} className="w-full py-4 bg-amber-600 hover:bg-amber-500 rounded-2xl font-black text-[12px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-white">
                              <Sparkles className="w-4 h-4 fill-white" /> 小摸 (${betConfig.smallClear})
                            </button>
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
                               <button key={`all-${ball}`} onClick={() => handleAction(p.id, ball, true)} className="py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl text-[9px] font-black hover:bg-amber-500/20">
                                 全收 {ball}
                               </button>
                             ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-6 max-w-2xl mx-auto mt-12">
               {!isSequenceMode && (
                 <button onClick={() => setGameState(GameState.SUMMARY)} className="flex-grow bg-slate-900 border border-slate-800 py-6 rounded-3xl font-black flex items-center justify-center gap-4 hover:bg-slate-800 transition-all shadow-xl">
                   <BarChart3 className="text-indigo-400" /> 結算成績
                 </button>
               )}
               <button onClick={() => performReset(false)} className="flex-grow bg-red-600/10 text-red-500 py-6 rounded-3xl font-black flex items-center justify-center gap-4 hover:bg-red-600 hover:text-white transition-all shadow-xl">
                 <Home /> 回到首頁
               </button>
            </div>
          </div>
        )}

        {gameState === GameState.SUMMARY && !isSequenceMode && (
          <div className="max-w-4xl mx-auto bg-slate-900 p-12 rounded-[4rem] border border-slate-800 mt-8 space-y-12 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-4xl font-black text-center bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">結算排行榜</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...players].sort((a, b) => b.earnings - a.earnings).map((p, idx) => (
                <div key={p.id} className={`bg-slate-950 p-8 rounded-[3rem] border relative overflow-hidden transition-all ${idx === 0 ? 'border-amber-500 shadow-xl shadow-amber-500/5 scale-105' : 'border-slate-800'}`}>
                  {idx === 0 && <div className="absolute top-4 right-6"><Trophy className="text-amber-500 w-10 h-10 animate-bounce" /></div>}
                  <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: p.color }} />
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Rank {idx + 1}</span>
                  <h3 className="text-3xl font-black mt-2">{p.name}</h3>
                  <div className={`text-4xl mt-2 tracking-tighter font-mono font-black ${p.earnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.earnings >= 0 ? '+' : ''}{p.earnings}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setGameState(GameState.PLAYING)} className="w-full py-6 bg-slate-800 hover:bg-slate-700 rounded-3xl font-black text-xl flex items-center justify-center gap-4 transition-all"><ArrowLeft /> 返回計分介面</button>
          </div>
        )}
      </main>

      <footer className="mt-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900/50 rounded-full border border-slate-800">
           <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">Rotation Tracker v3.4</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
