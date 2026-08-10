const express = require('express');
const crypto = require('crypto');
const query = require('./../db/query');
const router = express.Router();
const { requireAuth } = require('./auth');
const { table } = require('console');
const { pool } = require('./../db/connection');
const PG_RESERVED_WORDS = new Set([
    'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc',
    'asymmetric', 'authorization', 'binary', 'both', 'case', 'cast',
    'check', 'collate', 'collation', 'column', 'concurrently', 'constraint',
    'create', 'cross', 'current_catalog', 'current_date', 'current_role',
    'current_schema', 'current_time', 'current_timestamp', 'current_user',
    'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end',
    'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full',
    'grant', 'group', 'having', 'ilike', 'in', 'initially', 'inner',
    'intersect', 'into', 'is', 'isnull', 'join', 'lateral', 'leading',
    'left', 'like', 'limit', 'localtime', 'localtimestamp', 'natural',
    'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order',
    'outer', 'overlaps', 'placing', 'primary', 'references', 'returning',
    'right', 'select', 'session_user', 'similar', 'some', 'symmetric',
    'system_user', 'table', 'tablesample', 'then', 'to', 'trailing',
    'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose',
    'when', 'where', 'window', 'with'
]);

async function validateColumnDefault(pool, pgType, defaultValue) {
    try {
        await pool.query(`SELECT $1::${pgType}`, [defaultValue]);
        return { value: true };
    }
    catch (err) {
        return { valid: false, error: err.message };
    }
}

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
        [author_id, proj_name, description, api_key_hashed, api_key_prefix, (enable_auth === true ? true:false)]
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
});

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

router.post('/proceedCollabInvitation', requireAuth, async (req, res) => {
    const { proj_id, acceptInvitation } = req.body;
    const isExist = await query('SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2;', [proj_id, req.loggedInUser.id]);
    if (isExist.rows.length === 0) {
        return res.status(404).json({ msg: 'Invitation not found' });
    }
    if (isExist.rows[0].status == 'accepted') {
        return res.status(400).json({ msg: 'Already collaborating to this project' });
    }
    if (acceptInvitation == false) {
        await query('UPDATE project_collaborators SET status=$1 WHERE project_id=$2,created_at=CURRENT_TIMESTAMP AND user_id=$3;', ['rejected', proj_id, req.loggedInUser.id]);
        return res.status(200).json({ msg: 'Successfully rejected the collaboration invitation' });
    }
    await query('UPDATE project_collaborators SET status=$1 ,created_at=CURRENT_TIMESTAMP WHERE project_id=$2 AND user_id=$3;', ['accepted', proj_id, req.loggedInUser.id]);
    return res.status(200).json({ msg: 'Successfully accepted the collaboration invitation' });
});

router.post('/removeCollaboration', requireAuth, async (req, res) => {
    const { user_id, proj_id } = req.body;
    const isExist = await query('SELECT * FROM project_collaborators WHERE project_id=$1 AND user_id=$2', [proj_id, user_id]);
    if (isExist.rows.length === 0) {
        return res.status(404).json({ msg: "Collaborator not found" });
    }
    if (user_id == req.loggedInUser.id) {
        if (isExist.rows[0].status != 'accepted' && isExist.rows[0].status != 'pending') { return res.status(400).json({ msg: "You are not a collaborator of this project" }); }
        await query('UPDATE project_collaborators SET status=$1 WHERE project_id=$2 AND user_id=$3', ['rejected', proj_id, user_id]);
        return res.status(200).json({ msg: "You have successfully removed yourself from this project as a collaborator" });

    }
    const proj = await query('SELECT * FROM projects WHERE id=$1', [proj_id]);
    if (req.loggedInUser.id != proj.rows[0].author_id) {
        return res.status(400).json({ msg: "You are not allowed to remove the collaborator" });
    }
    if (isExist.rows[0].status != 'accepted' && isExist.rows[0].status != 'pending') { return res.status(400).json({ msg: "User is not a collaborator of this project" }); }
    await query('UPDATE project_collaborators SET status=$1 WHERE project_id=$2 AND user_id=$3', ['removed', proj_id, user_id]);
    return res.status(200).json({ msg: "Successfully removed the collaborator from this project as a collaborator" });

});

