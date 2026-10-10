import http from 'node:http';
import { verifyBearerAuthorization } from './auth.mjs';
import { PostgresCompanyStore } from './postgres-store.mjs';

function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))}
async function body(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}}
function badRequest(message){throw Object.assign(new Error(message),{code:'BAD_REQUEST'})}
function limitParam(value,defaultValue=50,max=100){if(value===null)return defaultValue;const n=Number(value);if(!Number.isInteger(n)||n<1||n>max)badRequest('limit must be an integer from 1 to 100');return n}
function idempotencyKey(value){if(typeof value!=='string'||value.trim()===''||value.trim().length>200)badRequest('Idempotency-Key must contain 1 to 200 characters');return value.trim()}
function organizationId(value){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))badRequest('invalid organization id');return value}
function isoTimestamp(value,name){
 if(value===undefined||value===null)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||Number.isNaN(Date.parse(value)))badRequest(`${name} must be an ISO-8601 timestamp`);
 return value;
}
function memoryInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))badRequest('memory body must be an object');
 const allowed=new Set(['content','category','sourceType','sourceRef','confidence','metadata','observedAt','freshUntil']);
 for(const key of Object.keys(value))if(!allowed.has(key))badRequest(`unknown memory field: ${key}`);
 if(typeof value.content!=='string'||value.content.trim()===''||value.content.length>10000)badRequest('content must contain 1 to 10000 characters');
 const categories=new Set(['brand','product_service','audience','policy','knowledge','decision','task','outcome','general']);
 const category=value.category??'general';if(typeof category!=='string'||!categories.has(category))badRequest('invalid memory category');
 const sourceType=value.sourceType??'user';if(sourceType!=='user')badRequest('authenticated propose API only accepts sourceType=user');
 if(typeof value.sourceRef!=='string'||value.sourceRef.trim()===''||value.sourceRef.length>500)badRequest('sourceRef must contain 1 to 500 characters');
 const confidence=value.confidence??1;if(typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1)badRequest('confidence must be a number from 0 to 1');
 const metadata=value.metadata??{};if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||JSON.stringify(metadata).length>16384)badRequest('metadata must be an object no larger than 16 KiB');
 const observedAt=isoTimestamp(value.observedAt,'observedAt');
 const freshUntil=isoTimestamp(value.freshUntil,'freshUntil');
 if(observedAt&&freshUntil&&Date.parse(freshUntil)<Date.parse(observedAt))badRequest('freshUntil must not precede observedAt');
 return {content:value.content.trim(),category,sourceType,sourceRef:value.sourceRef.trim(),confidence,metadata,observedAt,freshUntil};
}

export function createPostgresServer({store,authSecret=process.env.AUTH_HMAC_SECRET,authIssuer=process.env.AUTH_ISSUER||'ai-company-os',authAudience=process.env.AUTH_AUDIENCE||'ai-company-os-api'}={}){
 const db=store||new PostgresCompanyStore();
 return http.createServer(async(req,res)=>{try{
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'ai-company-os-postgres'});
   const {userId}=verifyBearerAuthorization(req.headers.authorization,{secret:authSecret,issuer:authIssuer,audience:authAudience});
   if(req.method==='POST'&&url.pathname==='/v1/organizations'){const input=await body(req);return send(res,201,await db.createOrganization({userId,name:input.name,accountType:input.accountType}))}
   const org=url.pathname.match(/^\/v1\/organizations\/([^/]+)$/);if(req.method==='GET'&&org)return send(res,200,await db.getContext({organizationId:org[1],userId}));
   const actions=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/actions$/);if(req.method==='POST'&&actions){const input=await body(req);return send(res,202,await db.recordAction({organizationId:actions[1],userId,actionType:input.actionType,idempotencyKey:req.headers['idempotency-key']}))}
   const memories=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/memories$/);
   if(req.method==='POST'&&memories){
     const result=await db.proposeMemory({organizationId:organizationId(memories[1]),userId,input:memoryInput(await body(req)),idempotencyKey:idempotencyKey(req.headers['idempotency-key'])});
     return send(res,result.duplicate?200:201,{...result.memory,duplicate:result.duplicate});
   }
   if(req.method==='GET'&&memories)return send(res,200,{items:await db.listMemories({organizationId:organizationId(memories[1]),userId,limit:limitParam(url.searchParams.get('limit'))})});
   const audit=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/audit$/);if(req.method==='GET'&&audit)return send(res,200,{items:await db.auditFor({organizationId:audit[1],userId})});
   return send(res,404,{error:'not_found'});
 }catch(error){
   const code=String(error?.code||'');
   if(code==='UNAUTHORIZED')return send(res,401,{error:'unauthorized'});
   if(code==='FORBIDDEN'||code==='42501')return send(res,403,{error:'forbidden'});
   if(code==='CAPABILITY_DENIED')return send(res,403,{error:'capability_denied',message:error.message});
   if(code==='NOT_FOUND')return send(res,404,{error:'not_found'});
   if(code==='BAD_REQUEST')return send(res,400,{error:'bad_request',message:error.message});
   return send(res,400,{error:'bad_request',message:String(error?.message||error)});
 }});
}
if(import.meta.url===`file://${process.argv[1]}`){
 if(!process.env.AUTH_HMAC_SECRET||process.env.AUTH_HMAC_SECRET.length<32)throw new Error('AUTH_HMAC_SECRET must contain at least 32 characters');
 const server=createPostgresServer();
 const port=Number(process.env.PORT||8788);
 server.listen(port,'127.0.0.1',()=>console.log(`[ai-company-os] postgres API http://127.0.0.1:${port}`));
}
