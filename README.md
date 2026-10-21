# Firewall Quality System

Public source-only export of the application. The original repository and its
local databases are unchanged.

This repository deliberately has a new history. Environment files, credentials,
database files, backups, business spreadsheets, presentations and internal
documentation are not included.

## Configuration

1. Install Git, Docker and Docker Compose.
2. Copy `.env.example` to `.env` and fill in all required values locally.
3. Set `SERVER_HOST` to the server IP or hostname, without a protocol or port.
4. Set a strong Oracle password, a long random JWT secret and a unique initial
   administrator password. The initial administrator login is `admin`.
5. Configure `SQLSERVER_URL`, `SQLSERVER_USER` and `SQLSERVER_PASSWORD` for your
   external SQL Server ERP database. This integration is required by the current
   backend configuration.
6. Run `docker compose up -d --build`.
7. Open `http://SERVER_HOST:3001/login`, replacing `SERVER_HOST` with your host.
   Browser clients also need access to the backend on port 8081.

Cloning this repository does not transfer any existing database or user account.
Transfer databases separately using an authenticated private channel and verify
backups before replacing destination data. Never publish `.env` or database
backups. Do not expose Oracle port 1521 to the Internet.

This public export requires secrets through environment variables instead of
embedding the original deployment credentials. It is not a security audit.
