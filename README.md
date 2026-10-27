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

## Reference messages and checkpoints

Messages and checkpoints are scoped to the project and PDEF (including PDEFs
containing `/`). Messages provide operator instructions in Firewall's OK-piece
verification; checkpoints populate reference-specific choices in Firewall/CSL
and per-point OK/NOK reviews in Delibera.

Lists preserve order, ignore blank entries, remove identical duplicates, and
accept up to 500 characters per entry. Replacing each list is transactional:
failed writes preserve its previous contents. If a reference's metadata cannot
be loaded, editing cannot be saved until the reference is reopened successfully,
preventing accidental erasure of existing messages or checkpoints.

## Barcode scan validation

Projects can configure a scan length (1–100 characters) during creation or with
the "Régler − / +" action, including locked system projects. Leave the field
empty to disable length checking; existing projects start unconfigured to avoid
blocking their workflows. Settings persist in Oracle PROJECT_SCAN_SETTINGS and
follow project renames/deletion. No default length is imposed automatically.

Firewall, CSL and Delibera check the full scanned length against the project's
setting, accepting all character types. Reference recognition accepts a complete
PDEF or FAS at the start of the code with a serial suffix; the full code no longer
has to equal the PDEF/FAS. Unrecognized references still produce an explicit error.
Scanner surrounding whitespace/terminators are trimmed by existing scan inputs.

Rejected scans open a large illustrated error dialog showing the project,
expected and received lengths, missing or extra character count, and scanned
value. No new record is written. Existing Delibera records also undergo length
validation before opening; history remains readable. Firewall/CSL edit validation
runs before deleting the old rows. Legacy report matching is unchanged.

Validate the frontend popup helper with
`node --test frontend/src/utils/barcode.test.js`. Oracle barcode integration
tests are opt-in with `RUN_ORACLE_BARCODE_TESTS=true` and use read-only reference
queries.

## Version photos

In Projects, administrators and supervisors can use **Photos des versions** to
choose an existing line/version and add, replace or delete its photo (JPEG/PNG,
maximum 2 MiB and 20 million pixels). One image is stored per project/line/version
in Oracle `PROJECT_VERSION_PHOTOS`, so container recreation does not lose images.
Photos follow project renames and are removed when the project is deleted.

Delibera displays the corresponding photo inside scan preparation, after
project, line and version have been selected. Once validated, the photo remains
visible beside the OK and NOK scan fields (below them on small screens), without
cropping the image. It is optional: missing images are
clearly indicated and do not block scanning. Loading errors are shown with retry,
and changing the selection immediately hides any previous photo.
Oracle photo integration tests use `RUN_ORACLE_PHOTO_TESTS=true`; test writes are
rolled back without changing existing photos.

## Delibera multi-code scans

The Projects scan-settings button now opens a conditions window. New and existing
projects can configure 1–3 required fields for both Delibera OK and NOK. Each
field has an optional length (1–100 characters), exact case-sensitive prefix and
exact suffix. Empty conditions are not imposed; every configured field still
requires a scan. Leading zeroes and punctuation are preserved. Code 1 remains the
piece barcode and must identify a project reference; codes 2 and 3 are additional
labels for the same piece, not additional pieces.

The operator scans each field and presses Enter (or Validate); focus advances to
the next field. No piece or NOK defect workflow starts until all fields pass.
Errors identify the field and failed condition in the centered error dialog.
Validation also runs server-side before insert, including checkpoint workflows.
Existing pieces reject complementary codes differing from their saved values.
Historical records without complementary codes remain readable.

Rules persist in `DELIBERA_SCAN_RULES`; existing projects without new rules retain
their previous single-field length rule. Firewall/CSL keep their independent
length-only setting and do not use the Delibera prefix/suffix/multi-code rules.
Complementary codes persist in `DELIBERA_RECORDS.SCAN_CODE_2/SCAN_CODE_3` and are
shown in recent scans, record details and Excel exports/imports. Renaming or
deleting a project also updates/removes its rules.

Frontend checks: `node --test frontend/src/utils/scanRules.test.js`.
Oracle integration: `RUN_ORACLE_SCAN_RULE_TESTS=true` (test writes rolled back).

## Delibera NOK entry

After the required scans and any checkpoint review, NOK opens the complete entry
window: piece details, multiple selectable posts, a seamstress search by name or
employee number, and multiple defect codes. Selection does not save anything:
the operator must click **Enregistrer**. At least one defect is required.
Cancelling creates no record; errors retain the form for correction or retry.
The scanned labels and checkpoint results are saved with the same piece.

All selected posts persist in `DELIBERA_RECORD_POSTES`; the first post remains in
the legacy `POSTE_ID` column. Details, history and Excel show the combined names,
and editing retains multiple selections. Historical single-post records continue
to work without migration of their data. Firewall/CSL and the automatic OK entry
workflow are unchanged.

