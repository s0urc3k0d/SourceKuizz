# Guide d’intégration Front (SourceKuizz)

Ce document décrit le flot minimal pour interfacer un front web avec l’API et le WebSocket du backend.

## Pré-requis
- Authentification JWT (endpoints `/auth/register` et `/auth/login`).
- Socket.IO côté client.

## Créer/Assurer une session
1. Le host (enseignant) crée un quiz et ses questions (HTTP protégés).
2. Appeler `POST /sessions/ensure` avec `{ quizId }`. Réponse `{ code, created }`.
3. Afficher le `code` aux joueurs.

## Rejoindre la session (Socket.IO)
- Le client ouvre un socket avec `auth: { token: <JWT> }`.
- Événement à émettre: `join_session` avec `{ code, quizId, nickname? }`.
- Le premier arrivé devient `host`. Les autres reçoivent `isHost: false`.
- Écouter:
  - `session_state`: `{ status, questionIndex, totalQuestions, remainingMs, isHost, autoNext, reconnected? }`
  - `question_started`: `{ questionId, index, timeLimitMs }`
  - `question_reveal`: `{ questionId, correctOptionIds }`
  - `leaderboard_update`: `{ entries: [{ playerId, nickname, score, rank }] }`

## Démarrer/Enchaîner
- Seul le host peut émettre `start_question { code }` depuis `lobby`/`reveal`.
- `autoNext` peut être activé via `toggle_auto_next { code, enabled }`.
- Les joueurs soumettent avec `submit_answer { questionId, optionId, clientTs, code }`.
- Quand tous ont répondu, `question_reveal` est envoyé automatiquement.

## Late join & Reconnexion
- Si un joueur rejoint en phase `question`, `session_state.remainingMs` sera calculé correctement pour l’UI.
- Si un joueur se reconnecte (même JWT), son score/streak sont restaurés; un `leaderboard_update` est émis rapidement.

## Snapshots HTTP
- GET `/sessions/:code` renvoie un snapshot public pour pré-afficher l’état d’une session sans Socket.IO.

## Erreurs
- Rejets typiques: `*_rejected` avec `{ code: 'not_host' | 'already_answered' | ... }`.
- `error_generic` peut être émis lors des erreurs d’auth WS.

## Conseils UI
- Timer: utilisez `session_state.remainingMs` et décrémentez côté client pour l’affichage; resynchronisez à `question_started`.
- Leaderboard: écoutez `leaderboard_update`; afficher rang et score.
- Host switch: quand `host_changed` arrive, vérifiez `isHost` lors des prochains `session_state`.

## Variables d’environnement utiles
- `TIME_SCALE`: accélération des timers (tests/dev).
- `REVEAL_DELAY_MS`: délai entre reveal et question suivante.
- `METRICS_RESET_TOKEN`: protection du reset.
- `DETACHED_TTL_MS`: durée de conservation des joueurs détachés (par défaut 10 minutes).
