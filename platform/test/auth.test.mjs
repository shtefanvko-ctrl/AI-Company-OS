import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authConfigurationFromEnvironment,
  createTestToken,
  parseAuthHmacKeys,
  validateAuthConfiguration,
  verifyBearerAuthorization
} from '../src/auth.mjs';

const secret='0123456789abcdef0123456789abcdef';
const sub='11111111-1111-4111-8111-111111111111';
const now=1_700_000_100;

test('valid bearer binds a UUID subject',()=>{
  const token=createTestToken({secret,sub,iat:now-10,exp:now+300});
  const auth=verifyBearerAuthorization(`Bearer ${token}`,{secret,now});
  assert.equal(auth.userId,sub);
});

test('missing malformed wrong-signature and expired tokens are denied',()=>{
  assert.throws(()=>verifyBearerAuthorization('',{secret,now}),/missing bearer/);
  assert.throws(()=>verifyBearerAuthorization('Bearer nope',{secret,now}),/malformed/);
  const wrong=createTestToken({secret:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',sub,iat:now-10,exp:now+300});
  assert.throws(()=>verifyBearerAuthorization(`Bearer ${wrong}`,{secret,now}),/signature/);
  const expired=createTestToken({secret,sub,iat:now-600,exp:now-1});
  assert.throws(()=>verifyBearerAuthorization(`Bearer ${expired}`,{secret,now}),/expired/);
});

test('issuer audience and subject are enforced',()=>{
  const wrongAudience=createTestToken({secret,sub,audience:'other',iat:now-10,exp:now+300});
  assert.throws(()=>verifyBearerAuthorization(`Bearer ${wrongAudience}`,{secret,now}),/scope/);
  const badSubject=createTestToken({secret,sub:'u1',iat:now-10,exp:now+300});
  assert.throws(()=>verifyBearerAuthorization(`Bearer ${badSubject}`,{secret,now}),/subject/);
});

test('key ring accepts active and previous signing keys during rotation',()=>{
  const keys={
    '2026-10-active':'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '2026-09-previous':'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  };
  for(const kid of Object.keys(keys)){
    const token=createTestToken({secret:keys[kid],kid,sub,iat:now-10,exp:now+300});
    const auth=verifyBearerAuthorization(`Bearer ${token}`,{keys,now});
    assert.equal(auth.userId,sub);
    assert.equal(auth.keyId,kid);
  }
});

test('key ring denies missing unknown removed and forged key ids',()=>{
  const active='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const previous='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const keys={active,previous};
  const token=({secret,kid})=>createTestToken({secret,kid,sub,iat:now-10,exp:now+300});

  assert.throws(()=>verifyBearerAuthorization(`Bearer ${token({secret:active})}`,{keys,now}),/missing token key id/);
  assert.throws(()=>verifyBearerAuthorization(`Bearer ${token({secret:active,kid:'unknown'})}`,{keys,now}),/unknown token key id/);
  assert.throws(()=>verifyBearerAuthorization(`Bearer ${token({secret:previous,kid:'previous'})}`,{keys:{active},now}),/unknown token key id/);
  assert.throws(()=>verifyBearerAuthorization(`Bearer ${token({secret:previous,kid:'active'})}`,{keys,now}),/signature/);
});

test('key configuration fails closed without exposing secret values',()=>{
  const active='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const parsed=parseAuthHmacKeys(JSON.stringify({active}));
  assert.equal(parsed.active,active);
  assert.ok(Object.isFrozen(parsed));
  assert.throws(()=>parseAuthHmacKeys('{'),/valid JSON/);
  assert.throws(()=>parseAuthHmacKeys('[]'),/JSON object/);
  assert.throws(()=>parseAuthHmacKeys('{}'),/at least one key/);
  assert.throws(()=>parseAuthHmacKeys(JSON.stringify({'bad kid':active})),/invalid key id/);
  assert.throws(()=>parseAuthHmacKeys(JSON.stringify({active:'short'})),/32 to 4096/);
  assert.throws(()=>validateAuthConfiguration({secret,keys:{active}}),/not both/);
  assert.throws(()=>authConfigurationFromEnvironment({AUTH_HMAC_SECRET:secret,AUTH_HMAC_KEYS:JSON.stringify({active})}),/not both/);
});
