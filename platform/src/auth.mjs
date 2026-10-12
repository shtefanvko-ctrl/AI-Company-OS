import { createHmac, timingSafeEqual } from 'node:crypto';

const validatedConfigurations=new WeakSet();

function b64urlDecode(value){
  return Buffer.from(String(value).replace(/-/g,'+').replace(/_/g,'/'),'base64');
}
function b64urlEncode(value){
  return Buffer.from(value).toString('base64url');
}
function hmac(data,secret){
  return createHmac('sha256',secret).update(data).digest();
}

function validSecret(value){
  return typeof value==='string'&&value.length>=32&&value.length<=4096;
}

function normalizeKeys(keys){
  if(!keys||typeof keys!=='object'||Array.isArray(keys))throw new Error('AUTH_HMAC_KEYS must be a JSON object');
  const entries=Object.entries(keys);
  if(entries.length===0)throw new Error('AUTH_HMAC_KEYS must contain at least one key');
  const normalized=Object.create(null);
  for(const [kid,secret] of entries){
    if(!/^[A-Za-z0-9._-]{1,64}$/.test(kid))throw new Error('AUTH_HMAC_KEYS contains an invalid key id');
    if(!validSecret(secret))throw new Error(`AUTH_HMAC_KEYS[${kid}] must contain 32 to 4096 characters`);
    normalized[kid]=secret;
  }
  return Object.freeze(normalized);
}

export function parseAuthHmacKeys(value){
  if(value===undefined||value===null||value==='')return undefined;
  let parsed;
  try{parsed=JSON.parse(value)}
  catch{throw new Error('AUTH_HMAC_KEYS must be valid JSON')}
  return normalizeKeys(parsed);
}

export function validateAuthConfiguration({secret,keys}={}){
  let configuration;
  if(keys!==undefined){
    if(secret!==undefined&&secret!==null&&secret!=='')throw new Error('configure AUTH_HMAC_KEYS or AUTH_HMAC_SECRET, not both');
    configuration=Object.freeze({keys:normalizeKeys(keys)});
  }else{
    if(!validSecret(secret))throw new Error('AUTH_HMAC_SECRET must contain 32 to 4096 characters');
    configuration=Object.freeze({secret});
  }
  validatedConfigurations.add(configuration);
  return configuration;
}

export function authConfigurationFromEnvironment(env=process.env){
  const keys=parseAuthHmacKeys(env.AUTH_HMAC_KEYS);
  return validateAuthConfiguration({keys,secret:keys===undefined?env.AUTH_HMAC_SECRET:env.AUTH_HMAC_SECRET||undefined});
}

export function verifyBearerAuthorization(header,{configuration,secret,keys,issuer='ai-company-os',audience='ai-company-os-api',now=Math.floor(Date.now()/1000)}={}){
  if(configuration!==undefined){
    if(secret!==undefined||keys!==undefined)throw new Error('pass a validated auth configuration or raw auth keys, not both');
    if(!validatedConfigurations.has(configuration))throw new Error('auth configuration must come from validateAuthConfiguration');
  }else configuration=validateAuthConfiguration({secret,keys});
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
  let signingSecret=configuration.secret;
  if(configuration.keys){
    if(typeof headerJson.kid!=='string'||headerJson.kid==='')throw Object.assign(new Error('missing token key id'),{code:'UNAUTHORIZED'});
    if(!Object.hasOwn(configuration.keys,headerJson.kid))throw Object.assign(new Error('unknown token key id'),{code:'UNAUTHORIZED'});
    signingSecret=configuration.keys[headerJson.kid];
  }
  const expected=hmac(`${h}.${p}`,signingSecret);
  let actual;
  try{actual=b64urlDecode(sig)}catch{throw Object.assign(new Error('invalid token signature'),{code:'UNAUTHORIZED'})}
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Object.assign(new Error('invalid token signature'),{code:'UNAUTHORIZED'});
  if(payload.iss!==issuer||payload.aud!==audience)throw Object.assign(new Error('invalid token scope'),{code:'UNAUTHORIZED'});
  if(typeof payload.sub!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub))throw Object.assign(new Error('invalid token subject'),{code:'UNAUTHORIZED'});
  if(!Number.isInteger(payload.exp)||payload.exp<=now)throw Object.assign(new Error('token expired'),{code:'UNAUTHORIZED'});
  if(Number.isInteger(payload.nbf)&&payload.nbf>now+30)throw Object.assign(new Error('token not active'),{code:'UNAUTHORIZED'});
  return {userId:payload.sub,claims:payload,keyId:headerJson.kid??null};
}

export function createTestToken({secret,kid,sub,issuer='ai-company-os',audience='ai-company-os-api',iat=1_700_000_000,exp=1_700_003_600}){
  const header=b64urlEncode(JSON.stringify({alg:'HS256',typ:'JWT',...(kid===undefined?{}:{kid})}));
  const payload=b64urlEncode(JSON.stringify({sub,iss:issuer,aud:audience,iat,exp}));
  const signature=hmac(`${header}.${payload}`,secret).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
