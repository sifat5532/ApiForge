const express = require('express');
const crypto = require('crypto');
const query = require('./../db/query');
const router = express.Router();
const { requireAuth } = require('./auth');

router.post('/createProject', requireAuth, async (req, res) => {
    const { proj_name, description, enable_auth, tags } = req.body;
    const author_id = req.loggedInUser.id;
    if (!proj_name) {
        return res.status(400).json({ msg: 'Please fill in project name' });

    }
    if (!/^[A-Za-z0-9-_.]{1,30}$/.test(proj_name)) {
        return res.status(400).json({ msg: 'Please give project name within 30 characters using a-z,A-Z,0-9,-,_ or . only' });

    }

    if (description != null && description.length > 500) {
        return res.status(400).json({ msg: 'Please give project description within 500 characters' });

    }
    if (tags != null) {
        if (tags.length > 10) {
            return res.status(400).json({ msg: 'Adding more than 10 tags is not allowed!' });
        }
        for (let i = 0; i < tags.length; i++) {
            const t = tags[i].trim().toLowerCase();
            if (t.length < 2 || t.length > 20) return res.status(400).json({ msg: 'Tag length must be between 2 to 20 characters' });
            if (!(t[0] >= 'a' && t[0] <= 'z')) return res.status(400).json({ msg: 'Tag name must start with an alphabet(a-z or A-Z)' });

        }
    }
    const result = await query('SELECT * FROM projects WHERE author_id=$1 AND name=$2', [author_id, proj_name]);
    if (result.rows.length > 0) {
        return res.status(400).json({ msg: 'You already have a project in this name' });
    }

    const api_key = crypto.randomBytes(32).toString('hex');
    const api_key_prefix = api_key.substring(0, 6);
    const api_key_hashed = crypto.createHash('sha256').update(api_key).digest('hex');

    const proj = await query('INSERT INTO projects(author_id,name,description,api_key_hashed,api_key_prefix,auth_enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [author_id, proj_name, description, api_key_hashed, api_key_prefix, enable_auth]
    );
    const proj_id = proj.rows[0].id;
    if (tags != null) {
        for (let i = 0; i < tags.length; i++) {
            const t1 = tags[i].trim().toLowerCase();
            const tag_result = await query('SELECT id FROM tags WHERE name=$1', [t1]);
            let tag_id = -1;
            if (tag_result.rows.length === 0) {
                const proj_tag = await query('INSERT INTO tags(name) VALUES($1) RETURNING id', [t1]);
                tag_id = proj_tag.rows[0].id;
            }
            else tag_id = tag_result.rows[0].id;

            await query('INSERT INTO project_tags(project_id,tag_id) VALUES ($1,$2)', [proj_id, tag_id]);

        }
    }
    res.status(201).json({ msg: 'Project created successfully', api_key: api_key });
}
)
router.post('/regenerateKey', requireAuth, async (req, res) => {
    const user_id = req.loggedInUser.id;
    const { proj_id } = req.body;
    const api_key = crypto.randomBytes(32).toString('hex');
    const api_key_prefix = api_key.substring(0, 6);
    const api_key_hashed = crypto.createHash('sha256').update(api_key).digest('hex');
    const result = await query('SELECT * FROM projects WHERE id=$1 AND author_id=$2', [proj_id, user_id]);
    if (result.rows.length === 0) {
        return res.status(400).json({ msg: "You don't have access to change the api key" });
    }
    else {
        await query('UPDATE projects SET api_key_hashed=$1 , api_key_prefix=$2 WHERE id=$3', [api_key_hashed, api_key_prefix, proj_id]);
        res.status(200).json({ msg: 'Api key regenerated successfully', api_key: api_key });
    }
});

router.post('/collabInvitation', requireAuth, async (req, res) => {
    const { proj_id, user_id } = req.body;
    if (user_id == req.loggedInUser.id) {
        return res.status(400).json({ msg: "You can't invite yourself as a collaborator" });
    }

    const findUser = await query('SELECT username FROM users WHERE id = $1', [user_id]);
    if (findUser.rows.length === 0) {
        return res.status(200).json({ msg: 'You are trying to add an invalid user' });
    }

    const result = await query('SELECT * FROM projects WHERE id=$1 AND author_id=$2', [proj_id, req.loggedInUser.id]);
    if (result.rows.length === 0) {
        return res.status(400).json({ msg: "You don't have access to add collaborators to this project" });
    }

    const isExist = await query('SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2;', [proj_id, user_id]);
    if (isExist.rows.length > 0) {
        if (isExist.rows[0].status == 'pending') {
            return res.status(400).json({ msg: 'Already invited to this project' });
        } else if (isExist.rows[0].status == 'accepted') {
            return res.status(400).json({ msg: 'Already collaborating to this project' });
        }
    }

    await query('INSERT INTO project_collaborators (project_id, user_id, role, status) VALUES($1, $2, $3, $4);', [proj_id, user_id, 'editor', 'pending']);
    return res.status(200).json({ msg: 'Successfully invited for collaboration' });
});

router.post('/proceedInvitation', requireAuth, async (req, res) => {
    const { proj_id, acceptInvitation } = req.body;
    const isExist = await query('SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2;', [proj_id, req.loggedInUser.id]);
    if (isExist.rows.length === 0) {
        return res.status(404).json({ msg: 'Invitition not found' });
    }
    if (isExist.rows[0].status == 'accepted') {
        return res.status(400).json({ msg: 'Already collaborating to this project' });
    }
    if (!acceptInvitation) {
        await query('UPDATE project_collaborators SET status=$1 WHERE project_id=$2,created_at=CURRENT_TIMESTAMP AND user_id=$3;', ['declined', proj_id, req.loggedInUser.id]);
        return res.status(200).json({ msg: 'Successfully reject the collaboration invitation' });
    }
    await query('UPDATE project_collaborators SET status=$1 ,created_at=CURRENT_TIMESTAMP WHERE project_id=$2 AND user_id=$3;', ['accepted', proj_id, req.loggedInUser.id]);
    return res.status(200).json({ msg: 'Successfully accept the collaboration invitation' });
});
module.exports = router;