import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { applyMigrations } from '../src/migrate.mjs';

const { Pool }=pg;

function quietLogger(){return {info(){}}}

test('migration replay skips matching SQL and rejects checksum drift',async()=>{
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:'migration_replay_contract'});
  const suffix=randomBytes(8).toString('hex');
  const migration={version:`ci_replay_${suffix}`,path:`ci/replay_${suffix}.sql`,sql:'SELECT 1'};
  try{
    const first=await applyMigrations({pool,migrations:[migration],logger:quietLogger()});
    assert.deepEqual(first,{applied:[migration.version],skipped:[]});
    const replay=await applyMigrations({pool,migrations:[migration],logger:quietLogger()});
    assert.deepEqual(replay,{applied:[],skipped:[migration.version]});
    const privileges=await pool.query(
      "SELECT has_schema_privilege('ai_company_app','ai_company_meta','USAGE') AS schema_usage,has_table_privilege('ai_company_app','ai_company_meta.schema_migrations','SELECT') AS ledger_select"
    );
    assert.deepEqual(privileges.rows[0],{schema_usage:false,ledger_select:false});
    await assert.rejects(
      applyMigrations({pool,migrations:[{...migration,sql:'SELECT 2'}],logger:quietLogger()}),
      error=>error?.code==='MIGRATION_DRIFT'
    );
  }finally{
    await pool.query('DELETE FROM ai_company_meta.schema_migrations WHERE version=$1',[migration.version]);
    await pool.end();
  }
});

test('the advisory lock serializes concurrent migration runners',async()=>{
  const suffix=randomBytes(8).toString('hex');
  const table=`ci_lock_${suffix}`;
  const migration={
    version:`ci_lock_${suffix}`,
    path:`ci/lock_${suffix}.sql`,
    sql:`CREATE TABLE ai_company_meta.${table}(id integer PRIMARY KEY); SELECT pg_sleep(0.1)`
  };
  const pools=[
    new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:'migration_lock_a'}),
    new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:'migration_lock_b'})
  ];
  try{
    const results=await Promise.all(pools.map(pool=>applyMigrations({pool,migrations:[migration],logger:quietLogger()})));
    assert.deepEqual(results.map(result=>result.applied.length).sort(),[0,1]);
    assert.deepEqual(results.map(result=>result.skipped.length).sort(),[0,1]);
    const state=await pools[0].query(
      'SELECT to_regclass($1) AS table_name,(SELECT count(*)::integer FROM ai_company_meta.schema_migrations WHERE version=$2) AS ledger_count',
      [`ai_company_meta.${table}`,migration.version]
    );
    assert.equal(state.rows[0].table_name,`ai_company_meta.${table}`);
    assert.equal(state.rows[0].ledger_count,1);
  }finally{
    await pools[0].query(`DROP TABLE IF EXISTS ai_company_meta.${table}`);
    await pools[0].query('DELETE FROM ai_company_meta.schema_migrations WHERE version=$1',[migration.version]);
    await Promise.all(pools.map(pool=>pool.end()));
  }
});

test('a failed migration rolls back the whole pending batch and ledger',async()=>{
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:'migration_rollback_contract'});
  const suffix=randomBytes(8).toString('hex');
  const table=`ci_migration_${suffix}`;
  const versions=[`ci_batch_a_${suffix}`,`ci_batch_b_${suffix}`];
  const migrations=[
    {version:versions[0],path:`ci/batch_a_${suffix}.sql`,sql:`CREATE TABLE ai_company_meta.${table}(id integer PRIMARY KEY)`},
    {version:versions[1],path:`ci/batch_b_${suffix}.sql`,sql:'SELECT * FROM ai_company_meta.table_that_must_not_exist'}
  ];
  try{
    await assert.rejects(applyMigrations({pool,migrations,logger:quietLogger()}),/table_that_must_not_exist/);
    const state=await pool.query(
      'SELECT to_regclass($1) AS table_name,(SELECT count(*)::integer FROM ai_company_meta.schema_migrations WHERE version=ANY($2::text[])) AS ledger_count',
      [`ai_company_meta.${table}`,versions]
    );
    assert.equal(state.rows[0].table_name,null);
    assert.equal(state.rows[0].ledger_count,0);
  }finally{
    await pool.query(`DROP TABLE IF EXISTS ai_company_meta.${table}`);
    await pool.query('DELETE FROM ai_company_meta.schema_migrations WHERE version=ANY($1::text[])',[versions]);
    await pool.end();
  }
});
