# Choix Techniques Proposés

## Stack A (Référence)
- Backend: NestJS + Fastify adapter
- ORM: Prisma
- DB Dev: SQLite → Prod: PostgreSQL
- Real-Time: ws (uWebSockets.js possible future) + Redis Pub/Sub
- Front: Next.js (App Router) + React Query + Zustand
- UI: TailwindCSS + Framer Motion
- Auth: Passport (local + Twitch OAuth)
- Validation: Zod
- Tests: Vitest (unit), Playwright (e2e), k6 (charge)
- Observabilité: OpenTelemetry + Prometheus + pino

## Justifications
| Composant | Raison |
|----------|-------|
| NestJS | Structure modulaire, DI, testabilité |
| Prisma | Productivité, migrations sûres, introspection |
| Next.js | SSR + SEO + hydration rapide |
| Redis | Pub/Sub + cache low latency |
| Zod | Validation runtime + types TS alignés |
| Tailwind | Rapidité prototypage UI |

## Alternatives
- Temps réel massif: Elixir/Phoenix Channels
- Backend minimal: Fastify simple + modules custom
- Go service WS haute densité (phase 4+)

## Qualité & CI/CD
- pnpm workspaces (front + backend)
- Lint: ESLint + biome (option)
- Formatting: Prettier
- Husky + lint-staged (pré-commit)
- GitHub Actions: test / build / scan deps

## Sécurité
- Argon2id via libsodium / node-argon2
- JWT RS256 (clé privée hors repo)

## Déploiement
- Conteneurs Docker (multi-stage build)
- Orchestrateur: Kubernetes (phase 3+) ou Fly.io/Render (phase 1-2)
- Reverse proxy: Nginx / Traefik / Cloudflare Tunnels

## CDN & Assets
- Upload → S3 compatible (MinIO en dev possible)
- Images traitées via service (sharp) async

## Stockage Futur Analytics
- EventLog → Data Lake (S3 parquet) + DuckDB / Athena

## Internationalisation
- Front: i18next / next-intl

## Feature Flags
- Table simple (flags), cache mémoire
- Lib future: Unleash / ConfigCat
