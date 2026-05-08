import Database, { type Database as DatabaseT } from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * SQLite-backed persistence for users, investments, and transactions.
 *
 * The DB lives at `${DATA_DIR}/app.db`. `DATA_DIR` defaults to
 * `<cwd>/data` for local development. In production (Azure App Service)
 * set `DATA_DIR=/home/data` so the DB sits on the persistent mount and
 * survives redeploys — the deploy replaces `/home/site/wwwroot` but
 * leaves `/home/data` alone.
 *
 * Pragmas:
 *   - WAL: better concurrent read/write throughput; readers don't block writers.
 *   - foreign_keys = ON: ensures `ON DELETE CASCADE` actually fires.
 *   - busy_timeout: brief retry window if a write contends with a checkpoint.
 *
 * The handle is pinned on `globalThis` so route-handler bundles share it
 * across HMR reloads in dev. In prod each Node worker opens its own.
 */

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

function dbFile(): string {
  return path.join(dataDir(), "app.db");
}

const GLOBAL_KEY = Symbol.for("investment-tracker.db");
type DbGlobals = { db: DatabaseT | null };
const g = globalThis as unknown as Record<symbol, DbGlobals>;
if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { db: null };

export function getDb(): DatabaseT {
  const cached = g[GLOBAL_KEY].db;
  if (cached) return cached;
  fs.mkdirSync(dataDir(), { recursive: true });
  const db = new Database(dbFile());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  applyMigrations(db);
  importLegacyJsonIfNeeded(db);
  g[GLOBAL_KEY].db = db;
  return db;
}

