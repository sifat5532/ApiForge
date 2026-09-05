const { qi } = require('./build.sql.select');

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

function buildInsertSQL(payload, catalog, req) {
    const values = [];
    const table = catalog.tableById.get(payload.table_id);
    const column_id_array = payload.column_id_array;
    const value_obj_array = payload.value_obj_array;
    const returning_cols_id = payload.returning_cols_id ?? [];

    const valueByColId = new Map(value_obj_array.map(v => [v.col_id, v]));

    const colNames = [];
    const placeholders = [];

    column_id_array.forEach(colId => {
        const col = catalog.colById.get(colId);
        const valObj = valueByColId.get(colId);
        const resolved = resolveValueObj(valObj, req, `col_id ${colId}`);
        colNames.push(qi(col.column_name));
        values.push(resolved);
        placeholders.push(`$${values.length}`);
    });

    let sql = `INSERT INTO ${qi(table.table_name)} (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;

    if (returning_cols_id.length) {
        const returningParts = returning_cols_id.map(colId => qi(catalog.colById.get(colId).column_name));
        sql += ` RETURNING ${returningParts.join(', ')}`;
    }

    return { text: sql, values };
}

module.exports = { buildInsertSQL };