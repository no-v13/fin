import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GameState, Participant } from './src/types';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// In-memory game state preserved globally
const globalObj = globalThis as any;
if (!globalObj.__game_state__) {
  globalObj.__game_state__ = {
    participants: [],
    currentRound: 0,
    step: 'INTRO',
    timerStartTimestamp: null,
    timerDuration: 30,
    timerActive: false,
    leaders: {},
    votes: {},
    ejected: {},
    transitionLogs: [],
    systemSerialNum: 0,
  };
}

const gState = globalObj.__game_state__ as GameState;

// Implementation of state advance helpers
function triggerEjectionStateSafe() {
  const zones = ['A', 'B', 'C'] as const;
  zones.forEach(z => {
    const hasParticipants = gState.participants.some(p => p.zone === z);
    if (hasParticipants && !gState.votes[z]) {
      gState.votes[z] = Math.random() < 0.5 ? 'BLUE' : 'RED';
    }
  });

  gState.step = 'EJECTION';
  gState.ejected = {};
  
  // Start manual 20s ejection overwatch timer as requested
  gState.timerActive = true;
  gState.timerDuration = 20; // Changed from 30s to 20s for red team ejection
  gState.timerStartTimestamp = Date.now();
}

function triggerTradeStateSafe() {
  gState.step = 'TRADE_TIME';
  gState.timerActive = true;
  gState.timerDuration = 30; // 30s trade showcase timer
  gState.timerStartTimestamp = Date.now();
  gState.transitionLogs = [];
  
  const zones = ['A', 'B', 'C'] as const;
  
  // 1. RED Zone Ejection Overwatch
  zones.forEach(z => {
    if (gState.votes[z] === 'RED') {
      const zoneMembers = gState.participants.filter(p => p.zone === z);
      if (zoneMembers.length > 0) {
        if (!gState.ejected[z]) {
          const leaderId = gState.leaders[z];
          // Attempt to eject someone other than leader
          const nonLeaderMembers = zoneMembers.filter(p => p.id !== leaderId);
          const finalCandidates = nonLeaderMembers.length > 0 ? nonLeaderMembers : zoneMembers;
          const chosen = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
          gState.ejected[z] = chosen.id;
          gState.transitionLogs.push(`⚠️ [Timeout!] Since the Leader of Zone ${z} did not select a member for ejection within the time limit, the system randomized a member and ejected '${chosen.nickname}'!`);
        }
      }
    }
  });
  
  // 2. Identify ejected participants
  const activeEjected: { [zone in 'A' | 'B' | 'C']?: Participant } = {};
  zones.forEach(z => {
    const pId = gState.ejected[z];
    if (pId) {
      const found = gState.participants.find(p => p.id === pId);
      if (found) activeEjected[z] = found;
    }
  });
  
  const redZonesList = zones.filter(z => !!activeEjected[z]);
  
  // 3. Trade distribution & Point rules preserved
  if (redZonesList.length === 3) {
    const pA = activeEjected.A!;
    const pB = activeEjected.B!;
    const pC = activeEjected.C!;
    
    const route = Math.random() < 0.5;
    if (route) {
      updateParticipantZoneSafe(pA.id, 'B');
      updateParticipantZoneSafe(pB.id, 'C');
      updateParticipantZoneSafe(pC.id, 'A');
      gState.transitionLogs.push(`🔄 Trade Ejection: Zone A [${pA.nickname}] ➡️ Zone B | Zone B [${pB.nickname}] ➡️ Zone C | Zone C [${pC.nickname}] ➡️ Zone A`);
    } else {
      updateParticipantZoneSafe(pA.id, 'C');
      updateParticipantZoneSafe(pB.id, 'A');
      updateParticipantZoneSafe(pC.id, 'B');
      gState.transitionLogs.push(`🔄 Trade Ejection: Zone A [${pA.nickname}] ➡️ Zone C | Zone B [${pB.nickname}] ➡️ Zone A | Zone C [${pC.nickname}] ➡️ Zone B`);
    }
  }
  else if (redZonesList.length === 2) {
    const z1 = redZonesList[0];
    const z2 = redZonesList[1];
    const p1 = activeEjected[z1]!;
    const p2 = activeEjected[z2]!;
    
    updateParticipantZoneSafe(p1.id, z2);
    updateParticipantZoneSafe(p2.id, z1);
    
    gState.transitionLogs.push(`🔄 Trade Ejection: Zone ${z1} [${p1.nickname}] and Zone ${z2} [${p2.nickname}] switched zones!`);
  }
  else if (redZonesList.length === 1) {
    const rZone = redZonesList[0];
    const p = activeEjected[rZone]!;
    
    const destinationCandidates = zones.filter(z => z !== rZone);
    const destZone = destinationCandidates[Math.floor(Math.random() * destinationCandidates.length)];
    
    updateParticipantZoneSafe(p.id, destZone);
    gState.transitionLogs.push(`🔄 Trade Ejection: Zone ${rZone} [${p.nickname}] has been transferred to Zone ${destZone}!`);
  }
  else {
    gState.transitionLogs.push(`🕊️ All teams chose BLUE: Everyone survived peacefully this round!`);
  }

  // Award round survival score points to non-ejected participants to verify score integrity
  gState.participants.forEach(p => {
    const pZone = p.zone;
    const isEjectedThisRound = (gState.ejected[pZone] === p.id);
    if (!isEjectedThisRound) {
      p.score = (p.score || 100) + 50; // points reward for surviving
    } else {
      p.score = (p.score || 100) + 10; // low score for being ejected
    }
  });
}

