# 🗺️ ROADMAP SourceKuizz

> Dernière mise à jour: 10 décembre 2025

---

## 🔴 Correctifs Critiques

| # | Problème | Fichier | Status |
|---|----------|---------|--------|
| 1 | Race condition création session | `realtime.gateway.ts` | ✅ Fait (cleanup + mutex) |
| 2 | Tokens OAuth en URL (sécurité) | `twitch.controller.ts` | ✅ Fait (cookies httpOnly) |
| 3 | Import dynamique ConflictException | `auth.service.ts` | ✅ Fait |
| 4 | Fuite mémoire sessions | `realtime.gateway.ts` | ✅ Fait (cleanup auto) |
| 5 | Pas de validation WebSocket | `realtime.gateway.ts` | ✅ Fait (Zod + ws-validation.ts) |

---

## 🟠 Correctifs Importants

| # | Problème | Fichier | Status |
|---|----------|---------|--------|
| 6 | Types `any` nombreux | Plusieurs fichiers | ✅ Fait (types/index.ts + refactoring) |
| 7 | Rate limiter buckets jamais purgés | `rate-limiter.ts` | ✅ Fait (cleanup auto) |
| 8 | QuizId requis manuellement pour join | `play/[code].tsx` | ✅ Fait (auto-fetch) |
| 9 | Pas de logout/révocation tokens | `auth.service.ts` | ✅ Fait (logout + revokeAll) |
| 10 | Export CSV non protégé | `session.controller.ts` | ✅ Fait (JwtAuthGuard) |
| 11 | Reconnexion WebSocket auto | `ws.ts` | ✅ Fait (socket.io auto-reconnect) |
| 12 | Pagination manquante | Controllers | ✅ Fait (quiz.service + frontend) |

---

## 🟡 Améliorations Recommandées

| # | Amélioration | Status |
|---|--------------|--------|
| 13 | Code dupliqué (session_state) | ✅ Fait (buildSessionStatePayload) |
| 14 | Gestion erreurs silencieuses | ✅ Fait (GlobalExceptionFilter) |
| 15 | Suppression en cascade Quiz | ✅ Fait (transaction Prisma) |
| 16 | Logs structurés | ✅ Fait (StructuredLoggerService) |

---

## 🚀 Nouvelles Fonctionnalités

### Phase 1 - Stabilisation MVP ✅
| Fonctionnalité | Effort | Status |
|----------------|--------|--------|
| Nettoyage auto sessions expirées | 1h | ✅ Fait |
| Auto-récupération quizId depuis code | 1h | ✅ Fait |
| Endpoint logout | 1h | ✅ Fait |

### Phase 2 - Expérience Utilisateur ✅
| Fonctionnalité | Effort | Status |
|----------------|--------|--------|
| Mode hors-ligne + reconnexion auto | 3h | ✅ Fait |
| Historique parties joueur | 3h | ✅ Fait |
| Personnalisation profil | 2h | ✅ Fait |
| Partage social résultats | 1h | ✅ Fait |
| Notifications push | 4h | ✅ Fait |

### Phase 3 - Gamification ✅
| Fonctionnalité | Effort | Status |
|----------------|--------|--------|
| Système de badges | 4h | ✅ Fait |
| XP et niveaux | 3h | ✅ Fait |
| Streaks journaliers | 2h | ✅ Fait |
| Leaderboard global | 2h | ✅ Fait |
| Power-ups (50/50, temps bonus) | 5h | ⏳ À faire |

### Phase 4 - Types de Questions ✅
| Fonctionnalité | Effort | Status |
|----------------|--------|--------|
| Vrai/Faux | 1h | ✅ Fait |
| Réponse texte libre | 3h | ✅ Fait |
| Questions ordre | 3h | ✅ Fait |
| Questions avec média | 4h | ✅ Fait |
| Mode blitz | 2h | ✅ Fait |

### Phase 5 - Intégrations (Partiel) ✅
| Fonctionnalité | Effort | Status |
|----------------|--------|--------|
| Overlay Twitch | 6h | ⏳ À faire |
| Bot Twitch !join | 4h | ⏳ À faire |
| API publique REST | 8h | ✅ Fait |
| Analytics dashboard | 6h | ✅ Fait |
| Discord bot | 5h | ⏳ À faire |

### Phase 6 - Scalabilité
| Fonctionnalité | Effort | Status |
|----------------|--------|--------|
| Redis Pub/Sub | 6h | ⏳ À faire |
| Migration PostgreSQL | 3h | ⏳ À faire |
| Queue de messages | 4h | ⏳ À faire |
| Multi-région | 10h | ⏳ À faire |
| Docker Compose production | 2h | ⏳ À faire |

---

## 📊 Légende

| Icône | Signification |
|-------|---------------|
| ⏳ | À faire |
| 🔄 | En cours |
| ✅ | Terminé |
| ❌ | Annulé |

---

## 📝 Changelog

### 10 décembre 2025
- ✅ Phase 5 (partiel): API publique REST + Analytics Dashboard
  - Module `api/`: ApiKeyService, ApiKeyController, PublicApiController
  - Module `analytics/`: AnalyticsService, AnalyticsController
  - Pages frontend: `/dashboard`, `/settings/api-keys`
  - Endpoints REST avec clés API (scopes, rate-limiting)
- ✅ Phase 4: Types de questions (Vrai/Faux, Texte libre, Ordre, Média, Blitz)
- ✅ Phase 3: Gamification (Badges, XP, Streaks, Leaderboard)
- ✅ Phase 2: Expérience utilisateur (Offline, Historique, Profils, Social, Push)
- ✅ Phase 1: Stabilisation MVP
- Création du fichier ROADMAP
- Identification des correctifs critiques et importants
- Planification des fonctionnalités futures
