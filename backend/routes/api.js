const express = require('express');
const query = require('./../db/query');
const router = express.Router();
const { requireAuth } = require('./auth');
const pool = require('./../db/connection');
const withActor = require('./../db/withActor');
const { requireProjectAuthor } = require('./project');
const { requireProjectAccess } = require('./project');
const { isProjectActive } = require('./project');
const checkPlanLimit = require('./../utils/planLimitChecker');
const loadProjectCatalog = require('./../utils/projectCatalog');
const _ = require('lodash');

const VALID_JOIN_OPERATORS = new Set(['=', '!=', '<>', '<', '>', '<=', '>=']);
function isValidJoinOperator(op) {
  return typeof op === 'string' && VALID_JOIN_OPERATORS.has(op.trim());
}

const VALID_JOIN_TYPES = new Set(['inner', 'left', 'right', 'full']);
function isValidJoinType(type) {
  return typeof type === 'string' && VALID_JOIN_TYPES.has(type.trim().toLowerCase());
}

const VALID_AGG_FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
function isValidAggFunction(fn) {
  return typeof fn === 'string' && VALID_AGG_FUNCTIONS.has(fn.trim().toUpperCase());
}

const VALID_WHERE_OPERATORS = new Set(['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL', 'BETWEEN']);
function isValidOperator(op) {
  return typeof op === 'string' && VALID_WHERE_OPERATORS.has(op.trim());
}

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
function isSafeIdentifier(str) {
  return typeof str === 'string' && SAFE_IDENTIFIER.test(str);
}

function describeCol(col, alias) {
  if (!col) return null;
  return alias ? `${alias}.${col.column_name}` : col.column_name;
}

function describeTable(catalog, tableId) {
  const t = catalog.tableById.get(tableId);
  return t ? t.table_name : `table_id ${tableId}`;
}

function buildAliasMap(select_obj, join_obj_array, errors) {
  const aliasToTableId = new Map();

  function register(alias, tableId, context) {
    if (!alias) {
      errors.push(`${context} is missing table_alias`);
      return;
    }
    if (!isSafeIdentifier(alias)) {
      errors.push(`${context} table_alias "${alias}" contains invalid characters`);
      return;
    }
    if (aliasToTableId.has(alias) && aliasToTableId.get(alias) !== tableId) {
      errors.push(`duplicate table_alias "${alias}" used for different tables`);
      return;
    }
    aliasToTableId.set(alias, tableId);
  }

  register(select_obj.table_alias, select_obj.table_id, 'select_obj');
  join_obj_array.forEach((j, i) => register(j.alias, j.table_id, `join_obj_array[${i}]`));

  return aliasToTableId;
}

// single-table alias map for PUT/DELETE (mirrors buildAliasMap, but no joins)
function buildSingleTableAliasMap(table_alias, table_id, errors) {
  const aliasToTableId = new Map();
  if (!table_alias) {
    errors.push('table_alias is missing');
    return aliasToTableId;
  }
  if (!isSafeIdentifier(table_alias)) {
    errors.push(`table_alias "${table_alias}" contains invalid characters`);
    return aliasToTableId;
  }
  aliasToTableId.set(table_alias, table_id);
  return aliasToTableId;
}

function checkAlias(nodeTableAlias, col, aliasToTableId, errors, label) {
  if (!nodeTableAlias) {
    errors.push(`${label} is missing table_alias`);
    return;
  }
  const aliasTableId = aliasToTableId.get(nodeTableAlias);
  if (aliasTableId === undefined) {
    errors.push(`${label} table_alias "${nodeTableAlias}" does not match any FROM/JOIN alias`);
  } else if (aliasTableId !== col.schema_table_id) {
    errors.push(`${label} table_alias "${nodeTableAlias}" does not match the table that owns column "${col.column_name}"`);
  }
}

