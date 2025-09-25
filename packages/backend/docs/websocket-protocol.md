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
| `start_question` | `{ code }` | Host démarre la question courante (phase lobby/reveal). | Requiert être host. |
| `submit_answer` | `{ questionId, optionId, clientTs, code? }` | Soumission réponse MCQ. | Rate limit + une seule réponse par question/socket. |
| `transfer_host` | `{ code, targetPlayerId }` | Transfert droits d'hôte. | Doit être host actuel. |
| `reaction` | `{ emoji, code? }` | Réaction temps réel (émote). | Rate limit. |
| `toggle_auto_next` | `{ code, enabled }` | Active progression auto. | Host uniquement. |

## Serveur -> Client Events
| Event | Payload | Description |
|-------|---------|-------------|
| `session_state` | `{ code, status, questionIndex, remainingMs, totalQuestions, isHost?, autoNext? }` | État courant. `remainingMs` est 0 en lobby. |
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

## Codes d'erreur / raisons (non exhaustif)
- `not_host`
- `already_answered`
- `rate_limited`
- `unknown_option`
- `unknown_question`
- `quiz_mismatch`
- `auth_failed`

## Tactiques de Synchronisation
- Le serveur est source de vérité pour le temps restant; clients peuvent extrapoler localement après `question_started`.
- Auto-reveal : déclenché dès que tous les joueurs ont répondu (`question.autoreveal` métrique incrémentée).
- Auto-next : si activé, passage automatique après phase reveal (petit délai configurable via `REVEAL_DELAY_MS`).

## Performance / Rate Limits
- Réponses : fenêtre 2000ms, max 3 par socket.
- Réactions : fenêtre 2000ms, max 6 par socket.

## Futurs possibles
- Types de question supplémentaires (multi-select, texte libre).
- Spectateur (join sans inscrire un player actif).
- Résilience reconnexion : ré-émission d'un `session_state` complet à reconnect.

