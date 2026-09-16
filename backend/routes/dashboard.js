const express = require('express');
const query = require('./../db/query');
const { requireAuth } = require('./auth');
const router = express.Router();

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.loggedInUser.id;
    const result = await query(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE author_id = $1) AS total_projects,
         (SELECT COUNT(*)
            FROM schema_tables T
            JOIN projects P ON T.project_id = P.id
            WHERE P.author_id = $1) AS total_tables,
         (SELECT COUNT(*)
            FROM api_definitions ap
            JOIN projects P ON P.id = ap.project_id
            WHERE P.author_id = $1) AS total_apis,
         (SELECT COUNT(*)
            FROM api_logs al
            JOIN api_definitions ap ON ap.id = al.api_definition_id
            JOIN projects P ON P.id = ap.project_id
            WHERE P.author_id = $1
            AND al.created_at > CURRENT_DATE - INTERVAL '30 day') AS requests_30d 
       `,
      [userId]
    );
    const row = result.rows[0];
    res.status(200).json({
      projects: Number(row.total_projects),
      tables: Number(row.total_tables),
      apis: Number(row.total_apis),
      requests30d: Number(row.requests_30d)
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ msg: 'Failed to load dashboard stats' });
  }
});

router.get('/recentProjects', requireAuth, async (req, res) => {
  try {
    const userId = req.loggedInUser.id;
    const result = await query(
      `SELECT p.id, p.name, p.created_at,
              (SELECT COUNT(*) FROM schema_tables WHERE project_id = p.id) AS total_tables,
              (SELECT COUNT(*) FROM api_definitions WHERE project_id = p.id) AS total_apis,
              (SELECT created_at FROM project_logs WHERE project_id = p.id ORDER BY created_at LIMIT 1) AS last_update
         FROM projects p
        WHERE p.author_id = $1 
        AND p.created_at > CURRENT_DATE - INTERVAL '3 month'
        ORDER BY p.created_at DESC
        LIMIT 5`,
      [userId]
    );
    res.status(200).json({ projects: result.rows });
  } catch (err) {
    console.error('Recent projects error:', err);
    res.status(500).json({ msg: 'Failed to load recent projects' });
  }
});

router.get('/recentActivity', requireAuth, async (req, res) => {
  try {
    const userId = req.loggedInUser.id;
    const result = await query(
      `SELECT pl.*, p.name AS project_name
        FROM project_logs pl
        JOIN projects p ON p.id = pl.project_id
        WHERE pl.changed_by = $1
          AND pl.created_at > CURRENT_DATE - INTERVAL '3 month'
        ORDER BY pl.created_at DESC
        LIMIT 7`,
      [userId]
    );
    res.status(200).json({ activities: result.rows });
  } catch (err) {
    console.error('Recent activity error:', err);
    res.status(500).json({ msg: 'Failed to load recent activity' });
  }
});

module.exports = router;