router.post('/createTable', requireAuth, async (req, res) => {
    const { proj_id, name, cols } = req.body;
    const isProj = await query('SELECT * FROM projects WHERE id=$1', [proj_id]);
    const isCollab = await query('SELECT * FROM project_collaborators WHERE project_id=$1 AND user_id=$2 AND role=$3 AND status=$4', [proj_id, req.loggedInUser.id, 'editor', 'accepted']);
    if (isProj.rows.length < 1 || (isProj.rows[0].author_id != req.loggedInUser.id && isCollab.rows.length < 1)) {
        return res.status(400).json({ msg: "You are not allowed to make table for this project" });
    }
    if (name == null || name.trim().length < 1) {
        return res.status(400).json({ msg: "Please fill the table name" });
    }
    const table_name = name.trim().toLowerCase();
    if (table_name[0] >= '0' && table_name[0] <= '9') return res.status(400).json({ msg: 'Table name should start with letters(a to z) or _' });
    if (!/^[a-z0-9_]{1,30}$/.test(table_name)) {
        return res.status(400).json({ msg: 'Please give table name within 30 characters using a-z,A-Z,0-9,-,_ or . only' });
    }
    if (PG_RESERVED_WORDS.has(name.toLowerCase())) {
        return res.status(400).json({ msg: 'Your given table name is a postgreSQL reserved word' });
    }
    const isExist = await query('SELECT * FROM schema_tables WHERE project_id=$1 AND table_name=$2', [proj_id, table_name]);
    if (isExist.rows.length > 0) {
        return res.status(400).json({ msg: 'Your alredy have a table in the project in this name' });
    }
    const schema_name = isProj.rows[0].name + '_' + proj_id + '_' + isProj.rows[0].author_id;
    const result = await query('INSERT INTO schema_tables(project_id,table_name,db_schema_name) VALUES($1,$2,$3) RETURNING id', [proj_id, table_name, schema_name]);
    const table_id = result.rows[0].id;
    for (let i = 0; cols != null && i < cols.length; i++) {
        //0 col_name,1 col_type,2 default,3(array) col_len,4 is_pk,5 is_auto_inc
        // 6 is_nullable,7 is_unique
        if (cols[i][0] == null || cols[i][0].trim().length < 1) {
            return res.status(400).json({ msg: "Please fill the column name" });
        }
        const col_name = cols[i][0].trim().toLowerCase();
        if (col_name[0] >= '0' && col_name[0] <= '9') return res.status(400).json({ msg: 'Column name should start with letters(a to z) or _' });
        if (!/^[a-z0-9_]{1,30}$/.test(col_name)) {
            return res.status(400).json({ msg: 'Please give column name within 30 characters using a-z,A-Z,0-9,-,_ or . only' });
        }
        if (PG_RESERVED_WORDS.has(name.toLowerCase())) {
            return res.status(400).json({ msg: 'Your given column name is a postgreSQL reserved word' });
        }
        console.log(cols[i][0], cols[i][1]);
        for (let j = 0; j < i; j++) {
            if (col_name == cols[j][0].trim().toLowerCase()) {
                return res.status(400).json({ msg: 'Every column name should be unique in a table' });
            }
        }
        if (!(cols[i][1] === 'INTEGER' || cols[i][1] === 'TEXT' || cols[i][1] === 'NUMARIC' || cols[i][1] === 'BOOLEAN' || cols[i][1] === 'VARCHAR' || cols[i][1] === 'DATE' || cols[i][1] === 'TIMESTAMP')) {
            return res.status(400).json({ msg: 'Your given data type is not valid' });
        }
        //used a pg function written on top to chk if default value matched with datatype 
        if (!validateColumnDefault(pool, cols[i][1], cols[i][2])) {
            return res.status(400).json({ msg: 'Your given default value does not matched with the give data type' });
        }
        if (cols[i][1] === 'VARCHAR') {
            if (cols[i][3] < 1) return res.status(400).json({ msg: 'Give valid length of the column' });
        }
        if (cols[i][1] === 'NUMARIC') {
            try {
                await pool.query(`SELECT $1::numeric($1,$2)`, [cols[i][3][0], cols[i][3][1]]);

            } catch {
                return res.status(400).json({ msg: "Give valid precision and scale" });
            }
        }
        const is_pk = cols[i][4] === true ? true : false;
        const is_auto_inc = cols[i][5] === true ? true : false;
        const is_nullable = cols[i][6] === true ? true : false;
        const is_unique = cols[i][7] === true ? true : false;
        if (is_auto_inc === true && (cols[i][1] != 'INTEGER' || (is_pk != true && is_unique != true))) {
            return res.status(409).json({ msg: "Auto increment is not possible for this key" });
        }
        if (is_pk === true && (is_nullable != false || is_unique != true)) {
            return res.status(409).json({ msg: "Primary key must be not nullable and unique" });
        }
        if (cols[i][1] != 'VARCHAR' || cols[i][1] != 'NUMARIC') {
            await query('INSERT INTO schema_columns(schema_table_id,col_name,col_type,default_value,is_primary_key,is_auto_increment,is_nullable,is_unique) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
                [table_id, cols[i][0], cols[i][1], cols[i][2], is_pk, is_auto_inc, is_nullable, is_unique]
            );
        }
        else if (cols[i][1] != 'VARCHAR') {
            await query('INSERT INTO schema_columns(schema_table_id,col_name,col_type,col_length,default_value,is_primary_key,is_auto_increment,is_nullable,is_unique) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                [table_id, cols[i][0], cols[i][1], cols[i][2], cols[i][3], is_pk, is_auto_inc, is_nullable, is_unique]
            );
        }
        else if (cols[i][1] != 'NUMARIC') {//**there is no precision column in schema_columns table how can we store numaric data type precision?I temporarily just added  len */
            await query('INSERT INTO schema_columns(schema_table_id,col_name,col_type,col_length,default_value,is_primary_key,is_auto_increment,is_nullable,is_unique) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                [table_id, cols[i][0], cols[i][1], cols[i][2], cols[i][3][0], is_pk, is_auto_inc, is_nullable, is_unique]
            );
        }
    }
    return res.status(200).json({ msg: 'Table successfully created' });


});

