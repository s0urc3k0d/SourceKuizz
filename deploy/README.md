# SourceKuizz - Guide de Déploiement

Ce dossier contient tous les fichiers nécessaires pour déployer SourceKuizz en production.

## Ports Utilisés

- **Backend (NestJS)**: `3007`
- **Frontend (Next.js)**: `3008`

## Fichiers

| Fichier | Description |
|---------|-------------|
| `ecosystem.config.js` | Configuration PM2 pour gérer les processus |
| `sourcekuizz.nginx.http.conf` | Config NGINX HTTP (avant Certbot) |
| `sourcekuizz.nginx.ssl.conf` | Config NGINX HTTPS (après Certbot) |
| `.env.production.example` | Exemple de variables d'environnement |
| `deploy.sh` | Script de déploiement automatisé |

## Déploiement Rapide

```bash
# 1. Sur le serveur, cloner le repo
git clone https://github.com/s0urc3k0d/SourceKuizz.git /var/www/sourcekuizz
cd /var/www/sourcekuizz

# 2. Rendre le script exécutable et le lancer
chmod +x deploy/deploy.sh
./deploy/deploy.sh

# 3. Éditer le fichier .env
nano packages/backend/.env

# 4. Redémarrer le backend
pm2 restart sourcekuizz-backend

# 5. Générer le certificat SSL
sudo certbot --nginx -d sourcekuizz.sourcekod.fr -d www.sourcekuizz.sourcekod.fr

# 6. Mettre à jour NGINX avec la config SSL
sudo cp deploy/sourcekuizz.nginx.ssl.conf /etc/nginx/sites-available/sourcekuizz
sudo nginx -t && sudo systemctl reload nginx
```

## Déploiement Manuel

### 1. Prérequis

```bash
# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm

# PM2
npm install -g pm2

# NGINX
sudo apt install -y nginx

# Certbot
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Installation

```bash
# Créer le dossier
sudo mkdir -p /var/www/sourcekuizz
sudo chown $USER:$USER /var/www/sourcekuizz

# Cloner le repo
git clone https://github.com/s0urc3k0d/SourceKuizz.git /var/www/sourcekuizz
cd /var/www/sourcekuizz

# Installer les dépendances
pnpm install
```

### 3. Configuration

```bash
# Copier l'exemple de configuration
cp deploy/.env.production.example packages/backend/.env

# Éditer avec vos valeurs
nano packages/backend/.env
```

Variables importantes à configurer :
- `JWT_SECRET` - Générer avec `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` - Depuis https://dev.twitch.tv/console/apps
- `METRICS_RESET_TOKEN` - Générer avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 4. Build

```bash
# Backend
cd packages/backend
pnpm run build

# Frontend (avec les URLs de production)
cd ../web
NEXT_PUBLIC_API_URL=https://sourcekuizz.sourcekod.fr/api \
NEXT_PUBLIC_WS_URL=https://sourcekuizz.sourcekod.fr \
pnpm run build
```

### 5. Base de données

```bash
cd packages/backend
mkdir -p data
npx prisma migrate deploy
npx prisma generate
```

### 6. NGINX (HTTP d'abord)

```bash
# Copier la config HTTP
sudo cp deploy/sourcekuizz.nginx.http.conf /etc/nginx/sites-available/sourcekuizz

# Activer le site
sudo ln -s /etc/nginx/sites-available/sourcekuizz /etc/nginx/sites-enabled/

# Tester et recharger
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Certificat SSL

```bash
# Générer le certificat
sudo certbot --nginx -d sourcekuizz.sourcekod.fr -d www.sourcekuizz.sourcekod.fr

# Mettre à jour NGINX avec la config SSL
sudo cp deploy/sourcekuizz.nginx.ssl.conf /etc/nginx/sites-available/sourcekuizz
sudo nginx -t
sudo systemctl reload nginx
```

### 8. PM2

```bash
cd /var/www/sourcekuizz

# Démarrer les applications
pm2 start deploy/ecosystem.config.js

# Sauvegarder la configuration
pm2 save

# Configurer le démarrage automatique
pm2 startup systemd
```

## Twitch OAuth

1. Aller sur https://dev.twitch.tv/console/apps
2. Créer une nouvelle application ou modifier l'existante
3. Ajouter l'URL de redirection : `https://sourcekuizz.sourcekod.fr/api/auth/twitch/callback`
4. Copier le Client ID et Client Secret dans `.env`

## Commandes Utiles

```bash
# Statut des applications
pm2 status

# Logs en temps réel
pm2 logs sourcekuizz-backend
pm2 logs sourcekuizz-frontend

# Redémarrer
pm2 restart sourcekuizz-backend
pm2 restart sourcekuizz-frontend
pm2 restart all

# Arrêter
pm2 stop all

# Monitoring
pm2 monit

# Mettre à jour l'application
cd /var/www/sourcekuizz
git pull
pnpm install
cd packages/backend && pnpm run build
cd ../web && pnpm run build
pm2 restart all
```

## Renouvellement SSL

Le certificat Let's Encrypt se renouvelle automatiquement via le timer certbot.

```bash
# Vérifier le timer
sudo systemctl status certbot.timer

# Test de renouvellement
sudo certbot renew --dry-run
```

## Troubleshooting

### Le backend ne démarre pas
```bash
# Vérifier les logs
pm2 logs sourcekuizz-backend --lines 50

# Vérifier que le port n'est pas utilisé
sudo lsof -i :3007
```

### Erreur NGINX
```bash
# Tester la configuration
sudo nginx -t

# Vérifier les logs
sudo tail -f /var/log/nginx/error.log
```

### Erreur de base de données
```bash
cd /var/www/sourcekuizz/packages/backend

# Régénérer le client Prisma
npx prisma generate

# Appliquer les migrations
npx prisma migrate deploy
```
