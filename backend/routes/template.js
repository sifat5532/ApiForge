const express = require('express');
const query = require('./../db/query');
const router = express.Router();
const { requireAuth } = require('./auth');
const { pool } = require('./../db/connection');

const templateExistence = async (req, res, next) =>{
    if(!req.body.template_id){
        return res.status(400).json({ msg: "You need to input a template id"})
    }
    const isExist = await query('SELECT * FROM projects WHERE id=$1 AND is_template=$2', [req.body.template_id, true]);
    if (isExist.rows.length === 0) {
        return res.status(404).json({ msg: "Template not found" });
    }
    next();
};

// ######################################################
// All the routes in this page are complete so far
// ######################################################

router.post('/like', requireAuth, templateExistence, async (req, res) => {
    const { template_id } = req.body;

    if(!template_id){
        return res.status(400).json({ msg: "You should input a template_id"});
    }

    const likeExist = await query('SELECT * FROM template_likes WHERE template_id=$1 AND user_id=$2', [template_id, req.loggedInUser.id]);
    if (likeExist.rows.length > 0) {
        await query('DELETE FROM template_likes WHERE template_id=$1 AND user_id=$2', [template_id, req.loggedInUser.id]);
        return res.status(200).json({ msg: "Successfully removed like in the template" });
    }

    await query('INSERT INTO template_likes(template_id, user_id) VALUES($1, $2)', [template_id, req.loggedInUser.id]);
    res.status(200).json({ msg: "Successfully liked the template" });
});

router.post('/rate', requireAuth, templateExistence, async (req, res) => {
    const { template_id, rating, review } = req.body;

    if(!template_id || !rating || !review){
        return res.status(400).json({ msg: "You should input template_id, rating and review"})
    }

    const isExist = await query('SELECT * FROM template_clones WHERE user_id=$1 AND template_id=$2', [req.loggedInUser.id, template_id]);
    if (isExist.rows.length === 0) {
        return res.status(400).json({ msg: "You have to clone the template first to rate it" });
    }
    if (!(rating >= 1 && rating <= 5)) {
        return res.status(400).json({ msg: "Rating should be integer between 1 to 5" });
    }
    if (review != null && review.length > 500) {
        return res.status(400).json({ msg: "Please give review within 500 characters" });
    }
    const ratingExist = await query('SELECT * FROM template_ratings WHERE template_id=$1 AND user_id=$2', [template_id, req.loggedInUser.id]);
    if (ratingExist.rows.length > 0) {
        if (rating) await query(`
            UPDATE template_ratings
            SET rating=$1, review_text=$2, updated_at=CURRENT_TIMESTAMP
            WHERE template_id=$3 AND user_id=$4`,
            [rating, review, template_id, req.loggedInUser.id]);
        return res.status(200).json({ msg: "Successfully updated the rating" });
    }
    await query(`
        INSERT INTO template_ratings
        (template_id, user_id, rating, review_text)
        VALUES($1, $2, $3, $4)`
        , [template_id, req.loggedInUser.id, rating, review]);
    res.status(200).json({ msg: "Successfully rated the template" });
});

router.post('/feedback', requireAuth, templateExistence, async (req, res) => {
    const { template_id, message } = req.body;

    if(!template_id || !message)
        return res.status(400).json({ msg: "You should input template_id and message"});

    if (message.trim().length == 0)
        return res.status(400).json({ msg: "You can not send empty feedback" });

    if (message.length > 500)
        return res.status(400).json({ msg: "Please give feedback within 500 characters" });

    const isExist = await query('SELECT * FROM template_clones WHERE user_id=$1 AND template_id=$2', [req.loggedInUser.id, template_id]);
    if (isExist.rows.length === 0) {
        return res.status(400).json({ msg: "You have to clone the template first to give feedback" });
    }

    await query('INSERT INTO template_feedback(template_id, user_id, message) VALUES($1, $2, $3)', [template_id, req.loggedInUser.id, message]);
    res.status(200).json({ msg: "Successfully sent feedback to the template" });
});

module.exports = router;