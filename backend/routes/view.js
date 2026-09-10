const express = require('express');
const query = require('./../db/query');
const pool = require('./../db/connection');
const { requireAuth } = require('./auth');
const { requireProjectAuthor }= require('./project');
const { requireProjectAccess }= require('./project');
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

async function resolveProjectIdParam(req, res, next) {
  const raw = req.params.projectId;
  if (raw == null) return next();
  if (/^\d+$/.test(raw)) return next();

  const result = await query(
    `SELECT p.id
       FROM projects p
      WHERE p.name = $1
        AND p.is_template = $2
        AND (p.author_id = $3 OR EXISTS (
              SELECT 1 FROM project_collaborators pc
               WHERE pc.user_id = $3 AND pc.status = $4 AND pc.project_id = p.id
             ))
      LIMIT 1`,
    [raw, false, req.loggedInUser.id, 'accepted']
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ msg: 'Project not found' });
  }
  req.params.projectId = String(result.rows[0].id);
  next();
}

router.get('/viewProject/:projectId', requireAuth, resolveProjectIdParam, requireProjectAccess , async (req, res) => {
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
                                WHERE p.id = $1
                                `, [req.params.projectId]);
                    if(result.rows.length < 1)   return res.status(404).json({msg : "Project not found"});
                    return res.status(200).json({msg : "Successfully show project" , project : result.rows[0]});
                               
});
router.get('/collaborators/:projectId', requireAuth , requireProjectAccess , async(req , res)=>{
   const result = await query(`SELECT 
                                cp.* ,  u.username , u.name
                                FROM project_collaborators cp
                                JOIN users u ON u.id = cp.user_id
                                WHERE cp.project_id = $1 AND (
                                cp.status = 'accepted' OR cp.status = 'pending')
                                ORDER BY cp.created_at DESC
                                `, [req.params.projectId]);
        if(result.rows.length === 0)   return res.status(404).json({msg : "No collaborato has been added yet "});
        return res.status(200).json({collaborators : result.rows});
});
router.get('/corsOrigin/:projectId' , requireAuth , requireProjectAccess , async(req , res)=>{
   const result = await query(`SELECT
                               o.*
                               FROM project_cors_origin o
                               JOIN projects p ON p.id = o.project_id
                                WHERE o.project_id = $1
                                ORDER BY o.created_at DESC 
                                `, [req.params.projectId]);
        if(result.rows.length === 0) return res.status(400).json({msg : "No cors origin has been added yet"});
        return res.status(200).json({cors_origins : result.rows});
});
router.get('/allTables/:projectId', requireAuth , requireProjectAccess , async (req, res) => {
    const result = await query(`SELECT 
                                   t.id,
                                   t.project_id,
                                   t.table_name ,
                                   t.created_at ,
                                   (SELECT COUNT(c.id) FROM schema_columns c WHERE c.schema_table_id = t.id ) AS TOTAL_COLUMNS
                                    FROM schema_tables t
                                    WHERE t.project_id = $1  
                                    ORDER BY t.id
                               `, [req.params.projectId]);          

    res.status(200).json({ tables: result.rows });
});

router.get('/projectLogs/:projectId', requireAuth, requireProjectAccess, async (req, res) => {
   try {
      const result = await query(`
         SELECT
            pl.id,
            pl.created_at,
            pl.entity_type,
            pl.entity_id,
            pl.change_type,
            pl.old_data,
            pl.new_data,
            u.id AS changed_by_id,
            u.name AS changed_by_name,
            u.username AS changed_by_username
         FROM project_logs pl
         LEFT JOIN users u ON u.id = pl.changed_by
         WHERE pl.project_id = $1
         ORDER BY pl.created_at DESC, pl.id DESC
      `, [req.params.projectId]);

      return res.status(200).json({ logs: result.rows });
   } catch (e) {
      console.error(e);
      return res.status(500).json({ msg: 'There was a server side error, please try again later' });
   }
});

router.get('/viewTableStructure/:tableId', requireAuth, async (req, res) => {
     const tableAccess = await query(`
                            SELECT 1
                            FROM schema_tables t 
                            JOIN projects P ON P.id = t.project_id
                            WHERE t.id = $1 AND ( 
                            p.author_id = $2 OR
                            EXISTS (
                            SELECT 1 
                            FROM project_collaborators cb
                            WHERE cb.user_id = $2 AND  cb.status = $3  AND cb.project_id = p.id )
                             )` ,
        [req.params.tableId, req.loggedInUser.id, 'accepted']);
    if (tableAccess.rows.length === 0) return res.status(404).json({ msg: "Table not found" });
    const result = await query(`SELECT 
                                c.* , t.table_name
                                FROM schema_tables t
                                JOIN schema_columns c ON c.schema_table_id = t.id
                                WHERE t.id = $1
                                ORDER BY c.is_primary_key DESC , c.id ASC
                                `, [req.params.tableId]);
    res.status(200).json({ coloumns: result.rows });
});
router.get('/viewTableData/:tableId', requireAuth, async (req, res) => {
    const { tableId } = req.params;
    const limit = Number(req.query.limit)||10;
    const offset = Number(req.query.offset)||0;

    const table = await query(`SELECT
                                    UPPER('PROJ_'||P.id||'_'||P.author_id) AS schema_name , S.table_name AS table_name
                                     FROM schema_tables S
                                     JOIN projects P ON P.id = S.project_id
                                     WHERE S.id = $1  AND P.is_template = $2 AND ( p.author_id = $3 OR
                                      EXISTS (SELECT 1 
                                              FROM project_collaborators pc 
                                              WHERE  pc.user_id = $3 AND pc.status = $4 AND pc.project_id = p.id))
                                          `, [tableId, false, req.loggedInUser.id, 'accepted']);
    if (table.rows.length === 0) return res.status(404).json({ msg: "Table not found" });
    const schema = table.rows[0].schema_name;
    const table_name = table.rows[0].table_name;
    const result = await query(`SELECT *
                           FROM "${schema}".${table_name}
                           LIMIT $1 OFFSET $2 `, [ limit , offset]);
    res.status(200).json({ msg: "Successfully show the data of the table ", data: result.rows });
});
router.get('/apis/:projectId' , requireAuth , requireProjectAccess , async(req , res)=>{
    const result = await query(`SELECT
                             a.* ,
                             p.name AS project_name ,
                             u.username AS author_username
                             FROM api_definitions a
                             JOIN projects p ON p.id = a.project_id
                             JOIN users u ON u.id = p.author_id
                             WHERE a.project_id = $1 AND (p.author_id = $2 OR EXISTS (
                             SELECT 1 
                             FROM project_collaborators pc 
                             WHERE  pc.user_id = $2 AND pc.status = $3 AND pc.project_id = p.id ))
                             ORDER BY a.created_at DESC
                                `, [req.params.projectId, req.loggedInUser.id, 'accepted']);
     return res.status(200).json({ apis : result.rows});
                             
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

router.get('/templateDetails/:templateId', async (req, res) => {
    const { templateId } = req.params;// ** I think ids  are not required to send to backend . Confirm me .
    const result = await query(`
                     SELECT 
                    P.id , P.name AS template_name , P.created_at , P.description ,P.auth_enabled , P.author_id , U.username , U.name AS author_name,
                    (SELECT COUNT(st.id) FROM schema_tables st WHERE st.project_id = P.id) AS total_tables,
                    (SELECT COUNT(ad.id) FROM api_definitions ad WHERE ad.project_id = P.id) AS total_apis,
                    (SELECT COUNT(*) FROM template_likes tl WHERE tl.template_id = P.id ) AS total_likes,
                    COALESCE((SELECT AVG(tr.rating)  FROM template_ratings tr WHERE tr.template_id = P.id ) , 0 ) AS avg_ratings ,
                    (SELECT COUNT(*) FROM template_clones tc WHERE tc.template_id = P.id ) AS total_cloned ,
                    COALESCE(
                                 ( SELECT json_agg(
                                  json_build_object (
                                  'id' , t.id , 'tag_id' , pt.tag_id ,
                                  'name' , t.name
                                  ) ORDER BY t.name
                                  ) AS tag
                                  FROM project_tags pt
                                  JOIN tags t ON t.id = pt.tag_id
                                   WHERE pt.project_id = p.id
                                 ) , '[]' :: json
                                 ) AS template_tags ,
                    COALESCE(
                                 ( SELECT json_agg(
                                  json_build_object (
                                  'user_id' , tr.user_id , 'name' , u.name , 'username' , u.username ,
                                  'rating' , tr.rating , 'created_at' , tr.created_at , 'updated_at' , tr.updated_at , 'review' , tr.review_text
                                  ) ORDER BY tr.created_at
                                  ) AS review
                                  FROM template_ratings tr
                                  JOIN users u ON u.id = tr.user_id
                                  WHERE tr.template_id = p.id
                                  LIMIT 10
                                 ) , '[]' :: json
                                 ) AS template_reviews ,
                
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
router.get('/searchTags', requireAuth, async (req, res) => {
    const search = (req.query.q || '').trim();
    if (!search) return res.status(200).json({ tags: [] });

    const result = await query(
        `SELECT id, name FROM tags WHERE name LIKE $1 ORDER BY name LIMIT 20`,
        [`%${search}%`]
    );
    return res.status(200).json({ tags: result.rows });
});

router.get('/notifications', requireAuth, async (req, res) => {
    const result = await query(
        `SELECT
            n.id,
            n.type,
            n.related_entity_name,
            n.related_entity_id,
            n.data,
            n.read_at,
            n.created_at,
            s.id            AS sender_id,
            s.name          AS sender_name,
            s.username      AS sender_username,
            p.name          AS entity_name,
            us.device_label AS session_device_label,
            us.ip_address   AS session_ip
        FROM notifications n
        LEFT JOIN users s ON s.id = n.sender_id
        LEFT JOIN projects p ON p.id = n.related_entity_id AND n.related_entity_name = 'projects'
        LEFT JOIN user_sessions us ON us.id = n.related_entity_id AND n.related_entity_name = 'user_sessions'
        WHERE n.receiver_id = $1
        ORDER BY n.created_at DESC`,
        [req.loggedInUser.id]
    );

    const notifications = result.rows.map(r => ({
        id: r.id,
        type: r.type,
        relatedEntityName: r.related_entity_name,
        relatedEntityId: r.related_entity_id,
        data: r.data,
        isRead: r.read_at != null,
        createdAt: r.created_at,
        sender: r.sender_id
            ? { id: r.sender_id, name: r.sender_name, username: r.sender_username }
            : null,
        entityName: r.entity_name,
        session: r.session_device_label
            ? { deviceLabel: r.session_device_label, ip: r.session_ip }
            : null
    }));

    res.status(200).json({ notifications });
});

router.post('/notifications/mark-read', requireAuth, async (req, res) => {
    const { notificationId } = req.body;
    if (notificationId == null) return res.status(400).json({ msg: 'notificationId is required' });

    const result = await query(
        `UPDATE notifications
            SET read_at = COALESCE(read_at, now())
         WHERE id = $1 AND receiver_id = $2`,
        [notificationId, req.loggedInUser.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ msg: 'Notification not found' });
    res.status(200).json({ msg: 'Notification marked as read' });
});

router.post('/notifications/mark-all-read', requireAuth, async (req, res) => {
    await query(
        `UPDATE notifications
            SET read_at = COALESCE(read_at, now())
         WHERE receiver_id = $1 AND read_at IS NULL`,
        [req.loggedInUser.id]
    );
    res.status(200).json({ msg: 'All notifications marked as read' });
});

router.post('/notifications/clear-read', requireAuth, async (req, res) => {
    const result = await query(
        `DELETE FROM notifications
         WHERE receiver_id = $1 AND read_at IS NOT NULL`,
        [req.loggedInUser.id]
    );
    res.status(200).json({ msg: 'Read notifications cleared', deleted: result.rowCount });
});

router.post('/notifications/dismiss', requireAuth, async (req, res) => {
    const { notificationId } = req.body;
    if (notificationId == null) return res.status(400).json({ msg: 'notificationId is required' });

    const result = await query(
        `DELETE FROM notifications
         WHERE id = $1 AND receiver_id = $2`,
        [notificationId, req.loggedInUser.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ msg: 'Notification not found' });
    res.status(200).json({ msg: 'Notification dismissed' });
});

module.exports = router;