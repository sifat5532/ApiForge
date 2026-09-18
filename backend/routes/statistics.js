/* =========================================================================
   ApiForge — statistics.js
   Project statistics route.  All queries run inside a single REPEATABLE READ
   transaction so every figure is consistent with the same DB snapshot.

   Endpoint:
     GET /statistics/project/:projectId?range=7d|30d

   :projectId may be a numeric id OR a project name slug (same as view.js).

   Response shape:
     {
       kpis:            { total_calls, avg_response_ms, error_rate_pct },
       calls_over_time: [ { day, calls, ma7 }, … ],
       top_endpoints:   [ { method, path, calls }, … ],
       method_dist:     [ { method, calls }, … ],
       error_rates:     [ { method, path, error_pct }, … ],
       peak_hours:      [ { hour, calls }, … ],   // always 24 entries (0–23)
     }
   ========================================================================= */

const express = require('express');
const pool    = require('../db/connection');
const query   = require('../db/query');
const { requireAuth } = require('./auth');
const { requireProjectAccess } = require('./project');

const router = express.Router();

/* -------------------------------------------------------------------------
   Resolve project name slug → numeric id (same logic as view.js)
   ------------------------------------------------------------------------- */
async function resolveProjectIdParam(req, res, next) {
    const raw = req.params.projectId;
    if (raw == null) return next();
    if (/^\d+$/.test(raw)) return next();   // already numeric

    const result = await query(
        `SELECT p.id
           FROM projects p
          WHERE p.name = $1
            AND p.is_template = $2
            AND (p.author_id = $3 OR EXISTS (
                  SELECT 1 FROM project_collaborators pc
                   WHERE pc.user_id = $3 AND pc.status = $4 AND pc.project_id = p.id
                ))
          LIMIT 1`,
        [raw, false, req.loggedInUser.id, 'accepted']
    );
    if (result.rows.length === 0) {
        return res.status(404).json({ msg: 'Project not found' });
    }
    req.params.projectId = String(result.rows[0].id);
    next();
}

/* -------------------------------------------------------------------------
   Validate the ?range query param
   ------------------------------------------------------------------------- */
function parseDays(rangeParam) {
    if (rangeParam === '7d')  return 7;
    if (rangeParam === '30d') return 30;
    return 30;
}

/* -------------------------------------------------------------------------
   Main stats endpoint
   ------------------------------------------------------------------------- */
