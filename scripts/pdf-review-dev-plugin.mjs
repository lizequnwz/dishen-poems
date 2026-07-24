import { readFile, rename, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const REVIEW_PREFIX = '/__pdf-review/';
const allowedActions = new Set(['approve', 'correct', 'hold', 'reject']);

function jsonResponse(response, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.end(body);
}

function validGregorianDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function isAllowedReviewOrigin(origin, host) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && parsed.host === host;
  } catch {
    return false;
  }
}

export function validateReviewSubmission(payload, catalog) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid review payload.');
  const candidate = catalog.candidates.find((item) => item.candidateId === payload.candidateId);
  if (!candidate) throw new Error('Unknown candidate ID.');
  if (!allowedActions.has(payload.action)) throw new Error('Invalid review action.');
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if ((payload.action === 'hold' || payload.action === 'reject') && !reason) {
    throw new Error('Hold and reject decisions require a reason.');
  }

  let corrections;
  if (payload.action === 'correct') {
    const input = payload.corrections;
    if (!input || typeof input !== 'object') throw new Error('Correct decisions require corrected fields.');
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    const writtenDate = typeof input.writtenDate === 'string' ? input.writtenDate.trim() : '';
    const candidateType = input.candidateType;
    if (!title || !body || !validGregorianDate(writtenDate)) throw new Error('Corrected title, body, and date are required.');
    if (!['poetry', 'excluded'].includes(candidateType)) throw new Error('Invalid corrected candidate type.');
    corrections = { title, body, writtenDate, candidateType };
  }

  return {
    id: `review-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    action: payload.action,
    reason,
    pdfSha256: candidate.pdfSha256,
    extractedContentFingerprint: candidate.contentFingerprint,
    corrections,
  };
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Review payload is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function pdfReviewDevPlugin(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const catalogPath = resolve(projectRoot, options.catalog ?? 'tmp/pdf-import/catalog/catalog.json');
  const decisionsPath = resolve(projectRoot, options.decisions ?? 'imports/pdf-review-decisions.json');
  const assetsRoot = resolve(projectRoot, options.assets ?? 'tmp/pdf-import/catalog/assets');

  return {
    name: 'dishen-pdf-review-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        if (!url.pathname.startsWith(REVIEW_PREFIX)) return next();
        try {
          if (request.method === 'GET' && url.pathname === `${REVIEW_PREFIX}catalog`) {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(await readFile(catalogPath));
            return;
          }
          if (request.method === 'GET' && url.pathname === `${REVIEW_PREFIX}decisions`) {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(await readFile(decisionsPath));
            return;
          }
          if (request.method === 'GET' && url.pathname.startsWith(`${REVIEW_PREFIX}assets/`)) {
            const relative = decodeURIComponent(url.pathname.slice(`${REVIEW_PREFIX}assets/`.length));
            const assetPath = resolve(assetsRoot, relative);
            if (assetPath !== assetsRoot && !assetPath.startsWith(`${assetsRoot}${sep}`)) {
              return jsonResponse(response, 403, { error: 'Invalid asset path.' });
            }
            const type = extname(assetPath) === '.png' ? 'image/png' : 'application/octet-stream';
            response.statusCode = 200;
            response.setHeader('Content-Type', type);
            response.setHeader('Cache-Control', 'no-store');
            response.end(await readFile(assetPath));
            return;
          }
          if (request.method === 'POST' && url.pathname === `${REVIEW_PREFIX}decisions`) {
            if (!isAllowedReviewOrigin(request.headers.origin, request.headers.host)) {
              return jsonResponse(response, 403, { error: 'Review writes only accept same-origin localhost requests.' });
            }
            const [catalog, decisionFile, submitted] = await Promise.all([
              readFile(catalogPath, 'utf8').then(JSON.parse),
              readFile(decisionsPath, 'utf8').then(JSON.parse),
              readRequestBody(request),
            ]);
            const record = validateReviewSubmission(submitted, catalog);
            record.reviewedAt = new Date().toISOString();
            record.reviewedBy = decisionFile.reviewedBy ?? 'site-owner';
            decisionFile.decisions ??= {};
            decisionFile.decisions[record.candidateId] = record;
            const sorted = Object.fromEntries(Object.entries(decisionFile.decisions).sort(([left], [right]) => left.localeCompare(right)));
            const output = `${JSON.stringify({ ...decisionFile, decisions: sorted }, null, 2)}\n`;
            const temporary = resolve(projectRoot, 'imports', `.pdf-review-decisions-${process.pid}.tmp`);
            await writeFile(temporary, output, 'utf8');
            await rename(temporary, decisionsPath);
            return jsonResponse(response, 200, { decision: record });
          }
          return jsonResponse(response, 404, { error: 'Unknown PDF review endpoint.' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'PDF review request failed.';
          return jsonResponse(response, message.includes('ENOENT') ? 404 : 400, { error: message });
        }
      });
    },
  };
}
