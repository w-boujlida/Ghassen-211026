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

## Employee stamps

In Operators, enter the employee's single required stamp code directly when
creating or editing the employee. There is no separate Stamps tab. The code is
created automatically if needed, and a code already assigned to another employee
is rejected. Replacing a stamp releases the previous assignment; deleting an
employee releases their stamp without deleting the code or quality history.

Employee Excel imports require one stamp per new employee in the `Tampon` column
(legacy `Tampon(s)` and `Tampons` headers are also accepted). Unknown codes are
created automatically. Employee exports include a single `Tampon` column.

## Daily local code commits

Run `bash bin/daily-local-commit.sh` to commit all non-ignored changes locally.
The script requires a Git author configured in this repository, skips unchanged
trees, and refuses to run during a merge, rebase, cherry-pick, revert, or bisect.
Failures are written to stderr. It never pushes to a remote.

On this server, the `fw_app` user crontab runs it daily at 23:00. The server
timezone must remain `Africa/Tunis` for that schedule. Inspect the schedule with
`crontab -l` and the log in `.git/daily-local-commit.log`.

These commits save code history on the same disk, not an independent backup.
Ignored files (including `.env`, Oracle data, dependencies, and build outputs)
are excluded. Keep secrets out of source files and maintain separate database
and off-machine backups.
