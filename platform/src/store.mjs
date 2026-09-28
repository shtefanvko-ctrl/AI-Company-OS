import { randomUUID } from 'node:crypto';

export class CompanyStore {
  #organizations = new Map();
  #memberships = new Map();
  #audit = [];

  createOrganization({ userId, name, accountType }) {
    if (!userId || !name?.trim() || !accountType?.trim()) throw new Error('userId, name and accountType are required');
    const id = randomUUID();
    const organization = { id, name: name.trim(), accountType: accountType.trim(), createdAt: new Date().toISOString() };
    this.#organizations.set(id, organization);
    this.#memberships.set(`${id}:${userId}`, { organizationId: id, userId, role: 'owner' });
    this.#audit.push({ type: 'organization.created', organizationId: id, userId, at: new Date().toISOString() });
    return structuredClone(organization);
  }

  requireMembership(organizationId, userId) {
    const membership = this.#memberships.get(`${organizationId}:${userId}`);
    if (!membership) throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
    return membership;
  }

  getOrganization({ organizationId, userId }) {
    this.requireMembership(organizationId, userId);
    const organization = this.#organizations.get(organizationId);
    if (!organization) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
    return structuredClone(organization);
  }

  recordAction({ organizationId, userId, actionType, idempotencyKey }) {
    this.requireMembership(organizationId, userId);
    if (!actionType || !idempotencyKey) throw new Error('actionType and idempotencyKey are required');
    const duplicate = this.#audit.find(x => x.organizationId === organizationId && x.idempotencyKey === idempotencyKey);
    if (duplicate) return { duplicate: true, actionId: duplicate.actionId };
    const actionId = randomUUID();
    this.#audit.push({ type: 'action.accepted', actionId, actionType, organizationId, userId, idempotencyKey, at: new Date().toISOString() });
    return { duplicate: false, actionId };
  }

  auditFor({ organizationId, userId }) {
    this.requireMembership(organizationId, userId);
    return this.#audit.filter(x => x.organizationId === organizationId).map(structuredClone);
  }
}
