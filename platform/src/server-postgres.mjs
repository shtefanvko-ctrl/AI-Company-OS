import http from 'node:http';
import { verifyBearerAuthorization } from './auth.mjs';
import { PostgresCompanyStore } from './postgres-store.mjs';

function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))}
async function body(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}}
function limitParam(value,defaultValue=50,max=100){if(value===null)return defaultValue;const n=Number(value);if(!Number.isInteger(n)||n<1||n>max)throw new Error('invalid limit');return n}

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
   if(req.method==='POST'&&memories){const input=await body(req);return send(res,201,await db.proposeMemory({organizationId:memories[1],userId,content:input.content,category:input.category,sourceType:input.sourceType,sourceRef:input.sourceRef,confidence:input.confidence,metadata:input.metadata}))}
   if(req.method==='GET'&&memories)return send(res,200,{items:await db.listMemories({organizationId:memories[1],userId,limit:limitParam(url.searchParams.get('limit'))})});
   const audit=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/audit$/);if(req.method==='GET'&&audit)return send(res,200,{items:await db.auditFor({organizationId:audit[1],userId})});
   return send(res,404,{error:'not_found'});
 }catch(error){
   const code=String(error?.code||'');
   if(code==='UNAUTHORIZED')return send(res,401,{error:'unauthorized'});
   if(code==='FORBIDDEN'||code==='42501')return send(res,403,{error:'forbidden'});
   if(code==='CAPABILITY_DENIED')return send(res,403,{error:'capability_denied',message:error.message});
   if(code==='NOT_FOUND')return send(res,404,{error:'not_found'});
   return send(res,400,{error:'bad_request',message:String(error?.message||error)});
 }});
}
if(import.meta.url===`file://${process.argv[1]}`){
 if(!process.env.AUTH_HMAC_SECRET||process.env.AUTH_HMAC_SECRET.length<32)throw new Error('AUTH_HMAC_SECRET must contain at least 32 characters');
 const server=createPostgresServer();
 const port=Number(process.env.PORT||8788);
 server.listen(port,'127.0.0.1',()=>console.log(`[ai-company-os] postgres API http://127.0.0.1:${port}`));
}
