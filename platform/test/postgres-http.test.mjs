import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { PostgresCompanyStore } from '../src/postgres-store.mjs';
import { createPostgresServer } from '../src/server-postgres.mjs';
import { createTestToken } from '../src/auth.mjs';

const secret='0123456789abcdef0123456789abcdef';
const u1='11111111-1111-4111-8111-111111111111';
const u2='22222222-2222-4222-8222-222222222222';
const now=Math.floor(Date.now()/1000);
const auth=id=>'Bearer '+createTestToken({secret,sub:id,iat:now-10,exp:now+600});

async function request(base,path,{method='GET',user,body,headers={}}={}){
  const res=await fetch(base+path,{method,headers:{...(user?{authorization:auth(user)}:{}),'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
  const json=await res.json();
  return {status:res.status,json};
}

async function withPostgresHttp(run,{max=1,application_name}={}){
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max,application_name});
  const store=new PostgresCompanyStore({pool});
  const server=createPostgresServer({store,authSecret:secret});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await run({store,base:`http://127.0.0.1:${server.address().port}`})}
  finally{
    await new Promise(resolve=>server.close(resolve));
    await store.close();
  }
}

async function actionSnapshot(store,organizationId){
  return (await store.pool.query('SELECT (SELECT count(*) FROM app.action_idempotency WHERE organization_id=$1) AS actions,(SELECT count(*) FROM app.audit_log WHERE organization_id=$1) AS audit',[organizationId])).rows[0];
}

async function memorySnapshot(store,organizationId){
  return (await store.pool.query(
    `SELECT
       (SELECT count(*)::int FROM app.company_memories WHERE organization_id=$1) AS memories,
       (SELECT count(*)::int FROM app.memory_revisions WHERE organization_id=$1) AS revisions,
       (SELECT count(*)::int FROM app.audit_log WHERE organization_id=$1 AND event_type='memory.proposed') AS audit`,
    [organizationId]
  )).rows[0];
}

async function waitForBlockedActions(admin,applicationName,count){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    const row=(await admin.query("SELECT count(*)::int AS blocked FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%app.accept_action%'",[applicationName])).rows[0];
    if(row.blocked===count)return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('concurrent action requests did not reach the database barrier');
}

test('authenticated HTTP persists tenant isolation and idempotency in PostgreSQL',async()=>{
  const store=new PostgresCompanyStore({connectionString:process.env.DATABASE_URL});
  const server=createPostgresServer({store,authSecret:secret});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  const base=`http://127.0.0.1:${address.port}`;
  try{
    assert.equal((await request(base,'/health')).status,200);
    assert.equal((await request(base,'/v1/organizations')).status,401);

    const a=await request(base,'/v1/organizations',{method:'POST',user:u1,body:{name:'Company A',accountType:'company'}});
    const b=await request(base,'/v1/organizations',{method:'POST',user:u2,body:{name:'Shop B',accountType:'shop'}});
    assert.equal(a.status,201);assert.equal(b.status,201);

    const own=await request(base,`/v1/organizations/${a.json.id}`,{user:u1});
    const cross=await request(base,`/v1/organizations/${a.json.id}`,{user:u2});
    assert.equal(own.status,200);
    assert.equal(cross.status,404);

    const first=await request(base,`/v1/organizations/${a.json.id}/actions`,{method:'POST',user:u1,headers:{'idempotency-key':'http-k1'},body:{actionType:'CONTENT.PREPARE'}});
    const second=await request(base,`/v1/organizations/${a.json.id}/actions`,{method:'POST',user:u1,headers:{'idempotency-key':'http-k1'},body:{actionType:'CONTENT.PREPARE'}});
    assert.equal(first.status,202);assert.equal(second.status,202);
    assert.equal(first.json.duplicate,false);
    assert.equal(second.json.duplicate,true);
    assert.equal(second.json.actionId,first.json.actionId);

    const crossAudit=await request(base,`/v1/organizations/${a.json.id}/audit`,{user:u2});
    assert.equal(crossAudit.status,200);
    assert.deepEqual(crossAudit.json.items,[]);
    const crossAction=await request(base,`/v1/organizations/${a.json.id}/actions`,{method:'POST',user:u2,headers:{'idempotency-key':'http-k1'},body:{actionType:'CONTENT.PREPARE'}});
    assert.equal(crossAction.status,403);

    const audit=await request(base,`/v1/organizations/${a.json.id}/audit`,{user:u1});
    assert.equal(audit.status,200);
    assert.equal(audit.json.items.filter(x=>x.event_type==='action.accepted').length,1);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await store.close();
  }
});

