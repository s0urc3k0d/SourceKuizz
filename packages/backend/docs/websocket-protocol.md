# WebSocket Protocol (SourceKuizz)

Base: Socket.IO default namespace.
Authentication: Provide `auth: { token: <JWT> }` when connecting. Invalid or missing token -> connection refused.

## Phases
- `lobby` : en attente de démarrage de question.
- `question` : question en cours (temps s'écoule côté serveur).
- `reveal` : correction affichée, transition en cours vers question suivante ou fin.
- `finished` : session terminée.

## Client -> Serveur Events
| Event | Payload | Description | Constraints |
|-------|---------|-------------|-------------|
| `join_session` | `{ code?, quizId, nickname? }` | Rejoint une session existante ou en crée une nouvelle si `code` omis (serveur génère). | Code généré = 6 chars (A-Z2-9 sans ambiguïtés). |
| `join_session` (spectateur) | `{ code, quizId, spectator: true }` | Rejoint en mode spectateur (pas de scoring, pas d’host). | |
| `start_question` | `{ code }` | Host démarre la question courante (phase lobby/reveal). | Requiert être host. |
| `submit_answer` | `{ questionId, optionId, clientTs, code? }` | Soumission réponse MCQ. | Rate limit + une seule réponse par question/socket. |
| `transfer_host` | `{ code, targetPlayerId }` | Transfert droits d'hôte. | Doit être host actuel. |
| `reaction` | `{ emoji, code? }` | Réaction temps réel (émote). | Rate limit. |
| `toggle_auto_next` | `{ code, enabled }` | Active progression auto. | Host uniquement. |

## Serveur -> Client Events
| Event | Payload | Description |
|-------|---------|-------------|
| `session_state` | `{ code, status, questionIndex, remainingMs, totalQuestions, isHost?, isSpectator?, autoNext?, reconnected? }` | État courant. `remainingMs` est dynamique pour les late joiners. `reconnected` est vrai quand le serveur a restauré l’état d’un joueur après reconnexion. |
| `session_code_assigned` | `{ code }` | Envoyé par le serveur si le client a rejoint sans fournir de code (nouvelle session créée). |
| `question_started` | `{ questionId, index, timeLimitMs }` | Nouvelle question lancée. |
| `answer_ack` | `{ questionId, accepted, correct?, scoreDelta?, reason? }` | Acquittement d'une réponse. `reason` si refus. |
| `question_reveal` | `{ questionId, correctOptionIds }` | Correction affichée. |
| `leaderboard_update` | `{ entries: [{ playerId, nickname, score, rank }] }` | Classement calculé. |
| `session_finished` | `{ final: [...] }` | Session terminée (classement final). |
| `host_changed` | `{ hostId }` | Nouveau host. |
| `reaction_broadcast` | `{ playerId, emoji }` | Diffusion réaction. |
| `auto_next_toggled` | `{ enabled }` | Nouveau statut auto-next. |
| Rejets / erreurs ponctuelles | `{ code: string }` | `*_rejected` (ex: `start_question_rejected`). |

## Codes d'erreur / raisons (normalisés)
- `not_host`
- `already_answered`
- `rate_limited`
- `unknown_option`
- `unknown_question`
- `quiz_mismatch`
- `auth_failed`
 - `spectator` (refus de réponse par un spectateur)

Les rejets côté serveur utilisent des évènements dédiés `*_rejected` avec payload `{ code, message? }`.

## Tactiques de Synchronisation
- Le serveur est source de vérité pour le temps restant; clients peuvent extrapoler localement après `question_started`.
- Late join: lorsqu’un client rejoint en phase `question`, le serveur calcule `remainingMs = timeLimitMs - (now - startedAt)` et l’inclut dans `session_state` initial.
- Reconnexion: lorsqu’un même utilisateur (JWT) se reconnecte, le serveur restaure score/streak/host et renvoie un `session_state` (avec `reconnected: true`) suivi d’un `leaderboard_update` immédiat.
 - Joueurs détachés: après déconnexion, l’état (score/streak) est conservé en mémoire pour une durée `DETACHED_TTL_MS` (par défaut 10 minutes). À la fin de la session, le cache est vidé.
- Auto-reveal : déclenché dès que tous les joueurs ont répondu (`question.autoreveal` métrique incrémentée).
- Auto-next : si activé, passage automatique après phase reveal (petit délai configurable via `REVEAL_DELAY_MS`).

## Performance / Rate Limits
- Réponses : fenêtre 2000ms, max 3 par socket.
- Réactions : fenêtre 2000ms, max 6 par socket.

## Endpoints HTTP complémentaires
- POST `/sessions/ensure` (auth requis): Body `{ quizId, code? }` → `{ code, created }`. Crée/assure une session en mémoire.
- GET `/sessions/:code`: Snapshot public `{ code, status, questionIndex, totalQuestions, playersCount, autoNext, remainingMs }`.

## Futurs possibles
- Types de question supplémentaires (multi-select, texte libre).
- Spectateur (join sans inscrire un player actif).
 - Résilience reconnexion : améliorations de remplacement de socket en double, TTL des joueurs détachés.