router.get(
    '/project/:projectId',
    requireAuth,
    resolveProjectIdParam,
    requireProjectAccess,
    async (req, res) => {
        const projectId = parseInt(req.params.projectId, 10);
        const days      = parseDays(req.query.range);

        const client = await pool.connect();
        try {
            await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');

            /* ----------------------------------------------------------------
               1. KPIs — total calls, avg response time, error rate
               ---------------------------------------------------------------- */
            const kpiRes = await client.query(`
                SELECT
                    COUNT(*)                                                  AS total_calls,
                    ROUND(AVG(al.response_time_ms))                           AS avg_response_ms,
                    ROUND(
                        100.0 * COUNT(*) FILTER (WHERE al.status_code >= 400)
                        / NULLIF(COUNT(*), 0),
                        2
                    )                                                         AS error_rate_pct
                FROM api_logs al
                JOIN api_definitions ad ON ad.id = al.api_definition_id
                WHERE ad.project_id = $1
                  AND al.created_at >= now() - ($2 || ' days')::INTERVAL
            `, [projectId, days]);

            /* ----------------------------------------------------------------
               2. Calls over time — daily volume + 7-day moving average
                  Always buffer 30 days so the MA edge is stable when range=7d.
               ---------------------------------------------------------------- */
            const callsRes = await client.query(`
                WITH daily AS (
                    SELECT
                        date_trunc('day', al.created_at)::date AS day,
                        COUNT(*)                               AS calls
                    FROM api_logs al
                    JOIN api_definitions ad ON ad.id = al.api_definition_id
                    WHERE ad.project_id = $1
                      AND al.created_at >= now() - '30 days'::INTERVAL
                    GROUP BY 1
                ),
                with_ma AS (
                    SELECT
                        day,
                        calls,
                        ROUND(AVG(calls) OVER (
                            ORDER BY day
                            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
                        )) AS ma7
                    FROM daily
                )
                SELECT day, calls, ma7
                FROM with_ma
                WHERE day >= (now() - ($2 || ' days')::INTERVAL)::date
                ORDER BY day
            `, [projectId, days]);

            /* ----------------------------------------------------------------
               3. Top endpoints by call volume (up to 8)
               ---------------------------------------------------------------- */
            const topRes = await client.query(`
                SELECT
                    ad.method,
                    ad.name      AS path,
                    COUNT(al.id) AS calls
                FROM api_logs al
                JOIN api_definitions ad ON ad.id = al.api_definition_id
                WHERE ad.project_id = $1
                  AND al.created_at >= now() - ($2 || ' days')::INTERVAL
                GROUP BY ad.id, ad.method, ad.name
                ORDER BY calls DESC
                LIMIT 8
            `, [projectId, days]);

            /* ----------------------------------------------------------------
               4. Traffic by HTTP method
               ---------------------------------------------------------------- */
            const methodRes = await client.query(`
                SELECT
                    ad.method,
                    COUNT(al.id) AS calls
                FROM api_logs al
                JOIN api_definitions ad ON ad.id = al.api_definition_id
                WHERE ad.project_id = $1
                  AND al.created_at >= now() - ($2 || ' days')::INTERVAL
                GROUP BY ad.method
                ORDER BY calls DESC
            `, [projectId, days]);

            /* ----------------------------------------------------------------
               5. Error rate by endpoint
               ---------------------------------------------------------------- */
            const errorRes = await client.query(`
                SELECT
                    ad.method,
                    ad.name AS path,
                    ROUND(
                        100.0 * COUNT(*) FILTER (WHERE al.status_code >= 400)
                        / NULLIF(COUNT(*), 0),
                        2
                    ) AS error_pct
                FROM api_logs al
                JOIN api_definitions ad ON ad.id = al.api_definition_id
                WHERE ad.project_id = $1
                  AND al.created_at >= now() - ($2 || ' days')::INTERVAL
                GROUP BY ad.id, ad.method, ad.name
                ORDER BY error_pct DESC NULLS LAST
            `, [projectId, days]);

            /* ----------------------------------------------------------------
               6. Peak usage hours (UTC), normalised to 0–23
               ---------------------------------------------------------------- */
            const hoursRes = await client.query(`
                SELECT
                    EXTRACT(HOUR FROM al.created_at)::int AS hour,
                    COUNT(*)                              AS calls
                FROM api_logs al
                JOIN api_definitions ad ON ad.id = al.api_definition_id
                WHERE ad.project_id = $1
                  AND al.created_at >= now() - ($2 || ' days')::INTERVAL
                GROUP BY 1
                ORDER BY 1
            `, [projectId, days]);

            await client.query('COMMIT');

            /* ---- normalise hour buckets → full 0-23 array ---- */
            const hourMap = {};
            hoursRes.rows.forEach(r => { hourMap[r.hour] = parseInt(r.calls, 10); });
            const peakHours = Array.from({ length: 24 }, (_, h) => ({
                hour:  h,
                calls: hourMap[h] ?? 0,
            }));

            return res.status(200).json({
                kpis: {
                    total_calls:     parseInt(kpiRes.rows[0]?.total_calls     ?? 0, 10),
                    avg_response_ms: parseInt(kpiRes.rows[0]?.avg_response_ms ?? 0, 10),
                    error_rate_pct:  parseFloat(kpiRes.rows[0]?.error_rate_pct ?? 0),
                },
                calls_over_time: callsRes.rows.map(r => ({
                    day:   r.day,
                    calls: parseInt(r.calls, 10),
                    ma7:   parseInt(r.ma7,   10),
                })),
                top_endpoints: topRes.rows.map(r => ({
                    method: r.method,
                    path:   r.path,
                    calls:  parseInt(r.calls, 10),
                })),
                method_dist: methodRes.rows.map(r => ({
                    method: r.method,
                    calls:  parseInt(r.calls, 10),
                })),
                error_rates: errorRes.rows.map(r => ({
                    method:    r.method,
                    path:      r.path,
                    error_pct: parseFloat(r.error_pct ?? 0),
                })),
                peak_hours: peakHours,
            });

        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('[statistics] error:', err);
            return res.status(500).json({ msg: 'There was a server side error, please try again later' });
        } finally {
            client.release();
        }
    }
);

module.exports = router;