test('one organization request persists one organization, membership and creation audit',async()=>{
  const store=new PostgresCompanyStore({connectionString:process.env.DATABASE_URL});
  const userId='33333333-3333-4333-8333-333333333333';
  try{
    const before=(await store.pool.query('SELECT organization_id FROM app.organization_members WHERE user_id=$1',[userId])).rows;
    const organization=await store.createOrganization({userId,name:'Single Company',accountType:'company'});
    const {rows}=await store.pool.query('SELECT organization_id FROM app.organization_members WHERE user_id=$1',[userId]);
    assert.equal(rows.length-before.length,1,'one request must create exactly one organization');
    assert.ok(rows.some(row=>row.organization_id===organization.id));
    const audit=await store.auditFor({organizationId:organization.id,userId});
    assert.equal(audit.filter(row=>row.event_type==='organization.created').length,1);
  }finally{await store.close()}
});

test('restricted PostgreSQL login resets pooled role and user after commit and rollback',async()=>{
  const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const login='ai_company_ci_'+randomBytes(8).toString('hex');
  const password=randomBytes(32).toString('hex');
  let created=false;
  let store;
  try{
    // PostgreSQL quotes both generated identifiers and credentials server-side.
    const create=(await admin.query("SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD %L', $1::text, $2::text) AS sql",[login,password])).rows[0].sql;
    await admin.query(create);
    created=true;
    await admin.query((await admin.query('SELECT format(\'GRANT ai_company_app TO %I\', $1::text) AS sql',[login])).rows[0].sql);
    const connection=new URL(process.env.DATABASE_URL);
    connection.username=login;
    connection.password=password;
    const pool=new pg.Pool({connectionString:connection.toString(),max:1});
    store=new PostgresCompanyStore({pool});
    const snapshot=async()=> (await pool.query("SELECT pg_backend_pid() AS pid,current_user,session_user,NULLIF(current_setting('app.user_id',true),'') AS user_id")).rows[0];
    // pool.query releases a client with an error by discarding it; take the
    // reuse baseline after this intentional permission failure.
    await assert.rejects(pool.query('SELECT * FROM app.organizations'),error=>error.code==='42501');
    const baseline=await snapshot();
    assert.equal(baseline.current_user,login);
    assert.equal(baseline.session_user,login);
    assert.equal(baseline.user_id,null);
    const roles=(await admin.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ($1,'ai_company_app') ORDER BY rolname",[login])).rows;
    assert.equal(roles.length,2);
    assert.ok(roles.every(role=>!role.rolsuper&&!role.rolbypassrls));
    const a=await store.createOrganization({userId:u1,name:'Pooled A',accountType:'company'});
    assert.deepEqual(await snapshot(),baseline,'COMMIT must clear the request identity and local role');
    const b=await store.createOrganization({userId:u2,name:'Pooled B',accountType:'shop'});
    assert.deepEqual(await snapshot(),baseline);
    await assert.rejects(store.getContext({organizationId:a.id,userId:u2}),error=>error.code==='NOT_FOUND');
    assert.deepEqual(await snapshot(),baseline,'ROLLBACK must clear the request identity and local role');
    const own=await store.getContext({organizationId:b.id,userId:u2});
    assert.equal(own.membership.user_id,u2);
    assert.deepEqual(await snapshot(),baseline);
    await assert.rejects(store.createOrganization({userId:u1,name:'Invalid',accountType:'invalid'}),error=>error.code==='22023');
    assert.deepEqual(await snapshot(),baseline,'SQL errors must not contaminate the next request');
    await assert.rejects(pool.query('SELECT * FROM app.organizations'),error=>error.code==='42501');
  }finally{
    if(store)await store.close();
    if(created)await admin.query((await admin.query('SELECT format(\'DROP ROLE %I\', $1::text) AS sql',[login])).rows[0].sql);
    await admin.end();
  }
});

test('action replay revalidates a disabled capability before returning a persisted result',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const user='44444444-4444-4444-8444-444444444444';
    const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'Capability revocation',accountType:'company'}});
    assert.equal(org.status,201);
    const path=`/v1/organizations/${org.json.id}/actions`;
    const action=key=>request(base,path,{method:'POST',user,headers:{'idempotency-key':key},body:{actionType:'CONTENT.PREPARE'}});
    const first=await action('capability-key');
    assert.equal(first.status,202);
    assert.equal(first.json.duplicate,false);
    const before=await actionSnapshot(store,org.json.id);
    const disabled=await store.pool.query("UPDATE app.organization_capabilities SET enabled=false WHERE organization_id=$1 AND capability_key='content.prepare'",[org.json.id]);
    assert.equal(disabled.rowCount,1);
    const replay=await action('capability-key');
    assert.equal(replay.status,403,'a saved action must not bypass the current capability decision');
    assert.equal((await action('new-capability-key')).status,403);
    assert.deepEqual(await actionSnapshot(store,org.json.id),before,'denied requests must not persist actions or audit events');
    await store.pool.query("UPDATE app.organization_capabilities SET enabled=true WHERE organization_id=$1 AND capability_key='content.prepare'",[org.json.id]);
    const restored=await action('capability-key');
    assert.equal(restored.status,202);
    assert.equal(restored.json.duplicate,true);
    assert.equal(restored.json.actionId,first.json.actionId);
    assert.deepEqual(await actionSnapshot(store,org.json.id),before,'an authorized replay must remain idempotent');
  });
});

