const { isDescribe, resolveVal, resolvePagingVal } = require('./resolve.value');

function qi(identifier) {
    return `"${identifier}"`;
}

function colExpr(tableAlias, colRow) {
    return `${qi(tableAlias)}.${qi(colRow.column_name)}`;
}


function buildConditionSQL(node, catalog, req, values, options) {
    if (node.node_type === 'group') {
        const parts = node.children.map((child, i) => {
            const sql = buildConditionSQL(child, catalog, req, values, options);
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
        const v1 = resolveVal(node.val1, req, `where col_id ${node.col_id}`, options);
        const v2 = resolveVal(node.val2, req, `where col_id ${node.col_id}`, options);
        values.push(v1, v2);
        return `${expr} BETWEEN $${values.length - 1} AND $${values.length}`;
    }

    if (op === 'IN' || op === 'NOT IN') {
        let v = resolveVal(node.val1, req, `where col_id ${node.col_id}`, options);
        if (!Array.isArray(v)) v = [v];
        const placeholders = v.map(item => {
            values.push(item);
            return `$${values.length}`;
        });
        return `${expr} ${op} (${placeholders.join(', ')})`;
    }

    const v = resolveVal(node.val1, req, `where col_id ${node.col_id}`, options);
    values.push(v);
    return `${expr} ${op} $${values.length}`;
}

function buildWhereSQL(whereArray, catalog, req, values, options) {
    if (!whereArray.length) return '';
    const parts = whereArray.map((node, i) => {
        const sql = buildConditionSQL(node, catalog, req, values, options);
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

function buildSelectSQL(payload, catalog, req, options) {
    const values = [];
    const select_obj = payload.select_obj;
    const join_obj_array = payload.join_obj_array ?? [];
    const where = payload.where ?? [];
    const group_by_cols_array = payload.group_by_cols_array ?? [];
    const having = payload.having ?? [];
    const order_by_array = payload.order_by_array ?? [];

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

    const mainTable = catalog.tableById.get(select_obj.table_id);
    let sql = `SELECT ${selectParts.join(', ')} FROM ${qi(mainTable.table_name)} AS ${qi(select_obj.table_alias)}`;

    for (const j of join_obj_array) {
        const joinTable = catalog.tableById.get(j.table_id);
        const leftCol = catalog.colById.get(j.left.col_id);
        const rightCol = catalog.colById.get(j.right.col_id);
        const leftExpr = colExpr(j.left.table_alias, leftCol);
        const rightExpr = colExpr(j.right.table_alias, rightCol);
        sql += ` ${j.type.toUpperCase()} JOIN ${qi(joinTable.table_name)} AS ${qi(j.alias)} ON ${leftExpr} ${j.join_operator} ${rightExpr}`;
    }

    const whereSQL = buildWhereSQL(where, catalog, req, values, options);
    if (whereSQL) sql += ` ${whereSQL}`;

    if (group_by_cols_array.length) {
        const groupParts = group_by_cols_array.map(g => {
            const col = catalog.colById.get(g.col_id);
            return colExpr(g.table_alias, col);
        });
        sql += ` GROUP BY ${groupParts.join(', ')}`;
    }

    if (having.length) {
        const havingParts = having.map((h, i) => {
            const col = catalog.colById.get(h.col_id);
            const expr = `${h.function_name.toUpperCase()}(${colExpr(h.table_alias, col)})`;
            const v = resolveVal(h, req, `having col_id ${h.col_id}`, options);
            values.push(v);
            const clause = `${expr} ${h.having_operator} $${values.length}`;
            return i === 0 ? clause : ` ${h.logical_operator.toUpperCase()} ${clause}`;
        });
        sql += ` HAVING ${havingParts.join('')}`;
    }

    if (order_by_array.length) {
        const orderParts = order_by_array.map(o => {
            const col = catalog.colById.get(o.col_id);
            return `${colExpr(o.table_alias, col)} ${o.order.toUpperCase()}`;
        });
        sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    if (payload.limit != null) {
        const rawLimit = resolvePagingVal(payload.limit, req, 'limit', options);
        const limit = isDescribe(options) ? rawLimit : coercePaginationInt(rawLimit, 'limit');
        values.push(limit);
        sql += ` LIMIT $${values.length}`;
    }
    if (payload.offset != null) {
        const rawOffset = resolvePagingVal(payload.offset, req, 'offset', options);
        const offset = isDescribe(options) ? rawOffset : coercePaginationInt(rawOffset, 'offset');
        values.push(offset);
        sql += ` OFFSET $${values.length}`;
    }
    return { text: sql, values };
}

module.exports = { buildSelectSQL, qi, colExpr, buildWhereSQL };
