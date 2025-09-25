# 🎮 SourceKuizz

**Plateforme de Quiz Interactif avec Intégration Twitch**

SourceKuizz est une application web moderne permettant de créer et jouer à des quiz interactifs en temps réel avec connexion Twitch. Parfait pour les streamers, éducateurs et communautés souhaitant engager leur audience avec des quiz dynamiques et des interactions temps réel.

## ✨ Fonctionnalités

### 🎯 Core Features
- **Authentification Multiple**: Connexion via pseudo/mot de passe ou OAuth Twitch
- **Quiz Temps Réel**: Sessions interactives avec WebSocket pour des mises à jour instantanées
- **Types de Questions**: Choix multiple, Vrai/Faux, Questions ouvertes
- **Système de Score**: Points dynamiques avec classements en temps réel
- **Chat Intégré**: Communication entre participants pendant les sessions
- **Gestion de Sessions**: Codes de session uniques pour rejoindre facilement

### 🔒 Sécurité
- Authentification JWT sécurisée
- Rate limiting pour prévenir les abus
- Validation stricte des données d'entrée
- Protection CORS configurée
- Headers de sécurité avec Helmet.js
- Chiffrement des mots de passe avec bcrypt

### 🚀 Performance
- WebSocket pour communications temps réel optimisées
- Base de données SQLite en développement, PostgreSQL en production
- Cache Redis pour la mise à l'échelle
- Pagination sur toutes les listes
- Optimisations frontend avec React Query

### 📱 Interface Utilisateur
- Design responsive avec Tailwind CSS
- Interface intuitive et moderne
- Support mobile complet
- Animations fluides avec Framer Motion
- Notifications temps réel avec React Hot Toast

## 🏗️ Architecture Technique

### Backend (Node.js + TypeScript)
```
src/server/
├── controllers/     # Logique métier des routes
├── middleware/      # Middlewares d'authentification, erreurs, etc.
├── models/         # Modèles de données TypeScript
├── routes/         # Définition des routes API REST
├── services/       # Services (Auth, Quiz, Database)
├── websocket/      # Gestion WebSocket temps réel
├── utils/          # Utilitaires (logger, helpers)
└── config/         # Configuration de l'application
```

**Stack Backend:**
- **Express.js**: Framework web rapide et minimaliste
- **Socket.IO**: Communications WebSocket bidirectionnelles
- **SQLite/PostgreSQL**: Base de données avec migrations
- **Passport.js**: Authentification avec stratégies JWT et Twitch
- **Winston**: Logging structuré avec rotation de fichiers
- **Jest**: Tests unitaires et d'intégration

### Frontend (React + TypeScript)
```
client/src/
├── components/     # Composants React réutilisables
├── pages/         # Pages de l'application
├── stores/        # État global avec Zustand
├── services/      # Services API et WebSocket
├── hooks/         # Hooks personnalisés React
├── types/         # Types TypeScript partagés
├── utils/         # Utilitaires frontend
└── styles/        # Styles globaux et Tailwind
```

**Stack Frontend:**
- **React 18**: Library UI avec hooks modernes
- **TypeScript**: Typage statique pour la robustesse
- **Vite**: Build tool ultra-rapide
- **Tailwind CSS**: Framework CSS utility-first
- **Zustand**: Gestion d'état simple et performante
- **React Query**: Cache et synchronisation des données serveur
- **Socket.IO Client**: Connexion WebSocket temps réel

## 🛠️ Installation et Développement

### Prérequis
- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **Git**

### Installation Rapide

1. **Cloner le repository**
```bash
git clone https://github.com/s0urc3k0d/SourceKuizz.git
cd SourceKuizz
```

2. **Installer les dépendances**
```bash
npm run setup
```

3. **Configuration**
```bash
cp .env.example .env
```

Éditer le fichier `.env` avec vos configurations :
```env
# Configuration de base
NODE_ENV=development
PORT=3000
CLIENT_PORT=3001

# Base de données
DATABASE_URL=./data/sourcekuizz.db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# Twitch OAuth (optionnel)
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
TWITCH_CALLBACK_URL=http://localhost:3000/auth/twitch/callback
```

4. **Démarrer en mode développement**
```bash
npm run dev
```

L'application sera accessible sur :
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **WebSocket**: ws://localhost:3000

### Scripts Disponibles

```bash
# Développement
npm run dev              # Démarrer client + serveur en mode watch
npm run server:dev       # Serveur uniquement en mode watch
npm run client:dev       # Client uniquement en mode watch

# Build et Production
npm run build           # Build complet (client + serveur)
npm run build:server    # Build serveur uniquement
npm run build:client    # Build client uniquement
npm start              # Démarrer en mode production

# Tests et Qualité
npm test               # Lancer les tests
npm run test:watch     # Tests en mode watch
npm run lint           # Linter le code
npm run lint:fix       # Corriger automatiquement les erreurs de lint

# Docker
npm run docker:build   # Build image Docker
npm run docker:run     # Lancer container Docker
```

## 🐳 Déploiement Docker

### Option 1: Docker Simple
```bash
# Build et run
npm run docker:build
npm run docker:run
```

### Option 2: Docker Compose (Recommandé)
```bash
# Démarrage basique
docker-compose up -d

# Avec Redis pour la mise à l'échelle
docker-compose --profile scaling up -d

# Configuration production complète (PostgreSQL + Nginx + Redis)
docker-compose --profile production up -d
```