function validatePagingVal(val, errors, label, max) {
  if (val == null) return;
  if (typeof val === 'number' || typeof val === 'string') {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0 || (max != null && n > max)) {
      errors.push(max != null
        ? `${label} must be a non-negative integer no greater than ${max}`
        : `${label} must be a non-negative integer`);
    }
    return;
  }
  if (typeof val !== 'object') {
    errors.push(`${label} is invalid`);
    return;
  }
  validateDynamicVal(val, errors, label, { data_type: 'integer' });
  if (val.fallback_value !== undefined && val.fallback_value !== null && val.fallback_value !== '') {
    const n = Number(val.fallback_value);
    if (!Number.isInteger(n) || n < 0 || (max != null && n > max)) {
      errors.push(max != null
        ? `${label} fallback_value must be a non-negative integer no greater than ${max}`
        : `${label} fallback_value must be a non-negative integer`);
    }
  }
}

function validateDynamicVal(val, errors, label, col) {
  if (!val) { errors.push(`${label} is missing`); return; }
  if (val.is_dynamic) {
    if (!['query_param', 'body', 'route_param'].includes(val.dynamic_value_getting_type)) {
      errors.push(`${label}: invalid dynamic_value_getting_type`);
    }
    if (!val.dynamic_field_name) {
      errors.push(`${label}: dynamic_field_name required when is_dynamic is true`);
    }
    if (!val.is_dynamic_required && val.fallback_value === undefined) {
      errors.push(`${label}: fallback_value required when field is optional`);
    }
  } else if (val.fallback_value === undefined) {
    errors.push(`${label}: static value provided but fallback_value is empty`);
  }

  if (col && val.fallback_value !== undefined && val.fallback_value !== null) {
    const result = typeMatchesColumn(val.fallback_value, col.data_type);
    if (result !== true) errors.push(`${label}: ${result}`);
  }
}

const INT_RE = /^-?\d+$/;

function typeMatchesColumn(value, pgType) {
  if (value === undefined || value === null) return true;

  const t = String(pgType || '').toLowerCase().trim();

  // boolean
  if (t === 'boolean') {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return true;
    return `expected a boolean (true/false) for column of type ${pgType}`;
  }

  // integer
  if (t === 'integer') {
    if (typeof value === 'number' && Number.isInteger(value)) return true;
    if (typeof value === 'string' && INT_RE.test(value.trim())) return true;
    return `expected an integer for column of type ${pgType}`;
  }

  // numeric
  if (t === 'numeric') {
    if (typeof value === 'number' && Number.isFinite(value)) return true;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return true;
    return `expected a number for column of type ${pgType}`;
  }

  // date
  if (t === 'date') {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      const d = new Date(value.trim());
      if (!isNaN(d.getTime())) return true;
    }
    return `expected a DATE (YYYY-MM-DD) for column of type ${pgType}`;
  }

  // timestamp
  if (t === 'timestamp') {
    if (typeof value === 'string') {
      const d = new Date(value.trim());
      if (!isNaN(d.getTime())) return true;
    }
    return `expected a valid TIMESTAMP for column of type ${pgType}`;
  }

  // text / varchar
  if (t === 'text' || t === 'varchar') {
    if (typeof value === 'string') return true;
    if (typeof value === 'number' || typeof value === 'boolean') return true;
    return `expected a string for column of type ${pgType}`;
  }

  return true;
}

const ALLOWED_OPERATORS = new Set(['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL', 'BETWEEN']);

function validateWhereArray(nodes, catalog, scopedTableIds, aliasToTableId, errors, depth = 0) {
  if (depth > 10) { errors.push('where clause nested too deeply'); return; }

  nodes.forEach((node, i) => {
    if (i > 0 && !['and', 'or'].includes((node.logical_operator || '').toLowerCase())) {
      errors.push(`invalid logical_operator at index ${i}: ${node.logical_operator}`);
    }

    if (node.node_type === 'group') {
      if (!Array.isArray(node.children) || node.children.length === 0) {
        errors.push('group node must have non-empty children');
      } else {
        validateWhereArray(node.children, catalog, scopedTableIds, aliasToTableId, errors, depth + 1);
      }
      return;
    }

    if (node.node_type !== 'condition') {
      errors.push(`unknown node_type: ${node.node_type}`);
      return;
    }

    const col = catalog.colById.get(node.col_id);
    if (!col) { errors.push(`where col_id ${node.col_id} not found`); return; }
    if (!scopedTableIds.has(col.schema_table_id)) {
      errors.push(`where column "${describeCol(col, node.table_alias)}" is out of FROM/JOIN scope`); return;
    }
    checkAlias(node.table_alias, col, aliasToTableId, errors, `where column "${describeCol(col, node.table_alias)}"`);
    if (!ALLOWED_OPERATORS.has(node.operator)) {
      errors.push(`invalid where operator: ${node.operator}`); return;
    }
    if (!['IS NULL', 'IS NOT NULL'].includes(node.operator)) {
      validateDynamicVal(node.val1, errors, 'val1', col);
    }
    if (node.operator === 'BETWEEN') {
      validateDynamicVal(node.val2, errors, 'val2', col);
    }
  });
}

