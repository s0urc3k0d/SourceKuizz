# Performance & Scalabilité

## Objectifs Chiffrés (Cibles)
- p95 answer→ack < 120ms (≤100 joueurs)
- p95 answer→reveal < 250ms
- 1 000 connexions WS / instance t2.medium équivalent (phase 2)

## Stratégies
- Sessions “hot” en mémoire (structure légère)
- Redis pour diffusion inter-nœuds (pub/sub par session)
- Diff leaderboard (patch plutôt que full)
- Compression conditionnelle (payload > 512B)
- Batching réponses (traitement par tick event loop)

## Optimisations Front
- Virtualisation scoreboard
- Suspense / streaming Next.js
- Pré-rendu quiz editing

## DB
- Prepared statements
- Pool (10–20 connexions / instance)
- Write path critiques: answers en insert bulk possible

## Nettoyage
- TTL sessions terminées (jobs async)
- Archivage EventLog (batch compress)

## Scalabilité Horizontale
| Phase | WS | API |
|-------|----|-----|
| 1 | Monolith | Monolith |
| 2 | Cluster + Redis | Monolith |
| 3 | Service dédié | API séparée |
| 4 | Multi-région | Geo load balancing |

## Stress Test (k6 Idée)
```
VU: 300
Scenario: join burst (1 min) + answer waves chaque 10s
Metrics: p95 latency, error %, CPU, GC pauses
```

## Memory Footprint Session (Estimation)
- Player struct ~ 300B
- Session state (100 joueurs) ~ 30KB + scoreboard
- 5 000 sessions concurrentes ≈ 150MB (hors overhead)

## Future
- Passage à uWebSockets.js / Go pour densité >10k
- MessagePack + delta encoding scoreboard