function updateParticipantZoneSafe(pId: string, newZone: 'A' | 'B' | 'C') {
  const p = gState.participants.find(part => part.id === pId);
  if (p) {
    p.zone = newZone;
  }
}

// REST APIs
app.get('/api/game/state', (req, res) => {
  // Check countdown timer expiration
  if (gState.timerActive && gState.timerStartTimestamp) {
    const elapsed = Math.floor((Date.now() - gState.timerStartTimestamp) / 1000);
    if (elapsed >= gState.timerDuration) {
      gState.timerActive = false;
      gState.timerStartTimestamp = null;
      
      // Automatic Step Transitions On Timeouts
      if (gState.step === 'VOTING') {
        triggerEjectionStateSafe();
      } else if (gState.step === 'EJECTION') {
        triggerTradeStateSafe();
      }
    } else {
      // Bot behavior automation
      const elapsedMs = Date.now() - gState.timerStartTimestamp;
      const zones = ['A', 'B', 'C'] as const;

      if (gState.step === 'VOTING') {
        let stateChanged = false;
        zones.forEach(z => {
          const leaderId = gState.leaders[z];
          if (leaderId && !gState.votes[z]) {
            const leader = gState.participants.find(p => p.id === leaderId);
            if (leader && leader.isBot) {
              const delayLimit = z === 'A' ? 3000 : z === 'B' ? 5000 : 7000;
              if (elapsedMs > delayLimit) {
                gState.votes[z] = Math.random() < 0.5 ? 'BLUE' : 'RED';
                stateChanged = true;
              }
            }
          }
        });

        if (stateChanged) {
          const activeZones = new Set(gState.participants.map(p => p.zone));
          let allVoted = true;
          for (const z of activeZones) {
            if (!gState.votes[z]) {
              allVoted = false;
              break;
            }
          }
          if (allVoted && activeZones.size > 0) {
            triggerEjectionStateSafe();
          }
        }
      } else if (gState.step === 'EJECTION') {
        let stateChanged = false;
        zones.forEach(z => {
          if (gState.votes[z] === 'RED' && !gState.ejected[z]) {
            const leaderId = gState.leaders[z];
            if (leaderId) {
              const leader = gState.participants.find(p => p.id === leaderId);
              if (leader && leader.isBot) {
                const delayLimit = z === 'A' ? 4000 : z === 'B' ? 6000 : 8000;
                if (elapsedMs > delayLimit) {
                  const zoneMembers = gState.participants.filter(p => p.zone === z);
                  if (zoneMembers.length > 0) {
                    const candidates = zoneMembers.filter(p => p.id !== leaderId);
                    const finalCandidates = candidates.length > 0 ? candidates : zoneMembers;
                    const chosen = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
                    gState.ejected[z] = chosen.id;
                    stateChanged = true;
                  }
                }
              }
            }
          }
        });

        if (stateChanged) {
          const activeRedZones = zones.filter(z => 
            gState.votes[z] === 'RED' && gState.participants.some(p => p.zone === z)
          );
          const allSelected = activeRedZones.every(z => !!gState.ejected[z]);
          if (allSelected) {
            triggerTradeStateSafe();
          }
        }
      }
    }
  }
  res.json(gState);
});

