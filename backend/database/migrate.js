import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const filename = fileURLToPath(import.meta.url);
const directory = path.dirname(filename);
dotenv.config({ path: path.resolve(directory, '../.env') });
const EXPECTED_DATABASE = 'payteam_kyc';
const BASELINE = '001_initial_schema.sql';
const LOCK = 'payteam_kyc:migrations';
const BASE_TABLES = [
  'roles', 'companies', 'schemes', 'users', 'user_wallets',
  'auth_password_reset_tokens', 'auth_rate_limits', 'auth_pending_registrations',
  'auth_otp_challenges', 'kyc_cases', 'kyc_steps',
  'kyc_verifications', 'bank_accounts', 'media_assets', 'agreement_acceptances',
  'kyc_status_history', 'kyc_identity_data', 'kyc_digilocker_sessions',
  'api_request_metrics',
];

async function getMigrationFiles() {
  const folder = path.join(directory, 'migrations');
  const names = (await fs.readdir(folder)).filter(name => name.endsWith('.sql')).sort();
  if (names[0] !== BASELINE || names.some(name => !/^\d{3}_[a-z0-9_]+\.sql$/.test(name))) {
    throw new Error(`Expected ${BASELINE}, followed by numbered SQL migrations.`);
  }
  if (new Set(names.map(name => name.slice(0, 3))).size !== names.length) {
    throw new Error('Duplicate migration numbers are not allowed. Remove old AquaPay migrations.');
  }
  return Promise.all(names.map(async name => {
    const sql = await fs.readFile(path.join(folder, name), 'utf8');
    // Normalize CRLF so Windows checkout does not change the checksum.
    const normalized = sql.replace(/\r\n/g, '\n');
    return { name, sql: normalized, sha256: createHash('sha256').update(normalized).digest('hex') };
  }));
}

async function getApplicationTables(connection) {
  const [rows] = await connection.query(`SELECT TABLE_NAME AS name
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> 'schema_migrations'`);
  return new Set(rows.map(row => row.name));
}

async function runMigrations() {
  let connection;
  let locked = false;
  try {
    if (process.env.DB_NAME !== EXPECTED_DATABASE) {
      throw new Error(`DB_NAME must be exactly ${EXPECTED_DATABASE}; no AquaPay database is permitted.`);
    }
    if (process.argv.slice(2).some(arg => arg !== '--seed')) {
      throw new Error('Unsupported option. Use node database/migrate.js (initial master data is included).');
    }
    const files = await getMigrationFiles();
    // Reuse AquaPay's config validation and TLS settings, not its production credentials.
    const { getDatabaseConfig } = await import('../src/config/db.js');
    const config = getDatabaseConfig();
    if (config.database !== EXPECTED_DATABASE) throw new Error('Unexpected database configuration.');
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(config.host);
    if (!localHost && (!config.ssl || !config.ssl.ca || config.ssl.rejectUnauthorized !== true)) {
      throw new Error('Remote MySQL requires a trusted provider CA via DB_SSL_CA.');
    }
    connection = await mysql.createConnection({
      ...config, ...(config.ssl ? { ssl: { ...config.ssl, verifyIdentity: true } } : {}),
      multipleStatements: true, timezone: 'Z',
    });
    await connection.query("SET time_zone = '+00:00'");
    if (!localHost) {
      const [[tls]] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
      if (!tls?.Value) throw new Error('Remote MySQL connection is not encrypted.');
    }
    const [[server]] = await connection.query('SELECT DATABASE() AS db, VERSION() AS version');
    if (server.db !== EXPECTED_DATABASE) throw new Error('Connected to an unexpected database.');
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(server.version);
    if (!match || /mariadb/i.test(server.version) || Number(match[1]) < 8 ||
        (Number(match[1]) === 8 && Number(match[2]) === 0 && Number(match[3]) < 16)) {
      throw new Error('Oracle MySQL 8.0.16 or later is required.');
    }
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [LOCK]);
    if (Number(lock.acquired) !== 1) throw new Error('Could not acquire migration lock.');
    locked = true;
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration VARCHAR(255) NOT NULL PRIMARY KEY,
      sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    const [records] = await connection.query('SELECT migration, sha256 FROM schema_migrations ORDER BY migration');
    const existing = await getApplicationTables(connection);
    if (!records.length && existing.size) {
      throw new Error('Untracked application tables exist. Stop: inspect partial migrations or use a new empty database.');
    }
    if (records.length > files.length) throw new Error('Migration files are missing.');
    for (let i = 0; i < records.length; i++) {
      if (records[i].migration !== files[i].name || records[i].sha256 !== files[i].sha256) {
        throw new Error(`Migration history or checksum mismatch: ${records[i].migration}. Never modify an applied migration.`);
      }
    }
    if (records.length && (BASE_TABLES.some(name => !existing.has(name)) || existing.has('role_hierarchy'))) {
      throw new Error('Baseline tables are missing or the old role hierarchy remains. Inspect schema drift.');
    }
    for (const file of files.slice(records.length)) {
      console.log(`Applying ${file.name}...`);
      // MySQL DDL implicitly commits. Never mark incomplete SQL as applied.
      await connection.query(file.sql);
      await connection.execute('INSERT INTO schema_migrations (migration, sha256) VALUES (?, ?)', [file.name, file.sha256]);
      console.log(`Applied ${file.name}`);
    }
    console.log('PayTeam migrations are up to date. Initial master data is part of migration 001.');
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Migration stopped:', error.message);
    console.error('If SQL execution began, inspect the schema before retrying; DDL may have committed.');
    process.exitCode = 1;
  } finally {
    if (connection) {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK]).catch(() => {});
      await connection.end();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === filename) await runMigrations();
export { runMigrations };
export default { runMigrations };
