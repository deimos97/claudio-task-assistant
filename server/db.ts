// SQLite (node:sqlite, incluido en Node) + migraciones versionadas + copias diarias.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUP_DIR, BACKUPS_KEPT, DATA_DIR, DB_FILE, ROOT } from './config.ts';

mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Migraciones: server/migrations/NNN_nombre.sql, aplicadas en orden; la versión
// aplicada se guarda en PRAGMA user_version.
function migrate(): void {
  const dir = join(ROOT, 'server', 'migrations');
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  const files = readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  for (const f of files) {
    const n = Number(f.slice(0, 3));
    if (n <= current) continue;
    backup(`pre-migracion-${n}`);
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(dir, f), 'utf8'));
      db.exec(`PRAGMA user_version = ${n}`);
      db.exec('COMMIT');
      console.log(`BD: migración ${f} aplicada`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Copia consistente de la BD (VACUUM INTO) en backups/; conserva las BACKUPS_KEPT más recientes. */
export function backup(label = 'auto'): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13); // 20261118T1530
  const file = join(BACKUP_DIR, `claudio-${stamp}-${label}.db`);
  rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  const old = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('-auto.db')).sort().reverse().slice(BACKUPS_KEPT);
  for (const f of old) rmSync(join(BACKUP_DIR, f), { force: true });
  return file;
}

migrate();

// Una copia al arrancar y otra cada 24 h (nombre con hora UTC).
backup();
setInterval(() => {
  try { backup(); } catch (e) { console.error('BD: fallo en la copia', e); }
}, 24 * 3600_000).unref();
