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
    const baseline=await snapshot();
    assert.equal(baseline.current_user,login);
    assert.equal(baseline.session_user,login);
    assert.equal(baseline.user_id,null);
    const roles=(await admin.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ($1,'ai_company_app') ORDER BY rolname",[login])).rows;
    assert.equal(roles.length,2);
    assert.ok(roles.every(role=>!role.rolsuper&&!role.rolbypassrls));
    await assert.rejects(pool.query('SELECT * FROM app.organizations'),error=>error.code==='42501');

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
