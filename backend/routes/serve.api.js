const express = require('express');
const query = require('./../db/query');
const router = express.Router();
const pool = require('./../db/connection');
const loadProjectCatalog = require('./../utils/projectCatalog');
const { buildSelectSQL } = require('./../utils/build.sql.select');
const { buildInsertSQL } = require('./../utils/build.sql.insert');
const { buildUpdateSQL } = require('./../utils/build.sql.update');
const { buildDeleteSQL } = require('./../utils/build.sql.delete');
const crypto = require('crypto');

function qi(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
}

function collectRouteParamNames(definition) {
    const names = [];

    function visitVal(val) {
        if (!val) return;
        if (val.dynamic_value_getting_type === 'route_param' && val.dynamic_field_name) {
            names.push(val.dynamic_field_name);
        }
        if (val.source === 'route_param' && val.dynamic_field_name) {
            names.push(val.dynamic_field_name);
        }
    }

    function visitWhere(whereArr) {
        if (!Array.isArray(whereArr)) return;
        for (const node of whereArr) {
            if (node.node_type === 'group') {
                visitWhere(node.children);
            } else {
                visitVal(node.val1);
                visitVal(node.val2);
            }
        }
    }

    visitWhere(definition.where);
    if (Array.isArray(definition.value_obj_array)) {
        definition.value_obj_array.forEach(visitVal);
    }
    if (Array.isArray(definition.having)) {
        definition.having.forEach(visitVal);
    }
    visitVal(definition.limit);
    visitVal(definition.offset);

    return names;
}

function attachRouteParams(req, definition) {
    const extraSegments = Array.isArray(req.params.splat) ? req.params.splat : [];
    const routeParamNames = collectRouteParamNames(definition);

    routeParamNames.forEach((name, i) => {
        if (extraSegments[i] !== undefined) {
            req.params[name] = extraSegments[i];
        }
    });
}

async function validateApiRoute(req, res, next) {
    const { username, projectname, apiname } = req.params;

    try {
        const result = await query(`
        SELECT
            a.id AS api_id,
            a.method,
            a.is_active AS api_is_active,
            a.query_definition,
            a.rate_limit_per_day,
            p.id AS project_id,
            p.author_id,
            p.auth_enabled,
            p.api_key_hashed,
            p.subscription_status
        FROM api_definitions a
        JOIN projects p ON p.id = a.project_id
        JOIN users u ON u.id = p.author_id
        WHERE u.username = $1 AND p.name = $2 AND a.name = $3 AND p.is_template = $4`,
            [username, projectname, apiname, false]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'API not found' });
        }

        const apiDefinition = result.rows[0];
        attachRouteParams(req, apiDefinition.query_definition);

        if (apiDefinition.method.toUpperCase() !== req.method) {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        if (!apiDefinition.api_is_active) {
            return res.status(404).json({ error: 'API is not active' });
        }

        if (apiDefinition.subscription_status !== 'active') {
            return res.status(402).json({ error: 'Project subscription is not active' });
        }

        if (apiDefinition.auth_enabled) {
            const providedKey = req.header('x-api-key');

            if (!providedKey) {
                return res.status(401).json({ error: 'API key required' });
            }

            const providedKeyHashed = crypto.createHash('sha256').update(providedKey).digest('hex');
            const isValidKey = crypto.timingSafeEqual(
                Buffer.from(providedKeyHashed, 'hex'),
                Buffer.from(apiDefinition.api_key_hashed, 'hex')
            );

            if (!isValidKey) {
                return res.status(401).json({ error: 'Invalid API key' });
            }
        }

        req.apiDefinition = apiDefinition;
        next();
    } catch (err) {
        console.error('validateApiRoute error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function handleApiRequest(req, res) {
    const apiDefinition = req.apiDefinition;

    try {
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res, apiDefinition);
            case 'POST':
                return await handleInsert(req, res, apiDefinition);
            case 'PUT':
                return await handleUpdate(req, res, apiDefinition);
            case 'DELETE':
                return await handleDelete(req, res, apiDefinition);
        }
    } catch (err) {
        console.error('handleApiRequest error:', err);
        const status = err.status || 500;
        res.status(status).json({ error: err.message || 'Internal server error' });
    }
}


async function enforceRateLimit(client, apiDefinition) {
    const usage = await client.query(`
        SELECT COUNT(*)::int AS cnt
        FROM api_logs
        WHERE api_definition_id = $1
        AND created_at >= now() - interval '1 day'`,
        [apiDefinition.api_id]
    );
    if (usage.rows[0].cnt >= apiDefinition.rate_limit_per_day) {
        const err = new Error('Rate limit exceeded');
        err.status = 429;
        throw err;
    }
}

async function logApiCall(client, apiDefinition, req, statusCode, responseTimeMs) {
    await client.query(`SET search_path TO public`);
    await client.query(`
        INSERT INTO api_logs (api_definition_id, ip_address, status_code, response_time_ms)
        VALUES ($1, $2, $3, $4)`,
        [apiDefinition.api_id, req.ip, statusCode, Math.round(responseTimeMs)]
    );
}

async function executeApiQuery(req, res, apiDefinition, buildSQLFn, successStatus) {
    const client = await pool.connect();
    const startedAt = process.hrtime.bigint();

    try {
        await client.query('BEGIN');

        await client.query(`SET search_path TO public`);
        await enforceRateLimit(client, apiDefinition);

        const catalog = await loadProjectCatalog(client, apiDefinition.project_id);

        const schema = `PROJ_${apiDefinition.project_id}_${apiDefinition.author_id}`;
        await client.query(`SET search_path TO ${qi(schema)}`);

        const { text, values } = buildSQLFn(apiDefinition.query_definition, catalog, req);
        const result = await client.query(text, values);

        const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        await logApiCall(client, apiDefinition, req, successStatus, responseTimeMs);

        await client.query('COMMIT');
        return res.status(successStatus).json(result.rows);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}


async function handleGet(req, res, apiDefinition) {
    return executeApiQuery(req, res, apiDefinition, buildSelectSQL, 200);
}

async function handleInsert(req, res, apiDefinition) {
    return executeApiQuery(req, res, apiDefinition, buildInsertSQL, 201);
}

async function handleUpdate(req, res, apiDefinition) {
    return executeApiQuery(req, res, apiDefinition, buildUpdateSQL, 200);
}

async function handleDelete(req, res, apiDefinition) {
    return executeApiQuery(req, res, apiDefinition, buildDeleteSQL, 200);
}

router.get('/:username/:projectname/:apiname{/*splat}', validateApiRoute, handleApiRequest);
router.post('/:username/:projectname/:apiname{/*splat}', validateApiRoute, handleApiRequest);
router.put('/:username/:projectname/:apiname{/*splat}', validateApiRoute, handleApiRequest);
router.delete('/:username/:projectname/:apiname{/*splat}', validateApiRoute, handleApiRequest);

module.exports = router;
