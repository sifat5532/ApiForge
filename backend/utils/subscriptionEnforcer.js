/*
 The caller must:
    1. Acquire a client from the pool.
    2. BEGIN a transaction with isolation level REPEATABLE READ (see below).
 
 For downgrade (or expiry to free):
    1. Lock non-template projects that violate table_per_project of the new plan.
    2. Lock non-template projects that violate api_per_project of the new plan.
    3. Count remaining active non-template projects. If count > project_count,
       lock the newest active ones first until within limit.

For upgrade:
   1. Starting from locked projects (newest first by created_at DESC), unlock
      any that do NOT violate table_per_project and api_per_project.
   2. Stop once the active project count reaches project_count (if not unlimited).

*/
async function enforceSubscriptionLimits(client, userId, newPlan, direction) {
    const { project_count, table_per_project, api_per_project } = newPlan;

    if (direction === 'downgrade') {
        // Step 1: Lock projects whose table count exceeds the new plan limit
        if (table_per_project !== null) {
            await client.query(
                `UPDATE projects p
                 SET subscription_status = 'locked'
                 WHERE p.author_id = $1
                   AND p.is_template = false
                   AND p.subscription_status = 'active'
                   AND (
                       SELECT COUNT(*) FROM schema_tables st WHERE st.project_id = p.id
                   ) > $2`,
                [userId, table_per_project]
            );
        }

        // Step 2: Lock projects whose api count exceeds the new plan limit
        if (api_per_project !== null) {
            await client.query(
                `UPDATE projects p
                 SET subscription_status = 'locked'
                 WHERE p.author_id = $1
                   AND p.is_template = false
                   AND p.subscription_status = 'active'
                   AND (
                       SELECT COUNT(*) FROM api_definitions ad WHERE ad.project_id = p.id
                   ) > $2`,
                [userId, api_per_project]
            );
        }

        // Step 3: Enforce project count limit
        if (project_count !== null) {
            const { rows: activeRows } = await client.query(
                `SELECT id FROM projects
                 WHERE author_id = $1
                   AND is_template = false
                   AND subscription_status = 'active'
                 ORDER BY created_at DESC`,
                [userId]
            );

            const activeCount = activeRows.length;
            if (activeCount > project_count) {
                // activeRows is newest-first; lock the excess from the front
                const tolock = activeRows.slice(0, activeCount - project_count).map(r => r.id);
                await client.query(
                    `UPDATE projects SET subscription_status = 'locked'
                     WHERE id = ANY($1::int[])`,
                    [tolock]
                );
            }
        }
    } else if (direction === 'upgrade') {
        // Get locked non-template projects, newest first
        const { rows: lockedRows } = await client.query(
            `SELECT id FROM projects
             WHERE author_id = $1
               AND is_template = false
               AND subscription_status = 'locked'
             ORDER BY created_at DESC`,
            [userId]
        );

        if (lockedRows.length === 0) return;

        // Current active project count
        const { rows: activeCountRows } = await client.query(
            `SELECT COUNT(*) FROM projects
             WHERE author_id = $1
               AND is_template = false
               AND subscription_status = 'active'`,
            [userId]
        );
        let activeCount = parseInt(activeCountRows[0].count, 10);

        for (const row of lockedRows) {
            if (project_count !== null && activeCount >= project_count) break;

            if (table_per_project !== null) {
                const { rows: tRows } = await client.query(
                    `SELECT COUNT(*) FROM schema_tables WHERE project_id = $1`,
                    [row.id]
                );
                if (parseInt(tRows[0].count, 10) > table_per_project) continue;
            }

            if (api_per_project !== null) {
                const { rows: aRows } = await client.query(
                    `SELECT COUNT(*) FROM api_definitions WHERE project_id = $1`,
                    [row.id]
                );
                if (parseInt(aRows[0].count, 10) > api_per_project) continue;
            }

            await client.query(
                `UPDATE projects SET subscription_status = 'active' WHERE id = $1`,
                [row.id]
            );
            activeCount++;
        }
    }
}

module.exports = enforceSubscriptionLimits;
