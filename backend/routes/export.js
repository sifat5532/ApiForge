const express = require('express');
const pool = require('./../db/connection');
const { requireAuth } = require('./auth');
const { requireProjectAccess } = require('./project');
const { buildSelectSQL } = require('./../utils/build.sql.select');
const { buildInsertSQL } = require('./../utils/build.sql.insert');
const { buildUpdateSQL } = require('./../utils/build.sql.update');
const { buildDeleteSQL } = require('./../utils/build.sql.delete');

const router = express.Router();

const DESCRIBE_OPTIONS = { mode: 'describe' };

const BUILDERS = {
    GET: buildSelectSQL,
    POST: buildInsertSQL,
    PUT: buildUpdateSQL,
    DELETE: buildDeleteSQL
};

function formatColLine(col) {
    const parts = [col.col_name, col.col_type];
    if (col.col_length != null) parts[1] += `(${col.col_length})`;
    if (col.is_primary_key) parts.push('PRIMARY KEY');
    if (col.is_auto_increment) parts.push('AUTO INCREMENT');
    if (col.is_unique) parts.push('UNIQUE');
    parts.push(col.is_nullable ? 'NULL' : 'NOT NULL');
    if (col.default_value !== undefined && col.default_value !== null && col.default_value !== '') {
        parts.push(`DEFAULT ${col.default_value}`);
    }
    return `  - ${parts.join(' ')}`;
}

function safeFilename(name) {
    const cleaned = String(name || 'project').replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned || 'project';
}

function frontEndBase() {
    return String(process.env.FRONT_END_URL || '').trim().replace(/\/+$/, '');
}

function buildCatalog(tables, columnsByTable) {
    const allCols = [];
    for (const cols of columnsByTable.values()) {
        for (const c of cols) {
            allCols.push({
                id: c.id,
                schema_table_id: c.schema_table_id,
                column_name: c.col_name,
                data_type: c.col_type
            });
        }
    }
    return {
        tableById: new Map(tables.map(t => [t.id, t])),
        colById: new Map(allCols.map(c => [c.id, c]))
    };
}

function describeApi(api, catalog, username, projectName) {
    const method = String(api.method || '').toUpperCase();
    const url = `${frontEndBase()}/${username}/${projectName}/${api.name}`;
    const lines = [
        `Api name: ${api.name}`,
        `Api url: ${url}`,
        `Method: ${method}`
    ];

    const builder = BUILDERS[method];
    if (!builder) {
        lines.push('Sql: unsupported method');
        lines.push('Params: []');
        return lines.join('\n');
    }

    try {
        const { text, values } = builder(api.query_definition, catalog, null, DESCRIBE_OPTIONS);
        lines.push(`Sql: ${text}`);
        lines.push(`Params: [${values.join(', ')}]`);
    } catch (err) {
        lines.push(`Sql: could not build SQL (${err.message})`);
        lines.push('Params: []');
    }

    return lines.join('\n');
}

router.get('/:projectId', requireAuth, requireProjectAccess, async (req, res) => {
    const projectId = req.params.projectId;
    const client = await pool.connect();

    try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');

        const projectRes = await client.query(
            `SELECT name, auth_enabled, author_id
             FROM projects
             WHERE id = $1 AND is_template = $2`,
            [projectId, false]
        );
        if (projectRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ msg: 'Project not found' });
        }
        const project = projectRes.rows[0];

        const userRes = await client.query(
            `SELECT username FROM users WHERE id = $1`,
            [project.author_id]
        );
        const username = userRes.rows[0] ? userRes.rows[0].username : 'unknown';

        const tablesRes = await client.query(
            `SELECT id, table_name
             FROM schema_tables
             WHERE project_id = $1
             ORDER BY id`,
            [projectId]
        );
        const tables = tablesRes.rows;

        const columnsByTable = new Map();
        for (const table of tables) {
            const colsRes = await client.query(
                `SELECT id, schema_table_id, col_name, col_type, default_value, col_length,
                        is_primary_key, is_auto_increment, is_nullable, is_unique
                 FROM schema_columns
                 WHERE schema_table_id = $1
                 ORDER BY is_primary_key DESC, id ASC`,
                [table.id]
            );
            columnsByTable.set(table.id, colsRes.rows);
        }

        const fksRes = await client.query(
            `SELECT
                fk.fk_name,
                fk.on_delete,
                fk.on_update,
                cc.col_name AS child_col_name,
                ct.table_name AS child_table_name,
                pc.col_name AS parent_col_name,
                pt.table_name AS parent_table_name
             FROM schema_foreign_keys fk
             JOIN schema_columns cc ON cc.id = fk.child_col_id
             JOIN schema_tables ct ON ct.id = cc.schema_table_id
             JOIN schema_columns pc ON pc.id = fk.parent_col_id
             JOIN schema_tables pt ON pt.id = pc.schema_table_id
             WHERE ct.project_id = $1
             ORDER BY ct.table_name, fk.fk_name`,
            [projectId]
        );

        const apisRes = await client.query(
            `SELECT name, method, query_definition
             FROM api_definitions
             WHERE project_id = $1
             ORDER BY name`,
            [projectId]
        );

        await client.query('COMMIT');

        const lines = [];
        lines.push(`Project name: ${project.name}`);
        lines.push(`Auth enabled: ${project.auth_enabled === true ? 'yes' : 'no'}`);
        lines.push('');
        lines.push('How to call APIs:');
        lines.push('Send requests to the Api url using the listed Method.');
        lines.push('If auth is enabled for the project, include the project API key in the x-api-key header on every request.');
        lines.push('Example: x-api-key: <your-api-key>');
        lines.push('Route params are extra path segments after the api name, in the order they appear in Params.');
        lines.push('Body params go in the JSON request body. Query params go in the URL query string.');
        lines.push('');

        lines.push('=== TABLES ===');
        if (tables.length === 0) {
            lines.push('No tables.');
        } else {
            for (const table of tables) {
                lines.push('');
                lines.push(`Table: ${table.table_name}`);
                const cols = columnsByTable.get(table.id) || [];
                if (cols.length === 0) {
                    lines.push('  (no columns)');
                } else {
                    for (const col of cols) {
                        lines.push(formatColLine(col));
                    }
                }
            }
        }

        lines.push('');
        lines.push('=== FOREIGN KEYS ===');
        if (fksRes.rows.length === 0) {
            lines.push('No foreign keys.');
        } else {
            for (const fk of fksRes.rows) {
                lines.push(
                    `${fk.fk_name}: ${fk.child_table_name}.${fk.child_col_name} -> ${fk.parent_table_name}.${fk.parent_col_name} ON DELETE ${fk.on_delete} ON UPDATE ${fk.on_update}`
                );
            }
        }

        const catalog = buildCatalog(tables, columnsByTable);
        lines.push('');
        lines.push('=== APIS ===');
        if (apisRes.rows.length === 0) {
            lines.push('No APIs.');
        } else {
            for (const api of apisRes.rows) {
                lines.push('');
                lines.push(describeApi(api, catalog, username, project.name));
            }
        }

        const body = lines.join('\n') + '\n';
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(project.name)}.txt"`);
        return res.status(200).send(body);
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) { /* ignore rollback errors */ }
        console.error(err);
        return res.status(500).json({ msg: 'There was a server side error, please try again later' });
    } finally {
        client.release();
    }
});

module.exports = router;
