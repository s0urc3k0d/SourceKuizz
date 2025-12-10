/**
 * PM2 Ecosystem Configuration for SourceKuizz
 * 
 * Ports used:
 * - Backend API: 3007
 * - Frontend Next.js: 3008
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only sourcekuizz-backend
 *   pm2 start ecosystem.config.js --only sourcekuizz-frontend
 *   pm2 restart ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 delete ecosystem.config.js
 *   pm2 logs sourcekuizz-backend
 *   pm2 logs sourcekuizz-frontend
 */

module.exports = {
  apps: [
    {
      name: 'sourcekuizz-backend',
      cwd: '/var/www/sourcekuizz/packages/backend',
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3007,
        HOST: '127.0.0.1',
      },
      env_file: '/var/www/sourcekuizz/packages/backend/.env',
      error_file: '/var/log/pm2/sourcekuizz-backend-error.log',
      out_file: '/var/log/pm2/sourcekuizz-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'sourcekuizz-frontend',
      cwd: '/var/www/sourcekuizz/packages/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3008',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3008,
        NEXT_PUBLIC_API_URL: 'https://sourcekuizz.sourcekod.fr/api',
        NEXT_PUBLIC_WS_URL: 'https://sourcekuizz.sourcekod.fr',
      },
      error_file: '/var/log/pm2/sourcekuizz-frontend-error.log',
      out_file: '/var/log/pm2/sourcekuizz-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
