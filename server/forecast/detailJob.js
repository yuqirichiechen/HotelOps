// Sprint 20.2 — background deep-fetch of every reservation's full rGuest
// detail, stored in `reservation_detail` so the UI never needs a live call.
//
// Flow:  list scrape (fast) → forecast_snapshot  →  startDetailJob() returns
// immediately; the job fetches details in the background, writing each
// reservation as soon as it completes (progressive) and heart-beating
// progress into `scrape_job`.
//
// Why this shape (the user's staleness concern):
//  • The UI reads stored rows only → a reservation that changed/cancelled in
//    rGuest after the list scrape can't make a card throw an error.
//  • Each row carries fetched_at + remote_state ('gone' = 404 in rGuest) so
//    the UI can say "as of 3:12 PM" / "no longer in rGuest" instead of failing.
//  • A section that fails keeps its previous good data (flagged stale) and is
//    retried on the next run; a failed reservation never wipes stored data.
//  • Incremental: only reservations that are new, changed (list fingerprint),
//    older than their TTL, or have failed sections are re-fetched, so after
//    the first full run a scrape touches a handful of reservations.
//
// Cost rules (see memory: no_db_timers_neon_cost): runs ONLY when an admin
// triggers a scrape / refresh — no timers, no background polling.
// Safety: concurrency-capped (here + the client's global in-flight cap),
// a rejected login aborts the whole job and is never retried (lockout).

'use strict';

const crypto = require('crypto');
const { createAgilysysClient } = require('../agilysys/client');
const { summarizeDetail } = require('./summarize');

const HOUR = 3600 * 1000;
const TTL_ACTIVE_MS = 3 * HOUR;     // arrivals / in-house / departures
const TTL_FUTURE_MS = 24 * HOUR;    // future reservations
const SECTION_RETRY_AFTER_MS = 30 * 60 * 1000;
const STALE_JOB_MS = 90 * 1000;     // no heartbeat for this long ⇒ job died (Koyeb restart)
const MAX_CONSECUTIVE_FAILURES = 8; // rGuest looks down → stop hammering

// List-level fields whose change means "this reservation changed — re-fetch".
// `kind` is included on purpose: it flips arrival → inhouse at the day roll.
const FINGERPRINT_FIELDS = ['status', 'statusLabel', 'kind', 'roomNumber', 'typeCode',
  'arrivalDate', 'departureDate', 'nights', 'vipUuid', 'ratePlanCode'];

function fingerprintOf(r) {
  const vals = FINGERPRINT_FIELDS.map(k => (r && r[k] !== undefined ? r[k] : null));
  return crypto.createHash('sha256').update(JSON.stringify(vals)).digest('hex');
}

const isFuture = (r) => r && r.kind === 'future';

// Lower = fetched sooner. Remaining arrivals first (what the desk needs now).
function priorityOf(r) {
  if (r.kind === 'arrival' && (r.status === 'RES' || r.statusLabel === 'Pending')) return 0;
  if (r.kind === 'arrival' || r.kind === 'inhouse' || r.kind === 'stayover') return 1;
  if (r.kind === 'departure') return 2;
  if (r.kind === 'future') return 3;
  return 4;
}

/**
 * Pure: decide which reservations need (re)fetching.
 * @param {Array}  reservations  payload.reservations
 * @param {Map}    stored        reservation_id → { list_fingerprint, fetched_at, remote_state, sections }
 * @param {number} nowMs
 * @param {boolean} force        re-fetch everything
 * @returns {{ targets: Array<{r, reason}>, skipped: number }}
 */
