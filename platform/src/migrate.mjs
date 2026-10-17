import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool }=pg;
const LOCK_NAMESPACE=1768040515;
const LOCK_KEY=1;

export const migrationManifest=Object.freeze([
  Object.freeze({version:'001',path:'platform/db/001_company_foundation.sql',url:new URL('../db/001_company_foundation.sql',import.meta.url)}),
  Object.freeze({version:'002',path:'platform/db/002_company_memory.sql',url:new URL('../db/002_company_memory.sql',import.meta.url)}),
  Object.freeze({version:'003',path:'platform/db/003_company_memory_api.sql',url:new URL('../db/003_company_memory_api.sql',import.meta.url)}),
  Object.freeze({version:'004',path:'platform/db/004_company_memory_verification.sql',url:new URL('../db/004_company_memory_verification.sql',import.meta.url)})
]);

function migrationError(message,code){return Object.assign(new Error(message),{code})}
function sha256(value){return createHash('sha256').update(value).digest('hex')}

async function prepareMigrations(migrations){
  if(!Array.isArray(migrations)||migrations.length===0)throw migrationError('migration manifest must not be empty','INVALID_MIGRATION_MANIFEST');
  const versions=new Set(),paths=new Set(),prepared=[];
  for(const migration of migrations){
    if(!migration||typeof migration!=='object')throw migrationError('migration entry must be an object','INVALID_MIGRATION_MANIFEST');
    const {version,path}=migration;
    if(typeof version!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(version))throw migrationError('migration version is invalid','INVALID_MIGRATION_MANIFEST');
    if(typeof path!=='string'||path.length===0||path.length>500)throw migrationError(`migration ${version} path is invalid`,'INVALID_MIGRATION_MANIFEST');
    if(versions.has(version)||paths.has(path))throw migrationError(`migration manifest contains duplicate version or path: ${version}`,'INVALID_MIGRATION_MANIFEST');
    versions.add(version);paths.add(path);
    const sql=Object.hasOwn(migration,'sql')?migration.sql:await readFile(migration.url,'utf8');
    if(typeof sql!=='string'||sql.trim()==='')throw migrationError(`migration ${version} SQL is empty`,'INVALID_MIGRATION_MANIFEST');
    prepared.push({version,path,sql,checksum:sha256(sql)});
  }
  return prepared;
}

function assertStoredMigration(stored,migration){
  if(stored.version!==migration.version||stored.path!==migration.path||stored.checksum_sha256!==migration.checksum){
    throw migrationError(`applied migration drift detected for ${migration.version} (${migration.path})`,'MIGRATION_DRIFT');
  }
}

export async function applyMigrations({connectionString=process.env.DATABASE_URL,pool,migrations=migrationManifest,logger=console}={}){
  const prepared=await prepareMigrations(migrations);
  if(!pool&&!connectionString)throw migrationError('DATABASE_URL is required','DATABASE_URL_REQUIRED');
  const ownsPool=!pool;
  const database=pool||new Pool({connectionString,max:1,application_name:'ai_company_migrations'});
  const client=await database.connect();
  const applied=[],skipped=[];
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1,$2)',[LOCK_NAMESPACE,LOCK_KEY]);
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS ai_company_meta;
      REVOKE ALL ON SCHEMA ai_company_meta FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS ai_company_meta.schema_migrations (
        version text PRIMARY KEY,
        path text NOT NULL UNIQUE,
        checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      REVOKE ALL ON TABLE ai_company_meta.schema_migrations FROM PUBLIC;
    `);

    for(const migration of prepared){
      const existing=await client.query(
        'SELECT version,path,checksum_sha256 FROM ai_company_meta.schema_migrations WHERE version=$1 OR path=$2',
        [migration.version,migration.path]
      );
      if(existing.rowCount>0){
        if(existing.rowCount!==1)throw migrationError(`migration ledger is ambiguous for ${migration.version}`,'MIGRATION_DRIFT');
        assertStoredMigration(existing.rows[0],migration);
        skipped.push(migration.version);
        continue;
      }
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO ai_company_meta.schema_migrations(version,path,checksum_sha256) VALUES ($1,$2,$3)',
        [migration.version,migration.path,migration.checksum]
      );
      applied.push(migration.version);
    }
    await client.query('COMMIT');
    const appliedVersions=new Set(applied),skippedVersions=new Set(skipped);
    for(const migration of prepared){
      if(appliedVersions.has(migration.version))logger?.info?.(`[migrate] applied ${migration.version} ${migration.path}`);
      if(skippedVersions.has(migration.version))logger?.info?.(`[migrate] skipped ${migration.version} ${migration.path}`);
    }
    return {applied,skipped};
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{
    client.release();
    if(ownsPool)await database.end();
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  applyMigrations().catch(error=>{
    console.error(`[migrate] failed ${error?.code||'ERROR'}: ${error?.message||error}`);
    process.exitCode=1;
  });
}