function validateSelectPayload(payload, catalog) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return ['payload must be an object'];
  }

  const select_obj = payload.select_obj;
  const join_obj_array = payload.join_obj_array ?? [];
  const where = payload.where ?? [];
  const group_by_cols_array = payload.group_by_cols_array ?? [];
  const having = payload.having ?? [];
  const order_by_array = payload.order_by_array ?? [];

  if (!select_obj || typeof select_obj !== 'object') {
    errors.push('select_obj is required');
    return errors;
  }
  if (select_obj.table_id == null) {
    errors.push('select_obj.table_id is required');
  }
  if (!Array.isArray(select_obj.cols_obj_array) || select_obj.cols_obj_array.length === 0) {
    errors.push('select_obj.cols_obj_array must have at least one column');
  }

  if (!Array.isArray(join_obj_array)) errors.push('join_obj_array must be an array');
  if (!Array.isArray(where)) errors.push('where must be an array');
  if (!Array.isArray(group_by_cols_array)) errors.push('group_by_cols_array must be an array');
  if (!Array.isArray(having)) errors.push('having must be an array');
  if (!Array.isArray(order_by_array)) errors.push('order_by_array must be an array');

  if (select_obj.table_id == null || !Array.isArray(select_obj.cols_obj_array) || select_obj.cols_obj_array.length === 0) {
    return errors;
  }

  const aliasToTableId = buildAliasMap(select_obj, join_obj_array, errors);

  // table ownership
  const mainTable = catalog.tableById.get(select_obj.table_id);
  if (!mainTable) errors.push(`table_id ${select_obj.table_id} does not exist in this project`);

  const scopedTableIds = new Set([select_obj.table_id]);
  const scopedAliases = new Set([select_obj.table_alias]);

  for (const j of join_obj_array) {
    const joinTable = catalog.tableById.get(j.table_id);
    if (!joinTable) {
      errors.push(`join table_id ${j.table_id} not in project`);
      continue;
    }
    if (!isValidJoinType(j.type)) {
      errors.push(`join type ${j.type} is not valid`);
      continue;
    }
    if (!j.left || !j.left.table_alias || j.left.col_id == null || !j.right || !j.right.table_alias || j.right.col_id == null) {
      errors.push(`join on table "${joinTable.table_name}" (alias "${j.alias}") must specify left.table_alias, left.col_id, right.table_alias, right.col_id`);
      continue;
    }

    const leftCol = catalog.colById.get(j.left.col_id);
    const rightCol = catalog.colById.get(j.right.col_id);
    if (!leftCol || !rightCol) {
      const leftDesc = leftCol ? describeCol(leftCol, j.left.table_alias) : `col_id ${j.left.col_id}`;
      const rightDesc = rightCol ? describeCol(rightCol, j.right.table_alias) : `col_id ${j.right.col_id}`;
      errors.push(`join columns invalid: ${leftDesc}, ${rightDesc}`);
      continue;
    }

    // each column must actually belong to the table its stated alias points to
    checkAlias(j.left.table_alias, leftCol, aliasToTableId, errors, `join left column "${describeCol(leftCol, j.left.table_alias)}"`);
    checkAlias(j.right.table_alias, rightCol, aliasToTableId, errors, `join right column "${describeCol(rightCol, j.right.table_alias)}"`);

    // exactly one side must be THIS join's own alias (the newly introduced table);
    // either left or right can be the new one
    const leftIsNewAlias = j.left.table_alias === j.alias;
    const rightIsNewAlias = j.right.table_alias === j.alias;
    if (leftIsNewAlias === rightIsNewAlias) {
      errors.push(`join on table "${joinTable.table_name}" (alias "${j.alias}") must have exactly one side reference its own alias`);
      continue;
    }
    const otherAlias = leftIsNewAlias ? j.right.table_alias : j.left.table_alias;
    if (!scopedAliases.has(otherAlias)) {
      errors.push(`join on table "${joinTable.table_name}" (alias "${j.alias}") references alias "${otherAlias}" which is not yet in scope`);
      continue;
    }

    if (!isValidJoinOperator(j.join_operator)) {
      errors.push(`invalid join_operator: ${j.join_operator}`);
    }

    scopedTableIds.add(j.table_id);
    scopedAliases.add(j.alias);
  }

  // select cols
  const seenSelectAliases = new Set();
  for (const c of select_obj.cols_obj_array) {
    // is_select_all still needs a valid, in-scope table_alias to know which table's "*" is meant
    if (c.is_select_all) {
      if (!c.table_alias) {
        errors.push(`select is_select_all entry is missing table_alias`);
        continue;
      }
      if (!isSafeIdentifier(c.table_alias)) {
        errors.push(`select is_select_all table_alias "${c.table_alias}" contains invalid characters`);
        continue;
      }
      if (!scopedAliases.has(c.table_alias)) {
        errors.push(`select is_select_all table_alias "${c.table_alias}" is not in FROM/JOIN scope`);
      }
      continue;
    }

    const col = catalog.colById.get(c.col_id);
    if (!col) { errors.push(`select col_id ${c.col_id} not found`); continue; }
    if (!scopedTableIds.has(col.schema_table_id)) {
      errors.push(`select column "${describeCol(col, c.table_alias)}" belongs to a table not in FROM/JOIN scope`);
    }
    checkAlias(c.table_alias, col, aliasToTableId, errors, `select column "${describeCol(col, c.table_alias)}"`);

    if (c.alias) { // cols own alias
      if (!isSafeIdentifier(c.alias)) {
        errors.push(`select column "${describeCol(col, c.table_alias)}" output alias "${c.alias}" contains invalid characters`);
      } else if (seenSelectAliases.has(c.alias)) {
        errors.push(`duplicate select column alias "${c.alias}"`);
      } else {
        seenSelectAliases.add(c.alias);
      }
    }

    if (c.function && !isValidAggFunction(c.function)) {
      errors.push(`invalid aggregate function: ${c.function}`);
    }
  }

  validateWhereArray(where, catalog, scopedTableIds, aliasToTableId, errors);

  // group by / having
  for (const g of group_by_cols_array) {
    const col = catalog.colById.get(g.col_id);
    if (!col) { errors.push(`group_by col_id ${g.col_id} not found`); continue; }
    if (!scopedTableIds.has(col.schema_table_id)) {
      errors.push(`group_by column "${describeCol(col, g.table_alias)}" is out of FROM/JOIN scope`);
      continue;
    }
    checkAlias(g.table_alias, col, aliasToTableId, errors, `group_by column "${describeCol(col, g.table_alias)}"`);
  }

  // if group_by is non-empty, every non-aggregated select col must appear in group_by (classic SQL rule)
  if (group_by_cols_array.length > 0) {
    const groupedIds = new Set(group_by_cols_array.map(g => g.col_id));

    for (const c of select_obj.cols_obj_array) {
      if (c.is_select_all) {
        const tableId = aliasToTableId.get(c.table_alias);
        if (tableId == null) continue; // already reported as an error above

        const tableColIds = [];
        for (const col of catalog.colById.values()) {
          if (col.schema_table_id === tableId) tableColIds.push(col.id);
        }

        const groupedIdsForAlias = new Set(
          group_by_cols_array.filter(g => g.table_alias === c.table_alias).map(g => g.col_id)
        );

        const missing = tableColIds.filter(id => !groupedIdsForAlias.has(id));
        if (missing.length > 0) {
          const missingNames = missing.map(id => catalog.colById.get(id)?.column_name ?? `col_id ${id}`);
          errors.push(
            `select_obj.cols_obj_array: is_select_all (table_alias "${c.table_alias}") requires every column of the table in GROUP BY; missing column(s): ${missingNames.join(', ')}`
          );
        }
        continue;
      }

      if (!c.function && !groupedIds.has(c.col_id)) {
        const col = catalog.colById.get(c.col_id);
        const desc = col ? describeCol(col, c.table_alias) : `col_id ${c.col_id}`;
        errors.push(`column "${desc}" is selected without aggregation but missing from GROUP BY`);
      }
    }
  }

  for (const h of having) {
    const col = catalog.colById.get(h.col_id);
    if (!col) { errors.push(`having col_id ${h.col_id} not found`); continue; }
    if (!scopedTableIds.has(col.schema_table_id)) {
      errors.push(`having column "${describeCol(col, h.table_alias)}" is out of FROM/JOIN scope`);
      continue;
    }
    checkAlias(h.table_alias, col, aliasToTableId, errors, `having column "${describeCol(col, h.table_alias)}"`);
    if (!isValidAggFunction(h.function_name)) errors.push(`invalid having function: ${h.function_name}`);
    if (!isValidOperator(h.having_operator)) errors.push(`invalid having_operator: ${h.having_operator}`);
    validateDynamicVal(h, errors, 'having', col);
  }

  // order by
  for (const o of order_by_array) {
    const col = catalog.colById.get(o.col_id);
    if (!col) { errors.push(`order_by col_id ${o.col_id} not found`); continue; }
    if (!scopedTableIds.has(col.schema_table_id)) {
      errors.push(`order_by column "${describeCol(col, o.table_alias)}" is out of FROM/JOIN scope`);
      continue;
    }
    checkAlias(o.table_alias, col, aliasToTableId, errors, `order_by column "${describeCol(col, o.table_alias)}"`);
    if (!['asc', 'desc'].includes((o.order || '').toLowerCase())) {
      errors.push(`invalid order direction: ${o.order}`);
    }
  }

  const MAX_LIMIT = 1000;
  validatePagingVal(payload.limit, errors, 'limit', MAX_LIMIT);
  validatePagingVal(payload.offset, errors, 'offset', null);

  return errors;
}

