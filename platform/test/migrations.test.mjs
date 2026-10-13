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
    await assert.rejects(
      applyMigrations({pool,migrations:[{...migration,sql:'SELECT 2'}],logger:quietLogger()}),
      error=>error?.code==='MIGRATION_DRIFT'
    );
  }finally{
    await pool.query('DELETE FROM ai_company_meta.schema_migrations WHERE version=$1',[migration.version]);
    await pool.end();
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
