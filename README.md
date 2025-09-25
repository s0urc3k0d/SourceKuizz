# SourceKuizz
Plateforme de quiz temps réel (backend NestJS + Socket.IO) avec authentification JWT, sessions multi‑joueurs, scoring, métriques Prometheus.

## 🚀 Quickstart Backend

1. Installer dépendances
```bash
pnpm install # ou npm install
```
2. Copier le fichier d'exemple d'environnement
```bash
cp packages/backend/.env.example packages/backend/.env
```
3. Lancer le serveur (port 3001 par défaut)
```bash
pnpm --filter @sourcekuizz/backend dev
```
4. (Optionnel) Remplir quelques données seed
```bash
pnpm --filter @sourcekuizz/backend seed
```
5. Tester un flux simple HTTP
```bash
curl -X POST http://localhost:3001/auth/register -H 'Content-Type: application/json' -d '{"username":"demo","password":"secret123"}'
```
Récupère `accessToken` dans la réponse.

## 🔌 WebSocket (Socket.IO)
Se connecter avec :
```js
const { io } = require('socket.io-client');
const socket = io('http://localhost:3001', { auth: { token: '<ACCESS_TOKEN>' }});
```
Créer une session à la volée (code auto-généré) :
```js
socket.emit('join_session', { quizId: '<QUIZ_ID>', nickname: 'Host' });
socket.on('session_code_assigned', ({ code }) => console.log('CODE=', code));
socket.on('session_state', console.log);
```
Documentation complète : `packages/backend/docs/websocket-protocol.md`.

## 🧪 Tests
E2E (Jest) et unitaires (Vitest) :
```bash
pnpm --filter @sourcekuizz/backend test:e2e
pnpm --filter @sourcekuizz/backend test
```
Test ciblé métriques :
```bash
pnpm --filter @sourcekuizz/backend test:metrics
```

## 📊 Métriques
- `/metrics` JSON
- `/metrics/prom` format Prometheus (counters / gauges / histogram latence réponses)
- `/metrics/reset` (protéger via `METRICS_RESET_TOKEN` en production)

## 🔐 Sécurité & Env
Variables clés (cf. `.env.example`):
- `JWT_SECRET` (obligatoire en prod)
- `METRICS_RESET_TOKEN` (sécurise reset)
- `TIME_SCALE` (accélération tests)
- `REVEAL_DELAY_MS` (délai après reveal)

## 🗂 Structure principale
```
packages/backend
	src/modules
		auth/ quiz/ realtime/ scoring/ database/ health/
	docs/websocket-protocol.md
	scripts/seed.ts
```

## ✅ Fonctionnalités Actuelles
- Auth register/login/refresh
- Création quiz + questions MCQ (timeLimitMs >= 1000)
- Sessions WS avec code généré serveur (6 chars)
- Démarrage question, réponses avec scoring (temps + streak), reveal auto, auto-next optionnel
- Transfert host, réactions (rate limited)
- Leaderboard en temps réel
- Métriques (counters, gauges, histogram) + reset protégé

## 🔜 Prochaines améliorations suggérées
- RemainingMs pour late joiners en phase question
- Métriques durées (question/session)
- Reconnexion résiliente (remplacement socket)
- Types de questions additionnels
- Mode spectateur

## 📝 Licence
Voir `LICENSE`.