// POST / PUT value object validation

const VALID_VALUE_SOURCES = new Set(['body_field', 'query_param', 'route_param', 'static_value']);
function isValidValueSource(source) {
  return typeof source === 'string' && VALID_VALUE_SOURCES.has(source.trim());
}

function validateValueObj(valObj, errors, label, col) {
  if (!valObj || typeof valObj !== 'object') { errors.push(`${label} is missing`); return; }

  if (!isValidValueSource(valObj.source)) {
    errors.push(`${label}: invalid source "${valObj.source}"`);
    return;
  }

  const source = valObj.source.trim();
  if (source === 'static_value') {
    if (valObj.is_dynamic === true) {
      errors.push(`${label}: source is static_value but is_dynamic is true`);
    }
    if (valObj.default_value === undefined || valObj.default_value === null) {
      errors.push(`${label}: default_value required when source is static_value`);
    }
  } else {
    if (valObj.is_dynamic === false) {
      errors.push(`${label}: source is "${source}" but is_dynamic is false`);
    }
    if (!valObj.dynamic_field_name) {
      errors.push(`${label}: dynamic_field_name required when source is "${source}"`);
    }
  }

  if (col && valObj.default_value !== undefined && valObj.default_value !== null) {
    const result = typeMatchesColumn(valObj.default_value, col.data_type);
    if (result !== true) errors.push(`${label}: ${result}`);
  }
}

