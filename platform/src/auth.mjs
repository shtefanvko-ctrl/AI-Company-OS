import { createHmac, timingSafeEqual } from 'node:crypto';

function b64urlDecode(value){
  return Buffer.from(String(value).replace(/-/g,'+').replace(/_/g,'/'),'base64');
}
function b64urlEncode(value){
  return Buffer.from(value).toString('base64url');
}
function hmac(data,secret){
  return createHmac('sha256',secret).update(data).digest();
}

export function verifyBearerAuthorization(header,{secret,issuer='ai-company-os',audience='ai-company-os-api',now=Math.floor(Date.now()/1000)}={}){
  if(typeof secret!=='string'||secret.length<32)throw new Error('AUTH_HMAC_SECRET must contain at least 32 characters');
  const match=/^Bearer\s+([^\s]+)$/i.exec(String(header||''));
  if(!match)throw Object.assign(new Error('missing bearer token'),{code:'UNAUTHORIZED'});
  const token=match[1], parts=token.split('.');
  if(parts.length!==3)throw Object.assign(new Error('malformed bearer token'),{code:'UNAUTHORIZED'});
  const [h,p,sig]=parts;
  let headerJson,payload;
  try{
    headerJson=JSON.parse(b64urlDecode(h).toString('utf8'));
    payload=JSON.parse(b64urlDecode(p).toString('utf8'));
  }catch{
    throw Object.assign(new Error('invalid bearer token json'),{code:'UNAUTHORIZED'});
  }
  if(headerJson.alg!=='HS256'||headerJson.typ!=='JWT')throw Object.assign(new Error('unsupported token algorithm'),{code:'UNAUTHORIZED'});
  const expected=hmac(`${h}.${p}`,secret);
  let actual;
  try{actual=b64urlDecode(sig)}catch{throw Object.assign(new Error('invalid token signature'),{code:'UNAUTHORIZED'})}
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Object.assign(new Error('invalid token signature'),{code:'UNAUTHORIZED'});
  if(payload.iss!==issuer||payload.aud!==audience)throw Object.assign(new Error('invalid token scope'),{code:'UNAUTHORIZED'});
  if(typeof payload.sub!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub))throw Object.assign(new Error('invalid token subject'),{code:'UNAUTHORIZED'});
  if(!Number.isInteger(payload.exp)||payload.exp<=now)throw Object.assign(new Error('token expired'),{code:'UNAUTHORIZED'});
  if(Number.isInteger(payload.nbf)&&payload.nbf>now+30)throw Object.assign(new Error('token not active'),{code:'UNAUTHORIZED'});
  return {userId:payload.sub,claims:payload};
}

export function createTestToken({secret,sub,issuer='ai-company-os',audience='ai-company-os-api',iat=1_700_000_000,exp=1_700_003_600}){
  const header=b64urlEncode(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const payload=b64urlEncode(JSON.stringify({sub,iss:issuer,aud:audience,iat,exp}));
  const signature=hmac(`${header}.${payload}`,secret).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
