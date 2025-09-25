# Architecture – Vue d'ensemble

## Objectifs
- Faible latence temps réel
- Expérience fluide et ludique
- Auth multi-méthodes (local + Twitch)
- Anti-triche & intégrité des scores
- Démarrage SQLite -> migration PostgreSQL
- Scalabilité horizontale par étapes
- Observabilité (logs, métriques, traces)

## Domaines Logiques
1. Identity & Auth
2. Quiz Authoring
3. Session Orchestrator
4. Real-Time Gateway
5. Scoring Engine
6. Leaderboard & Analytics
7. Anti-Cheat / Fairness
8. Gamification
9. Notification / Event Bus
10. Media Handling

## Phases d'Architecture
### Phase 1 (Monolith modulaire)
- Backend unique (NestJS / Fastify / Prisma)
- WebSocket intégré
- SQLite dev
- Front Next.js / SvelteKit

### Phase 2
- Séparation gateway temps réel
- Redis Pub/Sub
- Object storage + CDN

### Phase 3
- Microservices ciblés (Scoring, Analytics, Gamification)
- Event bus (NATS / Kafka light)
- Tech temps réel optimisée (Phoenix / Go) optionnelle

### Phase 4
- Multi-régions + sharding sessions
- Optimisations protocoles (MessagePack, compression avancée)

## Modèle de Données (Conceptuel Simplifié)
```
User(id, username, password_hash?, twitch_id?, avatar_url, created_at)
AuthSession(id, user_id, refresh_token_hash, expires_at, user_agent, ip)
Quiz(id, owner_id, title, description, visibility, created_at, updated_at)
Question(id, quiz_id, type, prompt, media_url, time_limit_ms, order)
QuestionOption(id, question_id, label, is_correct, weight)
GameSession(id, quiz_id, host_id, code, status, started_at, ended_at, config_json)
GamePlayer(id, session_id, user_id?, nickname, join_at, team_id?)
PlayerAnswer(id, session_id, question_id, player_id, answer_payload, answered_at, latency_ms, score_awarded)
ScoreAggregate(id, session_id, player_id, total_score, streak_count, last_update)
PowerUp(id, code, name, description, effect_json)
PlayerPowerUp(id, player_id, powerup_id, consumed_at)
EventLog(id, session_id, type, payload_json, created_at)
```

## Indexation & Performance
- Index unique sur code de session (TTL cleanup)
- Composite (session_id, player_id, question_id)
- Partial index sur bonnes réponses (is_correct)
- GIN / JSONB si texte libre

## Flux Principaux
1. Création quiz
2. Lancement session
3. Join joueur
4. Démarrage
5. Cycle question (broadcast, réponses, reveal)
6. Calcul score & leaderboard
7. Fin session + résumé

## Observabilité
- Métriques: ws_active_connections, answer_latency, scoring_duration
- Traces OpenTelemetry (join → answer)
- Logs JSON structurés

## Risques & Mitigations
| Risque | Mitigation |
|--------|------------|
| Latence élevée | Locality, compression, diff messages |
| Cheating (spoof temps) | Serveur autoritaire, compensation latence |
| Scalabilité scoreboard | Diff partielle (top N + joueur) |
| Fuite réponses | Jamais envoyer solution avant reveal |
| Charge join simultanée | File d'attente légère + burst contrôle |

## Prochaines Étapes
- Schéma Prisma initial
- Squelette backend + endpoints auth / quiz
- Gateway WS minimale
