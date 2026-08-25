const express = require('express');
const query = require('./../db/query');
const pool = require('./../db/connection');
const { requireAuth } = require('./auth');
const router = express.Router();

router.get('/allProjects', requireAuth, async (req, res)=>{
    let pageNum = req.query.page;
    let limit = req.query.limit;
    if(!pageNum){
        pageNum = 1;
    }
    if(!limit){
        limit = 10;
    }
    limit = parseInt(limit);
    pageNum = parseInt(pageNum);
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
                                ORDER BY p.id DESC
                                LIMIT $2 OFFSET $3;`,
                                [req.loggedInUser.id, limit, (pageNum-1) * limit]);
                                
    res.status(200).json({projects: result.rows});
});

module.exports = router;