function selectTargets(reservations, stored, nowMs = Date.now(), force = false) {
  const targets = [];
  let skipped = 0;
  const seen = new Set();
  for (const r of reservations || []) {
    if (!r || !r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    const row = stored.get(r.id);
    let reason = null;
    if (force)                     reason = 'forced';
    else if (!row)                 reason = 'new';
    else if (row.list_fingerprint !== fingerprintOf(r)) reason = 'changed';
    else {
      const age = nowMs - new Date(row.fetched_at).getTime();
      const ttl = isFuture(r) ? TTL_FUTURE_MS : TTL_ACTIVE_MS;
      if (row.remote_state === 'gone')           reason = age > SECTION_RETRY_AFTER_MS ? 'recheck-gone' : null;
      else if (age > ttl)                        reason = 'ttl';
      else {
        const secs = row.sections || {};
        const retry = Object.values(secs).some(s =>
          s && s.ok === false && nowMs - new Date(s.at).getTime() > SECTION_RETRY_AFTER_MS);
        if (retry) reason = 'retry-sections';
      }
    }
    if (reason) targets.push({ r, reason });
    else skipped++;
  }
  targets.sort((a, b) =>
    priorityOf(a.r) - priorityOf(b.r) ||
    String(a.r.arrivalDate || '').localeCompare(String(b.r.arrivalDate || '')));
  return { targets, skipped };
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function loadStored(pool, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { rows } = await pool.query(
    `SELECT reservation_id, list_fingerprint, fetched_at, remote_state, sections
       FROM reservation_detail WHERE reservation_id = ANY($1::uuid[])`,
    [ids],
  );
  rows.forEach(r => map.set(r.reservation_id, r));
  return map;
}

async function loadPrior(pool, id) {
  const { rows } = await pool.query(
    'SELECT detail, summary, sections FROM reservation_detail WHERE reservation_id = $1', [id]);
  return rows[0] || null;
}

async function saveDetail(pool, r, out, prior) {
  const summary = out.remoteState === 'ok'
    ? summarizeDetail(out.detail, r)
    : ((prior && prior.summary) || {});
  await pool.query(
    `INSERT INTO reservation_detail
       (reservation_id, confirmation_id, remote_state, list_fingerprint, detail, summary, sections,
        fetched_at, last_attempt_at, attempts, last_error)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, NOW(), NOW(), 1, NULL)
     ON CONFLICT (reservation_id) DO UPDATE SET
       confirmation_id  = COALESCE(EXCLUDED.confirmation_id, reservation_detail.confirmation_id),
       remote_state     = EXCLUDED.remote_state,
       list_fingerprint = EXCLUDED.list_fingerprint,
       detail           = EXCLUDED.detail,
       summary          = EXCLUDED.summary,
       sections         = EXCLUDED.sections,
       fetched_at       = CASE WHEN EXCLUDED.remote_state = 'ok' THEN NOW() ELSE reservation_detail.fetched_at END,
       last_attempt_at  = NOW(),
       attempts         = reservation_detail.attempts + 1,
       last_error       = NULL`,
    [
      r.id, r.confirmationId || null, out.remoteState, fingerprintOf(r),
      JSON.stringify(out.detail || {}), JSON.stringify(summary || {}), JSON.stringify(out.sections || {}),
    ],
  );
  return summary;
}

async function recordFailure(pool, id, message) {
  // UPDATE only: never create an empty "fetched" row out of a failure.
  await pool.query(
    `UPDATE reservation_detail
        SET last_attempt_at = NOW(), attempts = attempts + 1, last_error = $2
      WHERE reservation_id = $1`,
    [id, String(message).slice(0, 300)],
  );
}

async function getLatestJob(pool) {
  const { rows } = await pool.query('SELECT * FROM scrape_job ORDER BY started_at DESC LIMIT 1');
  const job = rows[0] || null;
  if (job && job.status === 'running' && Date.now() - new Date(job.heartbeat_at).getTime() > STALE_JOB_MS) {
    // Process died / restarted mid-run (lazy detection — no boot-time query).
    const upd = await pool.query(
      `UPDATE scrape_job SET status = 'interrupted', finished_at = NOW(),
              error = COALESCE(error, 'server restarted or job stalled')
        WHERE job_id = $1 AND status = 'running' RETURNING *`,
      [job.job_id],
    );
    return upd.rows[0] || job;
  }
  return job;
}

// ── job runner ──────────────────────────────────────────────────────────────

let active = null; // { jobId, startedAt } — one job at a time per process

async function startDetailJob({
  pool, snapshotId = null, reservations, force = false, concurrency = 3,
  createClient = createAgilysysClient, logger = console,
}) {
  if (active) {
    const job = await getLatestJob(pool);
    return { started: false, reused: true, job };
  }
  // Another instance (or a previous life of this one) may have a live job.
  const latest = await getLatestJob(pool);
  if (latest && latest.status === 'running') return { started: false, reused: true, job: latest };

  const ids = (reservations || []).map(r => r && r.id).filter(Boolean);
  const stored = await loadStored(pool, ids);
  const { targets, skipped } = selectTargets(reservations, stored, Date.now(), force);

  const { rows } = await pool.query(
    `INSERT INTO scrape_job (kind, snapshot_id, status, total, skipped, options, finished_at)
     VALUES ('detail', $1, $2, $3, $4, $5::jsonb, $6) RETURNING *`,
    [snapshotId, targets.length ? 'running' : 'success', targets.length, skipped,
      JSON.stringify({ force, concurrency, reasons: countBy(targets.map(t => t.reason)) }),
      targets.length ? null : new Date()],
  );
  const job = rows[0];
  if (!targets.length) return { started: false, reused: false, job };

  active = { jobId: job.job_id, startedAt: Date.now() };
  // Fire and forget — the HTTP request that triggered this returns now.
  runJob({ pool, job, targets, concurrency, createClient, logger })
    .catch(err => logger.error('[detailJob] crashed:', err && err.message))
    .finally(() => { active = null; });
  return { started: true, reused: false, job };
}

function countBy(list) {
  const o = {};
  list.forEach(k => { o[k] = (o[k] || 0) + 1; });
  return o;
}

async function runJob({ pool, job, targets, concurrency, createClient, logger }) {
  const client = createClient();
  const stats = { done: 0, failed: 0, gone: 0 };
  let consecutiveFailures = 0;
  let abortError = null;
  let lastFlush = 0;
  const queue = targets.slice();

  const flush = async (force = false) => {
    if (!force && Date.now() - lastFlush < 4000 && (stats.done + stats.failed) % 10 !== 0) return;
    lastFlush = Date.now();
    await pool.query(
      'UPDATE scrape_job SET done = $2, failed = $3, gone = $4, heartbeat_at = NOW() WHERE job_id = $1',
      [job.job_id, stats.done, stats.failed, stats.gone],
    ).catch(() => { /* progress is best-effort */ });
  };

  async function worker() {
    while (queue.length && !abortError) {
      const { r } = queue.shift();
      try {
        const prior = await loadPrior(pool, r.id);
        const out = await client.deepFetchReservation(r.id, { prior });
        await saveDetail(pool, r, out, prior);
        if (out.remoteState === 'gone') stats.gone++;
        stats.done++;
        consecutiveFailures = 0;
      } catch (err) {
        stats.failed++;
        consecutiveFailures++;
        logger.error('[detailJob] reservation failed:', r.id, err && err.message);
        await recordFailure(pool, r.id, err && err.message).catch(() => {});
        if (err && err.fatal) abortError = err;                           // bad credentials
        else if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          abortError = new Error(`rGuest failing repeatedly (${consecutiveFailures} in a row): ${err && err.message}`);
        }
      }
      await flush();
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const status = abortError ? 'failed' : (stats.failed > 0 ? 'partial' : 'success');
  await pool.query(
    `UPDATE scrape_job
        SET status = $2, done = $3, failed = $4, gone = $5, error = $6,
            heartbeat_at = NOW(), finished_at = NOW()
      WHERE job_id = $1`,
    [job.job_id, status, stats.done, stats.failed, stats.gone, abortError ? abortError.message : null],
  );
  logger.log(`[detailJob] ${status}: done=${stats.done} failed=${stats.failed} gone=${stats.gone} of ${targets.length}`);
}

// ── single-reservation live refresh (admin clicked "refresh") ────────────────

async function refreshOne({ pool, reservationId, listItem = null, createClient = createAgilysysClient }) {
  const client = createClient();
  const prior = await loadPrior(pool, reservationId);
  const out = await client.deepFetchReservation(reservationId, { prior });
  // Without a list item we can't fingerprint — keep the stored fingerprint
  // semantics simple by synthesising a minimal one from the fetched core.
  const R = (out.detail && out.detail.reservation) || {};
  const r = listItem || { id: reservationId, confirmationId: R.confirmationCode, status: R.status, arrivalDate: R.arrivalDate, departureDate: R.departureDate, nights: R.nights };
  await saveDetail(pool, r, out, prior);
  return out.remoteState;
}

module.exports = {
  startDetailJob, getLatestJob, refreshOne, loadPrior,
  // exported for tests
  selectTargets, fingerprintOf, priorityOf,
  TTL_ACTIVE_MS, TTL_FUTURE_MS,
};
