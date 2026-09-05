function getDynamicSource(req, type, fieldName) {
    if (type === 'query_param') return req.query ? req.query[fieldName] : undefined;
    if (type === 'body') return req.body ? req.body[fieldName] : undefined;
    if (type === 'route_param') return req.params ? req.params[fieldName] : undefined;
    return undefined;
}

function resolveVal(valObj, req, label) {
    if (!valObj.is_dynamic) {
        return valObj.fallback_value;
    }
    const fromRequest = getDynamicSource(req, valObj.dynamic_value_getting_type, valObj.dynamic_field_name);
    if (fromRequest !== undefined && fromRequest !== null && fromRequest !== '') {
        return fromRequest;
    }
    if (valObj.is_dynamic_required) {
        const err = new Error(`Missing required ${valObj.dynamic_value_getting_type} field "${valObj.dynamic_field_name}" for ${label}`);
        err.status = 400;
        throw err;
    }
    return valObj.fallback_value;
}

function qi(identifier) {
    return `"${identifier}"`;
}

function colExpr(tableAlias, colRow) {
    return `${qi(tableAlias)}.${qi(colRow.column_name)}`;
}


function buildConditionSQL(node, catalog, req, values) {
    if (node.node_type === 'group') {
        const parts = node.children.map((child, i) => {
            const sql = buildConditionSQL(child, catalog, req, values);
            return i === 0 ? sql : ` ${child.logical_operator.toUpperCase()} ${sql}`;
        });
        return `(${parts.join('')})`;
    }

    const col = catalog.colById.get(node.col_id);
    const expr = colExpr(node.table_alias, col);
    const op = node.operator;

    if (op === 'IS NULL' || op === 'IS NOT NULL') {
        return `${expr} ${op}`;
    }

    if (op === 'BETWEEN') {
        const v1 = resolveVal(node.val1, req, `where col_id ${node.col_id}`);
        const v2 = resolveVal(node.val2, req, `where col_id ${node.col_id}`);
        values.push(v1, v2);
        return `${expr} BETWEEN $${values.length - 1} AND $${values.length}`;
    }

    if (op === 'IN' || op === 'NOT IN') {
        let v = resolveVal(node.val1, req, `where col_id ${node.col_id}`);
        if (!Array.isArray(v)) v = [v]; // tolerate a single value sent for IN
        const placeholders = v.map(item => {
            values.push(item);
            return `$${values.length}`;
        });
        return `${expr} ${op} (${placeholders.join(', ')})`;
    }

    // =, !=, <>, <, >, <=, >=, LIKE, NOT LIKE
    const v = resolveVal(node.val1, req, `where col_id ${node.col_id}`);
    values.push(v);
    return `${expr} ${op} $${values.length}`;
}

function buildWhereSQL(whereArray, catalog, req, values) {
    if (!whereArray.length) return '';
    const parts = whereArray.map((node, i) => {
        const sql = buildConditionSQL(node, catalog, req, values);
        return i === 0 ? sql : ` ${node.logical_operator.toUpperCase()} ${sql}`;
    });
    return `WHERE ${parts.join('')}`;
}

function coercePaginationInt(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        const err = new Error(`Invalid value for ${label}: must be a non-negative integer`);
        err.status = 400;
        throw err;
    }
    return n;
}

// --- main builder ---

function buildSelectSQL(payload, catalog, req) {
    const values = [];
    const select_obj = payload.select_obj;
    const join_obj_array = payload.join_obj_array ?? [];
    const where = payload.where ?? [];
    const group_by_cols_array = payload.group_by_cols_array ?? [];
    const having = payload.having ?? [];
    const order_by_array = payload.order_by_array ?? [];

    // SELECT
    const selectParts = select_obj.cols_obj_array.map(c => {
        if (c.is_select_all) {
            return `${qi(c.table_alias)}.*`;
        }
        const col = catalog.colById.get(c.col_id);
        let expr = colExpr(c.table_alias, col);
        if (c.function) {
            expr = `${c.function.toUpperCase()}(${expr})`;
        }
        if (c.alias) {
            expr += ` AS ${qi(c.alias)}`;
        }
        return expr;
    });

    // FROM
    const mainTable = catalog.tableById.get(select_obj.table_id);
    let sql = `SELECT ${selectParts.join(', ')} FROM ${qi(mainTable.table_name)} AS ${qi(select_obj.table_alias)}`;

    // JOINS
    for (const j of join_obj_array) {
        const joinTable = catalog.tableById.get(j.table_id);
        const leftCol = catalog.colById.get(j.left.col_id);
        const rightCol = catalog.colById.get(j.right.col_id);
        const leftExpr = colExpr(j.left.table_alias, leftCol);
        const rightExpr = colExpr(j.right.table_alias, rightCol);
        sql += ` ${j.type.toUpperCase()} JOIN ${qi(joinTable.table_name)} AS ${qi(j.alias)} ON ${leftExpr} ${j.join_operator} ${rightExpr}`;
    }

    // WHERE
    const whereSQL = buildWhereSQL(where, catalog, req, values);
    if (whereSQL) sql += ` ${whereSQL}`;

    // GROUP BY
    if (group_by_cols_array.length) {
        const groupParts = group_by_cols_array.map(g => {
            const col = catalog.colById.get(g.col_id);
            return colExpr(g.table_alias, col);
        });
        sql += ` GROUP BY ${groupParts.join(', ')}`;
    }

    // HAVING
    if (having.length) {
        const havingParts = having.map((h, i) => {
            const col = catalog.colById.get(h.col_id);
            const expr = `${h.function_name.toUpperCase()}(${colExpr(h.table_alias, col)})`;
            const v = resolveVal(h, req, `having col_id ${h.col_id}`);
            values.push(v);
            const clause = `${expr} ${h.having_operator} $${values.length}`;
            return i === 0 ? clause : ` ${h.logical_operator.toUpperCase()} ${clause}`;
        });
        sql += ` HAVING ${havingParts.join('')}`;
    }

    // ORDER BY
    if (order_by_array.length) {
        const orderParts = order_by_array.map(o => {
            const col = catalog.colById.get(o.col_id);
            return `${colExpr(o.table_alias, col)} ${o.order.toUpperCase()}`;
        });
        sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // LIMIT / OFFSET
    if (payload.limit != null) {
        const rawLimit = resolveVal(payload.limit, req, 'limit');
        const limit = coercePaginationInt(rawLimit, 'limit');
        values.push(limit);
        sql += ` LIMIT $${values.length}`;
    }
    if (payload.offset != null) {
        const rawOffset = resolveVal(payload.offset, req, 'offset');
        const offset = coercePaginationInt(rawOffset, 'offset');
        values.push(offset);
        sql += ` OFFSET $${values.length}`;
    }

    return { text: sql, values };
}

module.exports = { buildSelectSQL, qi, colExpr, buildWhereSQL };