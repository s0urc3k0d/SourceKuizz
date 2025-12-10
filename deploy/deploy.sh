#!/bin/bash
#
# SourceKuizz - Deployment Script
#
# This script deploys SourceKuizz to a production server.
# Run this script on your server after cloning the repository.
#
# Prerequisites:
#   - Node.js 18+ installed
#   - pnpm installed (npm install -g pnpm)
#   - PM2 installed (npm install -g pm2)
#   - NGINX installed
#   - Certbot installed (for SSL)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#

set -e

# Configuration
APP_DIR="/var/www/sourcekuizz"
REPO_URL="https://github.com/s0urc3k0d/SourceKuizz.git"
BRANCH="main"
DOMAIN="sourcekuizz.sourcekod.fr"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SourceKuizz Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please do not run this script as root.${NC}"
    echo "Run as a regular user with sudo privileges."
    exit 1
fi

# Step 1: Create directories
echo -e "${YELLOW}Step 1: Creating directories...${NC}"
sudo mkdir -p "$APP_DIR"
sudo mkdir -p /var/log/pm2
sudo mkdir -p /var/www/certbot
sudo chown -R $USER:$USER "$APP_DIR"
sudo chown -R $USER:$USER /var/log/pm2

# Step 2: Clone or update repository
echo -e "${YELLOW}Step 2: Cloning/updating repository...${NC}"
if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/$BRANCH
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
    git checkout "$BRANCH"
fi

# Step 3: Install dependencies
echo -e "${YELLOW}Step 3: Installing dependencies...${NC}"
cd "$APP_DIR"
pnpm install --frozen-lockfile

# Step 4: Setup environment files
echo -e "${YELLOW}Step 4: Setting up environment files...${NC}"
if [ ! -f "$APP_DIR/packages/backend/.env" ]; then
    cp "$APP_DIR/deploy/.env.production.example" "$APP_DIR/packages/backend/.env"
    echo -e "${RED}IMPORTANT: Edit $APP_DIR/packages/backend/.env with your production values!${NC}"
fi

# Create data directory for SQLite
mkdir -p "$APP_DIR/packages/backend/data"

# Step 5: Build applications
echo -e "${YELLOW}Step 5: Building applications...${NC}"
cd "$APP_DIR/packages/backend"
pnpm run build

cd "$APP_DIR/packages/web"
# Set production environment for Next.js build
export NEXT_PUBLIC_API_URL="https://$DOMAIN/api"
export NEXT_PUBLIC_WS_URL="https://$DOMAIN"
pnpm run build

# Step 6: Run database migrations
echo -e "${YELLOW}Step 6: Running database migrations...${NC}"
cd "$APP_DIR/packages/backend"
npx prisma migrate deploy
npx prisma generate

# Step 7: Setup NGINX
echo -e "${YELLOW}Step 7: Setting up NGINX...${NC}"
sudo cp "$APP_DIR/deploy/sourcekuizz.nginx.http.conf" /etc/nginx/sites-available/sourcekuizz
if [ ! -L /etc/nginx/sites-enabled/sourcekuizz ]; then
    sudo ln -s /etc/nginx/sites-available/sourcekuizz /etc/nginx/sites-enabled/
fi
sudo nginx -t && sudo systemctl reload nginx

# Step 8: Setup PM2
echo -e "${YELLOW}Step 8: Setting up PM2...${NC}"
cd "$APP_DIR"
pm2 delete sourcekuizz-backend sourcekuizz-frontend 2>/dev/null || true
pm2 start deploy/ecosystem.config.js
pm2 save

# Step 9: Setup PM2 startup
echo -e "${YELLOW}Step 9: Setting up PM2 startup...${NC}"
pm2 startup systemd -u $USER --hp $HOME | tail -1 | bash || true

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Edit the environment file:"
echo "   nano $APP_DIR/packages/backend/.env"
echo ""
echo "2. Restart the backend after editing .env:"
echo "   pm2 restart sourcekuizz-backend"
echo ""
echo "3. Generate SSL certificate with Certbot:"
echo "   sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "4. After SSL is configured, update NGINX config:"
echo "   sudo cp $APP_DIR/deploy/sourcekuizz.nginx.ssl.conf /etc/nginx/sites-available/sourcekuizz"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "5. Configure Twitch OAuth redirect URI:"
echo "   https://$DOMAIN/api/auth/twitch/callback"
echo ""
echo -e "${GREEN}Application URLs:${NC}"
echo "   Frontend: http://$DOMAIN (or https after SSL)"
echo "   Backend API: http://$DOMAIN/api"
echo ""
echo -e "${GREEN}Useful commands:${NC}"
echo "   pm2 status                    - Check app status"
echo "   pm2 logs sourcekuizz-backend  - View backend logs"
echo "   pm2 logs sourcekuizz-frontend - View frontend logs"
echo "   pm2 restart all               - Restart all apps"
echo ""