### Variables d'Environnement pour Production
```env
NODE_ENV=production
JWT_SECRET=your-very-secure-jwt-secret-key
TWITCH_CLIENT_ID=your-twitch-app-client-id
TWITCH_CLIENT_SECRET=your-twitch-app-client-secret
TWITCH_CALLBACK_URL=https://yourdomain.com/auth/twitch/callback
CORS_ORIGIN=https://yourdomain.com
POSTGRES_PASSWORD=secure-database-password
```

## 🎮 Guide d'Utilisation

### Pour les Créateurs de Quiz
1. **Inscription/Connexion** via pseudo ou Twitch
2. **Créer un Quiz** avec titre, description, et questions
3. **Ajouter des Questions** (choix multiple, vrai/faux, texte libre)
4. **Lancer une Session** et obtenir un code de session
5. **Partager le Code** avec votre audience
6. **Gérer la Session** en temps réel (démarrer, pause, question suivante)

### Pour les Participants
1. **Rejoindre avec un Code** de session à 6 caractères
2. **Choisir un Pseudo** (ou utiliser votre compte Twitch)
3. **Répondre aux Questions** en temps réel
4. **Voir le Classement** mis à jour instantanément
5. **Participer au Chat** pendant la session

### API REST Endpoints

#### Authentification
```
POST /api/auth/register      # Inscription
POST /api/auth/login         # Connexion
GET  /api/auth/twitch        # OAuth Twitch
GET  /api/auth/me           # Profil utilisateur
PUT  /api/auth/profile      # Mise à jour profil
```

#### Quiz
```
GET    /api/quiz              # Liste des quiz publics
POST   /api/quiz              # Créer un quiz
GET    /api/quiz/my          # Mes quiz
GET    /api/quiz/:id         # Détails d'un quiz
POST   /api/quiz/:id/questions # Ajouter une question
POST   /api/quiz/:id/session  # Créer une session
```

#### Sessions
```
GET /api/quiz/session/:code   # Informations de session
```

### WebSocket Events

#### Événements Session
```javascript
socket.emit('join-session', { sessionCode, nickname })
socket.on('session-joined', (data) => { /* Session rejointe */ })
socket.on('participant-joined', (data) => { /* Nouveau participant */ })
```

#### Événements Quiz
```javascript
socket.emit('start-quiz', { sessionId })
socket.on('quiz-started', (data) => { /* Quiz démarré */ })
socket.emit('submit-answer', { questionId, answer })
socket.on('leaderboard-updated', (data) => { /* Scores mis à jour */ })
```

## 🧪 Tests

### Lancer les Tests
```bash
# Tests unitaires
npm test

# Tests avec couverture
npm run test:coverage

# Tests en mode watch
npm run test:watch
```

### Structure des Tests
```
tests/
├── unit/           # Tests unitaires
├── integration/    # Tests d'intégration
├── e2e/           # Tests end-to-end
└── fixtures/      # Données de test
```

## 📈 Performance et Monitoring

### Métriques Disponibles
- **Health Check**: `GET /health`
- **Statistiques**: `GET /api/quiz/stats`
- **Logs Structurés**: Winston avec rotation
- **Monitoring WebSocket**: Connexions actives, latence

### Optimisations
- **Rate Limiting**: 100 requêtes/15min par IP
- **Compression**: Gzip activé
- **Cache Headers**: Cache statique optimisé
- **WebSocket Heartbeat**: Détection de déconnexion
- **Pagination**: Toutes les listes sont paginées

## 🔧 Configuration Avancée

### Base de Données
```typescript
// SQLite (développement)
DATABASE_URL=./data/sourcekuizz.db

// PostgreSQL (production)
DATABASE_URL=postgresql://user:password@localhost:5432/sourcekuizz
```

### Redis (Mise à l'échelle)
```typescript
REDIS_URL=redis://localhost:6379
```

### Sécurité
```typescript
BCRYPT_ROUNDS=12                    # Niveau de hachage
RATE_LIMIT_WINDOW_MS=900000        # Fenêtre rate limiting
RATE_LIMIT_MAX=100                 # Max requêtes par fenêtre
```

## 🤝 Contribution

### Guide de Contribution
1. **Fork** le projet
2. **Créer une branche** pour votre feature (`git checkout -b feature/amazing-feature`)
3. **Commit** vos changements (`git commit -m 'Add amazing feature'`)
4. **Push** sur la branche (`git push origin feature/amazing-feature`)
5. **Ouvrir une Pull Request**

### Standards de Code
- **ESLint** pour la qualité du code
- **Prettier** pour le formatage
- **TypeScript** strict mode
- **Tests** requis pour les nouvelles fonctionnalités
- **Documentation** mise à jour

## 📝 Licence

Ce projet est sous licence **GPL-3.0**. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🙏 Remerciements

- **Twitch** pour l'API OAuth
- **Socket.IO** pour les WebSockets
- **React** et **Node.js** communautés
- Tous les **contributeurs** du projet

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/s0urc3k0d/SourceKuizz/issues)
- **Discussions**: [GitHub Discussions](https://github.com/s0urc3k0d/SourceKuizz/discussions)
- **Wiki**: [Documentation Wiki](https://github.com/s0urc3k0d/SourceKuizz/wiki)

---

**Fait avec ❤️ pour la communauté des streamers et éducateurs**
