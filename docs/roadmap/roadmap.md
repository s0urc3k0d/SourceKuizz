# Roadmap Incrémentale

## Phase 1 (MVP)
- Auth local + Twitch
- CRUD Quiz + Questions MCQ
- Sessions live basiques (join, question, answer, reveal, leaderboard)
- Scoring simple (correct + vitesse + streak basique)
- WebSocket single instance
- SQLite + migrations prêtes PostgreSQL
- Logs structurés + métriques minimales

## Phase 2
- Redis Pub/Sub (scaling horizontal)
- Power-ups de base
- Réactions emojis
- Équipes (score cumulé)
- Anti-cheat (flags vitesse & double answer)
- Passage PostgreSQL

## Phase 3
- Badges, XP, Niveaux
- Leaderboard global / saison
- Challenges journaliers
- Replays (timeline questions)
- Optimisation diff scoreboard

## Phase 4
- Predictions & boss questions avancées
- Overlay Twitch + commande chat !join
- Stockage médias externe (S3 + CDN)
- Event bus (NATS / Kafka)
- Service scoring dédié

## Phase 5
- Multi-régions / sharding sessions
- MessagePack + compression fine
- Spectator mass mode (SSE scalable)
- ML détection fraude
- Cosmétiques avancés / économie légère

## Phase 6 (Optionnel Long Terme)
- Tournois multi manches
- Marketplace de quiz communautaires
- API publique (création quiz automatisée)

## Critères Go/No-Go entre Phases
| Transition | Pré-requis |
|------------|------------|
| 1→2 | >50 sessions simultanées, CPU WS >60% |
| 2→3 | Rétention stable, demande progression joueurs |
| 3→4 | Audience Twitch active, >10% sessions stream |
| 4→5 | Latence > cible sur charges >500 joueurs |

## Suivi Risques
- Complexité gamification → feature flags progressifs
- Coût infra multi-région → déclencher seulement si audience internationale
