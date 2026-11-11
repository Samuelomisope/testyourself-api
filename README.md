# TestYourself API

NestJS backend for the TestYourself application.

## Setup

Install dependencies, configure the environment, and apply the Prisma migrations:

```bash
npm install
npx prisma migrate deploy
npm run start:dev
```

Required runtime configuration includes `DATABASE_URL`, `JWT_SECRET`, Google authentication credentials, and the object-storage credentials used by the application. Set `PORT` to the port supplied by your hosting platform. `REDIS_URL` enables cross-instance Socket.IO delivery; without Redis, realtime delivery is limited to a single API instance.

## Administrator access

Set `ADMIN_EMAILS` to a comma-separated list of administrator email addresses, or assign those accounts the `ADMIN` or `SUPER_ADMIN` role in the database. Keep this setting in the deployment environment and do not commit it to source control. The local ignored `.env` retains the administrator address that was previously hardcoded in the guard.

## WebSocket clients

Authenticate Socket.IO connections with a valid access token using `auth.accessToken` or `auth.token`. The server resolves the user identity from the token and checks the account against the database.

## Build and checks

```bash
npm run build
npm test -- --runInBand
```

Use `npm run start:prod` to run the compiled application. Apply pending database migrations before deploying a release that changes the Prisma schema.