test('revoked membership hides context and audit and denies replay and fresh writes',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const user='55555555-5555-4555-8555-555555555555';
    const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'Membership revocation',accountType:'company'}});
    assert.equal(org.status,201);
    const path=`/v1/organizations/${org.json.id}`;
    const action=key=>request(base,path+'/actions',{method:'POST',user,headers:{'idempotency-key':key},body:{actionType:'CONTENT.PREPARE'}});
    assert.equal((await action('membership-key')).status,202);
    const before=await actionSnapshot(store,org.json.id);
    const revoked=await store.pool.query('DELETE FROM app.organization_members WHERE organization_id=$1 AND user_id=$2',[org.json.id,user]);
    assert.equal(revoked.rowCount,1);
    assert.equal((await request(base,path,{user})).status,404);
    const audit=await request(base,path+'/audit',{user});
    assert.equal(audit.status,200);
    assert.deepEqual(audit.json.items,[]);
    assert.equal((await action('membership-key')).status,403);
    assert.equal((await action('new-membership-key')).status,403);
    assert.deepEqual(await actionSnapshot(store,org.json.id),before);
  });
});

test('organization roles make viewer read-only while member admin and owner can execute capability-permitted actions',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const user='88888888-8888-4888-8888-888888888888';
    const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'RBAC Company',accountType:'company'}});
    assert.equal(org.status,201);
    const contextPath=`/v1/organizations/${org.json.id}`;
    const action=(key)=>request(base,contextPath+'/actions',{
      method:'POST',
      user,
      headers:{'idempotency-key':key},
      body:{actionType:'CONTENT.PREPARE'}
    });
    const setRole=async role=>{
      const result=await store.pool.query(
        'UPDATE app.organization_members SET role=$1 WHERE organization_id=$2 AND user_id=$3',
        [role,org.json.id,user]
      );
      assert.equal(result.rowCount,1);
    };

    await setRole('viewer');
    assert.equal((await request(base,contextPath,{user})).status,200,'viewer keeps read access');
    const denied=await action('rbac-viewer');
    assert.equal(denied.status,403,'viewer must not execute business actions');

    for(const role of ['member','admin','owner']){
      await setRole(role);
      const accepted=await action('rbac-'+role);
      assert.equal(accepted.status,202,`${role} should execute a capability-permitted business action`);
      assert.equal(accepted.json.duplicate,false);
    }

    const audit=await request(base,contextPath+'/audit',{user});
    assert.equal(audit.status,200);
    assert.equal(audit.json.items.filter(x=>x.event_type==='action.accepted').length,3);
  });
});

