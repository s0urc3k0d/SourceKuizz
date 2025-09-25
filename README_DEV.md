# SourceKuizz – Monorepo (Initial Scaffold)

## Structure
packages/
  backend  (API + WebSocket – NestJS Fastify)
  web      (Front Next.js)
  shared   (Types partagés)

## Démarrage

1. Copier `.env.example` vers `packages/backend/.env` ou racine selon config future.
2. Installer dépendances:
```bash
corepack enable
pnpm install
```
3. Générer Prisma (backend):
```bash
pnpm --filter @sourcekuizz/backend prisma:generate
```
4. Lancer en dev:
```bash
pnpm dev
```

Backend par défaut sur http://localhost:3001

## Scripts Clés Backend
- `dev`: démarrage watch (ts-node-dev)
- `build`: compilation TypeScript
- `test`: Vitest (unit) – inclut scoring

## Prochaines Étapes Recommandées
- Implémenter Auth (local + Twitch OAuth)
- Ajouter migrations initiales + seeds
- Implémenter flux session WebSocket complet
- Ajouter CI GitHub Actions
- Introduire Redis (phase 2) + adapter WS

## Notes
Ce squelette est minimal pour commencer l’implémentation incrémentale décrite dans `docs/`.
