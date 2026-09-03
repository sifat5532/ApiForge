const express = require('express');
const query = require('./../db/query');
const pool = require('./../db/connection');
const { requireAuth } = require('./auth');
const router = express.Router();

router.get('/allProjects', requireAuth, async (req, res) => {

    const result = await query(`
                                WITH proj_logs AS (
                                    SELECT DISTINCT ON (pl.project_id)
                                        pl.project_id, u.name AS last_updater_name, pl.created_at AS last_updated_at
                                    FROM project_logs pl
                                    LEFT JOIN users u ON u.id = pl.changed_by
                                    ORDER BY pl.project_id, pl.created_at DESC
                                )
                                SELECT
                                    p.id,
                                    p.name,
                                    p.description,
                                    p.auth_enabled,
                                    p.is_clone,
                                    p.created_at,
                                    p.subscription_status,
                                    (SELECT COUNT(st.id) FROM schema_tables st WHERE st.project_id = P.id) AS total_tables,
                                    (SELECT COUNT(ad.id) FROM api_definitions ad WHERE ad.project_id = P.id) AS total_apis,
                                    COALESCE(plogs.last_updater_name, 'Deleted User') AS last_updater_name,
                                    COALESCE(plogs.last_updated_at, p.created_at) AS last_updated_at
                                FROM
                                    projects p
                                    LEFT JOIN proj_logs plogs ON plogs.project_id = p.id
                                WHERE
                                    p.is_template != TRUE
                                    AND p.author_id = $1
                                ORDER BY p.id DESC`,
        [req.loggedInUser.id]);

    res.status(200).json({ projects: result.rows });
});

router.get('/allContributingProjects', requireAuth, async (req, res) => {

    const result = await query(`
                                WITH proj_logs AS (
                                    SELECT DISTINCT ON (pl.project_id)
                                        pl.project_id, u.name AS last_updater_name, pl.created_at AS last_updated_at
                                    FROM project_logs pl
                                    LEFT JOIN users u ON u.id = pl.changed_by
                                    ORDER BY pl.project_id, pl.created_at DESC
                                )
                                SELECT
                                    p.id,
                                    p.name,
                                    p.description,
                                    p.auth_enabled,
                                    p.is_clone,
                                    p.created_at,
                                    p.subscription_status,
                                    (SELECT COUNT(st.id) FROM schema_tables st WHERE st.project_id = P.id) AS total_tables,
                                    (SELECT COUNT(ad.id) FROM api_definitions ad WHERE ad.project_id = P.id) AS total_apis,
                                    COALESCE(plogs.last_updater_name, 'Deleted User') AS last_updater_name,
                                    COALESCE(plogs.last_updated_at, p.created_at) AS last_updated_at
                                FROM
                                    projects p
                                    LEFT JOIN proj_logs plogs ON plogs.project_id = p.id
                                    LEFT JOIN project_collaborators pc ON pc.project_id = p.id
                                WHERE
                                    p.is_template != TRUE
                                    AND pc.user_id = $1 AND pc.status = $2
                                ORDER BY p.id DESC`,
        [req.loggedInUser.id, 'accepted']);

    res.status(200).json({ projects: result.rows });
});
router.get('/viewProject/:projectId', requireAuth, async (req, res) => {
    const result = await query(`SELECT
                                 p.* ,
                                 COALESCE(
                                 ( SELECT json_agg(
                                  json_build_object (
                                  'id' , pt.project_id , 'tag_id' , pt.tag_id ,
                                  'created_at' , pt.created_at ,
                                  'name' , t.name
                                  ) ORDER BY t.name
                                  ) AS tag
                                  FROM project_tags pt
                                  JOIN tags t ON t.id = pt.tag_id
                                   WHERE pt.project_id = p.id
                                 ) , '[]' :: json
                                 ) AS project_tags 
                                FROM projects p
                                WHERE p.id = $1 AND (p.author_id = $2 OR EXISTS (
                                SELECT 1 
                                FROM project_collaborators pc 
                                WHERE  pc.user_id = $2 AND pc.status = $3 AND pc.project_id = $1 ))
                                `, [req.params.projectId, req.loggedInUser.id, 'accepted']);
                    if(result.rows.length < 1)   return res.status(404).json({msg : "Project not found"});
                    return res.status(200).json({msg : "Successfully show project" , project : result.rows[0]});
                               
});
router.get('/collaborators/:projectId', requireAuth , async(req , res)=>{
   const result = await query(`SELECT 
                                cp.* ,  u.username , u.name
                                FROM project_collaborators cp
                                JOIN users u ON u.id = cp.user_id
                                JOIN  projects p ON p.id = cp.project_id
                                WHERE p.id = $1 AND (p.author_id = $2 OR EXISTS (
                                SELECT 1 
                                FROM project_collaborators pc 
                                WHERE  pc.user_id = $2 AND pc.status = $3 AND pc.project_id = $1 )) AND
                                (cp.status = 'pending' OR cp.status = 'accepted')
                                `, [req.params.projectId, req.loggedInUser.id, 'accepted']);
        return res.status(200).json({collaborators : result.rows});
});
router.get('/corsOrigin/:projectId' , requireAuth ,async(req , res)=>{
   const result = await query(`SELECT
                               o.*
                               FROM project_cors_origin o
                               JOIN projects p ON p.id = o.project_id
                                WHERE o.project_id = $1 AND (p.author_id = $2 OR EXISTS (
                                SELECT 1 
                                FROM project_collaborators pc 
                                WHERE  pc.user_id = $2 AND pc.status = $3 AND pc.project_id = $1 ))
                                ORDER BY o.created_at DESC 
                                `, [req.params.projectId, req.loggedInUser.id, 'accepted']);
        if(result.rows.length === 0) return res.status(400).json({msg : "No cors origin has been added yet"});
        return res.status(200).json({cors_origins : result.rows});
});
router.get('/allTables/:projectId', requireAuth, async (req, res) => {
    const result = await query(`SELECT 
                                   t.id,
                                   t.project_id,
                                   p.name,
                                   t.table_name,
                                   t.created_at,
                                   (SELECT COUNT(c.id) FROM schema_columns c WHERE c.schema_table_id = t.id ) AS TOTAL_COLUMNS
                                    FROM  projects p
                                    LEFT JOIN schema_tables t ON t.project_id = p.id
                                    WHERE p.id = $1 AND ( EXISTS (
                                    SELECT 1 
                                    FROM project_collaborators pc 
                                    WHERE pc.user_id = $2 AND pc.status = $3 AND pc.project_id = p.id ) OR p.author_id = $2 )
                                    ORDER BY t.table_name
                               `, [req.params.projectId, req.loggedInUser.id, 'accepted']);
    //  result.rows.length = 0 if user is not the author/collaborator of the project       
    //if has no table table_name will be null                
    if (result.rows.length < 1) return res.status(403).json({ msg: "You don't have access to the project" });
    res.status(200).json({ tables: result.rows });
});

