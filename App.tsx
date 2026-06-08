const API_URL = "https://octopusgame.onrender.com";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Crown, 
  Play, 
  ChevronRight, 
  RotateCcw, 
  Volume2, 
  ShieldAlert, 
  UserPlus, 
  TrendingUp, 
  AlertTriangle,
  UserX,
  VolumeX,
  Sparkles,
  Zap,
  Info,
  Smartphone,
  Tv
} from 'lucide-react';
import { GameState, Participant } from './types';

// Web Audio API synthesized retro effects for Squid Game drama
class SquidAudio {
  private static ctx: AudioContext | null = null;

  private static init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  public static playBeep(freq: number = 880, duration: number = 0.1) {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Ignored
    }
  }

  public static playAlarm() {
    this.playBeep(440, 0.2);
    setTimeout(() => this.playBeep(330, 0.4), 180);
  }

  public static playSuccess() {
    this.playBeep(523.25, 0.15); // C5
    setTimeout(() => this.playBeep(659.25, 0.15), 120); // E5
    setTimeout(() => this.playBeep(783.99, 0.3), 240); // G5
  }

  public static playWhoosh() {
    try {
      this.init();
      if (!this.ctx) return;
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 8.0;
      filter.frequency.setValueAtTime(200, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(1500, this.ctx.currentTime + 0.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start();
    } catch (e) {}
  }
}

export default function App() {
  // Dual layout mode (or role query parse)
  const [activeTab, setActiveTab] = useState<'main' | 'participant'>('main');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localParticipants, setLocalParticipants] = useState<Participant[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Client participant session persistence
  const [myId, setMyId] = useState<string>('');
  const [myNickname, setMyNickname] = useState<string>('');
  const [mySelectedZone, setMySelectedZone] = useState<'A' | 'B' | 'C'>('A');

  // Manual participant add (Presenter aid)
  const [manualName, setManualName] = useState<string>('');
  const [manualZone, setManualZone] = useState<'A' | 'B' | 'C'>('A');

  // Trade visual sequences
  const [activeTransfer, setActiveTransfer] = useState<{
    participant: Participant;
    fromZone: 'A' | 'B' | 'C';
    toZone: 'A' | 'B' | 'C';
  } | null>(null);
  
  const [isAnimatingTrade, setIsAnimatingTrade] = useState<boolean>(false);
  const [recentlyArrivedIds, setRecentlyArrivedIds] = useState<Set<string>>(new Set());

  // Polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Detect URL parameter on launch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleArg = params.get('role');
    if (roleArg === 'participant') {
      setActiveTab('participant');
    } else if (roleArg === 'main') {
      setActiveTab('main');
    }
  }, []);

  // Fetch Polling Engine
  useEffect(() => {
    fetchState();
    pollingRef.current = setInterval(() => {
      if (!isAnimatingTrade) {
        fetchState();
      }
    }, 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isAnimatingTrade]);

  const fetchState = async () => {
    try {
    const res = await fetch(`${API_URL}/api/game/state`);
      if (!res.ok) return;
      const data: GameState = await res.json();
      setGameState(data);

      // --- AUTO-RESET CLIENT STATE ON SERVER RESET ---
      if (data.currentRound === 0 && data.participants.length === 0) {
        if (myId) {
          setMyId('');
          setMyNickname('');
          setMySelectedZone('A');
        }
      } else if (myId && !data.participants.some(p => p.id === myId)) {
        setMyId('');
        setMyNickname('');
      }

      if (!isAnimatingTrade) {
        // Detect transitions & trades comparison with local cache
        if (localParticipants.length > 0 && data.participants.length > 0) {
          const transfers: typeof activeTransfer[] = [];

          data.participants.forEach(sm => {
            const matchedLocal = localParticipants.find(lp => lp.id === sm.id);
            if (matchedLocal && matchedLocal.zone !== sm.zone) {
              transfers.push({
                participant: sm,
                fromZone: matchedLocal.zone,
                toZone: sm.zone
              });
            }
          });

          if (transfers.length > 0) {
            runTradeFlySequencer(transfers, data);
            return;
          }
        }
        setLocalParticipants(data.participants);
      }
    } catch (err) {
      console.warn('Sync issue fetching state:', err);
    }
  };

  const runTradeFlySequencer = async (
    transfers: typeof activeTransfer[],
    finalGameState: GameState
  ) => {
    setIsAnimatingTrade(true);
    if (pollingRef.current) clearInterval(pollingRef.current);

    if (soundEnabled) SquidAudio.playAlarm();

    for (let i = 0; i < transfers.length; i++) {
      const transfer = transfers[i]!;
      setActiveTransfer(transfer);

      if (soundEnabled) {
        setTimeout(() => SquidAudio.playWhoosh(), 300);
      }

      // Smooth sliding update using Framer motion grid layout transition
      setLocalParticipants(prev => 
        prev.map(p => p.id === transfer.participant.id ? { ...p, zone: transfer.toZone } : p)
      );

      // Save arriving participant ID to activate strong flash/pulse animation
      setRecentlyArrivedIds(prev => {
        const next = new Set(prev);
        next.add(transfer.participant.id);
        return next;
      });

      // Show popup overlay for 3.5 seconds
      await new Promise(resolve => setTimeout(resolve, 3500));
      setActiveTransfer(null);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setLocalParticipants(finalGameState.participants);
    setGameState(finalGameState);
    setIsAnimatingTrade(false);

    // Expire arrival highlights after 4 seconds
    setTimeout(() => {
      setRecentlyArrivedIds(new Set());
    }, 4000);

    // Resume normal Polling
    pollingRef.current = setInterval(() => {
      if (!isAnimatingTrade) {
        fetchState();
      }
    }, 1000);
  };

  // ----------------------------------------------------
  // REST CLIENT API MUTATION TRIGGERS
  // ----------------------------------------------------
  const startTimerAction = async () => {
    if (soundEnabled) SquidAudio.playBeep(1000, 0.45);
    try {
      const res = await fetch(`${API_URL}/api/game/admin/start-timer`, {
  method: 'POST'
});

      if (res.ok) {
        const data = await res.json();
        setGameState(data);
        setLocalParticipants(data.participants);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const advanceStepAction = async () => {
    if (!gameState) return;
    if (soundEnabled) SquidAudio.playBeep(600, 0.2);
    
    let pathEndpoint = '/api/game/admin/next-round';
    
    if (gameState.currentRound > 0) {
      if (gameState.step === 'INTRO') {
        pathEndpoint = '/api/game/admin/start-timer';
      } else if (gameState.step === 'VOTING') {
        pathEndpoint = '/api/game/admin/trigger-ejection';
      } else if (gameState.step === 'EJECTION') {
        pathEndpoint = '/api/game/admin/trigger-trade';
      } else if (gameState.step === 'TRADE_TIME') {
        pathEndpoint = '/api/game/admin/next-round';
      }
    }

    try {
      const res = await fetch(pathEndpoint, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGameState(data);
        setLocalParticipants(data.participants);
        if (soundEnabled) SquidAudio.playSuccess();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const seedBotsAction = async () => {
    if (soundEnabled) SquidAudio.playBeep(480, 0.15);
    try {
      const res = await fetch('/api/game/admin/seed-bots', { method: 'POST' });
      if (res.ok) {
        const body = await res.json();
        setGameState(body.state);
        setLocalParticipants(body.state.participants);
        if (soundEnabled) SquidAudio.playSuccess();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resetGameAction = async () => {
    if (soundEnabled) SquidAudio.playBeep(220, 0.5);
    if (!confirm('Are you sure you want to reset the entire survival game? All current standby/participant data will be permanently cleared.')) return;
    try {
      const res = await fetch('/api/game/admin/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGameState(data);
        setLocalParticipants([]);
        setRecentlyArrivedIds(new Set());
        setActiveTransfer(null);
        // Clean participant state to return to registration lobby
        setMyId('');
        setMyNickname('');
        setMySelectedZone('A');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;
    try {
      const res = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: manualName, zone: manualZone }),
      });
      if (res.ok) {
        setManualName('');
        fetchState();
        if (soundEnabled) SquidAudio.playBeep(1200, 0.1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Participant Registration Submission
  const handleClientEnroll = async () => {
    if (!myNickname.trim()) {
      alert("Please enter a unique, stylish nickname to join the survival!");
      return;
    }
    try {
      const res = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: myNickname, zone: mySelectedZone }),
      });
      if (res.ok) {
        const data = await res.json();
        setMyId(data.participant.id);
        fetchState();
        if (soundEnabled) SquidAudio.playSuccess();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Leader Cast Votes (RED or BLUE)
  const castLeaderVote = async (choice: 'RED' | 'BLUE') => {
    if (!myId) return;
    try {
      const res = await fetch('/api/game/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: myId, vote: choice }),
      });
      if (res.ok) {
        if (soundEnabled) SquidAudio.playBeep(850, 0.12);
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Leader Cast direct member ejection touch
  const castLeaderEject = async (targetId: string) => {
    if (!myId) return;
    try {
      const res = await fetch('/api/game/eject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderId: myId, targetId }),
      });
      if (res.ok) {
        if (soundEnabled) SquidAudio.playBeep(320, 0.22);
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Quick presenter assist manual vote override (directly on main board click)
  const castManualPresenterVote = async (zone: 'A' | 'B' | 'C', choice: 'RED' | 'BLUE') => {
    if (!gameState) return;
    const leaderId = gameState.leaders[zone];
    if (!leaderId) {
      alert(`The leader of Zone ${zone} has not been chosen yet, cannot simulate votes.`);
      return;
    }
    try {
      const res = await fetch('/api/game/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: leaderId, vote: choice }),
      });
      if (res.ok) {
        if (soundEnabled) SquidAudio.playBeep(800, 0.1);
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const castManualPresenterEject = async (zone: 'A' | 'B' | 'C', targetId: string) => {
    if (!gameState) return;
    const leaderId = gameState.leaders[zone];
    if (!leaderId) return;
    try {
      const res = await fetch('/api/game/eject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderId, targetId }),
      });
      if (res.ok) {
        if (soundEnabled) SquidAudio.playBeep(300, 0.2);
        fetchState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Count down remaining
  const getTimerRemaining = () => {
    if (!gameState || !gameState.timerActive || !gameState.timerStartTimestamp) return 0;
    const elapsed = Math.floor((Date.now() - gameState.timerStartTimestamp) / 1000);
    const rem = gameState.timerDuration - elapsed;
    return rem > 0 ? rem : 0;
  };

  const timerVal = getTimerRemaining();

  // ----------------------------------------------------
  // SCRIPTS DATA HARDCODED ( 카드뉴스 텍스트용 )
  // ----------------------------------------------------
  const GAME_SCRIPTS = [
    {
      round: 1,
      title: "📌 Round 1: The Red or Blue Button",
      scenario: "You are locked in a room. There are two buttons in front of you.",
      choices: "🔵 Blue: We can survive together\n\n🔴 Red: Who are you? I can’t believe in you guys. I will survive alone",
      rules: "If all teams choose Blue, everyone survives peacefully. However, if more than half of the people choose Red, only the Red choosers survive, and everyone else dies. You have 30 seconds to talk, and your team should choose either blue or red. Go! Time is up! Which button did you choose? In return for this survival, the Red team must trade one member to another group. Remember, even if you move to a new team, you must keep your original number card with you."
    },
    {
      round: 2,
      title: "📌 Round 2: Zombie Apocalypse in Woolworths",
      scenario: "A zombie crisis has started. You are now stuck inside Woolworths with very little food.",
      choices: "🔵 Blue (Sharing): We share the food and wait for rescue to survive together.\n\n🔴 Red (Stealing): We steal food from other teams to feed ourselves.",
      rules: "If your team chooses Red again, you must trade another member randomly. 30 seconds. Start! Teams that chose Red, please change one of your members right now."
    },
    {
      round: 3,
      title: "📌 Round 3: The Runaway Train (Final Battle)",
      scenario: "A runaway train is coming at 150 km/h. There are old workers on the track.",
      choices: "🔵 Blue (Emergency Brake): We stop the train to save the workers. Our team will take a heavy physical impact, which might cause serious injuries.\n\n🔴 Red (Safety Wall): We build a wall to protect ourselves.",
      rules: "This is your final choice. 30 seconds, go! The game is over. You must trade another member again. Now, please open your secret score cards. Teams, add up all the numbers of your current members. The team with the highest score wins!"
    }
  ];

  // Visual Theme Mappings
  const zoneColors = {
    A: {
      neon: 'border-emerald-500 bg-emerald-950/20 text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
      text: 'text-emerald-400',
    },
    B: {
      neon: 'border-pink-500 bg-pink-950/20 text-pink-400',
      badge: 'bg-pink-500/20 text-pink-400 border border-pink-500/30',
      text: 'text-pink-400',
    },
    C: {
      neon: 'border-cyan-500 bg-cyan-950/20 text-cyan-400',
      badge: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
      text: 'text-cyan-400',
    },
  };

  const isLobby = !gameState || gameState.currentRound === 0;
  const selfObj = gameState?.participants.find(p => p.id === myId);

  const getZoneLuckyNumSum = (zoneId: 'A' | 'B' | 'C') => {
    return localParticipants
      .filter(p => p.zone === zoneId)
      .reduce((sum, p) => sum + (p.num || 0), 0);
  };

  const luckySumA = getZoneLuckyNumSum('A');
  const luckySumB = getZoneLuckyNumSum('B');
  const luckySumC = getZoneLuckyNumSum('C');
  const maxLuckySum = Math.max(luckySumA, luckySumB, luckySumC);

  const winningZones = (['A', 'B', 'C'] as const).filter(z => {
    const sum = z === 'A' ? luckySumA : z === 'B' ? luckySumB : luckySumC;
    return sum === maxLuckySum && sum > 0;
  });

  // ----------------------------------------------------
  // GESTION INDEPENDANT SIMULATOR (Independent Simulator Console)
  // ----------------------------------------------------
  const [isSimCollapsed, setIsSimCollapsed] = useState<boolean>(false);

  const simPerformRandomVotes = async () => {
    if (!gameState || gameState.step !== 'VOTING') {
      alert("Virtual voting simulations can only be executed in the VOTING state.");
      return;
    }
    const zones = ['A', 'B', 'C'] as const;
    for (const z of zones) {
      const leaderId = gameState.leaders[z];
      if (leaderId && !gameState.votes[z]) {
        await fetch('/api/game/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantId: leaderId, vote: Math.random() < 0.5 ? 'BLUE' : 'RED' }),
        });
      }
    }
    fetchState();
  };

  const simPerformRandomEjection = async () => {
    if (!gameState || gameState.step !== 'EJECTION') {
      alert("Member ejections can only be executed during the active EJECTION stage.");
      return;
    }
    const zones = ['A', 'B', 'C'] as const;
    for (const z of zones) {
      if (gameState.votes[z] === 'RED' && !gameState.ejected[z]) {
        const leaderId = gameState.leaders[z];
        const zoneMembers = gameState.participants.filter(p => p.zone === z);
        if (leaderId && zoneMembers.length > 0) {
          const eligible = zoneMembers.filter(p => p.id !== leaderId);
          const candidates = eligible.length > 0 ? eligible : zoneMembers;
          const randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
          
          await fetch('/api/game/eject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leaderId, targetId: randomTarget.id }),
          });
        }
      }
    }
    fetchState();
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-pink-500 selection:text-white font-sans relative overflow-x-hidden pb-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,0,127,0.04)_0%,transparent_80%)] pointer-events-none" />

      {/* GLOBAL SCREEN TYPE SWITCHER TABS - FOR DIRECT CONSOLE REHEARSAL */}
      <div className="bg-zinc-950 border-b border-zinc-900 sticky top-0 z-50 px-4 py-2 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border border-pink-500 block"></span>
          <span className="text-xs font-black tracking-wider uppercase text-zinc-300">STAGE WORKSPACE SYSTEM SETUP</span>
        </div>
        
        <div className="flex bg-black p-1 rounded-xl border border-zinc-850">
          <button 
            onClick={() => setActiveTab('main')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'main' 
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md shadow-pink-500/20' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            🖥️ Large Scoring Board
          </button>
          <button 
            onClick={() => setActiveTab('participant')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'participant' 
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/20' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            📱 Participant Mobile Mode
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 🖥️ 1. VIEW SCREEN : MAIN BROADCAST SCREEN                 */}
      {/* ======================================================== */}
      {activeTab === 'main' && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
          
          <header className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-zinc-850 bg-zinc-950/70 p-5 rounded-3xl mb-8 relative">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="w-8 h-8 rounded-full border-2 border-[#FF007F] flex items-center justify-center font-bold text-[#FF007F] text-xs shadow-[0_0_8px_#ff007f]">○</span>
                <span className="w-8 h-8 border-2 border-[#00FFFF] flex items-center justify-center font-bold text-[#00FFFF] rotate-45 transform text-[10px] shadow-[0_0_8px_#00ffff]">▲</span>
                <span className="w-8 h-8 border-2 border-[#00FF55] flex items-center justify-center font-bold text-[#00FF55] text-xs shadow-[0_0_8px_#00ff55]">■</span>
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-widest text-white leading-none">
                  SURVIVAL MAIN <span className="text-[#FF007F] animate-pulse"> SCOREBOARD </span>
                </h1>
                <p className="text-[9px] text-zinc-500 font-mono tracking-wider mt-1">REAL-TIME LARGE SCREEN SYNCHRONIZE PROTOCOL</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={seedBotsAction}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border border-cyan-400/40 text-white text-xs font-black tracking-widest uppercase rounded-2xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-95"
              >
                <Users className="w-4 h-4 text-cyan-300 animate-pulse" />
                <span>🤖 Seed 14 System Bots</span>
              </button>

              {gameState && gameState.currentRound > 0 && (
                <div className="flex items-center gap-3 bg-black px-4 py-2 rounded-2xl border border-zinc-800">
                  <div className="text-right">
                    <span className="text-[9px] text-zinc-500 font-mono block">STAGE ROUND</span>
                    <span className="text-sm font-black text-[#00FFFF]">ROUND 0{gameState.currentRound}</span>
                  </div>
                  <div className="w-px h-6 bg-zinc-800" />
                  <div className="text-right">
                    <span className="text-[9px] text-zinc-500 font-mono block">STATE VALUE</span>
                    <span className="text-sm font-bold text-pink-500 tracking-wider uppercase">{gameState.step}</span>
                  </div>
                </div>
              )}
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 rounded-xl transition cursor-pointer"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-450 animate-bounce" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* presenter control rail */}
            <div className="lg:col-span-1 space-y-6">
              <div className="rounded-2xl border-2 border-pink-500 bg-zinc-950 p-5 shadow-2xl relative overflow-hidden shadow-[0_0_15px_rgba(255,0,127,0.15)]">
                <div className="absolute top-0 left-0 right-0 h-1 bg-pink-500" />
                <h3 className="text-xs font-extrabold text-[#FF007F] tracking-widest mb-4 uppercase flex items-center gap-1">
                  <Crown className="w-4 h-4" /> HOST CONTROL CENTER PANEL
                </h3>

                {gameState && gameState.timerActive && (
                  <div className="mb-4 bg-black border border-pink-500/30 rounded-xl p-3 text-center">
                    <span className="text-[9px] text-zinc-500 block mb-0.5 uppercase tracking-wider font-mono">COUNTDOWN CLOCK</span>
                    <span className={`text-4xl font-mono font-black ${timerVal <= 5 ? 'text-red-500 animate-pulse' : 'text-[#00FFFF]'}`}>
                      00:{timerVal.toString().padStart(2, '0')}
                    </span>
                    <div className="w-full bg-zinc-900 h-1 mt-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${timerVal <= 5 ? 'bg-red-500' : 'bg-[#00FFFF]'}`}
                        style={{ width: `${(timerVal / gameState.timerDuration) * 100}%`, transition: 'width 1s linear' }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {isLobby ? (
                    <button
                      onClick={startTimerAction}
                      className="w-full py-4 text-sm font-black text-white bg-pink-600 hover:bg-pink-500 rounded-xl transition-all shadow-[0_0_15px_rgba(255,0,127,0.3)] animate-pulse"
                    >
                      ✅ All Participants Ready (START)
                    </button>
                  ) : (
                    <>
                      {!gameState.timerActive && gameState.step !== 'TRADE_TIME' && gameState.currentRound <= 3 && (
                        <button
                          onClick={startTimerAction}
                          className="w-full py-4 text-xs font-black text-[#00FF55] border-2 border-[#00FF55] hover:bg-[#00FF55]/10 rounded-xl transition-all shadow-[0_0_10px_rgba(0,255,85,0.1)]"
                        >
                          ⏱️ Start Timer (30s Decision limit)
                        </button>
                      )}

                      {gameState.currentRound <= 3 && (
                        <button
                          onClick={advanceStepAction}
                          className="w-full py-3 text-xs font-bold text-[#00FFFF] border border-[#00FFFF]/60 bg-[#00FFFF]/5 hover:bg-[#00FFFF]/10 rounded-xl transition"
                        >
                          Next Step Sequence [NEXT] ▶
                        </button>
                      )}
                    </>
                  )}

                  <div className="pt-3 border-t border-zinc-900 flex justify-between gap-2.5">
                    <button
                      onClick={resetGameAction}
                      className="w-full py-2.5 text-[10px] font-bold bg-red-955/20 border border-red-900/40 text-red-400 rounded-lg hover:bg-red-900/30 text-center"
                    >
                      🔄 Force Hard Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* main visual lanes */}
            <div className="lg:col-span-3 space-y-6">
              
              {/* BRAND BROADCAST WARNING BANNER (Red 방출 심사 돌입 단계시) */}
              {gameState && gameState.step === 'EJECTION' && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-red-950/30 via-black to-red-950/30 border-3 border-pink-500/80 animate-pulse text-center">
                  <h4 className="text-2xl font-black text-rose-100 uppercase tracking-wider">
                    📢 Zones that chose RED must expel 1 member!
                  </h4>
                  <p className="text-xs text-rose-400 mt-1">
                    Zone leaders must pick 1 member to expel. If the timer expires, the system will eject a random teammate automatically within 20 seconds.
                  </p>
                </div>
              )}

              {/* BRAND BROADCAST WARNING BANNER (Trade 타임 방출 조치 발령시) */}
              {gameState && gameState.step === 'TRADE_TIME' && (
                <div className="p-6 rounded-3xl bg-gradient-to-b from-purple-950/30 via-black to-purple-950/30 border-3 border-cyan-400 text-center space-y-4 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
                  <div className="space-y-1.5 animate-pulse">
                    <h4 className="text-2xl md:text-3xl font-black text-[#00FFFF] uppercase tracking-widest neon-text-pink">
                      🚨 Executive Ejection Relocation Order!
                    </h4>
                    <p className="text-sm text-zinc-200 max-w-2xl mx-auto leading-relaxed">
                      "Expelled agents must leave their personal belongings silently at their current seats, and <strong className="text-yellow-400 font-extrabold uppercase">quietly walk with only themselves to the newly assigned refuge zone specified on the board list below!</strong>"
                    </p>
                  </div>

                  {/* Relocation targets detail card box as requested */}
                  <div className="max-w-2xl mx-auto p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800 space-y-3">
                    <span className="text-[10px] text-zinc-500 font-mono tracking-widest block uppercase font-black">
                      ACTIVE VERIFIED TRANSFERS LIST
                    </span>
                    <div className="space-y-2.5 text-left">
                      {gameState.transitionLogs && gameState.transitionLogs.filter(log => log.includes('Trade Ejection:') || log.includes('transferred')).length > 0 ? (
                        gameState.transitionLogs
                          .filter(log => log.includes('Trade Ejection:') || log.includes('transferred'))
                          .map((log, idx) => (
                            <div key={idx} className="p-3 bg-zinc-900 border border-zinc-850 rounded-xl flex items-center gap-3 font-mono text-xs font-extrabold text-[#00FFFF] border-l-4 border-l-pink-500 shadow-inner">
                              <span className="text-pink-500 text-sm">🚶</span>
                              <span className="leading-tight">{log.replace('🔄 Trade Ejection: ', '')}</span>
                            </div>
                          ))
                      ) : (
                        <div className="text-xs text-zinc-500 py-3 text-center italic">Processing network relocation parameters...</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STRIKING RED BLUE CENTRAL DESCRIPTION AND IMAGERY COVER (VOTING STEP ONLY) */}
              {gameState && gameState.step === 'VOTING' && (() => {
                const matchedScript = GAME_SCRIPTS.find(s => s.round === gameState.currentRound) || GAME_SCRIPTS[0];
                const scenarioImg = gameState.currentRound === 1 ? "/round1.png" : gameState.currentRound === 2 ? "/round2.png" : "/round3.png";

                return (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative">
                    {/* Header bar */}
                    <div className="bg-black/90 p-3.5 border-b border-zinc-850 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase font-bold">
                          CHIEF SELECTION INTERACTIVE STATE - ROUND ACTIVE
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-pink-500/10 border border-pink-500/30 rounded text-[9px] font-bold text-[#FF007F] font-mono tracking-widest uppercase">
                        MISSION BRIEFING
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
                      {/* Image block (6 columns) */}
                      <div className="md:col-span-7 relative h-72 md:h-[420px] bg-zinc-900 border-r border-zinc-900 overflow-hidden">
                        <img 
                          src={scenarioImg} 
                          alt="Round visual scenario cover"
                          className="w-full h-full object-cover brightness-75 hover:scale-102 transition duration-700"
                          referrerPolicy="no-referrer"
                        />
                        {/* Dynamic backdrop shade */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                        
                        {/* Floating button design inside the visual panel as requested */}
                        <div className="absolute bottom-4 left-4 right-4 z-10 flex gap-4">
                          <button 
                            onClick={() => castManualPresenterVote('A', 'BLUE')}
                            className="flex-1 bg-blue-600/90 hover:bg-blue-600 border border-blue-400/50 p-4 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] backdrop-blur-md active:scale-95 cursor-pointer"
                          >
                            <span className="text-2xl md:text-3xl">🔵</span>
                            <span className="text-[9px] md:text-[10px] font-black tracking-widest uppercase text-center">BLUE CO-SURVIVE</span>
                          </button>

                          <button 
                            onClick={() => castManualPresenterVote('A', 'RED')}
                            className="flex-1 bg-red-650/90 hover:bg-red-650 border border-red-500/50 p-4 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] backdrop-blur-md active:scale-95 cursor-pointer animate-pulse"
                          >
                            <span className="text-2xl md:text-3xl">🔴</span>
                            <span className="text-[9px] md:text-[10px] font-black tracking-widest uppercase text-center">RED EXCLUSION</span>
                          </button>
                        </div>
                      </div>

                      {/* Scenario/Details description block (5 columns) */}
                      <div className="md:col-span-5 p-6 flex flex-col justify-between space-y-4 bg-zinc-950">
                        <div>
                          <span className="text-[10px] text-[#00FFFF] font-mono tracking-widest block uppercase font-bold">
                            ROUND 0{gameState.currentRound} MISSION PREVIEW
                          </span>
                          <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight mt-1 leading-snug">
                            {matchedScript.title}
                          </h3>
                          
                          <div className="mt-4 space-y-3 font-mono text-[11px] leading-relaxed text-zinc-300 max-h-[240px] overflow-y-auto pr-1">
                            <p className="font-sans font-bold text-zinc-400 uppercase tracking-wider text-[9px] border-b border-zinc-900 pb-1 mb-1.5">
                              📖 The Scenario
                            </p>
                            <p className="whitespace-pre-line italic">"{matchedScript.scenario}"</p>
                            
                            <p className="font-sans font-bold text-zinc-400 uppercase tracking-wider text-[9px] border-b border-zinc-900 pb-1 pt-2 mb-1.5">
                              ⚡ Choices & Verdict Rules
                            </p>
                            <p className="whitespace-pre-line text-[#00FFFF]">{matchedScript.choices}</p>
                            <p className="whitespace-pre-line text-zinc-400 text-[10px] leading-normal pt-2 border-t border-zinc-900 mt-2">
                              {matchedScript.rules}
                            </p>
                          </div>
                        </div>

                        {/* Ticking indicator info at the bottom of panel */}
                        <div className="p-3 bg-zinc-900/40 border border-zinc-900 rounded-xl text-center">
                          <span className="text-[9px] text-zinc-500 font-bold block uppercase tracking-wider">
                            VOTE TRANSMITTED OVERVIEW
                          </span>
                          <div className="flex gap-2.5 justify-center items-center mt-1.5 font-mono text-[10px] md:text-xs">
                            <span className="text-emerald-400">Zone A: {gameState.votes.A ? `${gameState.votes.A} ✓` : '...'}</span>
                            <span className="text-zinc-650">|</span>
                            <span className="text-pink-400">Zone B: {gameState.votes.B ? `${gameState.votes.B} ✓` : '...'}</span>
                            <span className="text-zinc-650">|</span>
                            <span className="text-cyan-400">Zone C: {gameState.votes.C ? `${gameState.votes.C} ✓` : '...'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {isLobby ? (
                <div className="p-12 text-center rounded-3xl border border-dashed border-zinc-805 bg-zinc-950/40 space-y-5">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-850 flex items-center justify-center mx-auto text-2xl text-zinc-500">
                    👥
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-xl font-bold">Waiting for Agents to Join</h3>
                    <p className="text-xs text-zinc-400 max-w-md mx-auto">Please select your nickname and seating zone in your mobile screen to enter the lobby. Real-time board slots will assign dynamically.</p>
                  </div>
                  <div className="text-xs text-[#00FFFF] font-mono">Current Standby Count: {localParticipants.length} Agents</div>
                </div>
              ) : gameState.step === 'FINISHED' ? (
                <div className="space-y-6 bg-zinc-950/90 border-2 border-yellow-500/50 p-8 rounded-3xl relative overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(234,179,8,0.08)_0%,transparent_75%)] shadow-2xl">
                  {/* Glowing header banner */}
                  <div className="text-center space-y-3">
                    <span className="px-5 py-1.5 bg-yellow-400 text-black rounded-full text-xs font-black tracking-widest uppercase shadow-[0_0_15px_rgba(234,179,8,0.4)] inline-block">
                      🏆 "Survival Final Settlement: Winning Zone Declare 🏆
                    </span>
                    <h2 className="text-4xl md:text-6xl font-black text-white tracking-widest uppercase mb-1">
                      THE END OF SURVIVAL
                    </h2>
                    <p className="text-zinc-400 text-xs md:text-sm max-w-xl mx-auto leading-relaxed">
                     All 3 rounds have concluded without incident. The final winning team will be announced by tallying the total scores of team members' unique Elimination Defense Numbers (#Card ID)!
                    </p>
                  </div>

                  {/* Calculations and Rankings Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                    {(['A', 'B', 'C'] as const).map(zoneId => {
                      const members = localParticipants.filter(p => p.zone === zoneId);
                      const luckyNumSum = members.reduce((sum, p) => sum + (p.num || 0), 0);
                      const isWinner = winningZones.includes(zoneId);

                      return (
                        <div 
                          key={zoneId}
                          className={`p-6 rounded-3xl border-2 ${isWinner ? 'border-yellow-400 bg-yellow-950/20 shadow-[0_0_20px_rgba(234,179,8,0.25)] scale-102 font-bold' : 'border-zinc-850 bg-zinc-950/40 opacity-70'} flex flex-col min-h-[400px] transition-all`}
                        >
                          <div className="flex items-center justify-between pb-3 border-b border-zinc-900 mb-4">
                            <div>
                              <h4 className="text-sm font-black text-white uppercase tracking-wider">
                                {zoneId === 'A' && 'A Zone'}
                                {zoneId === 'B' && 'B Zone'}
                                {zoneId === 'C' && 'C Zone '}
                              </h4>
                              <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{members.length} Residents Moved In</span>
                            </div>
                            {isWinner && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest bg-yellow-400 text-black animate-bounce shadow">
                                👑 WINNER
                              </span>
                            )}
                          </div>

                          {/* Sum display card */}
                          <div className="py-5 px-3 rounded-2xl bg-black border border-zinc-900 text-center space-y-1 mb-4 select-none">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest block font-bold">Total Unique ID Score </span>
                            <span className={`text-5xl font-mono font-black ${isWinner ? 'text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'text-zinc-350'}`}>
                              {luckyNumSum} 
                            </span>
                          </div>

                          {/* Member list with their lucky nums and scores */}
                          <div className="flex-1 overflow-y-auto space-y-2 max-h-[220px] pr-1">
                            {members.map(p => (
                              <div key={p.id} className="p-3 rounded-xl border border-zinc-900 bg-zinc-900/40 flex items-center justify-between text-xs transition">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-zinc-950 border border-zinc-850 flex items-center justify-center font-mono font-bold text-[10px] text-yellow-400">
                                    #{p.num}
                                  </span>
                                  <span className="font-extrabold text-[#00FFFF]">{p.nickname}</span>
                                  {p.isBot && <span className="text-[8px] px-1 bg-sky-950 border border-sky-850 text-sky-455 rounded font-mono">BOT</span>}
                                </div>
                                <span className="text-[9px] text-zinc-500 font-mono font-bold">{p.score || 120} Point</span>
                              </div>
                            ))}
                            {members.length === 0 && (
                              <div className="text-zinc-650 text-center py-8 text-xs italic">No surviving agents detected in this sector.</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Winner announcement text banner */}
                  <div className="p-6 bg-yellow-400/10 border-2 border-yellow-400/40 rounded-2xl text-center max-w-2xl mx-auto space-y-2 animate-pulse shadow-lg">
                    <h3 className="text-lg md:text-xl font-black text-yellow-300 tracking-wider">
                      👑 The Ultimate Champion: {winningZones.map(z => `${z}zone`).join(', ')} 👑
                    </h3>
                    <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                      Verification Results: Total #Card ID Scores of Surviving Agents by Zone,{' '}
                      <span className="text-yellow-400 font-extrabold underline">{winningZones.map(z => `${z}zone`).join(', ')}</span>has successfully captured the final victory!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* COMPACT ACTIVE ROUND INDICATOR BANNER - NO English script lines, highly neat */}
                  {gameState && gameState.currentRound > 0 && (
                    <div className="bg-[#0b0c10] border border-zinc-800 rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(255,0,127,0.06)_0%,transparent_60%)] animate-fade-in shadow-xl">
                      <div className="flex items-center gap-4">
                        <img 
                          src={gameState.currentRound === 1 ? "/round1.png" : gameState.currentRound === 2 ? "/round2.png" : "/round3.png"} 
                          alt={`Round ${gameState.currentRound}`}
                          className="w-14 h-14 object-cover rounded-xl border border-zinc-800 shadow"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <span className="text-[9px] text-[#FF007F] font-black tracking-widest uppercase font-mono bg-[#FF007F]/10 px-2.5 py-0.5 rounded border border-[#FF007F]/30">
                            ROUND ACTIVE
                          </span>
                          <h2 className="text-xl font-black text-white mt-1 uppercase tracking-tight">
                            {gameState.currentRound === 1 && "Round 01: The Red or Blue Button"}
                            {gameState.currentRound === 2 && "Round 02: Zombie Apocalypse in Woolworths"}
                            {gameState.currentRound === 3 && "Round 03: The Runaway Train (Final Battle)"}
                          </h2>
                        </div>
                      </div>

                      {/* Display symbols badge in the center/right */}
                      <div className="flex items-center gap-2 bg-black/40 px-4 py-2 border border-zinc-800 rounded-2xl font-mono shrink-0">
                        {gameState.currentRound === 1 && (
                          <>
                            <span className="w-5 h-5 rounded-full border-2 border-emerald-500 flex items-center justify-center text-xs font-bold text-emerald-400">○</span>
                            <span className="text-xs text-emerald-400 font-extrabold tracking-wider uppercase">CIRCLE SHAPE</span>
                          </>
                        )}
                        {gameState.currentRound === 2 && (
                          <>
                            <span className="w-5 h-5 border-2 border-pink-500 rotate-45 transform flex items-center justify-center text-[10px] font-bold text-pink-400">▲</span>
                            <span className="text-xs text-pink-500 font-extrabold tracking-wider uppercase">TRIANGLE SHAPE</span>
                          </>
                        )}
                        {gameState.currentRound === 3 && (
                          <>
                            <span className="w-5 h-5 border-2 border-cyan-400 flex items-center justify-center text-xs font-bold text-cyan-400">■</span>
                            <span className="text-xs text-cyan-400 font-extrabold tracking-wider uppercase">SQUARE SHAPE</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {(['A', 'B', 'C'] as const).map(zoneId => {
                    const zoneStyle = zoneColors[zoneId];
                    const members = localParticipants.filter(p => p.zone === zoneId);
                    const isZoneRed = gameState.votes[zoneId] === 'RED';
                    const isZoneBlue = gameState.votes[zoneId] === 'BLUE';
                    const isEjectingStage = gameState.step === 'EJECTION' && isZoneRed;

                    return (
                      <div 
                        key={zoneId}
                        className={`p-5 rounded-2xl border-2 ${zoneStyle.neon} flex flex-col min-h-[460px] bg-zinc-950/70 transition-all`}
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-zinc-805 mb-4">
                          <div>
                            <h4 className="text-sm font-extrabold text-white">
                              {zoneId === 'A' && 'A zone (TEAM GREEN)'}
                              {zoneId === 'B' && 'B zone (TEAM PINK)'}
                              {zoneId === 'C' && 'C zone (TEAM CYAN)'}
                            </h4>
                            <span className="text-[9px] text-zinc-500 font-mono tracking-widest uppercase">{members.length} MEMBERS IN</span>
                          </div>

                          {isZoneRed && <span className="text-[8px] bg-red-650 text-white font-extrabold px-1.5 py-0.5 rounded animate-pulse">🔴 RED</span>}
                          {isZoneBlue && <span className="text-[8px] bg-blue-600 text-white font-extrabold px-1.5 py-0.5 rounded">🔵 BLUE</span>}
                          {!isZoneRed && !isZoneBlue && <span className="text-[10px] text-zinc-500 font-mono">Standby</span>}
                        </div>

                        {/* Chief Display on board */}
                        {members.length > 0 && (
                          <div className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs mb-3 text-amber-200">
                            <span className="font-bold">👑 Leader: {members.find(m => m.id === gameState.leaders[zoneId])?.nickname || 'Awaiting Selection'}</span>
                          </div>
                        )}

                        <div className="flex-1 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                          <AnimatePresence mode="popLayout">
                            {members.map(p => {
                              const isChief = gameState.leaders[zoneId] === p.id;
                              const isEjectedTarget = gameState.ejected[zoneId] === p.id;
                              const isArrived = recentlyArrivedIds.has(p.id);

                              return (
                                <motion.div
                                  key={p.id}
                                  layoutId={`card-${p.id}`}
                                  layout
                                  transition={{
                                    type: "spring",
                                    stiffness: 90,
                                    damping: 14
                                  }}
                                  className={`p-3 rounded-lg border transition-colors relative ${
                                    isArrived 
                                      ? 'border-pink-500 bg-pink-950/40 text-pink-400 font-bold scale-102 shadow-[0_0_12px_#ff007f]' 
                                      : isEjectedTarget 
                                      ? 'border-yellow-600 bg-yellow-950/20 opacity-80' 
                                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-zinc-950 border border-zinc-700 flex items-center justify-center font-mono font-bold text-[10px] text-zinc-400">
                                        #{p.num}
                                      </span>
                                      <span className="font-bold text-white leading-none">{p.nickname}</span>
                                      {p.isBot && <span className="text-[8px] px-1 bg-sky-950 border border-sky-850 text-sky-450 rounded font-mono">BOT</span>}
                                    </div>

                                    <div className="flex items-center gap-1">
                                      {isChief && <span className="text-amber-400 text-[10px]" title="Decision Maker">👑</span>}
                                      {isEjectingStage && !isChief && (
                                        <button 
                                          onClick={() => castManualPresenterEject(zoneId, p.id)}
                                          className="px-1.5 py-0.5 bg-red-650 hover:bg-red-500 text-white rounded text-[8px] font-bold"
                                        >
                                          Release
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-1 flex items-center justify-between text-[8px] text-zinc-500 font-mono">
                                    <span></span>
                                    <span>{p.score || 120} P</span>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

              {/* TRANSITION TIMELINE EVENT HISTORIES */}
              {gameState && gameState.transitionLogs && gameState.transitionLogs.length > 0 && (
                <div className="p-4 bg-zinc-950 border border-zinc-850 rounded-2xl">
                  <h4 className="text-xs font-bold text-[#FF007F] tracking-widest uppercase flex items-center gap-1 mb-3">
                    <ShieldAlert className="w-4 h-4" /> Trade & Transfer Log
                  </h4>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto font-mono text-[11px] text-zinc-300">
                    {gameState.transitionLogs.map((log, idx) => (
                      <p key={idx} className="leading-relaxed odd:text-zinc-450"><span className="text-[#FF007F] font-bold">[TR-{idx+1}]</span> {log}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 📱 2. VIEW SCREEN : MOBILE PARTICIPANT SCREEN             */}
      {/* ======================================================== */}
      {activeTab === 'participant' && (
        <div className="max-w-md mx-auto px-4 pt-8">
          
          {!myId ? (
            /* IF GAME ALREADY STARTED */
            gameState && gameState.currentRound > 0 ? (
              <div className="space-y-6 text-center py-10 px-6 bg-zinc-950 border border-zinc-900 rounded-3xl">
                <div className="w-16 h-16 mx-auto bg-red-950/30 border border-red-500/30 text-red-500 rounded-full flex items-center justify-center text-2xl animate-pulse">
                  🔒
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-md font-black text-red-500 uppercase tracking-widest">Intake Closed</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    The survival game is currently in progress. Registration has been closed by the host. Please spectate and wait for the next game!
                  </p>
                </div>
              </div>
            ) : (
              /* ENROLL FORM */
              <div className="space-y-6">
                <div className="text-center space-y-1.5">
                  <span className="px-2.5 py-0.5 bg-teal-950 text-teal-400 border border-teal-800 text-[9px] font-black tracking-widest uppercase rounded">PARTICIPANT GATEWAY</span>
                  <h2 className="text-2xl font-black">Survival Agent Transfer System</h2>
                  <p className="text-xs text-zinc-400">Please enter your unique nickname and select your designated zone.</p>
                </div>

                <div className="p-6 rounded-3xl bg-zinc-950 border border-zinc-850 space-y-5 shadow-2xl">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">Agent ID</label>
                    <input 
                      type="text" 
                      value={myNickname}
                      onChange={e => setMyNickname(e.target.value)}
                      placeholder="Enter Nickname" 
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">Physical Landing Zone</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['A', 'B', 'C'] as const).map(zone => (
                        <button
                          key={zone}
                          onClick={() => setMySelectedZone(zone)}
                          className={`py-3.5 rounded-xl border-2 font-black transition-all ${
                            mySelectedZone === zone 
                              ? 'border-teal-400 bg-teal-950/20 text-[#00FFFF] shadow-md shadow-teal-500/20' 
                              : 'border-zinc-800 text-zinc-500 bg-black'
                          }`}
                        >
                          {zone} zone
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={handleClientEnroll}
                    className="w-full py-4 rounded-xl text-xs font-black tracking-widest uppercase bg-[#00FFFF] text-black hover:bg-[#00FFFF]/80 transition shadow-lg shadow-teal-500/10 cursor-pointer"
                  >
                    Entry, Intake & Transmission ▶
                  </button>
                </div>
              </div>
            )
          ) : (
            /* ACTIVE ROLE CHAMELEON PORT */
            <div className="space-y-6">
              
              <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-2xl flex items-center justify-between text-xs">
                <span>Agent ID: <strong className="text-teal-400 font-extrabold">{myNickname}</strong></span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] px-2.5 py-0.5 bg-[#00FFFF]/10 border border-[#00FFFF]/30 text-[#00FFFF] rounded-full font-black">
                  # {selfObj?.num || '?'}
                </span>
                <span className="text-pink-400 font-bold">Team: {selfObj?.zone || mySelectedZone}zone</span>
              </div>

              {isLobby ? (
                <div className="p-8 text-center bg-zinc-950 border border-zinc-85 border-dashed rounded-3xl space-y-4">
                  <span className="text-3xl block">⏳</span>
                  <h4 className="text-sm font-bold">Board Sync - Staging Line</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                   Your order has been assigned and successfully locked into Card #${selfObj?.num || '?' } on the lobby display. Waiting for the presenter to begin.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {gameState.step === 'FINISHED' ? (
                    <div className="p-6 bg-zinc-950 border-2 border-yellow-500/40 rounded-3xl text-center space-y-4 animate-fade-in">
                      <span className="text-4xl block animate-bounce">🏆</span>
                      <h3 className="text-md font-black uppercase tracking-wider text-yellow-400">Final Showdown: Scoring & Results </h3>
                      
                      {/* Personal outcome banner */}
                      {selfObj && winningZones.includes(selfObj.zone) ? (
                        <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-bold">
                          🎉 🎉 Victory! Your zone, ${selfObj.zone}, is the Final Champion!! 🎉 🎉
                        </div>
                      ) : (
                        <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                          our assigned zone, ${selfObj?.zone || 'assigned'} sector, has completed its desperate struggle.
                        </div>
                      )}

                      <div className="p-3.5 bg-black border border-zinc-900 rounded-2xl text-left font-mono text-xs text-zinc-400 space-y-1.5 shadow-inner">
                        <p className="text-[10px] text-zinc-500 font-sans font-bold uppercase border-b border-zinc-900 pb-1.5 mb-1.5">내 요원 정보 요약</p>
                        <p>Agent ID: <strong className="text-yellow-400"># {selfObj?.num} (Static)</strong></p>
                        <p>Point Assets: <strong className="text-[#00FFFF]">{selfObj?.score || 120} P</strong></p>
                        <p>Final Retained Zone: <strong className="text-pink-400">Zone {selfObj?.zone}</strong></p>
                      </div>

                      {/* Score tallies per Zone */}
                      <div className="p-3 bg-black border border-zinc-900 rounded-xl text-left space-y-2">
                        <span className="text-[10px] text-zinc-500 font-sans font-bold block">Zone ID Totals</span>
                        <div className="space-y-1 font-mono text-xs">
                          {(['A', 'B', 'C'] as const).map(z => {
                            const term = z === 'A' ? 'A zone (GREEN)' : z === 'B' ? 'B zone (PINK)' : 'C zone (CYAN)';
                            const total = z === 'A' ? luckySumA : z === 'B' ? luckySumB : luckySumC;
                            const isWin = winningZones.includes(z);
                            return (
                              <div key={z} className={`flex justify-between items-center py-1 px-2 rounded ${isWin ? 'bg-yellow-400/10 text-yellow-300 font-bold border border-yellow-400/20' : 'text-zinc-400'}`}>
                                <span>{term}</span>
                                <span>{total}  {isWin && '👑'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* VOTING STEP INTERACTION */}
                      {gameState.step === 'VOTING' && (
                        gameState.leaders[selfObj?.zone || 'A'] === myId ? (
                          <div className="p-5 bg-zinc-950 border border-yellow-500/40 rounded-3xl space-y-5">
                            <span className="text-xs bg-yellow-550/20 text-yellow-300 font-bold px-2 py-0.5 rounded border border-yellow-400/30 uppercase block text-center">
                              👑 Leader Decision Rights: Status
                            </span>
                            <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                              As the current Zone Leader, you must transmit either an Alliance Pact (BLUE) or a Defection Capture (RED) command within 30 seconds.
                            </p>

                            <div className="space-y-2">
                              <button 
                                onClick={() => castLeaderVote('BLUE')}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs tracking-widest rounded-xl transition cursor-pointer"
                              >
                                🔵 CO-SURVIVE 
                              </button>
                              <button 
                                onClick={() => castLeaderVote('RED')}
                                className="w-full py-3.5 bg-red-650 hover:bg-red-500 text-white font-black text-xs tracking-widest rounded-xl transition cursor-pointer animate-pulse"
                              >
                                🔴 EXCLUSION 
                              </button>
                            </div>
                            
                            <div className="text-[10px] text-zinc-500 font-mono text-center">
                              Transmission Status: {gameState.votes[selfObj?.zone || 'A'] ? <strong className="text-[#00FFFF] uppercase">{gameState.votes[selfObj?.zone || 'A']}</strong> : '미전송 (대기)'}
                            </div>
                          </div>
                        ) : (
                          <div className="p-8 text-center bg-zinc-950 border border-zinc-900 rounded-3xl space-y-3">
                            <span className="text-xl block animate-spin">⏳</span>
                            <h5 className="text-xs font-bold text-zinc-300">Zone Status: Synchronizing...</h5>
                            <p className="text-[10px] text-zinc-500">
                              Elected Leader: Processing Zone Retention Vote via Whiteboard Session.
                            </p>
                          </div>
                        )
                      )}

                      {/* EJECTION OVERWATCH STEP */}
                      {gameState.step === 'EJECTION' && (
                        gameState.votes[selfObj?.zone || 'A'] === 'BLUE' ? (
                          <div className="p-6 bg-zinc-950 border border-blue-400/20 text-center rounded-3xl space-y-3">
                            <span className="text-2xl block">🛡️</span>
                            <h4 className="text-sm font-black text-blue-400">{/*서바이벌 미션을 마침내 성공했거나, 생존이 확정된 순간 화면에 화려한 이펙트와 함께 쾅! 하고 박힐 짜릿한 축하 문구군요!

해외 서바이벌 게임이나 넷플릭스 예능 등에서 미션 성공 시 전광판에 띄우는 가장 힙하고 웅장한 스타일로 제안해 드립니다.

1. 글로벌 게임 UI 스타일 (가장 추천, 카타르시스가 느껴지는 버전)
미션 성공 도장이 찍히듯 화면 중앙에 크게 박히기 가장 좋은 대담하고 세련된 표현입니다.*/}

"Zone Survival Secured!</h4>
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                              Coordination complete. Your vital assets are fully protected without a single breach. Sit back and remain in your designated seats.
                            </p>
                          </div>
                        ) : gameState.votes[selfObj?.zone || 'A'] === 'RED' ? (
                          gameState.leaders[selfObj?.zone || 'A'] === myId ? (
                            <div className="p-4 bg-zinc-950 border border-pink-500/30 rounded-3xl space-y-4">
                              <span className="text-[10px] bg-red-955/20 border border-red-500/40 text-red-400 font-bold px-2 py-0.5 rounded uppercase block text-center animate-pulse">
                                🚨 Select 1 member of your team to banish.
                              </span>
                              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                {gameState.participants
                                  .filter(p => p.zone === selfObj?.zone && p.id !== myId)
                                  .map(p => (
                                    <button
                                      key={p.id}
                                      onClick={() => castLeaderEject(p.id)}
                                      className="w-full text-left p-3 bg-zinc-90 w bg-black border border-zinc-800 hover:border-red-500 rounded-xl flex items-center justify-between text-xs transition"
                                    >
                                      <span>{p.nickname} (행운#{p.num})</span>
                                      <span className="text-[9px] bg-pink-950 text-pink-400 font-mono font-bold px-1.5 py-0.5 rounded">Target</span>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          ) : (
                            <div className="p-6 bg-zinc-90 text-center rounded-3xl border border-[#FF007F]/20 space-y-3">
                              <span className="text-2xl block animate-bounce">🚨</span>
                              <h5 className="text-xs font-bold text-[#FF007F]">Eject Reviewing...</h5>
                              <p className="text-[10px] text-zinc-400">
                                Reviewing leader's ejection mandate for zone survival.
                              </p>
                            </div>
                          )
                        ) : null
                      )}

                      {/* TRADE_TIME RESOLUTION */}
                      {gameState.step === 'TRADE_TIME' && (
                        Object.values(gameState.ejected).includes(myId) ? (
                          <div className="p-5 bg-red-950/20 border-2 border-red-500/50 rounded-3xl text-center space-y-4 animate-pulse">
                            <span className="text-3xl block">🚶</span>
                            <h4 className="text-md font-black text-rose-450 leading-none">⚠️Ejection & Relocation Order Initiated!</h4>
                            <p className="text-[11px] text-zinc-200 leading-relaxed bg-black/60 p-3.5 rounded-xl border border-zinc-800 text-left">
                              <strong>[CODE OF CONDUCT]</strong> Keep your personal bags at your current seat. Stand up without any items, look at the main front display, and proceed safely to your assigned relocation zone.
                            </p>
                          </div>
                        ) : (
                          <div className="p-6 bg-zinc-950 border border-emerald-500/20 text-center rounded-3xl space-y-3">
                            <span className="text-2xl block">✔</span>
                            <h4 className="text-sm font-bold text-emerald-400">Survival Retention Approved!</h4>
                            <p className="text-[11px] text-zinc-400">ZONE SECURED. Without a single defection, your original qualifications have been successfully sustained.</p>
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              )}

              {/* PARTICIPANT FOOTER INFORMATION TRACE */}
              <div className="pt-4 border-t border-zinc-900 flex justify-between text-[10px] text-zinc-550 font-mono">
                <span>Agent Verification: {myId.substring(4, 9)}</span>
                <span>session: gState RTDB LINK</span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ======================================================== */}
      {/* ⚠️ SPECTACULAR TRADE POPUP OVERLAY ON TRANSFORMATION     */}
      {/* ======================================================== */}
      <AnimatePresence>
        {activeTransfer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: -50 }}
              className="max-w-xl text-center space-y-6 p-8 rounded-3xl border-4 border-pink-500/90 shadow-[0_0_25px_#ff007f] bg-black bg-[radial-gradient(circle_at_top,rgba(255,0,127,0.08)_0%,transparent_60%)]"
            >
              <div className="flex justify-center gap-3">
                <span className="w-10 h-10 rounded-full border-3 border-[#FF007F] flex items-center justify-center font-bold text-[#FF007F] text-sm shadow-[0_0_6px_#ff007f]">○</span>
                <span className="w-10 h-10 border-3 border-[#00FFFF] flex items-center justify-center font-bold text-[#00FFFF] rotate-45 transform text-[10px] shadow-[0_0_6px_#00ffff]">▲</span>
                <span className="w-10 h-10 border-3 border-[#00FF55] flex items-center justify-center font-bold text-[#00FF55] text-sm shadow-[0_0_6px_#00ff55]">■</span>
              </div>

              <div className="space-y-3">
                <span className="px-3 py-1 rounded bg-pink-500/10 border border-pink-500/40 text-pink-400 font-extrabold tracking-widest text-[9px] uppercase animate-pulse">
                  ⚠️ SECURITY ENFORCED MEMBER TRADE
                </span>
                
                <h2 className="text-3xl font-black text-white leading-normal">
                  {activeTransfer.participant.nickname} <br />
                  <span className="text-[#00FFFF] uppercase tracking-tighter text-3xl font-black neon-text-pink">PENDING EJECTION!</span>
                </h2>

                <p className="text-md text-zinc-350 font-mono mt-3 leading-relaxed bg-[#050505] p-3.5 rounded-xl border border-zinc-800">
                  [{activeTransfer.fromZone} Zone / Current Sector] ➡️ Apprehended and deployed to Transfer [Zone {activeTransfer.toZone}].
                </p>
              </div>

              <span className="text-[10px] text-zinc-550 block font-mono animate-bounce mt-2 text-zinc-500">
                ⚡ 전광판 카드 블록이 날아가 스르륵 슬라이딩하고 있습니다...
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* 🛠️ 3. VIEW SCREEN : REHEARSAL SIMULATION SCREEN           */}
    </div>
  );
}