// Admin API - Start Timer / Auto-round move
app.post('/api/game/admin/start-timer', (req, res) => {
  if (gState.currentRound === 0) {
    gState.currentRound = 1;
  }
  gState.step = 'VOTING';
  gState.votes = {};
  gState.ejected = {};
  gState.transitionLogs = [];
  gState.timerActive = true;
  gState.timerDuration = 30; // 30s vote timer
  gState.timerStartTimestamp = Date.now();
  
  // Pick leaders (prioritizing human players)
  const zones = ['A', 'B', 'C'] as const;
  zones.forEach(zone => {
    const zoneMembers = gState.participants.filter(p => p.zone === zone);
    if (zoneMembers.length > 0 && !gState.leaders[zone]) {
      const humans = zoneMembers.filter(p => !p.isBot);
      const candidates = humans.length > 0 ? humans : zoneMembers;
      const randomIndex = Math.floor(Math.random() * candidates.length);
      gState.leaders[zone] = candidates[randomIndex].id;
    }
  });

  // ======= REMOVABLE SIMULATION APIS & HOOKS =======
  const simPlayer = gState.participants.find(p => p.id.startsWith('sim_player_'));
  if (simPlayer && globalObj.__sim_join_count__) {
    const sz = simPlayer.zone;
    if (globalObj.__sim_join_count__ % 2 === 1) {
      gState.leaders[sz] = simPlayer.id;
    } else {
      const otherMembers = gState.participants.filter(p => p.zone === sz && p.id !== simPlayer.id);
      if (otherMembers.length > 0) {
        gState.leaders[sz] = otherMembers[0].id;
      }
    }
  }
  // =================================================
  
  res.json(gState);
});

// Admin API - Seed bots
app.post('/api/game/admin/seed-bots', (req, res) => {
  // Remove existing bots, keep human players
  gState.participants = gState.participants.filter(p => !p.isBot);
  
  const zones = ['A', 'B', 'C'] as const;
  const humans = gState.participants;
  const seededList: Participant[] = [];
  const humanCount = humans.length;

  if (humanCount === 0) {
    // If no human has joined yet, we generate exactly 14 bots to fill up (Zone A: 5, Zone B: 5, Zone C: 4)
    zones.forEach(zone => {
      const botsLimit = zone === 'C' ? 4 : 5;
      for (let i = 1; i <= botsLimit; i++) {
        gState.systemSerialNum += 1;
        const assignedNum = gState.systemSerialNum; // Assign unique sequential card ID
        const pId = 'bot_' + zone.toLowerCase() + '_' + i + '_' + Math.random().toString(36).substring(2, 6);
        const newBot: Participant = {
          id: pId,
          nickname: `Bot_${zone}${i}`,
          zone: zone,
          num: assignedNum,
          joinedAt: Date.now(),
          isBot: true,
          score: 100 + assignedNum * 20
        };
        gState.participants.push(newBot);
        seededList.push(newBot);
      }
    });
  } else {
    // If humans exist, we fill each zone up to exactly 5 members
    zones.forEach(zone => {
      const zoneHumans = humans.filter(p => p.zone === zone);
      const botsCountNeeded = Math.max(0, 5 - zoneHumans.length);
      
      for (let i = 0; i < botsCountNeeded; i++) {
        gState.systemSerialNum += 1;
        const assignedNum = gState.systemSerialNum; // Assign unique sequential card ID
        const pId = 'bot_' + zone.toLowerCase() + '_' + (i + 1) + '_' + Math.random().toString(36).substring(2, 6);
        const newBot: Participant = {
          id: pId,
          nickname: `Bot_${zone}${i + 1}`,
          zone: zone,
          num: assignedNum,
          joinedAt: Date.now(),
          isBot: true,
          score: 100 + assignedNum * 20
        };
        gState.participants.push(newBot);
        seededList.push(newBot);
      }
    });
  }

  // Pick leaders for each zone (Prefer humans over bots)
  zones.forEach(zone => {
    const zoneMembers = gState.participants.filter(p => p.zone === zone);
    if (zoneMembers.length > 0) {
      const humanPlayer = zoneMembers.find(p => !p.isBot);
      if (humanPlayer) {
        gState.leaders[zone] = humanPlayer.id;
      } else {
        gState.leaders[zone] = zoneMembers[0].id;
      }
    } else {
      delete gState.leaders[zone];
    }
  });
  
  res.json({ success: true, seeded: seededList, state: gState });
});

