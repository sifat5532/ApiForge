async function loadProjectCatalog(pgClient, projectId) {
  const tables = await pgClient.query(
    `SELECT id, table_name FROM schema_tables WHERE project_id = $1`,
    [projectId]
  );
  const columns = await pgClient.query(
    `SELECT id, schema_table_id, col_name AS column_name, col_type AS data_type
     FROM schema_columns WHERE schema_table_id = ANY($1::int[])`,
    [tables.rows.map(t => t.id)]
  );

  return {
    tableById: new Map(tables.rows.map(t => [t.id, t])),
    colById: new Map(columns.rows.map(c => [c.id, c])),
    colsByTable: _.groupBy(columns.rows, 'schema_table_id')
  };
}

module.exports = loadProjectCatalog;