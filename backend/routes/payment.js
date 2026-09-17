require('dotenv').config();
const express = require('express');
const pool = require('../db/connection');
const query = require('../db/query');
const { requireAuth } = require('./auth');
const router = express.Router();

const SLUG = process.env.SLUG;
const AUTHORIZATION = process.env.AUTHORIZATION;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

router.post('/subscribe', requireAuth, async (req, res) => {
    const { plan_id } = req.body;
    let { month } = req.body;

    if (plan_id === undefined || plan_id === null) {
        return res.status(400).json({ msg: 'Select a plan' });
    }

    const planResult = await query('SELECT * FROM plans WHERE plan_id = $1', [plan_id]);
    if (planResult.rows.length === 0) {
        return res.status(404).json({ msg: 'Plan not found' });
    }

    const plan = planResult.rows[0];

    if (plan.name === 'free') {
        month = null;
        // will add a log here
        await query('INSERT INTO subscription_log(user_id, plan_id) VALUES($1, $2)',
            [req.loggedInUser.id, plan_id]);
        return res.status(200).json({ done: true, msg: 'Subscribed to free plan successfully' });
    }

    if (plan.name === 'lite' || plan.name === 'pro') {
        const parsedMonth = Number(month);
        if (!Number.isInteger(parsedMonth) || parsedMonth <= 0) {
            return res.status(400).json({ msg: 'Invalid month count. Month must be a positive integer.' });
        }
        // creating payment gateway url
        const amount = plan.cost_per_month * parsedMonth;
        let currency = 'BDT';
        const data = { amount, currency };
        console.log('Outgoing data:', data);

        const url = `https://mockgateway.com/api/pg/${SLUG}/init`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AUTHORIZATION}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            console.log('Gateway response:', result);
            const paymentUrl = result.next_action.redirect_to_url.url;
            const paymentID = result.id; // similar as trxn id;
            await query('INSERT INTO subscription_log(user_id, plan_id, trxn_id, payment_method, payment_status, amount, month_count) VALUES($1, $2, $3, $4, $5, $6, $7)',
                [req.loggedInUser.id, plan_id, paymentID, 'mockgateway', 'pending', amount, month]);

            return res.status(200).json({ done: false, paymentID, amount, month: parsedMonth, paymentUrl, msg: "Payment should be done in this url" });
            // res.status(response.status).json(result);
        } catch (err) {
            console.error('Gateway request failed:', err);
            res.status(500).json({ error: err.message });
        }
    }
    return res.status(400).json({ msg: 'Invalid plan' });
});

router.post('/webhook', express.json(), async (req, res) => {
    const payload = req.body;
    console.log('Webhook received:', payload);

    let eventID = payload.id;
    let paymentId = payload.data.object.id; // trxn_id
    let paymentStatus = payload.data.object.status;

    if (!paymentId) {
        console.warn('Webhook missing paymentId, ignoring');
        return res.status(400).json({ error: 'missing paymentId' });
    }

    if (!req.get('WEBHOOK_SECRET') || req.get('WEBHOOK_SECRET') != WEBHOOK_SECRET) {
        return res.status(400).json({ error: 'Invalid Webhook secret' });
    }

    try {
        await pool.query(
            'UPDATE subscription_log SET payment_status = $1, updated_at = NOW() WHERE trxn_id = $2',
            [paymentStatus, paymentId]
        );
        res.status(200).json({ received: true });
    } catch (err) {
        console.error('Webhook processing failed:', err);
        // 500 tells MockGateway to retry later if it does that
        res.status(500).json({ error: 'internal error' });
    }
});


router.get('/verify', requireAuth, async (req, res) => {
    const { paymentId } = req.body;
    if (!paymentId) {
        return res.status(400).json({ msg: 'Payment ID is needed' });
    }
    // console.log('Verifying paymentId:', paymentId);

    let queryRes = await query('SELECT * FROM subscription_log WHERE trxn_id = $1 AND user_id = $2',
        [paymentId, req.loggedInUser.id]);
    if (queryRes.rowCount <= 0) {
        return res.status(400).json({ msg: 'Either invalid Payment ID or you are not allowed to see the status' });
    }

    const url = `https://mockgateway.com/api/pg/${SLUG}/verify/${paymentId}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${AUTHORIZATION}`
            }
        });
        const result = await response.json();
        const paymentStatus = result.status;
        queryRes = await query('SELECT * FROM subscription_log WHERE trxn_id = $1 AND user_id = $2',
            [paymentId, req.loggedInUser.id]);
        if (queryRes.rows[0].payment_status == 'pending' && result.status && (result.status == 'succeeded' || result.status == 'canceled')) {
            await pool.query('UPDATE subscription_log SET payment_status = $1, updated_at = NOW() WHERE trxn_id = $2',
                [result.status, paymentId]
            );
        }
        if(result.status != 'succeeded' || result.status != 'canceled'){
            return res.status(200).json({ paymentStatus: 'pending'});
        }
        res.status(200).json({ paymentStatus });
    } catch (err) {
        console.error('Gateway request failed:', err);
        res.status(500).json({ msg: err.message });
    }
});

router.get('/anyPendingPayment', requireAuth, async (req, res)=>{
    const log_res = await query('SELECT payment_status FROM subscription_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1;', [req.loggedInUser.id]);
    if(log_res.rowCount > 0 && log_res.rows[0].payment_status == 'pending'){
        return res.status(409).json({msg: 'You already have a pending payment. You have already paid, then don\'t pay again and contact the ApiForge team. Otherwise, you can proceed to a new payment.'});
    }
    return res.status(200).json({msg: 'No pending payment request'});
});

module.exports = router;