test('role downgrade denies persisted replays and fresh actions until write access is restored',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const user='99999999-9999-4999-8999-999999999999';
    const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'RBAC replay',accountType:'company'}});
    assert.equal(org.status,201);
    const path=`/v1/organizations/${org.json.id}/actions`;
    const action=key=>request(base,path,{method:'POST',user,headers:{'idempotency-key':key},body:{actionType:'CONTENT.PREPARE'}});
    const setRole=async role=>{
      const result=await store.pool.query(
        'UPDATE app.organization_members SET role=$1 WHERE organization_id=$2 AND user_id=$3',
        [role,org.json.id,user]
      );
      assert.equal(result.rowCount,1);
    };

    await setRole('member');
    const first=await action('rbac-replay-key');
    assert.equal(first.status,202);
    assert.equal(first.json.duplicate,false);
    const before=await actionSnapshot(store,org.json.id);

    await setRole('viewer');
    assert.equal((await action('rbac-replay-key')).status,403,'a persisted action must not bypass the current role decision');
    assert.equal((await action('rbac-fresh-key')).status,403,'viewer must not create a fresh action');
    assert.deepEqual(await actionSnapshot(store,org.json.id),before,'denied actions must not add action or audit rows');

    await setRole('member');
    const restored=await action('rbac-replay-key');
    assert.equal(restored.status,202);
    assert.equal(restored.json.duplicate,true);
    assert.equal(restored.json.actionId,first.json.actionId);
    assert.deepEqual(await actionSnapshot(store,org.json.id),before,'an authorized replay remains idempotent');
  });
});

test('company memory API enforces typed provenance tenant RBAC capability and idempotency',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const userA='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const userB='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    const a=await request(base,'/v1/organizations',{method:'POST',user:userA,body:{name:'Memory API A',accountType:'company'}});
    const b=await request(base,'/v1/organizations',{method:'POST',user:userB,body:{name:'Memory API B',accountType:'shop'}});
    assert.equal(a.status,201);assert.equal(b.status,201);
    const path=`/v1/organizations/${a.json.id}/memories`;
    const input={
      content:'Customer prefers verified service history.',
      category:'knowledge',
      sourceType:'user',
      sourceRef:'user-statement:contract',
      confidence:0.9,
      metadata:{source:'postgres-http'},
      observedAt:'2026-10-08T00:00:00.000Z',
      freshUntil:'2027-01-01T00:00:00.000Z'
    };
    const propose=(key,body=input,user=userA)=>request(base,path,{method:'POST',user,headers:key?{'idempotency-key':key}:{},body});

    assert.equal((await request(base,'/v1/organizations/not-a-uuid/memories',{user:userA})).status,400);
    assert.equal((await propose()).status,400,'memory mutations require an idempotency key');
    assert.equal((await propose('forged-state',{...input,canonicalState:'canonical'})).status,400,'unknown lifecycle fields must fail closed');
    assert.equal((await propose('agent-source',{...input,sourceType:'agent'})).status,400,'a user endpoint must not forge agent provenance');
    assert.equal((await propose('missing-source',{...input,sourceRef:undefined})).status,400,'company facts require a source reference');

    const first=await propose('memory-contract-key');
    assert.equal(first.status,201);
    assert.equal(first.json.duplicate,false);
    assert.equal(first.json.canonical_state,'proposed');
    assert.equal(first.json.verification_status,'unverified');
    assert.equal(first.json.revision_number,1);
    assert.ok(!('created_by' in first.json));
    assert.ok(!('content_hash' in first.json));
    assert.ok(!('idempotency_key' in first.json));

    const replay=await propose('memory-contract-key');
    assert.equal(replay.status,200);
    assert.equal(replay.json.duplicate,true);
    assert.equal(replay.json.id,first.json.id);
    const conflict=await propose('memory-contract-key',{...input,content:'Different fact'});
    assert.equal(conflict.status,400);
    assert.match(conflict.json.message,/different memory proposal/);
    const withoutObservedAt={...input};delete withoutObservedAt.observedAt;
    assert.equal((await propose('memory-contract-key',withoutObservedAt)).status,400,'omitting an explicitly bound observedAt must conflict');
    assert.deepEqual(await memorySnapshot(store,a.json.id),{memories:1,revisions:1,audit:1});

    const own=await request(base,path+'?limit=10',{user:userA});
    assert.equal(own.status,200);
    assert.equal(own.json.items.length,1);
    assert.equal(own.json.items[0].id,first.json.id);
    assert.equal(own.json.items[0].revision_number,1);
    assert.equal((await request(base,path+'?limit=0',{user:userA})).status,400);
    assert.equal((await request(base,path,{user:userB})).status,404,'non-member memory reads must not reveal tenant existence');
    assert.equal((await propose('cross-tenant',input,userB)).status,403);

    const setRole=role=>store.pool.query(
      'UPDATE app.organization_members SET role=$1 WHERE organization_id=$2 AND user_id=$3',
      [role,a.json.id,userA]
    );
    await setRole('viewer');
    assert.equal((await request(base,path,{user:userA})).status,200,'viewer keeps read access');
    assert.equal((await propose('viewer-write')).status,403);
    assert.equal((await propose('memory-contract-key')).status,403,'role downgrade must deny persisted replay');

    await setRole('member');
    await store.pool.query("UPDATE app.organization_capabilities SET enabled=false WHERE organization_id=$1 AND capability_key='memory.write'",[a.json.id]);
    assert.equal((await propose('capability-write')).status,403);
    assert.equal((await propose('memory-contract-key')).status,403,'disabled capability must deny persisted replay');
    assert.deepEqual(await memorySnapshot(store,a.json.id),{memories:1,revisions:1,audit:1});

    await store.pool.query("UPDATE app.organization_capabilities SET enabled=true WHERE organization_id=$1 AND capability_key='memory.write'",[a.json.id]);
    assert.equal((await propose('memory-contract-key')).status,200);
    await store.pool.query('DELETE FROM app.organization_members WHERE organization_id=$1 AND user_id=$2',[a.json.id,userA]);
    assert.equal((await request(base,path,{user:userA})).status,404);
    assert.equal((await propose('revoked-write')).status,403);
    assert.equal((await propose('memory-contract-key')).status,403,'revoked membership must deny persisted replay');
    assert.deepEqual(await memorySnapshot(store,a.json.id),{memories:1,revisions:1,audit:1});
  });
});

