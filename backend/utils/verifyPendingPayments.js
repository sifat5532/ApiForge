require('dotenv').config();
const pool = require('../db/connection');

const SLUG = process.env.SLUG;
const AUTHORIZATION = process.env.AUTHORIZATION;

async function verifyPendingPayments() {
    try {
        // Fetch the last subscription_log row per user where payment_status is 'pending'
        const { rows: pendingLogs } = await pool.query(`
            SELECT DISTINCT ON (user_id) user_id, log_id, trxn_id
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
            const { user_id, log_id, trxn_id } = log;
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
                    await pool.query(
                        'UPDATE subscription_log SET payment_status = $1, updated_at = NOW() WHERE trxn_id = $2 AND user_id = $3',
                        [paymentStatus, trxn_id, user_id]
                    );
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
