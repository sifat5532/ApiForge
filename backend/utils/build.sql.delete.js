const { qi, colExpr, buildWhereSQL } = require('./build.sql.select');

function buildDeleteSQL(payload, catalog, req, options) {
    const values = [];
    const table = catalog.tableById.get(payload.table_id);
    const table_alias = payload.table_alias;
    const where = payload.where ?? [];
    const returning_cols_id = payload.returning_cols_id ?? [];

    let sql = `DELETE FROM ${qi(table.table_name)} AS ${qi(table_alias)}`;

    const whereSQL = buildWhereSQL(where, catalog, req, values, options);
    if (whereSQL) sql += ` ${whereSQL}`;

    if (returning_cols_id.length) {
        const returningParts = returning_cols_id.map(colId => colExpr(table_alias, catalog.colById.get(colId)));
        sql += ` RETURNING ${returningParts.join(', ')}`;
    }

    return { text: sql, values };
}

module.exports = { buildDeleteSQL };