router.post('/addCorsOrigin', requireAuth, async (req, res) => {
    const { proj_id, origin } = req.body;
    const isExist = await query('SELECT * FROM projects WHERE id=$1 AND author_id=$2', [proj_id, req.loggedInUser.id]);
    if (isExist.rows.length === 0) {
        return res.status(400).json({ msg: "You are not allowed to add cors origin of this project" });
    }
    if (origin.trim().length < 1) { return res.status(400).json({ msg: "Cors origin can not be blank" }); }
    const isOriginExist = await query('SELECT * FROM project_cors_origin WHERE project_id=$1 AND origin=$2', [proj_id, origin]);
    if (isOriginExist.rows.length > 0) {
        return res.status(400).json({ msg: "The project already have this cors origin" });
    }
    await query('INSERT INTO project_cors_origin(project_id,origin) VALUES($1,$2)', [proj_id, origin]);
    return res.status(200).json({ msg: "Successfully added cors origin" });

});

router.post('/removeCorsOrigin', requireAuth, async (req, res) => {
    const { proj_id, origin } = req.body;
    const isExist = await query('SELECT * FROM projects WHERE id=$1 AND author_id=$2', [proj_id, req.loggedInUser.id]);
    if (isExist.rows.length === 0) {
        return res.status(400).json({ msg: "You are not allowed to remove cors origin of this project" });
    }
    const isOriginExist = await query('SELECT * FROM project_cors_origin WHERE project_id=$1 AND origin=$2', [proj_id, origin]);
    if (isOriginExist.rows.length < 1) {
        return res.status(400).json({ msg: "The cors origin does not exist for this project" });
    }
    await query('DELETE FROM project_cors_origin WHERE project_id=$1 AND origin=$2', [proj_id, origin]);
    return res.status(200).json({ msg: "Successfully removed cors origin" });

});

module.exports = router;