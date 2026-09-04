const express = require('express');
const query = require('./../db/query');
const router = express.Router();
const { requireAuth } = require('./auth');
const pool = require('./../db/connection');
const { requireProjectAuthor } = require('./project');
const { requireProjectAccess } = require('./project');
const { isProjectActive } = require('./project');
const checkPlanLimit = require('./../utils/planLimitChecker');
const loadProjectCatalog = require('./../utils/projectCatalog');
const buildSelectSQL = require('./../utils/build.sql.select');
const _ = require('lodash');
const bcrypt = require('bcrypt');

async function validateApiRoute(req, res, next) {
    const { username, projectname, apiname } = req.params;

    try {
        const result = await query(`
            SELECT
                a.id AS api_id,
                a.method,
                a.is_active AS api_is_active,
                a.query_definition,
                p.id AS project_id,
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

        if (apiDefinition.method.toUpperCase() !== req.method) {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        if (!apiDefinition.api_is_active) {
            return res.status(404).json({ error: 'API is not active' });
        }

        if (apiDefinition.auth_enabled) {
            const providedKey = req.header('x-api-key');

            if (!providedKey) {
                return res.status(401).json({ error: 'API key required' });
            }

            const isValidKey = await bcrypt.compare(providedKey, apiDefinition.api_key_hashed);

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
                return res.status(501).json({ error: 'Not implemented yet' });
            case 'PUT':
                return res.status(501).json({ error: 'Not implemented yet' });
            case 'DELETE':
                return res.status(501).json({ error: 'Not implemented yet' });
        }
    } catch (err) {
        console.error('handleApiRequest error:', err);
        const status = err.status || 500;
        res.status(status).json({ error: err.message || 'Internal server error' });
    }
}

async function handleGet(req, res, apiDefinition) {
    const catalog = await loadProjectCatalog(apiDefinition.project_id);

    // apiDefinition.query_definition is the JSONB payload describing the SELECT
    const { text, values } = buildSelectSQL(apiDefinition.query_definition, catalog, req);

    const client = await pool.connect();
    try {
        // Scope this connection to the project's own Postgres schema
        await client.query(
            `SET search_path TO ${JSON.stringify(`proj_${apiDefinition.project_id}_${apiDefinition.author_id}`)}`
        );

        const result = await client.query(text, values);
        res.status(200).json(result.rows);
    } finally {
        client.release();
    }
}

module.exports = handleApiRequest;


router.get('/:username/:projectname/:apiname', validateApiRoute, handleApiRequest);
router.post('/:username/:projectname/:apiname', validateApiRoute, handleApiRequest);
router.put('/:username/:projectname/:apiname', validateApiRoute, handleApiRequest);
router.delete('/:username/:projectname/:apiname', validateApiRoute, handleApiRequest);


module.exports = router;