The frontend entry HTML is served without caching so reloading after a deployment
loads the current version. Already-open tabs keep their running version until
reloaded; close or cancel any unfinished entry before refreshing.

## Scan settings per PDEF and version

In Projects > Parametres projet, first select a PDEF, then one of its versions
before editing the Firewall/CSL length or Delibera rules. Settings apply to the
project/PDEF/version tuple across all lines and persist in `REF_SCAN_SETTINGS`.
Two PDEFs sharing a version can use different lengths, numbers of required labels,
prefixes and suffixes. A blank length explicitly disables its length condition.

Unconfigured tuples inherit their existing version settings (`VERSION_SCAN_SETTINGS`),
then project defaults, without overwriting existing settings. In Delibera, code 1
identifies the PDEF in the preparation version; its rules are then loaded and
validated before complementary scans become available. Changing code 1 invalidates
all complementary confirmations. The server rechecks the recognized tuple before
any insert. Firewall/CSL also use the recognized PDEF/version length.
Settings follow project rename/delete operations.

## Modal dismissal

Clicking outside a modal does not dismiss it or discard the current form.
Use its explicit close/cancel button (or the header cross). Successful save
actions retain their existing completion behavior. This applies to shared
settings dialogs and the custom Firewall, CSL and Delibera overlays.

## Historique de l’activité métier (administrateurs)

Dans **Utilisateurs → Historique de connexion**, l’onglet **Activité métier**
affiche les actions du compte sélectionné ; l’historique global propose le même
onglet. Seul le rôle **ADMIN** peut consulter cette activité, y compris via
l’API. Les droits existants de consultation des connexions restent inchangés.
Filtres : matricule exact (vue globale), dates inclusives, module et résultat ;
pagination de 50 lignes dans l’interface (API : 1 à 200, page 1 à 1 000 000).

Le backend enregistre les requêtes métier POST/PUT/PATCH/DELETE des modules
applicatifs reconnus : créations, modifications, suppressions, imports,
scans Délibéra, validations, contrôles et retours NOK → OK. Sont également
enregistrés les GET explicites `/firewall/scan`, `/csl/scan` et les routes
d’export serveur (Firewall/CSL, Tri, rapports qualité et défauts couturière).
Les pages, listes, recherches de codes, statistiques, lectures d’historique,
connexions et renouvellements de jetons sont exclus. Les tentatives de
connexion continuent d’utiliser leur historique existant.

Les exports Excel générés localement (Firewall, CSL, Délibéra, audit produit,
opérateurs/employés, utilisateurs/connexions, projets/références/modèles,
postes et codes défauts) déclarent leur génération après l’appel à XLSX.
Ils sont affichés **Déclaré navigateur**, jamais comme une preuve de
téléchargement réussi. L’API n’accepte qu’un module autorisé et le format XLSX ;
l’acteur vient toujours de l’authentification serveur, pas du navigateur.
Une déclaration échouée affiche une alerte à l’utilisateur.

Chaque ligne conserve le matricule et l’identifiant authentifiés, la date
serveur, le module, l’action, la route **modèle**, les identifiants de cible
autorisés, le statut HTTP et la durée. Ni contenu de formulaire, ni mot de
passe, jeton, fichier, SQL ou ensemble de paramètres n’est enregistré.
Les identifiants de cible proviennent uniquement des variables de route
autorisées et des paramètres `projet`, `barcode`, `barCode` ; les créations
dont l’identifiant est dans le corps ne prétendent pas connaître cette cible.
Les résultats sont des résultats **HTTP** : un import répondant 200 peut avoir
des lignes ignorées/en erreur, et plusieurs requêtes peuvent correspondre
à une seule opération utilisateur.

Au premier démarrage, une table additive `USER_BUSINESS_ACTIVITY` et ses
index sont créés dans le schéma Oracle applicatif (SYSTEM sur l’installation
actuelle). Aucun changement des tables métier ou de `LOGIN_HISTORY`, aucune
reconstitution d’anciennes actions, aucune suppression de données. Les acteurs
restent lisibles après suppression d’un compte (pas de clé étrangère).
La création de table doit réussir avant que le service démarre.

L’enregistrement intervient après le traitement HTTP, indépendamment de la
transaction métier : si le stockage d’audit échoue après une écriture validée,
la réponse métier n’est pas changée et une alerte serveur **ERROR
BUSINESS_AUDIT_WRITE_FAILED** est émise (type d’erreur, sans SQL ni paramètres).
Surveiller ces alertes : une indisponibilité Oracle peut donc laisser une
lacune, sans fausse ligne de succès. Les lectures/déclarations d’export
indisponibles répondent 503 avec un message explicite. Aucun mécanisme de
rétention automatique n’est appliqué.

Validation ciblée : `mvn "-Dtest=BusinessActivity*Test" test` dans l’image
builder backend ; build frontend avec son Dockerfile. Le déploiement doit
publier **ensemble** le backend et le frontend, après validation ; aucune
modification de volume ou import de base n’est nécessaire.