// Participant Join
app.post('/api/game/join', (req, res) => {
  const { nickname, zone } = req.body;
  if (!nickname || !['A', 'B', 'C'].includes(zone)) {
    res.status(400).json({ error: 'invalid_inputs' });
    return;
  }
  
  const pId = 'p_' + Math.random().toString(36).substring(2, 9);
  gState.systemSerialNum += 1;
  const assignedNum = gState.systemSerialNum; // Assign globally unique sequential ticket/card number
  
  const newParticipant: Participant = {
    id: pId,
    nickname: nickname.trim().substring(0, 10),
    zone: zone as 'A' | 'B' | 'C',
    num: assignedNum,
    joinedAt: Date.now(),
    score: 120
  };
  
  gState.participants.push(newParticipant);
  res.json({ success: true, participant: newParticipant });
});

// Leader Vote Choice
app.post('/api/game/vote', (req, res) => {
  const { participantId, vote } = req.body;
  const participant = gState.participants.find(p => p.id === participantId);
  if (!participant) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  
  const zone = participant.zone;
  if (gState.leaders[zone] !== participantId) {
    res.status(403).json({ error: 'not_leader' });
    return;
  }
  
  if (gState.step !== 'VOTING') {
    res.status(400).json({ error: 'not_voting_step' });
    return;
  }
  
  gState.votes[zone] = vote as 'BLUE' | 'RED';
  
  const activeZones = new Set(gState.participants.map(p => p.zone));
  let allVoted = true;
  for (const z of activeZones) {
    if (!gState.votes[z]) {
      allVoted = false;
      break;
    }
  }
  
  if (allVoted && activeZones.size > 0) {
    triggerEjectionStateSafe();
  }
  
  res.json({ success: true, state: gState });
});

// Member Ejection by choice
app.post('/api/game/eject', (req, res) => {
  const { leaderId, targetId } = req.body;
  const leader = gState.participants.find(p => p.id === leaderId);
  const target = gState.participants.find(p => p.id === targetId);
  
  if (!leader || !target) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  
  const zone = leader.zone;
  if (gState.leaders[zone] !== leaderId) {
    res.status(403).json({ error: 'not_leader' });
    return;
  }
  
  if (gState.step !== 'EJECTION') {
    res.status(400).json({ error: 'not_ejection_step' });
    return;
  }
  
  gState.ejected[zone] = targetId;
  
  const activeRedZones = (['A', 'B', 'C'] as const).filter(z => 
    gState.votes[z] === 'RED' && gState.participants.some(p => p.zone === z)
  );
  const allEjectedSelected = activeRedZones.every(z => !!gState.ejected[z]);
  
  if (allEjectedSelected) {
    triggerTradeStateSafe();
  }
  
  res.json({ success: true, state: gState });
});

// Admin API - Trigger manual ejection override helper
app.post('/api/game/admin/trigger-ejection', (req, res) => {
  triggerEjectionStateSafe();
  res.json(gState);
});

// Admin API - Trigger manual trade override helper
app.post('/api/game/admin/trigger-trade', (req, res) => {
  triggerTradeStateSafe();
  res.json(gState);
});

// Admin API - Next Round
app.post('/api/game/admin/next-round', (req, res) => {
  gState.currentRound += 1;
  gState.votes = {};
  gState.ejected = {};
  gState.timerStartTimestamp = null;
  gState.timerActive = false;
  gState.transitionLogs = [];
  
  if (gState.currentRound <= 3) {
    gState.step = 'INTRO';
    const newLeaders: { A?: string; B?: string; C?: string } = {};
    for (const zone of ['A', 'B', 'C'] as const) {
      const zoneMembers = gState.participants.filter(p => p.zone === zone);
      if (zoneMembers.length > 0) {
        const humans = zoneMembers.filter(p => !p.isBot);
        const candidates = humans.length > 0 ? humans : zoneMembers;
        const randomIndex = Math.floor(Math.random() * candidates.length);
        newLeaders[zone] = candidates[randomIndex].id;
      }
    }
    gState.leaders = newLeaders;

    // ======= REMOVABLE SIMULATION APIS & HOOKS =======
    const simPlayer = gState.participants.find(p => p.id.startsWith('sim_player_'));
    if (simPlayer && globalObj.__sim_join_count__) {
      const sz = simPlayer.zone;
      if (globalObj.__sim_join_count__ % 2 === 1) {
        gState.leaders[sz] = simPlayer.id;
      } else {
        const otherMembers = gState.participants.filter(p => p.zone === sz && p.id !== simPlayer.id);
        if (otherMembers.length > 0) {
          gState.leaders[sz] = otherMembers[0].id;
        }
      }
    }
    // =================================================
  } else {
    gState.step = 'FINISHED';
    gState.leaders = {};
  }
  
  res.json(gState);
});

