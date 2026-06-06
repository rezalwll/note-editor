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
- `UPLOAD_DIR`: attachment storage folder
- `MAX_UPLOAD_SIZE_MB`: upload limit for images and PDFs

## Deployment notes

- Put the app behind HTTPS and a reverse proxy.
- Persist both Postgres data and the `uploads/` directory.
- Run `npm run prisma:deploy` during deployment.
- Run `npm run prisma:seed` once on first deploy.
- Replace the default bootstrap password in production environment config.