function validateReturningCols(returning_cols_id, catalog, table_id, errors) {
  if (!Array.isArray(returning_cols_id)) {
    errors.push('returning_cols_id must be an array');
    return;
  }
  const tableName = describeTable(catalog, table_id);
  for (const colId of returning_cols_id) {
    const col = catalog.colById.get(colId);
    if (!col || col.schema_table_id !== table_id) {
      const colDesc = col ? col.column_name : `col_id ${colId}`;
      errors.push(`returning_cols_id: column "${colDesc}" invalid or not part of table "${tableName}"`);
    }
  }
}

// ---------- POST ----------

function validateInsertPayload(payload, catalog) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['payload must be an object'];

  if (payload.table_id == null) {
    errors.push('table_id is required');
    return errors;
  }
  const table = catalog.tableById.get(payload.table_id);
  if (!table) {
    errors.push(`table_id ${payload.table_id} does not exist in this project`);
    return errors;
  }

  const column_id_array = payload.column_id_array;
  const value_obj_array = payload.value_obj_array;

  if (!Array.isArray(column_id_array) || column_id_array.length === 0) {
    errors.push('column_id_array must be a non-empty array');
  }
  if (!Array.isArray(value_obj_array) || value_obj_array.length === 0) {
    errors.push('value_obj_array must be a non-empty array');
  }
  if (!Array.isArray(column_id_array) || !Array.isArray(value_obj_array)) {
    return errors;
  }

  const validColIds = new Set();
  column_id_array.forEach((colId, i) => {
    const col = catalog.colById.get(colId);
    if (!col) { errors.push(`column_id_array[${i}]: col_id ${colId} not found`); return; }
    if (col.schema_table_id !== payload.table_id) {
      errors.push(`column_id_array[${i}]: column "${col.column_name}" does not belong to table "${table.table_name}"`);
      return;
    }
    if (validColIds.has(colId)) {
      errors.push(`column_id_array[${i}]: duplicate column "${col.column_name}"`);
      return;
    }
    validColIds.add(colId);
  });

  if (value_obj_array.length !== column_id_array.length) {
    errors.push(`value_obj_array length (${value_obj_array.length}) must match column_id_array length (${column_id_array.length})`);
  }

  const seenValueColIds = new Set();
  value_obj_array.forEach((v, i) => {
    if (!v || v.col_id == null) { errors.push(`value_obj_array[${i}] is missing col_id`); return; }
    const col = catalog.colById.get(v.col_id);
    const colDesc = col ? col.column_name : `col_id ${v.col_id}`;
    if (!validColIds.has(v.col_id)) {
      errors.push(`value_obj_array[${i}]: column "${colDesc}" is not present in column_id_array`);
    }
    if (seenValueColIds.has(v.col_id)) {
      errors.push(`value_obj_array[${i}]: duplicate column "${colDesc}"`);
    }
    seenValueColIds.add(v.col_id);

    validateValueObj(v, errors, `value_obj_array[${i}] (column "${colDesc}")`, col);
  });

  validateReturningCols(payload.returning_cols_id ?? [], catalog, payload.table_id, errors);

  return errors;
}

