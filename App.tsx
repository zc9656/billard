
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Player, RoundHistory, GameState, BetMode, BetConfig } from './types';
import { DEFAULT_COLORS } from './constants';
import { 
  Trophy, Play, ChevronRight, Settings2, AlertTriangle,
  Coins, BarChart3, Home as HomeIcon,
  ArrowLeft, Star, PlusSquare, LogIn, Link2, RefreshCcw, Users, UserCheck, Loader2, Info, XCircle, Copy, CheckCircle2
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
  const [availableBalls, setAvailableBalls] = useState<number[]>([]);

  // --- 連線狀態 ---
  const [peer, setPeer] = useState<Peer | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [tempName, setTempName] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [myId, setMyId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const connectionsRef = useRef<DataConnection[]>([]);

  // 1. 初始化檢查 URL 參數
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && room.length === 4) {
      setInputCode(room);
    }
  }, []);

  // 廣播最新狀態 (僅房主)
  const broadcastState = useCallback((targetConn?: DataConnection) => {
    if (!isHost) return;
    const stateData = {
      type: 'STATE_UPDATE',
      state: { gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, playerCount }
    };
    
    if (targetConn) {
      if (targetConn.open) targetConn.send(stateData);
    } else if (connectionsRef.current.length > 0) {
      connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(stateData);
      });
    }
  }, [gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, isHost, playerCount]);

  // 當關鍵狀態改變時廣播
  useEffect(() => {
    if (isHost) broadcastState();
  }, [gameState, betConfig, players, currentOrder, history, commonPot, availableBalls, broadcastState]);

  // 滿員自動開局檢測 (僅房主)
  useEffect(() => {
    if (isHost && gameState === GameState.WAITING) {
      const namedPlayers = players.filter(p => p.name.trim() !== '');
      if (namedPlayers.length === playerCount) {
        const timer = setTimeout(() => startGame(), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isHost, players, playerCount, gameState]);

  const handleIncomingData = useCallback((data: any, conn?: DataConnection) => {
    if (data.type === 'STATE_UPDATE') {
      setGameState(data.state.gameState);
      setBetConfig(data.state.betConfig);
      setPlayers(data.state.players);
      setCurrentOrder(data.state.currentOrder);
      setHistory(data.state.history);
      setCommonPot(data.state.commonPot);
      setAvailableBalls(data.state.availableBalls);
      setPlayerCount(data.state.playerCount);
    } else if (data.type === 'PLAYER_JOIN' && isHost) {
      setPlayers(prev => {
        const nextIdx = prev.findIndex(p => p.name === '');
        if (nextIdx === -1) return prev; 
        const newPlayers = [...prev];
        newPlayers[nextIdx] = { 
          ...newPlayers[nextIdx], 
          id: data.peerId, 
          name: data.name,
          isReady: true 
        };
        return newPlayers;
      });
    } else if (data.type === 'ACTION_REQUEST' && isHost) {
      if (data.action === 'FOUL') handleFoul(data.playerId);
      if (data.action === 'WIN') handleAction(data.playerId, data.ball, data.isCollectAll);
      if (data.action === 'CLEAR') handleClearTableAction(data.playerId, data.clearType);
      if (data.action === 'RESET') performReset(true);
    }
  }, [isHost, playerCount]);

  // 初始化房主
  const initHostPeer = () => {
    setIsConnecting(true);
    setErrorMsg(null);
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const newPeer = new Peer(`bill-pro-${code}`);
    
    newPeer.on('open', (id) => {
      setRoomCode(code);
      setPeer(newPeer);
      setIsHost(true);
      setMyId(id);
      setIsConnecting(false);
      const initialPlayers = Array.from({ length: playerCount }, (_, i) => ({
        id: i === 0 ? id : `pending-${i}`,
        name: '',
        color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        earnings: 0,
        isReady: i === 0
      }));
      setPlayers(initialPlayers);
      setGameState(GameState.MODE_SELECT);
    });

    newPeer.on('connection', (conn) => {
      conn.on('open', () => {
        setConnections(prev => [...prev, conn]);
        connectionsRef.current = [...connectionsRef.current, conn];
        setIsConnected(true);
        broadcastState(conn);
      });
      conn.on('data', (data) => handleIncomingData(data, conn));
      conn.on('close', () => {
        setConnections(prev => prev.filter(c => c !== conn));
        connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
      });
    });

    newPeer.on('error', (err) => {
      setIsConnecting(false);
      if (err.type === 'unavailable-id') initHostPeer();
      else setErrorMsg('建立房間失敗，請重試');
    });
  };

  // 加入球桌
  const joinTable = () => {
    if (inputCode.length !== 4 || !tempName) return;
    setIsConnecting(true);
    setErrorMsg(null);
    
    const newPeer = new Peer();
    newPeer.on('open', (id) => {
      setPeer(newPeer);
      setMyId(id);
      const conn = newPeer.connect(`bill-pro-${inputCode}`, { reliable: true });
      
      const timeout = setTimeout(() => {
        if (!conn.open) {
          setErrorMsg('房間不存在或連線超時');
          setIsConnecting(false);
          newPeer.destroy();
        }
      }, 8000);

      conn.on('open', () => {
        clearTimeout(timeout);
        setRoomCode(inputCode);
        setConnections([conn]);
        connectionsRef.current = [conn];
        setIsConnected(true);
        setIsHost(false);
        setIsConnecting(false);
        setGameState(GameState.WAITING);
        conn.send({ type: 'PLAYER_JOIN', name: tempName, peerId: id });
      });
      
      conn.on('data', handleIncomingData);
    });

    newPeer.on('error', (err) => {
      setIsConnecting(false);
      setErrorMsg('連線失敗');
    });
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- 遊戲邏輯 ---

  const handleBetModeSelect = (mode: BetMode) => {
    let initialAmounts: { [key: number]: number } = { 9: 100 };
    if (mode === '369') initialAmounts = { 3: 50, 6: 50, 9: 100 };
    if (mode === '59') initialAmounts = { 5: 50, 9: 100 };
    setBetConfig({ ...betConfig, mode, amounts: initialAmounts });
    setGameState(GameState.BET_CONFIG);
  };

  const startGame = () => {
    if (!isHost) return;
    setCurrentOrder([...players]);
    setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
    setGameState(GameState.PLAYING);
  };

  const performReset = (force = false) => {
    if (!isHost && !force) {
      if (window.confirm('確定要離開嗎？')) window.location.href = window.location.pathname;
      return;
    }
    if (force || window.confirm('確定要解散房間嗎？')) {
      window.location.href = window.location.pathname;
    }
  };

  const updatePlayersEarnings = (updates: { id: string, amount: number }[]) => {
    const updateFunc = (prev: Player[]) => prev.map(p => {
      const up = updates.find(u => u.id === p.id);
      return up ? { ...p, earnings: p.earnings + up.amount } : p;
    });
    setPlayers(updateFunc);
    setCurrentOrder(updateFunc);
  };

  const handleFoul = (playerId: string) => {
    if (!isHost) {
      if (connections[0]?.open) connections[0].send({ type: 'ACTION_REQUEST', action: 'FOUL', playerId });
      return;
    }
    updatePlayersEarnings([{ id: playerId, amount: -betConfig.foul }]);
    setCommonPot(prev => prev + betConfig.foul);
    const p = players.find(x => x.id === playerId);
    setHistory(prev => [{ id: Date.now().toString(), timestamp: Date.now(), type: 'FOUL', fouler: p?.name, amount: betConfig.foul }, ...prev]);
  };

  const handleAction = (winnerId: string, ball: number, isCollectAll: boolean = false) => {
    if (!isHost) {
      if (connections[0]?.open) connections[0].send({ type: 'ACTION_REQUEST', action: 'WIN', playerId: winnerId, ball, isCollectAll });
      return;
    }
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const sitterIdx = (winnerIdx - 1 + playerCount) % playerCount;
    const winner = currentOrder[winnerIdx];
    const sitter = currentOrder[sitterIdx];
    const amount = betConfig.amounts[ball] || 0;

    const updates: { id: string, amount: number }[] = [];
    if (isCollectAll) {
      players.forEach(p => {
        if (p.id === winner.id) updates.push({ id: p.id, amount: amount * (playerCount - 1) });
        else updates.push({ id: p.id, amount: -amount });
      });
    } else {
      updates.push({ id: winner.id, amount: amount });
      updates.push({ id: sitter.id, amount: -amount });
    }

    updatePlayersEarnings(updates);

    if (ball === 9) {
      const others = currentOrder.filter(p => p.id !== winner.id && p.id !== sitter.id);
      setCurrentOrder([winner, sitter, ...others]);
      setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
    } else {
      setAvailableBalls(prev => prev.filter(b => b !== ball));
    }
  };

  const handleClearTableAction = (winnerId: string, type: 'BIG_CLEAR' | 'SMALL_CLEAR') => {
    if (!isHost) {
      if (connections[0]?.open) connections[0].send({ type: 'ACTION_REQUEST', action: 'CLEAR', playerId: winnerId, clearType: type });
      return;
    }
    const winner = currentOrder.find(p => p.id === winnerId)!;
    const amount = type === 'BIG_CLEAR' ? betConfig.bigClear : betConfig.smallClear;
    const updates = players.map(p => ({
      id: p.id,
      amount: p.id === winner.id ? amount * (playerCount - 1) : -amount
    }));
    updatePlayersEarnings(updates);
    
    const winnerIdx = currentOrder.findIndex(p => p.id === winnerId);
    const sitterIdx = (winnerIdx - 1 + playerCount) % playerCount;
    const sitter = currentOrder[sitterIdx];
    const others = currentOrder.filter(p => p.id !== winner.id && p.id !== sitter.id);
    setCurrentOrder([winner, sitter, ...others]);
    setAvailableBalls(Object.keys(betConfig.amounts).map(Number).sort((a, b) => a - b));
  };

  const MoneyDisplay = ({ val }: { val: number }) => (
    <span className={`font-mono font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {val >= 0 ? '+' : ''}{val}
    </span>
  );

  // --- 畫面渲染 ---

  if (gameState === GameState.HOME) {
    const isJoiningViaLink = new URLSearchParams(window.location.search).has('room');

    return (
      <div className="w-full max-w-4xl mx-auto min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4">
          <Coins className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-5xl font-black mb-2">撞球追分 Pro</h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">P2P Real-time Connection</p>
        </div>

        {errorMsg && (
          <div className="mb-8 w-full bg-red-500/10 border border-red-500/50 p-4 rounded-2xl flex items-center gap-4 text-red-500 animate-bounce">
            <XCircle />
            <span className="font-bold">{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          {/* 開桌區 (若不是透過連結進入才顯示) */}
          {!isJoiningViaLink && (
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl space-y-6">
              <h2 className="text-2xl font-black flex items-center gap-3"><PlusSquare className="text-emerald-500" /> 我要開桌</h2>
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase">1. 選擇遊戲人數</label>
                <div className="grid grid-cols-2 gap-4">
                  {[3, 4].map(num => (
                    <button 
                      key={num} onClick={() => setPlayerCount(num)}
                      className={`py-4 rounded-xl font-bold border transition-all ${playerCount === num ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                    >
                      {num} 人制
                    </button>
                  ))}
                </div>
                <button onClick={initHostPeer} disabled={isConnecting} className="w-full bg-emerald-600 hover:bg-emerald-500 py-5 rounded-2xl font-black text-xl transition-all shadow-xl active:scale-95 disabled:opacity-50">
                  {isConnecting ? <Loader2 className="animate-spin mx-auto" /> : '建立球桌'}
                </button>
              </div>
            </div>
          )}

          {/* 加入區 */}
          <div className={`${isJoiningViaLink ? 'md:col-span-2 max-w-lg mx-auto' : ''} bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl space-y-6 w-full`}>
            <h2 className="text-2xl font-black flex items-center gap-3">
              <LogIn className="text-indigo-400" /> {isJoiningViaLink ? '透過邀請加入' : '加入球桌'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">1. 您的暱稱</label>
                <input 
                  type="text" placeholder="輸入名稱" value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 focus:ring-2 focus:ring-indigo-500 font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">2. 房間代碼</label>
                <input 
                  type="text" maxLength={4} placeholder="4 位代碼" value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
                  readOnly={isJoiningViaLink}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 focus:ring-2 focus:ring-indigo-500 font-mono text-2xl tracking-widest text-center ${isJoiningViaLink ? 'opacity-50' : ''}`}
                />
              </div>
              <button onClick={joinTable} disabled={inputCode.length !== 4 || !tempName || isConnecting} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3">
                {isConnecting ? <Loader2 className="animate-spin" /> : <Link2 />} 加入遊戲
              </button>
              {isJoiningViaLink && (
                <button onClick={() => window.location.href = window.location.pathname} className="w-full text-xs text-slate-500 font-bold hover:text-slate-300">
                  切換至開桌模式
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 等待室介面
  if (gameState === GameState.WAITING) {
    const joinedCount = players.filter(p => p.name !== '').length;
    return (
      <div className="w-full max-w-2xl mx-auto min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950">
        <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[3rem] w-full space-y-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6">
             <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-[10px] font-black uppercase">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {joinedCount === playerCount ? 'Ready' : 'Waiting'}
             </div>
          </div>

          <div className="text-center space-y-4">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest">邀請碼</h2>
            <div className="flex items-center justify-center gap-4">
              <div className="text-6xl font-black font-mono tracking-tighter text-emerald-400">{roomCode}</div>
              <button onClick={copyInviteLink} className={`p-4 rounded-2xl border transition-all ${copied ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-200'}`}>
                {copied ? <CheckCircle2 /> : <Copy />}
              </button>
            </div>
            <p className="text-[10px] font-bold text-slate-600 uppercase">點擊圖示複製邀請連結</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase">玩家名單 ({joinedCount}/{playerCount})</h3>
            <div className="grid grid-cols-1 gap-3">
              {players.map((p, i) => (
                <div key={p.id} className={`p-5 rounded-2xl border flex items-center justify-between transition-all duration-500 ${p.name ? 'bg-slate-900 border-slate-700 shadow-xl' : 'bg-slate-950/50 border-slate-800 border-dashed opacity-50'}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-slate-800" style={p.name ? { color: p.color } : {}}>{i + 1}</div>
                    {p.name ? (
                      <span className="font-black text-xl">{p.name} {p.id === myId && "(您)"}</span>
                    ) : (
                      <span className="text-slate-600 italic">等待加入...</span>
                    )}
                  </div>
                  {p.name && <UserCheck className="text-emerald-500 animate-in zoom-in" />}
                </div>
              ))}
            </div>
          </div>

          {isHost && players[0].name === '' && (
            <div className="space-y-4 pt-4 border-t border-slate-800 animate-in slide-in-from-bottom-2">
               <label className="text-xs font-bold text-slate-500 uppercase block">房主暱稱</label>
               <div className="flex gap-2">
                 <input 
                  type="text" placeholder="輸入您的名稱" value={tempName} onChange={(e) => setTempName(e.target.value)}
                  className="flex-grow bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 font-bold focus:ring-2 focus:ring-emerald-500"
                 />
                 <button 
                  onClick={() => {
                    setPlayers(prev => {
                      const newP = [...prev];
                      newP[0] = { ...newP[0], name: tempName };
                      return newP;
                    });
                  }}
                  className="bg-emerald-600 px-6 rounded-xl font-black active:scale-95 transition-transform"
                 >
                  確認
                 </button>
               </div>
            </div>
          )}

          {joinedCount === playerCount ? (
            <div className="flex items-center justify-center gap-3 py-4 text-emerald-400 font-black animate-pulse">
               <Loader2 className="animate-spin" />
               人齊了！即將自動開局...
            </div>
          ) : (
            <p className="text-center text-xs text-slate-500 italic">滿員後將自動開始計分</p>
          )}

          <button onClick={() => performReset(false)} className="w-full py-4 text-slate-500 hover:text-red-400 text-sm font-bold transition-colors">離開房間</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto min-h-screen p-4 md:p-8">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20"><Coins className="text-emerald-400" /></div>
          <div>
            <h1 className="text-2xl font-black">撞球追分 Pro</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Room: {roomCode} • {playerCount}P Mode</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3">
             <Users className="w-4 h-4 text-slate-600" />
             <span className="text-sm font-bold">{players.filter(p => p.name !== '').length} / {playerCount}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3">
             <span className="text-[10px] font-black text-amber-500">公池</span>
             <span className="text-lg font-mono font-black">${commonPot}</span>
          </div>
        </div>
      </header>

      {gameState === GameState.PLAYING && (
        <div className="mb-8 bg-slate-900/40 p-4 rounded-3xl flex items-center justify-center gap-2 overflow-x-auto no-scrollbar border border-slate-800 shadow-inner">
          {currentOrder.map((p, i) => (
            <React.Fragment key={p.id}>
              <div className={`flex items-center gap-3 px-5 py-2 rounded-xl transition-all duration-500 ${i === 0 ? 'bg-emerald-500/20 border border-emerald-500/50 scale-110 shadow-lg' : 'opacity-40 scale-90'}`}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-sm font-black whitespace-nowrap">{p.name}</span>
                {p.id === myId && <span className="text-[8px] bg-slate-800 px-1 rounded ml-1 font-bold">YOU</span>}
              </div>
              {i < currentOrder.length - 1 && <ChevronRight className="w-4 h-4 text-slate-700" />}
            </React.Fragment>
          ))}
        </div>
      )}

      <main>
        {gameState === GameState.MODE_SELECT && (
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 py-12">
            {['369', '59', '9'].map(m => (
              <button key={m} onClick={() => handleBetModeSelect(m as BetMode)} disabled={!isHost} className="bg-slate-900 p-12 rounded-[3rem] border border-slate-800 hover:border-emerald-500 transition-all disabled:opacity-50 group shadow-2xl">
                <Trophy className="w-12 h-12 mx-auto mb-4 text-slate-700 group-hover:text-amber-500 transition-colors" />
                <span className="text-xl font-black">{m} 模式</span>
              </button>
            ))}
          </div>
        )}

        {gameState === GameState.BET_CONFIG && (
          <div className="max-w-2xl mx-auto bg-slate-900 p-10 rounded-[3rem] border border-slate-800 space-y-8 shadow-2xl">
            <h2 className="text-xl font-black">設定獎金金額</h2>
            <div className="grid grid-cols-1 gap-4">
              {Object.keys(betConfig.amounts).map(b => (
                <div key={b} className="flex items-center gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <span className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center font-black">{b}</span>
                  <input type="number" readOnly={!isHost} value={betConfig.amounts[Number(b)]} onChange={(e) => setBetConfig({...betConfig, amounts: {...betConfig.amounts, [Number(b)]: Number(e.target.value)}})} className="bg-transparent text-2xl font-black w-full text-right outline-none focus:text-emerald-400" />
                </div>
              ))}
              <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-xs font-bold text-slate-500">基本罰金</span>
                <input type="number" readOnly={!isHost} value={betConfig.foul} onChange={(e) => setBetConfig({...betConfig, foul: Number(e.target.value)})} className="bg-transparent text-2xl font-black w-full text-right text-red-400 outline-none" />
              </div>
            </div>
            <button onClick={() => setGameState(GameState.WAITING)} disabled={!isHost} className="w-full bg-emerald-600 py-6 rounded-2xl font-black text-xl disabled:opacity-50 active:scale-95 transition-transform shadow-xl shadow-emerald-900/20">進入等待室</button>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${playerCount === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`}>
            {currentOrder.map((p, i) => (
              <div key={p.id} className={`p-6 rounded-[2.5rem] border flex flex-col justify-between min-h-[420px] transition-all relative ${i === 0 ? 'bg-emerald-500/10 border-emerald-500 shadow-emerald-500/10 shadow-2xl' : 'bg-slate-900/40 border-slate-800'}`}>
                {i === 0 && (
                   <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                     <Star className="w-3 h-3 fill-white animate-pulse" /> 打家 (Lead)
                   </div>
                )}
                
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${i === 0 ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-slate-800'}`}>{i + 1}</div>
                    <button onClick={() => handleFoul(p.id)} className="text-red-500 p-2 hover:bg-red-500/10 rounded-xl transition-all"><AlertTriangle /></button>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black flex items-center gap-2">
                       {p.name}
                       {p.id === myId && <span className="text-[10px] text-slate-500 border border-slate-800 px-2 rounded">YOU</span>}
                    </h3>
                    <div className="text-3xl mt-1 tracking-tighter"><MoneyDisplay val={p.earnings} /></div>
                  </div>
                </div>

                <div className="space-y-3 mt-6">
                  {i === 0 && (
                    <button onClick={() => handleClearTableAction(p.id, 'BIG_CLEAR')} className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"><Star className="w-4 h-4" /> 大摸 (${betConfig.bigClear * (playerCount - 1)})</button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {availableBalls.map(b => (
                      <button key={b} onClick={() => handleAction(p.id, b)} className={`py-4 rounded-xl font-black border transition-all active:scale-95 ${b === 9 ? 'bg-emerald-600 border-emerald-400 hover:bg-emerald-500' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}>進 {b}</button>
                    ))}
                  </div>
                  {i === 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800">
                      {availableBalls.map(b => (
                        <button key={`all-${b}`} onClick={() => handleAction(p.id, b, true)} className="py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl text-[10px] font-black hover:bg-amber-500/20 transition-all">全收 {b}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(gameState === GameState.PLAYING || gameState === GameState.SUMMARY) && (
          <div className="mt-12 flex flex-col md:flex-row gap-4 max-w-2xl mx-auto">
             <button onClick={() => setGameState(GameState.SUMMARY)} className="flex-grow bg-slate-900 py-6 rounded-2xl font-black flex items-center justify-center gap-4 border border-slate-800 hover:bg-slate-800 transition-colors shadow-xl"><BarChart3 /> 結算統計</button>
             <button onClick={() => performReset(false)} className="flex-grow bg-red-600/10 text-red-500 py-6 rounded-2xl font-black flex items-center justify-center gap-4 hover:bg-red-600 hover:text-white transition-all shadow-xl"><HomeIcon /> 離開房間</button>
          </div>
        )}

        {gameState === GameState.SUMMARY && (
          <div className="max-w-4xl mx-auto bg-slate-900 p-12 rounded-[4rem] border border-slate-800 mt-8 space-y-12 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="text-4xl font-black text-center">比賽結算</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...players].sort((a, b) => b.earnings - a.earnings).map((p, idx) => (
                <div key={p.id} className={`bg-slate-950 p-8 rounded-[2.5rem] border relative overflow-hidden transition-all duration-700 ${idx === 0 ? 'border-amber-500/50 ring-1 ring-amber-500/20 shadow-2xl shadow-amber-500/10 scale-105' : 'border-slate-800'}`}>
                  {idx === 0 && <div className="absolute top-4 right-6 animate-bounce"><Trophy className="text-amber-500 w-8 h-8" /></div>}
                  <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[10px] font-bold text-slate-600">RANK {idx + 1}</span>
                  <h3 className="text-3xl font-black mt-2">{p.name} {p.id === myId && "(您)"}</h3>
                  <div className="text-3xl mt-1 tracking-tighter"><MoneyDisplay val={p.earnings} /></div>
                </div>
              ))}
            </div>
            <button onClick={() => setGameState(GameState.PLAYING)} className="w-full py-6 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-xl flex items-center justify-center gap-4 transition-colors"><ArrowLeft /> 返回計分</button>
          </div>
        )}
      </main>
      
      {gameState === GameState.PLAYING && (
         <footer className="mt-16 text-center text-slate-700 space-y-2">
            <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest">
               <Info className="w-3 h-3" />
               規則：贏家下一局打家，上家(放水者)下局排第二。
            </div>
         </footer>
      )}
    </div>
  );
};

export default App;