test('memory proposal audit failure rolls back the fact revision and idempotency key',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const user='cccccccc-3333-4333-8333-cccccccccccc';
    const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'Memory audit rollback',accountType:'company'}});
    assert.equal(org.status,201);
    const path=`/v1/organizations/${org.json.id}/memories`;
    const proposal=()=>request(base,path,{
      method:'POST',user,headers:{'idempotency-key':'memory-audit-rollback'},
      body:{content:'Rollback-safe fact',category:'knowledge',sourceType:'user',sourceRef:'user-statement:rollback'}
    });
    const before=await memorySnapshot(store,org.json.id);
    await store.pool.query("ALTER TABLE app.audit_log ADD CONSTRAINT ci_memory_audit_failure CHECK (event_type <> 'memory.proposed' OR payload->>'idempotency_key' <> 'memory-audit-rollback') NOT VALID");
    try{
      assert.equal((await proposal()).status,400);
      assert.deepEqual(await memorySnapshot(store,org.json.id),before,'failed audit must roll back memory and revision');
    }finally{await store.pool.query('ALTER TABLE app.audit_log DROP CONSTRAINT ci_memory_audit_failure')}
    const retry=await proposal();
    assert.equal(retry.status,201);
    assert.equal(retry.json.duplicate,false);
    const replay=await proposal();
    assert.equal(replay.status,200);
    assert.equal(replay.json.duplicate,true);
    assert.equal(replay.json.id,retry.json.id);
    assert.deepEqual(await memorySnapshot(store,org.json.id),{memories:1,revisions:1,audit:1});
  });
});

test('unknown action types are rejected even when the idempotency key exists',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const user='66666666-6666-4666-8666-666666666666';
    const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'Typed replay',accountType:'company'}});
    assert.equal(org.status,201);
    const path=`/v1/organizations/${org.json.id}/actions`;
    const action=actionType=>request(base,path,{method:'POST',user,headers:{'idempotency-key':'typed-key'},body:{actionType}});
    assert.equal((await action('CONTENT.PREPARE')).status,202);
    const before=await actionSnapshot(store,org.json.id);
    const replay=await action('UNKNOWN.ACTION');
    assert.equal(replay.status,400,'a saved action must not bypass the typed action contract');
    assert.equal(replay.json.error,'bad_request');
    assert.deepEqual(await actionSnapshot(store,org.json.id),before);
  });
});

test('an idempotency key cannot be replayed as a different known action type',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const user='77777777-7777-4777-8777-777777777777';
    const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'Typed idempotency',accountType:'company'}});
    assert.equal(org.status,201);
    const path=`/v1/organizations/${org.json.id}/actions`;
    const action=actionType=>request(base,path,{method:'POST',user,headers:{'idempotency-key':'typed-known-key'},body:{actionType}});
    const first=await action('CONTENT.PREPARE');
    assert.equal(first.status,202);
    assert.equal(first.json.duplicate,false);
    const before=await actionSnapshot(store,org.json.id);
    const conflict=await action('CONTENT.REVIEW');
    assert.equal(conflict.status,400,'one idempotency key must remain bound to its original action type');
    assert.equal(conflict.json.error,'bad_request');
    assert.match(conflict.json.message,/different action type/);
    assert.deepEqual(await actionSnapshot(store,org.json.id),before,'a typed conflict must not persist actions or audit events');
    const retry=await action('CONTENT.PREPARE');
    assert.equal(retry.status,202);
    assert.equal(retry.json.duplicate,true);
    assert.equal(retry.json.actionId,first.json.actionId);
  });
});

