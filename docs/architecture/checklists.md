# Checklists Opérationnelles

## MVP Release
- [ ] Auth local (register, login, refresh, logout)
- [ ] OAuth Twitch
- [ ] CRUD Quiz (title, description, MCQ)
- [ ] WebSocket: join, question, submit_answer, reveal, leaderboard
- [ ] Scoring simple
- [ ] Streak basique
- [ ] Logs JSON + métriques basiques
- [ ] Dockerfile
- [ ] Migrations SQLite

## Pré-Scaling (Phase 2)
- [ ] Redis intégré
- [ ] Rate limiting global
- [ ] Power-ups init (DOUBLE_SCORE, REVEAL_HINT)
- [ ] Réactions live basiques
- [ ] Anti double-answer enforced DB + mémoire
- [ ] Health checks / readiness

## Gamification Phase 3
- [ ] Badges modèle
- [ ] XP calcul + progression
- [ ] Leaderboard global
- [ ] Replays (EventLog parse)

## Observabilité
- [ ] Export Prometheus
- [ ] Traces OTEL minimal
- [ ] Dashboard latence & ws connections

## Sécurité
- [ ] Argon2id paramètres calibrés
- [ ] Rotation refresh tokens
- [ ] CSP active
- [ ] Sanitisation éditeur quiz
- [ ] Limite uploads média

## Qualité
- [ ] Unit tests scoring
- [ ] WS integration test (join->question->answer)
- [ ] Load test script (k6)
- [ ] Lint + format CI

## Pré-Prod Go/No-Go
- [ ] p95 answer<120ms (100 joueurs test)
- [ ] Erreurs 5xx <0.5%
- [ ] Drop WS <1%
- [ ] Pas de fuite mémoire apparente
