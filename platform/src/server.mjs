import http from 'node:http';
import { CompanyStore } from './store.mjs';
export const store=new CompanyStore();
function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))}
async function body(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}}
const userId=req=>String(req.headers['x-user-id']||'');
export function createServer(){return http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true,service:'ai-company-os-contract'});
 if(req.method==='POST'&&url.pathname==='/v1/organizations'){const input=await body(req);return send(res,201,store.createOrganization({userId:userId(req),name:input.name,accountType:input.accountType}))}
 const org=url.pathname.match(/^\/v1\/organizations\/([^/]+)$/);if(req.method==='GET'&&org)return send(res,200,store.getContext({organizationId:org[1],userId:userId(req)}));
 const actions=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/actions$/);if(req.method==='POST'&&actions){const input=await body(req);return send(res,202,store.recordAction({organizationId:actions[1],userId:userId(req),actionType:input.actionType,idempotencyKey:req.headers['idempotency-key']}))}
 const audit=url.pathname.match(/^\/v1\/organizations\/([^/]+)\/audit$/);if(req.method==='GET'&&audit)return send(res,200,{items:store.auditFor({organizationId:audit[1],userId:userId(req)})});
 return send(res,404,{error:'not_found'});
 }catch(error){if(error?.code==='FORBIDDEN')return send(res,403,{error:'forbidden'});if(error?.code==='CAPABILITY_DENIED')return send(res,403,{error:'capability_denied',message:error.message});if(error?.code==='NOT_FOUND')return send(res,404,{error:'not_found'});return send(res,400,{error:'bad_request',message:String(error?.message||error)})}})}
if(import.meta.url===`file://${process.argv[1]}`){const port=Number(process.env.PORT||8788);createServer().listen(port,'127.0.0.1',()=>console.log(`[ai-company-os] contract harness http://127.0.0.1:${port}`))}