router.get('/viewTableStructure/:tableId', requireAuth, async (req, res) => {
    const result = await query(`SELECT 
                                c.* , t.table_name
                                FROM schema_tables t
                                JOIN schema_columns c ON c.schema_table_id = t.id
                                JOIN projects p ON p.id = t.project_id
                                WHERE t.id = $1 AND (p.author_id = $2 OR EXISTS (
                                SELECT 1 
                                FROM project_collaborators pc 
                                WHERE  pc.user_id = $2 AND pc.status = $3 AND pc.project_id = p.id ))
                                ORDER BY c.is_primary_key DESC , c.id ASC
                                `, [req.params.tableId, req.loggedInUser.id, 'accepted']);
    if (result.rows.length < 1) return res.status(403).json({ msg: "You don't have access to the table" });
    res.status(200).json({ coloumns: result.rows });
});
router.get('/viewTableData/:tableId/:limit/:offset', requireAuth, async (req, res) => {
    const { tableId, limit, offset } = req.params;

    const table = await query(`SELECT
                                    UPPER('PROJ_'||P.id||'_'||P.author_id) AS schema_name , S.table_name AS table_name
                                     FROM schema_tables S
                                     JOIN projects P ON P.id = S.project_id
                                     WHERE S.id = $1  AND P.is_template = $2 AND ( p.author_id = $3 OR
                                      EXISTS (SELECT 1 
                                              FROM project_collaborators pc 
                                              WHERE  pc.user_id = $3 AND pc.status = $4 AND pc.project_id = p.id))
                                          `, [tableId, false, req.loggedInUser.id, 'accepted']);
    if (table.rows.length < 1) return res.status(404).json({ msg: "Table not found" });

    const schema = table.rows[0].schema_name;
    const table_name = table.rows[0].table_name;
    const result = await query(`SELECT *
                           FROM "${schema}".${table_name}
                           LIMIT $1 OFFSET $2 `, [Number(limit) || 10, Number(offset) || 0]);
    res.status(200).json({ msg: "Successfully show the data of the table ", data: result.rows });
});
router.get('/viewUserSessions', requireAuth, async (req, res) => {

    const result = await query(`
                            SELECT 
                            id ,
                            user_id , 
                            device_label ,
                            ip_address ,
                            created_at ,
                            expires_at ,
                            last_active_at ,
                            revoked_at 
                            FROM user_sessions 
                            WHERE user_id = $1 AND created_at > CURRENT_DATE - INTERVAL '1 month'
                            ORDER BY last_active_at DESC 
                            `, [req.loggedInUser.id]
    );
    res.status(200).json({ msg: "Successfully show user sessions", data: result.rows });
});
router.get('/viewTemplate/:templateId', async (req, res) => {
    const { templateId } = req.params;// ** I think ids  are not required to send to backend . Confirm me .
    const result = await query(`
                     SELECT 
                    P.id , P.name , P.created_at , P.description ,P.auth_enabled , P.author_id , U.username , U.name ,
                    (SELECT COUNT(st.id) FROM schema_tables st WHERE st.project_id = P.id) AS total_tables,
                    (SELECT COUNT(ad.id) FROM api_definitions ad WHERE ad.project_id = P.id) AS total_apis,
                    (SELECT COUNT(*) FROM template_likes tl WHERE tl.template_id = P.id ) AS total_likes,
                    (SELECT AVG(tr.rating)  FROM template_ratings tr WHERE tr.template_id = P.id ) AS avg_ratings ,
                    (SELECT COUNT(*) FROM template_clones tc WHERE tc.template_id = P.id ) AS total_cloned ,
                    COALESCE (
                     ( SELECT json_agg( 
                     json_build_object(
                     'id' , tb.id , 'table_name' , tb.table_name , 'created_at' , tb.created_at ,
					 'columns' , COALESCE( tb_cols.columns , '[]'::json)
                     ) ORDER BY tb.table_name
					 )
                      FROM schema_tables tb 
                      LEFT JOIN LATERAL (
                       SELECT json_agg(
                         json_build_object(
                           'id' , c.id , 
                           'name' , c.col_name , 
                           'type' , c.col_type , 
                           'default_value' ,  c.default_value  , 
                           'column_length' , c.col_length  , 
                           'is_primary_key' , c.is_primary_key ,
                           'is_auto_increment' , c.is_auto_increment ,
                           'is_nullable' , c.is_nullable ,
                           'is_unique' , c.is_unique ,
                           'created_at' , c.created_at ,
                           'parent_col_id' , fk.parent_col_id ,
                            'parent_col_name' , ppk.col_name ,
                            'parent_table_name' , pt.table_name ,
                           'fk_name' , fk.fk_name ,
                           'on_delete' , fk.on_delete ,
                           'on_update' , fk.on_update
                         ) ORDER BY c.is_primary_key DESC , c.is_unique DESC , c.id ASC 
                       ) AS columns
                        FROM schema_columns c
                        LEFT JOIN schema_foreign_keys fk ON fk.child_col_id = c.id
                        LEFT JOIN schema_columns ppk ON ppk.id = fk.parent_col_id
                        LEFT JOIN schema_tables pt ON pt.id = ppk.schema_table_id
                        WHERE c.schema_table_id = tb.id
                      ) tb_cols ON TRUE 
                       WHERE tb.project_id = P.id
                    ) ,  '[]' :: json ) AS tables , 
                    COALESCE (
                    ( SELECT json_agg (
                         json_build_object (
                           'id' , ad.id ,
                           'name' , ad.name ,
                           'query_definition' , ad.query_definition ,
                           'rate_limit_per_day' , ad.rate_limit_per_day 
                         ) ORDER BY ad.name) AS definitions 
                          FROM api_definitions ad 
                          WHERE ad.project_id = P.id
                    
					) 
                    , '[]' :: json ) AS apis
                    FROM projects P 
                    JOIN users U ON U.id = P.author_id
                    WHERE P.id = $1 AND P.is_template = $2
                      `, [templateId, true]);
    if (result.rows.length === 0) return res.status(404).json({ msg: "Template not found" });
    res.status(200).json({ msg: "Successfully show template details ", data: result.rows[0] })

});
router.get('/viewAllForeignkeys/:projectId', requireAuth, async (req, res) => {
    const { projectId } = req.params;
    const projAccess = await query(`
                            SELECT 1
                            FROM projects P
                            WHERE P.id = $1 AND ( 
                            p.author_id = $2 OR
                            EXISTS (
                            SELECT 1 
                            FROM project_collaborators cb
                            WHERE cb.user_id = $2 AND  cb.status = $3  AND cb.project_id = $1 )
                             )` ,
        [projectId, req.loggedInUser.id, 'accepted']);
    if (projAccess.rows.length === 0) return res.status(403).json({ msg: "Project not found" });
    const result = await query(`
                            SELECT
                             fk.child_col_id , cc.col_name AS child_col_name ,
                             ct.id AS child_table_id , ct.table_name AS child_table_name ,
                             fk.parent_col_id , pc.col_name AS parent_col_name ,
                             pt.id AS parent_table_id , pt.table_name AS parent_table_name ,
                             fk.fk_name ,
                             fk.on_delete ,
                             fk.on_update ,
                             fk.created_at
                             FROM schema_foreign_keys fk 
                             JOIN schema_columns cc ON cc.id = fk.child_col_id
                             JOIN schema_tables ct ON ct.id = cc.schema_table_id 
                             JOIN schema_columns pc ON pc.id = fk.parent_col_id
                             JOIN schema_tables pt ON pt.id = pc.schema_table_id  
                             JOIN projects P ON P.id = ct.project_id 
                             WHERE p.id = $1 
                             `, [projectId]);

    res.status(200).json({ msg: "Successfully fetched foreign keys", data: result.rows })

});
router.post('/getUsername', async(req , res)=>{
    const {username} = req.body;
    const result = await query(`SELECT
                                 u.id , u.name , u.username
                                 FROM users u
                                 WHERE u.username LIKE $1
                                ` , [`%${username}%`]);
   return res.status(200).json(result.rows);

})
module.exports = router;