// ---------- Migrations -------------------------------------------------------

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "001_init",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color TEXT NOT NULL,
        hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        iterations INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE investments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        -- stock / mutual-fund variant
        symbol TEXT,
        quantity REAL,
        avg_cost REAL,
        -- cash variant
        label TEXT,
        balance REAL,
        principal REAL,
        interest_rate REAL,
        maturity_date TEXT,
        -- common
        currency TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sort_index INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_investments_user_sort
        ON investments(user_id, sort_index);

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        investment_id TEXT NOT NULL
          REFERENCES investments(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        fees REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_transactions_user_inv
        ON transactions(user_id, investment_id);
      CREATE INDEX idx_transactions_user_date
        ON transactions(user_id, date);
    `,
  },
];

function applyMigrations(db: DatabaseT): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>)
      .map((r) => r.name),
  );
  const insertMig = db.prepare("INSERT INTO _migrations (name) VALUES (?)");
  const tx = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (applied.has(m.name)) continue;
      db.exec(m.sql);
      insertMig.run(m.name);
    }
  });
  tx();
}

// ---------- One-time JSON → SQLite import ------------------------------------

/**
 * Imports legacy file-based data on first DB open. Idempotent: a populated
 * `users` table short-circuits the function, so re-runs are no-ops.
 *
 * Source layout (file storage):
 *   ${DATA_DIR}/users.json                   — registry
 *   ${DATA_DIR}/users/<uid>/investments.json
 *   ${DATA_DIR}/users/<uid>/transactions.json
 *
 * Older single-PIN layout is also handled (carried forward by the previous
 * `lib/users.ts#migrateIfNeeded` flow) — if the user upgraded directly to
 * SQLite without ever booting the multi-user JSON layout, we synthesize a
 * "Default" user the same way.
 *
 * On success, every consumed JSON file is renamed to `*.migrated` rather
 * than deleted, so a manual rollback is possible.
 */
function importLegacyJsonIfNeeded(db: DatabaseT): void {
  const userCount = (
    db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }
  ).c;
  if (userCount > 0) return;

  const dir = dataDir();
  const usersFile = path.join(dir, "users.json");
  const usersRoot = path.join(dir, "users");
  const legacyAuth = path.join(dir, "auth.json");
  const legacyInvestments = path.join(dir, "investments.json");
  const legacyTransactions = path.join(dir, "transactions.json");

  // Promote legacy single-PIN data to a Default user folder if needed.
  if (!fs.existsSync(usersFile) && fs.existsSync(legacyAuth)) {
    promoteLegacySinglePin(
      legacyAuth,
      legacyInvestments,
      legacyTransactions,
      usersFile,
      usersRoot,
    );
  }

  if (!fs.existsSync(usersFile)) return;

  let registry: unknown;
  try {
    registry = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  } catch {
    return;
  }
  const users = (registry as { users?: unknown[] }).users;
  if (!Array.isArray(users) || users.length === 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, color, hash, salt, iterations, created_at)
    VALUES (@id, @name, @color, @hash, @salt, @iterations, @created_at)
  `);
  const insertInv = db.prepare(`
    INSERT INTO investments (
      id, user_id, category, symbol, quantity, avg_cost,
      label, balance, principal, interest_rate, maturity_date,
      currency, notes, created_at, updated_at, sort_index
    ) VALUES (
      @id, @user_id, @category, @symbol, @quantity, @avg_cost,
      @label, @balance, @principal, @interest_rate, @maturity_date,
      @currency, @notes, @created_at, @updated_at, @sort_index
    )
  `);
  const insertTx = db.prepare(`
    INSERT INTO transactions (
      id, user_id, investment_id, type, date, quantity, price, fees,
      currency, notes, created_at, updated_at
    ) VALUES (
      @id, @user_id, @investment_id, @type, @date, @quantity, @price, @fees,
      @currency, @notes, @created_at, @updated_at
    )
  `);

  type RawUser = {
    id: string;
    name: string;
    color: string;
    hash: string;
    salt: string;
    iterations: number;
    createdAt: string;
  };

  const consumedUserDirs: string[] = [];

  const importTx = db.transaction(() => {
    for (const u of users as RawUser[]) {
      insertUser.run({
        id: u.id,
        name: u.name,
        color: u.color,
        hash: u.hash,
        salt: u.salt,
        iterations: u.iterations,
        created_at: u.createdAt,
      });

      const userDir = path.join(usersRoot, u.id);
      const invFile = path.join(userDir, "investments.json");
      const txFile = path.join(userDir, "transactions.json");

      if (fs.existsSync(invFile)) {
        const raw = JSON.parse(fs.readFileSync(invFile, "utf8")) as {
          investments?: unknown[];
        };
        const arr = Array.isArray(raw.investments) ? raw.investments : [];
        arr.forEach((iv, idx) => {
          const v = iv as Record<string, unknown>;
          insertInv.run({
            id: String(v.id),
            user_id: u.id,
            category: String(v.category),
            symbol: typeof v.symbol === "string" ? v.symbol : null,
            quantity: typeof v.quantity === "number" ? v.quantity : null,
            avg_cost: typeof v.avgCost === "number" ? v.avgCost : null,
            label: typeof v.label === "string" ? v.label : null,
            balance: typeof v.balance === "number" ? v.balance : null,
            principal:
              typeof v.principal === "number" ? v.principal : null,
            interest_rate:
              typeof v.interestRate === "number" ? v.interestRate : null,
            maturity_date:
              typeof v.maturityDate === "string" ? v.maturityDate : null,
            currency: String(v.currency),
            notes: typeof v.notes === "string" ? v.notes : null,
            created_at: String(v.createdAt),
            updated_at:
              typeof v.updatedAt === "string"
                ? v.updatedAt
                : String(v.createdAt),
            sort_index: idx,
          });
        });
      }

      if (fs.existsSync(txFile)) {
        const raw = JSON.parse(fs.readFileSync(txFile, "utf8")) as {
          transactions?: unknown[];
        };
        const arr = Array.isArray(raw.transactions) ? raw.transactions : [];
        for (const it of arr) {
          const v = it as Record<string, unknown>;
          insertTx.run({
            id: String(v.id),
            user_id: u.id,
            investment_id: String(v.investmentId),
            type: String(v.type),
            date: String(v.date),
            quantity: Number(v.quantity ?? 0),
            price: Number(v.price ?? 0),
            fees: Number(v.fees ?? 0),
            currency: String(v.currency),
            notes: typeof v.notes === "string" ? v.notes : null,
            created_at: String(v.createdAt),
            updated_at:
              typeof v.updatedAt === "string"
                ? v.updatedAt
                : String(v.createdAt),
          });
        }
      }

      consumedUserDirs.push(userDir);
    }
  });

  try {
    importTx();
  } catch (err) {
    console.error("[db] JSON → SQLite import failed; aborted:", err);
    throw err;
  }

  // Rename consumed files to leave a manual-rollback breadcrumb.
  safeRename(usersFile, usersFile + ".migrated");
  for (const d of consumedUserDirs) {
    safeRename(d, d + ".migrated");
  }
  console.log(
    `[db] Imported ${users.length} user(s) from JSON to ${dbFile()}`,
  );
}

function promoteLegacySinglePin(
  legacyAuth: string,
  legacyInvestments: string,
  legacyTransactions: string,
  usersFile: string,
  usersRoot: string,
): void {
  // Mirrors the old `lib/users.ts#migrateIfNeeded` exactly so users who
  // skipped the multi-user JSON release still end up here cleanly.
  let auth: { hash: string; salt: string; iterations: number; createdAt?: string };
  try {
    auth = JSON.parse(fs.readFileSync(legacyAuth, "utf8"));
  } catch {
    return;
  }
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const palette = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#06b6d4",
    "#8b5cf6",
    "#ef4444",
    "#84cc16",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const color = palette[Math.abs(h) % palette.length];

  fs.writeFileSync(
    usersFile,
    JSON.stringify(
      {
        users: [
          {
            id,
            name: "Default",
            color,
            hash: auth.hash,
            salt: auth.salt,
            iterations: auth.iterations,
            createdAt: auth.createdAt ?? new Date().toISOString(),
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  const userDir = path.join(usersRoot, id);
  fs.mkdirSync(userDir, { recursive: true });
  if (fs.existsSync(legacyInvestments)) {
    safeRename(legacyInvestments, path.join(userDir, "investments.json"));
  }
  if (fs.existsSync(legacyTransactions)) {
    safeRename(legacyTransactions, path.join(userDir, "transactions.json"));
  }
  safeRename(legacyAuth, legacyAuth + ".bak");
}

function safeRename(from: string, to: string): void {
  try {
    fs.renameSync(from, to);
  } catch {
    // Non-fatal; rollback breadcrumb is best-effort.
  }
}
