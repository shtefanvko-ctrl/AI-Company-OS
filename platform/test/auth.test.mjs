import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestToken,verifyBearerAuthorization } from '../src/auth.mjs';

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