// Admin API - Reset
app.post('/api/game/admin/reset', (req, res) => {
  gState.participants = [];
  gState.currentRound = 0;
  gState.step = 'INTRO';
  gState.timerStartTimestamp = null;
  gState.timerDuration = 30;
  gState.timerActive = false;
  gState.leaders = {};
  gState.votes = {};
  gState.ejected = {};
  gState.transitionLogs = [];
  gState.systemSerialNum = 0;
  
  // Reset simulation join count
  globalObj.__sim_join_count__ = 0;

  res.json(gState);
});

// ======= REMOVABLE SIMULATION CORE ENDPOINTS =======
// These APIs can be completely removed if no longer needed.
app.post('/api/game/sim/join', (req, res) => {
  const { nickname, zone } = req.body;
  if (!nickname || !['A', 'B', 'C'].includes(zone)) {
    res.status(400).json({ error: 'invalid_inputs' });
    return;
  }

  // Reset the game's entire active state to starting fresh
  gState.participants = [];
  gState.votes = {};
  gState.ejected = {};

  if (!globalObj.__sim_join_count__) {
    globalObj.__sim_join_count__ = 0;
  }
  globalObj.__sim_join_count__ += 1;
  const currentCount = globalObj.__sim_join_count__;

  const userZone = zone as 'A' | 'B' | 'C';

  // 1. Create the human participant inside the designated zone (Assigned number 1)
  const pId = 'sim_player_' + Math.random().toString(36).substring(2, 9);
  const newPart: Participant = {
    id: pId,
    nickname: nickname.trim().substring(0, 10),
    zone: userZone,
    num: 1,
    joinedAt: Date.now(),
    score: 120
  };
  gState.participants.push(newPart);

  // 2. Add exactly 4 simulation bots in the user's zone to total exactly 5 members
  for (let i = 2; i <= 5; i++) {
    gState.participants.push({
      id: `bot_sim_${userZone.toLowerCase()}_${Math.random().toString(36).substring(2, 5)}`,
      nickname: `${userZone}Zone_Bot${i - 1}`,
      zone: userZone,
      num: i,
      joinedAt: Date.now(),
      isBot: true,
      score: 100
    });
  }

  // Arrange userZone's leader (Odd count = Human user is Leader, Even count = Normal citizen/passenger)
  const isLeader = (currentCount % 2 === 1);
  if (isLeader) {
    gState.leaders[userZone] = pId;
  } else {
    // Pick the first bot in the user's zone as leader
    const firstBot = gState.participants.find(p => p.zone === userZone && p.id !== pId);
    if (firstBot) {
      gState.leaders[userZone] = firstBot.id;
    }
  }

  // 3. Fill the other two zones with exactly 5 bots each, numbered 1 to 5 to maintain exactly a 15-player session!
  const otherZones = (['A', 'B', 'C'] as const).filter(z => z !== userZone);
  otherZones.forEach(z => {
    const botsInZone: Participant[] = [];
    for (let i = 1; i <= 5; i++) {
      const botPart: Participant = {
        id: `bot_sim_${z.toLowerCase()}_${Math.random().toString(36).substring(2, 5)}`,
        nickname: `${z}Zone_Bot${i}`,
        zone: z,
        num: i,
        joinedAt: Date.now(),
        isBot: true,
        score: 100
      };
      gState.participants.push(botPart);
      botsInZone.push(botPart);
    }
    // Set the first bot in this zone as the zone leader
    gState.leaders[z] = botsInZone[0].id;
  });

  res.json({ 
    success: true, 
    participant: newPart, 
    isLeader, 
    joinCount: currentCount,
    state: gState 
  });
});

app.get('/api/game/sim/count', (req, res) => {
  res.json({ joinCount: globalObj.__sim_join_count__ || 0 });
});
// ===================================================

async function startServer() {
  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
