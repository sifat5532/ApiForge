const express = require('express');
const query = require('../db/query');
const { requireAuth } = require('./auth');
const router = express.Router();

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
        return res.status(200).json({ msg: 'Subscribed to free plan successfully' });
    }

    if (plan.name === 'lite' || plan.name === 'pro') {
        const parsedMonth = Number(month);
        if (!Number.isInteger(parsedMonth) || parsedMonth <= 0) {
            return res.status(400).json({ msg: 'Invalid month count. Month must be a positive integer.' });
        }

        const amount = plan.cost_per_month * parsedMonth;
        return res.status(200).json({ amount, month: parsedMonth });
    }

    return res.status(400).json({ msg: 'Invalid plan' });
});

module.exports = router;
