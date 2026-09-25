const pool = require('../db/connection');
const enforceSubscriptionLimits = require('./subscriptionEnforcer');

/**
 * Check all users whose active subscription has expired (end_date < NOW()).
 * For each expired subscription, within a single REPEATABLE READ transaction:
 *   1. Insert a subscription_log row for the free plan (DB trigger handles
 *      updating the subscriptions table).
 *   2. Enforce free plan limits (downgrade) on the user's projects.
 */
async function checkExpiredSubscriptions() {
    console.log('[SubscriptionCron] Running expired subscription check...');
    try {
        // Fetch expired non-free active subscriptions (outside any per-user txn)
        const { rows: expiredSubs } = await pool.query(
            `SELECT s.subscription_id, s.user_id, s.plan_id
             FROM subscriptions s
             JOIN plans p ON p.name = 'free'
             WHERE s.status = 'active'
               AND s.end_date IS NOT NULL
               AND s.end_date < NOW()
               AND s.plan_id != p.plan_id`
        );

        if (expiredSubs.length === 0) {
            console.log('[SubscriptionCron] No expired subscriptions found.');
            return;
        }

        console.log(`[SubscriptionCron] Found ${expiredSubs.length} expired subscription(s). Processing...`);

        // Fetch the free plan details once (stable data, no need to be inside txn)
        const { rows: freePlanRows } = await pool.query(
            `SELECT plan_id, project_count, table_per_project, api_per_project
             FROM plans WHERE name = 'free'`
        );
        if (freePlanRows.length === 0) {
            console.error('[SubscriptionCron] Free plan not found in plans table.');
            return;
        }
        const freePlan = freePlanRows[0];

        for (const sub of expiredSubs) {
            const client = await pool.connect();
            try {
                // REPEATABLE READ: see subscriptionEnforcer.js for the full rationale.
                await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

                // Insert free-plan log row; DB trigger switches the subscription
                await client.query(
                    `INSERT INTO subscription_log(user_id, plan_id) VALUES($1, $2)`,
                    [sub.user_id, freePlan.plan_id]
                );

                // Enforce free plan project limits
                await enforceSubscriptionLimits(client, sub.user_id, freePlan, 'downgrade');

                await client.query('COMMIT');
                console.log(`[SubscriptionCron] Processed expiry for user_id=${sub.user_id} -> switched to free plan.`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[SubscriptionCron] Failed to process user_id=${sub.user_id}:`, err.message);
            } finally {
                client.release();
            }
        }
    } catch (err) {
        console.error('[SubscriptionCron] Failed to fetch expired subscriptions:', err.message);
    }
}

function startSubscriptionCron() {
    // Run immediately on startup
    checkExpiredSubscriptions();

    // Then repeat every 30 minutes
    const intervalId = setInterval(checkExpiredSubscriptions, 30 * 60 * 1000);

    return function stop() {
        clearInterval(intervalId);
    };
}

module.exports = { startSubscriptionCron, checkExpiredSubscriptions };
