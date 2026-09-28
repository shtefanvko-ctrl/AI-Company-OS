import http from 'node:http';
import { CompanyStore } from './store.mjs';

export const store = new CompanyStore();

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
function userId(req) { return String(req.headers['x-user-id'] || ''); }

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'ai-company-os-contract' });
      if (req.method === 'POST' && url.pathname === '/v1/organizations') {
        const input = await body(req);
        return send(res, 201, store.createOrganization({ userId: userId(req), name: input.name, accountType: input.accountType }));
      }
      const orgMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)$/);
      if (req.method === 'GET' && orgMatch) return send(res, 200, store.getOrganization({ organizationId: orgMatch[1], userId: userId(req) }));
      const actionMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/actions$/);
      if (req.method === 'POST' && actionMatch) {
        const input = await body(req);
        return send(res, 202, store.recordAction({ organizationId: actionMatch[1], userId: userId(req), actionType: input.actionType, idempotencyKey: req.headers['idempotency-key'] }));
      }
      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error?.code === 'FORBIDDEN') return send(res, 403, { error: 'forbidden' });
      if (error?.code === 'NOT_FOUND') return send(res, 404, { error: 'not_found' });
      return send(res, 400, { error: 'bad_request', message: String(error?.message || error) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8788);
  createServer().listen(port, '127.0.0.1', () => console.log(`[ai-company-os] contract harness http://127.0.0.1:${port}`));
}