// ---------- PUT ----------

function validateUpdatePayload(payload, catalog) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['payload must be an object'];

  if (payload.table_id == null) {
    errors.push('table_id is required');
    return errors;
  }
  const table = catalog.tableById.get(payload.table_id);
  if (!table) {
    errors.push(`table_id ${payload.table_id} does not exist in this project`);
    return errors;
  }

  const value_obj_array = payload.value_obj_array;
  const where = payload.where ?? [];

  if (!Array.isArray(value_obj_array) || value_obj_array.length === 0) {
    errors.push('value_obj_array must be a non-empty array');
  } else {
    const seenColIds = new Set();
    value_obj_array.forEach((v, i) => {
      if (!v || v.col_id == null) { errors.push(`value_obj_array[${i}] is missing col_id`); return; }
      const col = catalog.colById.get(v.col_id);
      if (!col) { errors.push(`value_obj_array[${i}]: col_id ${v.col_id} not found`); return; }
      if (col.schema_table_id !== payload.table_id) {
        errors.push(`value_obj_array[${i}]: column "${col.column_name}" does not belong to table "${table.table_name}"`);
        return;
      }
      if (seenColIds.has(v.col_id)) {
        errors.push(`value_obj_array[${i}]: duplicate column "${col.column_name}"`);
      }
      seenColIds.add(v.col_id);
      validateValueObj(v, errors, `value_obj_array[${i}] (column "${col.column_name}")`, col);
    });
  }

  const aliasToTableId = buildSingleTableAliasMap(payload.table_alias, payload.table_id, errors);
  const scopedTableIds = new Set([payload.table_id]);

  if (!Array.isArray(where)) {
    errors.push('where must be an array');
  } else if (where.length === 0) {
    // Prevents an accidental full-table update — remove this check if you want to allow it explicitly.
    errors.push('where must not be empty for an update');
  } else {
    validateWhereArray(where, catalog, scopedTableIds, aliasToTableId, errors);
  }

  validateReturningCols(payload.returning_cols_id ?? [], catalog, payload.table_id, errors);

  return errors;
}

