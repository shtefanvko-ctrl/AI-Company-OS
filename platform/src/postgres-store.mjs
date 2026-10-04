import pg from 'pg';
const { Pool } = pg;

export class PostgresCompanyStore {
  constructor({connectionString=process.env.DATABASE_URL,pool}={}){
    if(!pool&&!connectionString)throw new Error('DATABASE_URL is required');
    this.pool=pool||new Pool({connectionString});
  }
  async close(){await this.pool.end()}

  async #withUser(userId,fn){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ai_company_app');
      await client.query("SELECT set_config('app.user_id',$1,true)",[userId]);
      const result=await fn(client);
      await client.query('COMMIT');
      return result;
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      throw error;
    }finally{client.release()}
  }

  async createOrganization({userId,name,accountType}){
    return this.#withUser(userId,async client=>{
      const {rows}=await client.query('SELECT * FROM app.create_organization($1,$2)',[name,accountType]);
      return rows[0];
    });
  }

  async getContext({organizationId,userId}){
    return this.#withUser(userId,async client=>{
      const org=(await client.query('SELECT * FROM app.organizations WHERE id=$1',[organizationId])).rows[0];
      if(!org)throw Object.assign(new Error('not found'),{code:'NOT_FOUND'});
      const membership=(await client.query('SELECT organization_id,user_id,role,created_at FROM app.organization_members WHERE organization_id=$1 AND user_id=$2',[organizationId,userId])).rows[0];
      if(!membership)throw Object.assign(new Error('forbidden'),{code:'FORBIDDEN'});
      const capabilities=(await client.query('SELECT capability_key FROM app.organization_capabilities WHERE organization_id=$1 AND enabled=true ORDER BY capability_key',[organizationId])).rows.map(x=>x.capability_key);
      return {organization:org,membership,capabilities};
    });
  }

  async recordAction({organizationId,userId,actionType,idempotencyKey}){
    return this.#withUser(userId,async client=>{
      // Authorization and the duplicate decision share the atomic database write.
      const row=(await client.query('SELECT * FROM app.accept_action_result($1,$2,$3)',[organizationId,actionType,idempotencyKey])).rows[0];
      return {duplicate:row.duplicate,actionId:row.action_id};
    });
  }

  async proposeMemory({organizationId,userId,content,category='general',sourceType='user',sourceRef=null,confidence=1,metadata={}}){
    return this.#withUser(userId,async client=>{
      const {rows}=await client.query(
        `INSERT INTO app.company_memories(
           organization_id,content,category,source_type,source_ref,confidence,metadata,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,organization_id,content,category,source_type,source_ref,confidence,
                   verification_status,canonical_state,metadata,observed_at,fresh_until,
                   content_hash,created_by,created_at,updated_at`,
        [organizationId,content,category,sourceType,sourceRef,confidence,metadata,userId]
      );
      return rows[0];
    });
  }

  async listMemories({organizationId,userId,limit=50}){
    return this.#withUser(userId,async client=>{
      const org=(await client.query('SELECT id FROM app.organizations WHERE id=$1',[organizationId])).rows[0];
      if(!org)throw Object.assign(new Error('not found'),{code:'NOT_FOUND'});
      const {rows}=await client.query(
        `SELECT id,organization_id,content,category,source_type,source_ref,confidence,
                verification_status,canonical_state,metadata,observed_at,fresh_until,
                content_hash,created_by,created_at,updated_at
         FROM app.company_memories
         WHERE organization_id=$1
         ORDER BY created_at DESC,id DESC
         LIMIT $2`,
        [organizationId,limit]
      );
      return rows;
    });
  }

  async auditFor({organizationId,userId}){
    return this.#withUser(userId,async client=>{
      const {rows}=await client.query('SELECT id,event_type,payload,created_at,user_id FROM app.audit_log WHERE organization_id=$1 ORDER BY id',[organizationId]);
      return rows;
    });
  }
}
