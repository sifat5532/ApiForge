const { qi, colExpr, buildWhereSQL } = require('./build.sql.select');

function getValueSource(req, source, fieldName) {
    if (source === 'body_field') return req.body ? req.body[fieldName] : undefined;
    if (source === 'query_param') return req.query ? req.query[fieldName] : undefined;
    if (source === 'route_param') return req.params ? req.params[fieldName] : undefined;
    return undefined;
}

function resolveValueObj(valObj, req, label) {
    if (valObj.source === 'static_value') {
        return valObj.default_value;
    }
    const fromRequest = getValueSource(req, valObj.source, valObj.dynamic_field_name);
    if (fromRequest !== undefined && fromRequest !== null && fromRequest !== '') {
        return fromRequest;
    }
    if (valObj.default_value !== undefined && valObj.default_value !== null) {
        return valObj.default_value;
    }
    const err = new Error(`Missing required ${valObj.source} field "${valObj.dynamic_field_name}" for ${label}`);
    err.status = 400;
    throw err;
}

// main builder

function buildUpdateSQL(payload, catalog, req) {
    const values = [];
    const table = catalog.tableById.get(payload.table_id);
    const table_alias = payload.table_alias;
    const value_obj_array = payload.value_obj_array;
    const where = payload.where ?? [];
    const returning_cols_id = payload.returning_cols_id ?? [];

    // SET
    const setParts = value_obj_array.map(v => {
        const col = catalog.colById.get(v.col_id);
        const resolved = resolveValueObj(v, req, `col_id ${v.col_id}`);
        values.push(resolved);
        return `${qi(col.column_name)} = $${values.length}`;
    });

    let sql = `UPDATE ${qi(table.table_name)} AS ${qi(table_alias)} SET ${setParts.join(', ')}`;

    // WHERE
    const whereSQL = buildWhereSQL(where, catalog, req, values);
    if (whereSQL) sql += ` ${whereSQL}`;

    // RETURNING
    if (returning_cols_id.length) {
        const returningParts = returning_cols_id.map(colId => colExpr(table_alias, catalog.colById.get(colId)));
        sql += ` RETURNING ${returningParts.join(', ')}`;
    }

    return { text: sql, values };
}

module.exports = { buildUpdateSQL };