// ---------- DELETE ----------

function validateDeletePayload(payload, catalog) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['payload must be an object'];

  if (payload.table_id == null) {
    errors.push('table_id is required');
    return errors;
  }
  if (!catalog.tableById.get(payload.table_id)) {
    errors.push(`table_id ${payload.table_id} does not exist in this project`);
    return errors;
  }

  const where = payload.where ?? [];
  const aliasToTableId = buildSingleTableAliasMap(payload.table_alias, payload.table_id, errors);
  const scopedTableIds = new Set([payload.table_id]);

  if (!Array.isArray(where)) {
    errors.push('where must be an array');
  } else if (where.length === 0) {
    // Prevents an accidental full-table delete — remove this check if you want to allow it explicitly.
    errors.push('where must not be empty for a delete');
  } else {
    validateWhereArray(where, catalog, scopedTableIds, aliasToTableId, errors);
  }

  validateReturningCols(payload.returning_cols_id ?? [], catalog, payload.table_id, errors);

  return errors;
}

function addFirst(map, id, context) {
  if (id == null || map.has(id)) return;
  map.set(id, context);
}

function collectWhereCols(nodes, columns) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.node_type === 'group') {
      collectWhereCols(node.children, columns);
      continue;
    }
    if (node.node_type === 'condition') {
      addFirst(columns, node.col_id, 'where');
    }
  }
}

function collectApiDependencies(method, payload, catalog) {
  const tables = new Map();
  const columns = new Map();
  if (!payload || typeof payload !== 'object') return { tables, columns };

  if (method === 'GET') {
    const select_obj = payload.select_obj || {};
    addFirst(tables, select_obj.table_id, 'from');
    const join_obj_array = Array.isArray(payload.join_obj_array) ? payload.join_obj_array : [];
    for (const j of join_obj_array) {
      if (j) addFirst(tables, j.table_id, 'join');
    }

    const aliasToTableId = new Map();
    if (select_obj.table_alias != null) aliasToTableId.set(select_obj.table_alias, select_obj.table_id);
    for (const j of join_obj_array) {
      if (j && j.alias != null) aliasToTableId.set(j.alias, j.table_id);
    }

    const cols_obj_array = Array.isArray(select_obj.cols_obj_array) ? select_obj.cols_obj_array : [];
    for (const c of cols_obj_array) {
      if (!c) continue;
      if (c.is_select_all) {
        const tableId = aliasToTableId.get(c.table_alias);
        if (tableId != null && catalog && catalog.colById) {
          for (const col of catalog.colById.values()) {
            if (col.schema_table_id === tableId) addFirst(columns, col.id, 'select');
          }
        }
        continue;
      }
      addFirst(columns, c.col_id, 'select');
    }
    for (const j of join_obj_array) {
      if (!j) continue;
      if (j.left) addFirst(columns, j.left.col_id, 'join');
      if (j.right) addFirst(columns, j.right.col_id, 'join');
    }
    collectWhereCols(payload.where, columns);
    const group_by_cols_array = Array.isArray(payload.group_by_cols_array) ? payload.group_by_cols_array : [];
    for (const g of group_by_cols_array) {
      if (g) addFirst(columns, g.col_id, 'group_by');
    }
    const having = Array.isArray(payload.having) ? payload.having : [];
    for (const h of having) {
      if (h) addFirst(columns, h.col_id, 'having');
    }
    const order_by_array = Array.isArray(payload.order_by_array) ? payload.order_by_array : [];
    for (const o of order_by_array) {
      if (o) addFirst(columns, o.col_id, 'order_by');
    }
  } else if (method === 'POST') {
    addFirst(tables, payload.table_id, 'target');
    const column_id_array = Array.isArray(payload.column_id_array) ? payload.column_id_array : [];
    for (const colId of column_id_array) {
      addFirst(columns, colId, 'insert');
    }
    const returning_cols_id = Array.isArray(payload.returning_cols_id) ? payload.returning_cols_id : [];
    for (const colId of returning_cols_id) {
      addFirst(columns, colId, 'returning');
    }
  } else if (method === 'PUT') {
    addFirst(tables, payload.table_id, 'target');
    const value_obj_array = Array.isArray(payload.value_obj_array) ? payload.value_obj_array : [];
    for (const v of value_obj_array) {
      if (v) addFirst(columns, v.col_id, 'set');
    }
    collectWhereCols(payload.where, columns);
    const returning_cols_id = Array.isArray(payload.returning_cols_id) ? payload.returning_cols_id : [];
    for (const colId of returning_cols_id) {
      addFirst(columns, colId, 'returning');
    }
  } else if (method === 'DELETE') {
    addFirst(tables, payload.table_id, 'target');
    collectWhereCols(payload.where, columns);
    const returning_cols_id = Array.isArray(payload.returning_cols_id) ? payload.returning_cols_id : [];
    for (const colId of returning_cols_id) {
      addFirst(columns, colId, 'returning');
    }
  }

  return { tables, columns };
}

