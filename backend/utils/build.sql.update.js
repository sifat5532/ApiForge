const { qi, colExpr, buildWhereSQL } = require('./build.sql.select');
const { resolveValueObj } = require('./resolve.value');

function buildUpdateSQL(payload, catalog, req, options) {
    const values = [];
    const table = catalog.tableById.get(payload.table_id);
    const table_alias = payload.table_alias;
    const value_obj_array = payload.value_obj_array;
    const where = payload.where ?? [];
    const returning_cols_id = payload.returning_cols_id ?? [];

    const setParts = value_obj_array.map(v => {
        const col = catalog.colById.get(v.col_id);
        const resolved = resolveValueObj(v, req, `col_id ${v.col_id}`, options);
        values.push(resolved);
        return `${qi(col.column_name)} = $${values.length}`;
    });

    let sql = `UPDATE ${qi(table.table_name)} AS ${qi(table_alias)} SET ${setParts.join(', ')}`;

    const whereSQL = buildWhereSQL(where, catalog, req, values, options);
    if (whereSQL) sql += ` ${whereSQL}`;

    if (returning_cols_id.length) {
        const returningParts = returning_cols_id.map(colId => colExpr(table_alias, catalog.colById.get(colId)));
        sql += ` RETURNING ${returningParts.join(', ')}`;
    }

    return { text: sql, values };
}

module.exports = { buildUpdateSQL };
