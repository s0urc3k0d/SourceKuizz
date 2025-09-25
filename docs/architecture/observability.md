# Observabilité

## Objectifs
- Détecter rapidement régressions perf
- Comprendre comportements sessions
- Faciliter debug incidents

## Logs
- Format JSON (pino): { ts, level, msg, reqId, userId?, sessionId?, latencyMs }
- Niveaux: trace, debug, info, warn, error
- Redaction: tokens / passwords filtrés

## Métriques (Prometheus)
| Nom | Type | Description |
|-----|------|-------------|
| ws_active_connections | Gauge | Connexions WS actives |
| ws_messages_in_total | Counter | Messages reçus |
| ws_messages_out_total | Counter | Messages envoyés |
| answer_latency_ms | Histogram | Latence réponse brute |
| scoring_duration_ms | Histogram | Temps calcul score |
| sessions_active | Gauge | Sessions en cours |
| players_per_session | Summary | Distribution joueurs/session |

## Traces (OpenTelemetry)
- Span: joinSession, sendQuestion, submitAnswer, computeScore, revealQuestion
- Attributs: session.id, question.id, player.id (anonymisé hash)

## Table EventLog
- Type: PLAYER_JOIN, ANSWER_SUBMIT, SCORE_UPDATE, POWERUP_USE, SESSION_START, SESSION_END
- Analyse offline possible (replay / re-scoring)

## Dashboards (Idées)
- Temps réel: connexions, latence p95, erreurs
- Session: funnel (join → answer1 → finish)
- Anti-cheat: distribution latences, flags actifs

## Alerting
| Condition | Seuil |
|-----------|-------|
| Latence p95 answer > 400ms | 5 min |
| Erreurs 5xx > 1% | 2 min |
| Drop WS > 3% | 5 min |
| Spikes 429 | >3x moyenne |

## Retention
- Logs détaillés: 7 jours
- Agrégats: 90 jours
- EventLog brut: 30 jours (puis compact)

## Évolution
- Export traces vers Jaeger / Tempo
- Intégration anomaly detection (p95 drift)