router.post('/create', requireAuth, requireProjectAccess, isProjectActive, async (req, res) => {
  const proj_id = (req.params.projectId ? req.params.projectId : req.query.projectId);
  const api_name = (req.params.api_name ? req.params.api_name : req.query.api_name);
  const method = (req.params.method ? req.params.method : req.query.method);
  if (!api_name || !method) {
    return res.status(400).json({ msg: "You should insert api_name and method with your request" });
  }
  if (!/^[a-z][a-z0-9_]{0,29}$/.test(api_name)) {
    return res.status(400).json({ msg: `Please give a valid name using only a-z, A-Z, 0-9 and _` });
  }
  const method_upper = _.toUpper(method.trim());
  if (!["POST", "GET", "PUT", "DELETE"].includes(method_upper)) {
    return res.status(400).json({ msg: `Invalid method name` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await client.query('SELECT set_config(\'app.current_user_id\', $1, true)', [String(req.loggedInUser.id)]);
    await checkPlanLimit(client, req.projectAuthorId, 'api', proj_id);
    const projectCatalog = await loadProjectCatalog(client, proj_id);

    let errors = [];
    if (method_upper === "GET") {
      errors = validateSelectPayload(req.body, projectCatalog);
    } else if (method_upper === "POST") {
      errors = validateInsertPayload(req.body, projectCatalog);
    } else if (method_upper === "PUT") {
      errors = validateUpdatePayload(req.body, projectCatalog);
    } else if (method_upper === "DELETE") {
      errors = validateDeletePayload(req.body, projectCatalog);
    }
    if (errors.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ valid: false, errors });
    }

    const deps = collectApiDependencies(method_upper, req.body, projectCatalog);
    const inserted = await client.query(`
      INSERT INTO api_definitions
          (name, project_id, method, query_definition, rate_limit_per_day)
      VALUES
          ($1, $2, $3, $4, $5)
      RETURNING id;`, [api_name, proj_id, method_upper, req.body, 1000]);
    const apiId = inserted.rows[0].id;

    if (deps.tables.size > 0) {
      await client.query(`
        INSERT INTO api_table_dependencies (api_definition_id, schema_table_id, usage_context)
        SELECT $1, x.schema_table_id, x.usage_context
        FROM unnest($2::int[], $3::text[]) AS x(schema_table_id, usage_context)
      `, [apiId, [...deps.tables.keys()], [...deps.tables.values()]]);
    }
    if (deps.columns.size > 0) {
      await client.query(`
        INSERT INTO api_column_dependencies (api_definition_id, schema_col_id, usage_context)
        SELECT $1, x.schema_col_id, x.usage_context
        FROM unnest($2::int[], $3::text[]) AS x(schema_col_id, usage_context)
      `, [apiId, [...deps.columns.keys()], [...deps.columns.values()]]);
    }

    await client.query('COMMIT');
    return res.status(200).json({ valid: true, msg: "Api definition added successfully" });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(e.status || 500).json({ msg: e.status ? e.message : 'There was a server side error, please try again later' });
  } finally {
    client.release();
  }

});

module.exports = router;