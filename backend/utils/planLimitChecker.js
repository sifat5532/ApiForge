async function checkPlanLimit(client, actingUserId, type, projId = null) {
    // For project-level checks, the plan that matters is the acting user's own.
    // For table/api checks, it's the project *owner's* plan (a collaborator
    // creating a table still counts against the project author's limits).
    let planUserId = actingUserId;
    if (type === 'table' || type === 'api') {
        if (!projId) {
            const e = new Error('projId is required for this check');
            e.status = 400;
            throw e;
        }
        const proj = await client.query('SELECT author_id FROM projects WHERE id=$1', [projId]);
        if (proj.rows.length === 0) {
            const e = new Error('Project not found');
            e.status = 404;
            throw e;
        }
        planUserId = proj.rows[0].author_id;
    }

    const sub = await client.query(
        `SELECT p.project_count, p.table_per_project, p.api_per_project, p.api_call_per_day
         FROM subscriptions s
         JOIN plans p ON p.plan_id = s.plan_id
         WHERE s.user_id = $1 AND s.status = $2
         FOR UPDATE OF s`,
        [planUserId, 'active']
    );

    if (sub.rows.length === 0) {
        const e = new Error('No active subscription found');
        e.status = 400;
        throw e;
    }

    const plan = sub.rows[0];

    if (type === 'project') {
        if (plan.project_count === null) return; // unlimited
        const countResult = await client.query(
            'SELECT COUNT(*) FROM projects WHERE author_id = $1',
            [actingUserId]
        );
        const currentCount = parseInt(countResult.rows[0].count, 10);
        if (currentCount >= plan.project_count) {
            const e = new Error(`Your plan allows a maximum of ${plan.project_count} projects`);
            e.status = 403;
            throw e;
        }

    } else if (type === 'table') {
        if (plan.table_per_project === null) return; // unlimited
        const countResult = await client.query(
            'SELECT COUNT(*) FROM schema_tables WHERE project_id = $1',
            [projId]
        );
        const currentCount = parseInt(countResult.rows[0].count, 10);
        if (currentCount >= plan.table_per_project) {
            const e = new Error(`Subscription plan of project author allows a maximum of ${plan.table_per_project} tables per project`);
            e.status = 403;
            throw e;
        }

    } else if (type === 'api') {
        if (plan.api_per_project === null) return; // unlimited
        const countResult = await client.query(
            'SELECT COUNT(*) FROM api_definitions WHERE project_id = $1',
            [projId]
        );
        const currentCount = parseInt(countResult.rows[0].count, 10);
        if (currentCount >= plan.api_per_project) {
            const e = new Error(`Subscription plan of project author allows a maximum of ${plan.api_per_project} APIs per project`);
            e.status = 403;
            throw e;
        }

    } else if (type === 'api_call') {
        if (plan.api_call_per_day === null) return; // unlimited
        const countResult = await client.query(
            `SELECT COUNT(*) FROM api_logs L
             JOIN api_definitions A ON A.id = L.api_definition_id
             WHERE A.project_id = $1 AND L.created_at >= CURRENT_DATE`,
            [projId]
        );
        const currentCount = parseInt(countResult.rows[0].count, 10);
        if (currentCount >= plan.api_call_per_day) {
            const e = new Error(`This project has hit its daily API call limit (${plan.api_call_per_day})`);
            e.status = 429;
            throw e;
        }
    }
}

module.exports = checkPlanLimit;