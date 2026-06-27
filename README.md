# Personal Notebook

Single-user notebook web app built with `Next.js 16`, `React 19`, `Tailwind CSS 4`, `Prisma 7`, and `Postgres`.

## Features

- Password gate on first visit
- Bootstrap password defaults to `reza1071377`
- Password change from in-app security settings
- Notebook and page CRUD
- Rich-text editor with headings, lists, tasks, code blocks, links, and images
- Full-text style search over title, body text, and tags
- Image and PDF attachments
- Single-user session auth with secure cookies

## Local setup

1. Copy `.env.example` into `.env` if you want custom values.
2. Set `DATABASE_URL` to your Postgres instance.
3. Start Postgres. The fastest local option is:

```bash
docker compose up -d
```

If you already have Postgres installed locally, make sure it is listening on `localhost:5432` and that the `notebook` database exists.
4. Run:

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

5. Open `http://localhost:3000`.
6. Log in with the bootstrap password and change it from `/settings/security`.

## Important environment variables

- `DATABASE_URL`: Postgres connection string
- `SESSION_SECRET`: long random secret for signed session cookies
- `BOOTSTRAP_PASSWORD`: initial password for first seed/bootstrap user
- `SESSION_COOKIE_SECURE`: set to `true` only when the app is served behind HTTPS
- `UPLOAD_DIR`: attachment storage folder
- `MAX_UPLOAD_SIZE_MB`: upload limit for images and PDFs
- `EMAIL_ENABLED`: set to `true` to send signup and password-reset emails
- `MAIL_PROVIDER`: currently `gmail`
- `GMAIL_USER` / `GMAIL_APP_PASSWORD`: Gmail sender account and app password
- `MAIL_FROM`: sender address shown to users
- `APP_BASE_URL`: public app URL used in email links, for example `https://notavanote.ir`
- `SUPPORT_EMAIL`: optional contact shown in auth help text

## Verification

Run the complete regression check before every push or deployment:

```bash
npm run verify
```

This validates the Prisma schema, runs ESLint and TypeScript, executes the
functional tests, and creates a production build. Use `npm run test:watch`
while developing a focused change.

## Deployment notes

- Put the app behind HTTPS and a reverse proxy.
- Persist both Postgres data and the `uploads/` directory.
- Run `npm run prisma:deploy` during deployment.
- Run `npm run prisma:seed` once on first deploy.
- Replace the default bootstrap password in production environment config.

## Ubuntu server deploy

1. From the project root, create and upload an archive:

```bash
tar --exclude .git --exclude node_modules --exclude .next --exclude uploads -czf notebook-deploy.tgz .
scp notebook-deploy.tgz root@YOUR_SERVER_IP:/root/
scp scripts/deploy-notebook.sh root@YOUR_SERVER_IP:/root/
```

2. SSH into the server and run:

```bash
chmod +x /root/deploy-notebook.sh
BOOTSTRAP_PASSWORD='replace-this-now' /root/deploy-notebook.sh
```

Notes:

- The script expects the archive at `/root/notebook-deploy.tgz`.
- Default app path is `/var/www/notebook`.
- Default port is `3000` behind Nginx on port `80`.
- The bootstrap password should be overridden at runtime for production.
- The deploy script now creates a dedicated Postgres login named `notebook_app` by default instead of reusing `postgres`.

## Git-based auto deploy

If you want the server to redeploy itself after every `git push`, install the poller once on the server. For a private GitHub repository, point it at an SSH deploy key:

```bash
chmod +x scripts/install-auto-deploy.sh scripts/auto-deploy-server.sh
sudo APP_DIR=/var/www/notebook PORT=3000 scripts/install-auto-deploy.sh
```

What it does:

- Installs a `systemd` timer named `notebook-auto-deploy.timer`
- Checks the GitHub `master` branch every minute
- Runs a fresh deploy only when a new commit is detected
- Keeps the last deployed commit in `/var/lib/notebook-auto-deploy/last-deployed-commit`

## Database portability

If you plan to move the app between servers often, treat the database and `uploads/` as one migration unit.

1. On the current server, create a full backup:

```bash
chmod +x scripts/db-backup.sh scripts/db-restore.sh
APP_DIR=/var/www/notebook scripts/db-backup.sh
```

This creates a timestamped folder under `/var/backups/notebook/` containing:

- `database.dump`: PostgreSQL custom-format dump
- `uploads.tgz`: attachment files
- `manifest.txt`: basic metadata
- `sha256sums.txt`: integrity hashes

2. Copy that backup directory to the next server.

3. Deploy the app code on the next server first.

4. Restore the backup on the next server:

```bash
APP_DIR=/var/www/notebook scripts/db-restore.sh /var/backups/notebook/20260614T000000Z
pm2 restart notebook
```

Operational notes:

- Keep using Prisma migrations for schema evolution; use dump/restore for server-to-server moves.
- The backup is application-consistent only if no writes happen during the dump. For the cleanest migration, put the app in maintenance mode or stop PM2 briefly before backup.
- If you move to HTTPS later, set `SESSION_COOKIE_SECURE="true"` in `.env` and restart PM2.
