require('dotenv').config();
const pool = require('../db/connection');
const enforceSubscriptionLimits = require('./subscriptionEnforcer');

const SLUG = process.env.SLUG;
const AUTHORIZATION = process.env.AUTHORIZATION;

async function verifyPendingPayments() {
    try {
        // Fetch the last subscription_log row per user where payment_status is 'pending'
        // (outside any per-user txn — just a read to find work to do)
        const { rows: pendingLogs } = await pool.query(`
            SELECT DISTINCT ON (user_id) user_id, log_id, trxn_id, plan_id
            FROM subscription_log
            WHERE payment_status = 'pending'
            ORDER BY user_id, log_id DESC
        `);

        if (pendingLogs.length === 0) {
            // console.log('[verifyPendingPayments] No pending payments found.');
            return;
        }

        // console.log(`[verifyPendingPayments] Found ${pendingLogs.length} pending payment(s). Verifying...`);

        for (const log of pendingLogs) {
            const { user_id, log_id, trxn_id, plan_id } = log;
            try {
                const url = `https://mockgateway.com/api/pg/${SLUG}/verify/${trxn_id}`;
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${AUTHORIZATION}`
                    }
                });
                const result = await response.json();
                const paymentStatus = result.status;

                if (paymentStatus === 'succeeded' || paymentStatus === 'canceled') {
                    if (paymentStatus === 'succeeded') {
                        // Fetch plan details and old sub outside the txn (stable reads)
                        const planRes = await pool.query(
                            `SELECT plan_id, project_count, table_per_project, api_per_project
                             FROM plans WHERE plan_id = $1`,
                            [plan_id]
                        );
                        const oldSubRes = await pool.query(
                            `SELECT plan_id FROM subscriptions
                             WHERE user_id = $1 AND status = 'inactive'
                             ORDER BY subscription_id DESC LIMIT 1`,
                            [user_id]
                        );

                        if (planRes.rows.length > 0) {
                            const newPlan = planRes.rows[0];
                            const oldPlanId = oldSubRes.rows.length > 0 ? oldSubRes.rows[0].plan_id : null;
                            const direction = (oldPlanId === null || newPlan.plan_id > oldPlanId) ? 'upgrade' : 'downgrade';

                            // REPEATABLE READ: see subscriptionEnforcer.js for the full rationale.
                            const client = await pool.connect();
                            try {
                                await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

                                // Update the log status; DB trigger activates the new subscription
                                await client.query(
                                    'UPDATE subscription_log SET payment_status = $1, updated_at = NOW() WHERE trxn_id = $2 AND user_id = $3',
                                    [paymentStatus, trxn_id, user_id]
                                );

                                await enforceSubscriptionLimits(client, user_id, newPlan, direction);

                                await client.query('COMMIT');
                            } catch (err) {
                                await client.query('ROLLBACK');
                                throw err;
                            } finally {
                                client.release();
                            }
                        }
                    } else {
                        // canceled — just update the status, no enforcement needed
                        await pool.query(
                            'UPDATE subscription_log SET payment_status = $1, updated_at = NOW() WHERE trxn_id = $2 AND user_id = $3',
                            [paymentStatus, trxn_id, user_id]
                        );
                    }

                    // console.log(`[verifyPendingPayments] user_id=${user_id}, trxn_id=${trxn_id} -> ${paymentStatus}`);
                } else {
                    // console.log(`[verifyPendingPayments] user_id=${user_id}, trxn_id=${trxn_id} still pending (gateway status: ${paymentStatus})`);
                }
            } catch (err) {
                console.error(`[verifyPendingPayments] Failed to verify trxn_id=${trxn_id} for user_id=${user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[verifyPendingPayments] Failed to fetch pending payments:', err.message);
    }
}

module.exports = verifyPendingPayments;
