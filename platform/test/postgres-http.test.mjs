import test from 'node:test';
import assert from 'node:assert/strict';
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

    const audit=await request(base,`/v1/organizations/${a.json.id}/audit`,{user:u1});
    assert.equal(audit.status,200);
    assert.ok(audit.json.items.some(x=>x.event_type==='action.accepted'));
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await store.close();
  }
});
