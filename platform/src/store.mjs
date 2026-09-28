import { randomUUID } from 'node:crypto';

export const ACCOUNT_TYPES = ['blogger','specialist','shop','company','hybrid'];
export const CAPABILITY_PACKS = Object.freeze({
  blogger: ['content.prepare','content.review','inbox.read'],
  specialist: ['content.prepare','content.review','inbox.read','crm.contact'],
  shop: ['content.prepare','content.review','inbox.read','crm.contact','catalog.manage'],
  company: ['content.prepare','content.review','inbox.read','crm.contact','campaign.manage','analytics.read'],
  hybrid: ['content.prepare','content.review','inbox.read','crm.contact','catalog.manage','campaign.manage','analytics.read']
});
export const ACTION_CAPABILITY = Object.freeze({
  'CONTENT.PREPARE':'content.prepare',
  'CONTENT.REVIEW':'content.review',
  'INBOX.READ':'inbox.read',
  'CRM.CONTACT_UPSERT':'crm.contact',
  'CATALOG.MANAGE':'catalog.manage',
  'CAMPAIGN.MANAGE':'campaign.manage',
  'ANALYTICS.READ':'analytics.read'
});

export class CompanyStore {
  #organizations = new Map(); #memberships = new Map(); #capabilities = new Map(); #audit = [];

  createOrganization({ userId, name, accountType }) {
    const type=String(accountType||'').trim();
    if (!userId || !name?.trim() || !ACCOUNT_TYPES.includes(type)) throw new Error('userId, name and valid accountType are required');
    const id = randomUUID();
    const organization = { id, name: name.trim(), accountType:type, createdAt:new Date().toISOString() };
    this.#organizations.set(id, organization);
    this.#memberships.set(`${id}:${userId}`, { organizationId:id, userId, role:'owner' });
    this.#capabilities.set(id, new Set(CAPABILITY_PACKS[type]));
    this.#audit.push({ type:'organization.created', organizationId:id, userId, accountType:type, at:new Date().toISOString() });
    return structuredClone(organization);
  }

  requireMembership(organizationId,userId){const m=this.#memberships.get(`${organizationId}:${userId}`);if(!m)throw Object.assign(new Error('forbidden'),{code:'FORBIDDEN'});return m}
  requireCapability(organizationId,capability){if(!this.#capabilities.get(organizationId)?.has(capability))throw Object.assign(new Error(`capability denied: ${capability}`),{code:'CAPABILITY_DENIED'})}

  getContext({organizationId,userId}){
    const membership=this.requireMembership(organizationId,userId);const organization=this.#organizations.get(organizationId);
    if(!organization)throw Object.assign(new Error('not found'),{code:'NOT_FOUND'});
    return {organization:structuredClone(organization),membership:structuredClone(membership),capabilities:[...(this.#capabilities.get(organizationId)||[])].sort()};
  }
  getOrganization(input){return this.getContext(input).organization}

  recordAction({ organizationId, userId, actionType, idempotencyKey }) {
    this.requireMembership(organizationId,userId);
    if(!actionType||!idempotencyKey)throw new Error('actionType and idempotencyKey are required');
    const capability=ACTION_CAPABILITY[actionType];if(!capability)throw new Error(`unknown actionType: ${actionType}`);this.requireCapability(organizationId,capability);
    const duplicate=this.#audit.find(x=>x.organizationId===organizationId&&x.idempotencyKey===idempotencyKey);
    if(duplicate)return {duplicate:true,actionId:duplicate.actionId};
    const actionId=randomUUID();this.#audit.push({type:'action.accepted',actionId,actionType,capability,organizationId,userId,idempotencyKey,at:new Date().toISOString()});
    return {duplicate:false,actionId};
  }
  auditFor({organizationId,userId}){this.requireMembership(organizationId,userId);return this.#audit.filter(x=>x.organizationId===organizationId).map(structuredClone)}
}
