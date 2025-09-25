# Protocole Temps Réel

## Canal
- WebSocket principal (wss://.../rt)
- Fallback SSE pour spectateurs masse (option ultérieure)
- Auth via token (Bearer dans query ?token= ou header lors de l'upgrade)

## Messages (Format JSON compact)
```
Client→Server
join_session { code, nickname?, authToken? }
submit_answer { questionId, answer, clientTs }
use_powerup { code, targetPlayerId? }
reaction { emoji }
ping { ts }

Server→Client
session_state { status, questionIndex, remainingMs }
question { id, prompt, type, options[], timeLimitMs }
answer_ack { questionId, accepted, serverLatencyMs }
reveal { questionId, correct, perOptionStats[], playerScoreDelta, leaderboardSlice[] }
powerup_effect { playerId, effect }
reaction_broadcast { playerId, emoji }
leaderboard_update { entries[] }
end_session { finalLeaderboard, summaryId }
pong { ts }
```

## Optimisations
- Compression permessage-deflate (puis MessagePack option)
- Heartbeat: ping toutes les 25s
- Backpressure: limiter envoi si > X msg/sec
- Diff scoreboard (envoi uniquement changements)
- Pré-chargement questions côté serveur en mémoire (hot set)

## Synchronisation Temps
- Offset initial: client envoie ts client → serveur répond ts serveur
- Ajustement scoring par (clientTs - serverTs)
- reveal synchronisé: broadcast + clients alignent animation via delta

## Anti-Triche Spécifique Temps Réel
- Refus réponses hors fenêtre (grace 200ms)
- Score vitesse = clamp(0, 1 - adjustedLatency/limit)
- Flag réponses <80ms (pattern improbable) → marquage
- Pas de réponses correctes dans payload avant reveal

## Stratégie Scalabilité WS
Phase 1: process unique
Phase 2: Cluster (Node.js cluster / multiple pods) + Redis Pub/Sub (channel per session)
Phase 3: Service dédié (Go / Elixir) + event bus

## Format Binaire (Option)
- Passage à MessagePack après >5k concurrents
- Mapping types courts: t (type), p (payload)

## Exemple Pseudo-code Broadcast
```ts
function broadcast(sessionId, type, payload) {
  const msg = JSON.stringify({ t: type, p: payload });
  for (const c of clientsBySession(sessionId)) c.ws.send(msg);
}
```
