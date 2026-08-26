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
                                    JOIN users u ON u.id = pl.changed_by
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
                                    COALESCE(plogs.last_updater_name, u.name) AS last_updater_name,
                                    COALESCE(plogs.last_updated_at, p.created_at) AS last_updated_at
                                FROM
                                    projects p
                                    LEFT JOIN proj_logs plogs ON plogs.project_id = p.id
                                    LEFT JOIN users u ON u.id = p.author_id
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
                                    JOIN users u ON u.id = pl.changed_by
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
                                    COALESCE(plogs.last_updater_name, u.name) AS last_updater_name,
                                    COALESCE(plogs.last_updated_at, p.created_at) AS last_updated_at
                                FROM
                                    projects p
                                    LEFT JOIN proj_logs plogs ON plogs.project_id = p.id
                                    LEFT JOIN users u ON u.id = p.author_id
                                    LEFT JOIN project_collaborators pc ON pc.project_id = p.id
                                WHERE
                                    p.is_template != TRUE
                                    AND pc.user_id = $1 AND pc.status = $2
                                ORDER BY p.id DESC`,
        [req.loggedInUser.id, 'accepted']);

    res.status(200).json({ projects: result.rows });
});

router.get('/allTables/:projectId', requireAuth, async(req, res)=>{
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
                                    WHERE pc.project_id = p.id AND pc.user_id = $2 AND pc.status = $3 ) OR p.author_id = $2 )
                                    ORDER BY t.table_name
                               `, [req.params.projectId, req.loggedInUser.id, 'accepted'] );
    //  result.rows.length = 0 if user is not the author/collaborator of the project       
    //if has no table table_name will be null                
    if(result.rows.length <1) return res.status(403).json({msg:"You don't have access to the project"});
    res.status(200).json({tables : result.rows});
});

router.get('/viewTableStructure/:tableId',requireAuth,async(req,res)=>{
    const result = await query(`SELECT 
                                c.* , t.table_name, 
                                fk.child_col_id ,
                                fk.parent_col_id ,
                                fk.fk_name ,
                                fk.on_delete ,
                                fk.on_update ,
                                fk.created_at AS fk_created_at
                                FROM schema_tables t
                                JOIN schema_columns c ON c.schema_table_id = t.id
                                JOIN projects p ON p.id = t.project_id
                                LEFT JOIN schema_foreign_keys fk ON fk.child_col_id = c.id
                                WHERE t.id = $1 AND (p.author_id = $2 OR EXISTS (
                                SELECT 1 
                                FROM project_collaborators pc 
                                WHERE pc.project_id = p.id AND pc.user_id = $2 AND pc.status = $3))
                                ORDER BY c.is_primary_key DESC , c.id ASC
                                `,[req.params.tableId , req.loggedInUser.id, 'active']);
    if(result.rows.length <1) return res.status(403).json({msg:"You don't have access to the table"});
    res.status(200).json({coloumns : result.rows});
});

module.exports = router;