test('concurrent HTTP actions deduplicate atomically within each tenant',async()=>{
  const applicationName='ai_company_race_'+randomBytes(8).toString('hex');
  await withPostgresHttp(async({store,base})=>{
    const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
    const locker=await admin.connect();
    const pending=[];
    try{
      const organizations=[];
      for(const user of [u1,u2]){
        const org=await request(base,'/v1/organizations',{method:'POST',user,body:{name:'Concurrent '+user,accountType:'company'}});
        assert.equal(org.status,201);
        organizations.push({id:org.json.id,user});
      }
      await locker.query('BEGIN');
      // Allow reads, but hold all inserts until every request has reached SQL.
      // This CI-only barrier makes the race reproducible without timing guesses.
      await locker.query('LOCK TABLE app.action_idempotency IN SHARE MODE');
      try{
        for(const org of organizations){
          for(let i=0;i<3;i++)pending.push(request(base,`/v1/organizations/${org.id}/actions`,{
            method:'POST',user:org.user,headers:{'idempotency-key':'concurrent-key'},body:{actionType:'CONTENT.PREPARE'}
          }));
        }
        await waitForBlockedActions(admin,applicationName,pending.length);
      }finally{await locker.query('ROLLBACK')}
      const results=await Promise.all(pending);
      const ids=[];
      for(let i=0;i<organizations.length;i++){
        const group=results.slice(i*3,i*3+3);
        assert.deepEqual(group.map(r=>r.status),[202,202,202],'every concurrent retry must be accepted');
        assert.deepEqual(group.map(r=>r.json.duplicate).sort(),[false,true,true],'exactly one request must create the action');
        assert.equal(new Set(group.map(r=>r.json.actionId)).size,1);
        ids.push(group[0].json.actionId);
        assert.deepEqual(await actionSnapshot(store,organizations[i].id),{actions:'1',audit:'2'});
        const audit=await store.auditFor({organizationId:organizations[i].id,userId:organizations[i].user});
        const accepted=audit.filter(row=>row.event_type==='action.accepted');
        assert.equal(accepted.length,1);
        assert.equal(accepted[0].payload.action_id,ids[i]);
      }
      assert.notEqual(ids[0],ids[1],'the same key in another tenant creates an independent action');
    }finally{
      await locker.query('ROLLBACK').catch(()=>{});
      locker.release();
      await Promise.allSettled(pending);
      await admin.end();
    }
  },{max:6,application_name:applicationName});
});

test('audit failure rolls back the action and leaves its key available for retry',async()=>{
  await withPostgresHttp(async({store,base})=>{
    const org=await request(base,'/v1/organizations',{method:'POST',user:u1,body:{name:'Atomic action audit',accountType:'company'}});
    assert.equal(org.status,201);
    const before=await actionSnapshot(store,org.json.id);
    const action=()=>request(base,`/v1/organizations/${org.json.id}/actions`,{
      method:'POST',user:u1,headers:{'idempotency-key':'ci-audit-rollback'},body:{actionType:'CONTENT.PREPARE'}
    });
    // Inject a real database failure only in the disposable CI database.
    await store.pool.query("ALTER TABLE app.audit_log ADD CONSTRAINT ci_audit_failure CHECK (event_type <> 'action.accepted' OR payload->>'idempotency_key' <> 'ci-audit-rollback') NOT VALID");
    try{
      const failed=await action();
      assert.equal(failed.status,400);
      assert.match(failed.json.message,/ci_audit_failure/);
      assert.deepEqual(await actionSnapshot(store,org.json.id),before,'a failed audit must leave no action or audit row');
    }finally{await store.pool.query('ALTER TABLE app.audit_log DROP CONSTRAINT ci_audit_failure')}
    const retry=await action();
    assert.equal(retry.status,202);
    assert.equal(retry.json.duplicate,false,'the failed transaction must not consume the key');
    const replay=await action();
    assert.equal(replay.status,202);
    assert.equal(replay.json.duplicate,true);
    assert.equal(replay.json.actionId,retry.json.actionId);
    assert.deepEqual(await actionSnapshot(store,org.json.id),{actions:'1',audit:'2'});
  });
});
