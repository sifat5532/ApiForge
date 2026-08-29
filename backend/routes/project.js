const express = require('express');
const crypto = require('crypto');
const query = require('./../db/query');
const router = express.Router();
const { requireAuth } = require('./auth');
const pool = require('./../db/connection');
const checkPlanLimit = require('./../utils/planLimitChecker');
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

// ######################################################
//
// ######################################################

async function validateColumnDefault(pool, pgType, defaultValue) {
    try {
        await pool.query(`SELECT $1::${pgType}`, [defaultValue]);
        return true;
    }
    catch (err) {
        return false;
    }
}

const validateName = (req, res, name, instanceType, id) => {
    if (name >= '0' && name <= '9') {
        res.status(400).json({ msg: `${instanceType} name should start with letters(a to z) or _`, id });
        return { isResSent: true };
    }
    if (!/^[a-z_][a-z0-9_]{0,29}$/.test(name)) {
        res.status(400).json({ msg: `Please give ${instanceType} name within 30 characters using a-z, 0-9 or _ only`, id });
        return { isResSent: true };
    }
    if (PG_RESERVED_WORDS.has(name.toLowerCase())) {
        res.status(400).json({ msg: `Your given ${instanceType} name is a postgreSQL reserved word`, id });
        return { isResSent: true };
    }
    return { isResSent: false };

};

const requireProjectAuthor = async (req, res, next) => {
    const proj_id = req.body.proj_id ? req.body.proj_id : req.params.projectId;
    if (!proj_id) return res.status(400).json({ msg: "You should insert a project id with your request" });

    const result = await query('SELECT id FROM projects WHERE id=$1 AND author_id=$2', [proj_id, req.loggedInUser.id]);
    if (result.rows.length === 0) {
        return res.status(403).json({ msg: "You don't have access to make any change to this project" });
    }
    next();
};

//it also chk is if the proj is not a template 
const requireProjectAccess = async (req, res, next) => {
    const { proj_id } = req.body;
    if (!proj_id) return res.status(400).json({ msg: "You should insert a project id with your request" });

    const result = await query('SELECT id FROM projects WHERE id=$1 AND author_id=$2  AND is_template=$3', [proj_id, req.loggedInUser.id, false]);

    const isCollab = await query('SELECT project_id FROM project_collaborators WHERE project_id=$1 AND user_id=$2 AND role=$3 AND status=$4', [proj_id, req.loggedInUser.id, 'editor', 'accepted']);
    if (isCollab.rows.length === 0 && result.rows.length === 0) {
        return res.status(403).json({ msg: "You don't have access to make any change to this project" });
    }
    next();
};

const isProjectActive = async (req, res, next) => {
    const { proj_id } = req.body;
    if (!proj_id) return res.status(400).json({ msg: "You should insert a project id with your request" });

    const result = await query('SELECT id FROM projects WHERE id = $1 AND subscription_status = $2', [proj_id, 'active']);
    if (result.rows.length === 0) {
        return res.status(403).json({ msg: "Your project is locked. Upgrade your subscription to unlock it" });
    }
    next();
};

router.post('/createProject', requireAuth, async (req, res) => {
    const { proj_name, description, enable_auth, tags } = req.body;
    const author_id = req.loggedInUser.id;
    if (!proj_name) {
        return res.status(400).json({ msg: 'Please fill in project name' });
    }
    if (!/^[A-Za-z][a-zA-Z0-9_]{0,29}$/.test(proj_name)) {
        return res.status(400).json({ msg: 'Please give project name within 30 characters using a-z, 0-9 or _ only and first letter within a-z' });
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

    const result = await query('SELECT * FROM projects WHERE author_id = $1 AND name = $2', [author_id, proj_name]);
    if (result.rows.length > 0) {
        return res.status(400).json({ msg: 'You already have a project in this name' });
    }

    const api_key = crypto.randomBytes(32).toString('hex');
    const api_key_prefix = api_key.substring(0, 6);
    const api_key_hashed = crypto.createHash('sha256').update(api_key).digest('hex');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await checkPlanLimit(client, author_id, 'project');

        const proj = await client.query(`
            INSERT INTO projects
            (author_id, name, description, api_key_hashed, api_key_prefix, auth_enabled)
            VALUES($1, $2, $3, $4, $5, $6)
            RETURNING id`,
            [author_id, proj_name, description, api_key_hashed, api_key_prefix, (enable_auth === true ? true : false)]
        );
        const proj_id = proj.rows[0].id;
        if (tags != null) {
            for (let i = 0; i < tags.length; i++) {
                const t1 = tags[i].trim().toLowerCase();
                const tag_result = await client.query('SELECT id FROM tags WHERE name=$1', [t1]);
                let tag_id = -1;
                if (tag_result.rows.length === 0) {
                    const proj_tag = await client.query('INSERT INTO tags(name) VALUES($1) RETURNING id', [t1]);
                    tag_id = proj_tag.rows[0].id;
                }
                else tag_id = tag_result.rows[0].id;

                await client.query('INSERT INTO project_tags(project_id,tag_id) VALUES ($1,$2)', [proj_id, tag_id]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ msg: 'Project created successfully', api_key: api_key });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        if (e.code === '23505') { // this checking is specific to this route only
            return res.status(400).json({ msg: 'You already have a project in this name' });
        }
        res.status(e.status || 500).json({ msg: e.status ? e.message : 'There was a server side error, please try again later' });
    } finally {
        client.release();
    }
});

router.post('/regenerateKey', requireAuth, requireProjectAuthor, isProjectActive, async (req, res) => {
    const { proj_id } = req.body;

    const api_key = crypto.randomBytes(32).toString('hex');
    const api_key_prefix = api_key.substring(0, 6);
    const api_key_hashed = crypto.createHash('sha256').update(api_key).digest('hex');

    await query('UPDATE projects SET api_key_hashed = $1, api_key_prefix = $2 WHERE id = $3', [api_key_hashed, api_key_prefix, proj_id]);
    res.status(200).json({ msg: 'Api key regenerated successfully', api_key: api_key });

});

router.post('/collabInvitation', requireAuth, requireProjectAuthor, isProjectActive, async (req, res) => {
    const { proj_id, user_id } = req.body;
    if (user_id == req.loggedInUser.id) {
        return res.status(400).json({ msg: "You can't invite yourself as a collaborator" });
    }

    const findUser = await query('SELECT username FROM users WHERE id = $1', [user_id]);
    if (findUser.rows.length === 0) {
        return res.status(200).json({ msg: 'You are trying to add an invalid user' });
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
        await query('UPDATE project_collaborators SET status=$1, created_at=CURRENT_TIMESTAMP WHERE project_id=$2, AND user_id=$3;', ['rejected', proj_id, req.loggedInUser.id]);
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

router.post('/createTable', requireAuth, requireProjectAccess, isProjectActive, async (req, res) => {   //requreAccesProject
    const { proj_id, name, cols } = req.body;
    if (!proj_id || !name || !cols) {
        return res.status(400).json({ msg: "You should insert all necessary information" });
    }

    if (name == null || name.trim().length < 1) {
        return res.status(400).json({ msg: "Please fill the table name" });
    }
    const table_name = name.trim().toLowerCase();
    if (validateName(req, res, table_name, 'table', 'NULL').isResSent) return; // can be added table front end id here later

    if (cols == null || cols.length < 1) {
        return res.status(400).json({ msg: "You should create at least one column" });
    }
    if (cols.length > 100) {
        return res.status(400).json({ msg: "You can create at most 100 columns for a table" });
    }
    const isExist = await query('SELECT * FROM schema_tables WHERE project_id=$1 AND table_name=$2', [proj_id, table_name]);
    if (isExist.rows.length > 0) {
        return res.status(400).json({ msg: 'Your alredy have a table in the project in this name' });
    }

    for (let i = 0; i < cols.length; i++) {
        //0 col_name,1 col_type,2 default,3(array) col_len,4 is_pk,5 is_auto_inc
        // 6 is_nullable,7 is_unique, 8 element_id_frontend

        cols[i][2] = cols[i][2] == '' ? null : cols[i][2];
        cols[i][3] = cols[i][3] == '' ? 6 : (cols[i][3] < 6 ? cols[i][3] + 6 : cols[i][3]);

        cols[i][4] = cols[i][4] === true ? true : false; // is_pk
        cols[i][5] = cols[i][5] === true ? true : false; // is_auto_inc
        cols[i][6] = cols[i][6] === true ? true : false; // is_nullable
        cols[i][7] = cols[i][7] === true ? true : false; // is_unique

        if (cols[i][0] == null || cols[i][0].trim().length < 1) {
            return res.status(400).json({ msg: "Please in fill the column name", id: cols[i][8] });
        }
        const col_name = cols[i][0].trim().toLowerCase();
        if (validateName(req, res, col_name, 'column', cols[i][8]).isResSent) { return; }

        for (let j = 0; j < i; j++) {
            if (col_name == cols[j][0].trim().toLowerCase()) {
                return res.status(400).json({ msg: 'Every column name should be unique in a table', id: cols[i][8] });
            }
        }
        if (!(cols[i][1] === 'INTEGER' || cols[i][1] === 'TEXT' || cols[i][1] === 'NUMERIC' || cols[i][1] === 'BOOLEAN' || cols[i][1] === 'VARCHAR' || cols[i][1] === 'DATE' || cols[i][1] === 'TIMESTAMP')) {
            return res.status(400).json({ msg: 'Your given data type is not valid', id: cols[i][8] });
        }
        //used a pg function written on top to chk if default value matched with datatype 
        if (!await validateColumnDefault(pool, cols[i][1], cols[i][2])) {
            return res.status(400).json({ msg: 'Your given default value does not match with the give data type', id: cols[i][8] });
        }

        if (cols[i][1] === 'VARCHAR' || cols[i][1] === 'NUMERIC') {
            if (cols[i][3] < 1) return res.status(400).json({ msg: 'Give valid length of the column', id: cols[i][8] });
        }

        if (cols[i][5] === true && (cols[i][1] != 'INTEGER' || (cols[i][4] != true && cols[i][7] != true))) {
            return res.status(409).json({ msg: "Auto increment is not possible for this key", id: cols[i][8] });
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await checkPlanLimit(client, req.loggedInUser.id, 'table', proj_id);

        const result = await client.query('INSERT INTO schema_tables(project_id,table_name) VALUES($1, $2) RETURNING id', [proj_id, table_name]);
        const table_id = result.rows[0].id;

        let query_string = 'INSERT INTO schema_columns(schema_table_id, col_name, col_type, default_value, col_length, is_primary_key, is_auto_increment, is_nullable, is_unique) VALUES';
        let c = 1;
        const values = [];
        let values_param = '';
        for (let i = 0; i < cols.length; i++) {
            values_param += '(';
            for (let j = 0; j < cols[i].length; j++) { // ignoring the front end id but adding the table_id :)
                if (j != cols[i].length - 1) {
                    values_param += '$' + c + ', ';
                } else {
                    values_param += '$' + c;
                }
                if (j == 0) {
                    values.push(table_id);
                } else {
                    values.push(cols[i][j - 1]);
                }
                c++;
            }
            if (i != cols.length - 1) {
                values_param += '), '
            } else {
                values_param += ');'
            }
        }
        query_string += values_param;
        await client.query(query_string, values);

        await client.query('COMMIT');
        return res.status(200).json({ msg: 'Table successfully created' });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(e.status || 500).json({ msg: e.status ? e.message : 'There was a server side error, please try again later' });
    } finally {
        client.release();
    }
});

router.post('/addCorsOrigin', requireAuth, requireProjectAuthor, isProjectActive, async (req, res) => {
    const { proj_id, origin } = req.body;

    if (origin.trim().length < 1) { return res.status(400).json({ msg: "Cors origin can not be blank" }); }
    const isOriginExist = await query('SELECT * FROM project_cors_origin WHERE project_id = $1 AND origin = $2', [proj_id, origin]);
    if (isOriginExist.rows.length > 0) {
        return res.status(400).json({ msg: "The project already have this cors origin" });
    }
    await query(`
        INSERT INTO project_cors_origin
        (project_id, origin)
        VALUES($1, $2)
        ON CONFLICT (project_id, origin)
        DO NOTHING;`, [proj_id, origin]);
    return res.status(200).json({ msg: "Successfully added cors origin" });

});

router.post('/removeCorsOrigin', requireAuth, requireProjectAuthor, isProjectActive, async (req, res) => {
    const { proj_id, origin } = req.body;

    const isOriginExist = await query('SELECT * FROM project_cors_origin WHERE project_id = $1 AND origin = $2', [proj_id, origin]);
    if (isOriginExist.rows.length < 1) {
        return res.status(400).json({ msg: "The cors origin does not exist for this project" });
    }
    await query('DELETE FROM project_cors_origin WHERE project_id = $1 AND origin = $2', [proj_id, origin]);
    return res.status(200).json({ msg: "Successfully removed cors origin" });

});

router.post('/addForeignKey', requireAuth, requireProjectAccess, isProjectActive, async (req, res) => {
    const { proj_id, schema_table_id, child_col_id, parent_col_id, fk_constraint_name, on_dlt, on_upd } = req.body;
    if (child_col_id == parent_col_id) {
        return res.status(400).json({ msg: "Child column id and parent column id can not be same" });
    }
    const fk_name = fk_constraint_name.trim().toLowerCase();
    if (validateName(req, res, fk_name, 'fk_name', 'NULL').isResSent) return;
    const on_delete = on_dlt == null ? 'NO ACTION' : on_dlt.toUpperCase();
    const on_update = on_upd == null ? 'NO ACTION' : on_upd.toUpperCase();
    if (on_delete == null || (on_delete != 'CASCADE' && on_delete != 'SET NULL' && on_delete != 'RESTRICT' && on_delete != 'NO ACTION')) {
        return res.status(400).json({ msg: "on_delete foreign key action must be either 'CASCADE', 'SET NULL' , 'RESTRICT' or 'NO ACTION'" });
    }
    if (on_update != 'CASCADE' && on_update != 'SET NULL' && on_update != 'RESTRICT' && on_update != 'NO ACTION') {
        return res.status(400).json({ msg: "on_update foreign key action must be either 'CASCADE', 'SET NULL' 'NO ACTION' or 'RESTRICT'" });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;");
        const isExist = await client.query(`
                                    SELECT
                                        C.col_type AS child_col_type,
                                        C.is_nullable AS child_nullable,
                                        P.col_type AS parent_col_type
                                    FROM
                                        schema_columns C
                                        JOIN schema_columns P ON TRUE
                                        JOIN schema_tables Ct ON Ct.id = C.schema_table_id
                                        JOIN schema_tables Pt ON Pt.id = P.schema_table_id
                                        JOIN projects Pj ON Pj.id = Ct.project_id
                                        AND Pj.id = Pt.project_id
                                    WHERE
                                        C.id = $1
                                        AND P.id = $2
                                        AND (
                                            P.is_primary_key = $3
                                            OR P.is_unique = $4
                                        )
                                        AND Ct.id = $5
                                        AND pj.id = $6`,
            [child_col_id, parent_col_id, true, true, schema_table_id, proj_id]);
        if (isExist.rows.length < 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ msg: "Your input combination is not valid." });
        }
        if (isExist.rows[0].child_col_type != isExist.rows[0].parent_col_type) {
            await client.query('ROLLBACK');
            return res.status(400).json({ msg: "The child and parent column type should be same" });
        }
        if (isExist.rows[0].child_nullable === false && (on_delete === 'SET NULL' || on_update === 'SET NULL')) {
            await client.query('ROLLBACK');
            return res.status(409).json({ msg: "The child column does not allow null but you set null as foreign key delete on update action" });
        }
        const FkName = await client.query(`
                                    SELECT
                                        1
                                    FROM
                                        schema_tables T
                                        JOIN schema_columns C ON C.schema_table_id = T.id
                                    WHERE
                                        T.id = $1
                                        AND EXISTS (
                                            SELECT
                                                1
                                            FROM
                                                schema_foreign_keys Fk
                                            WHERE
                                                Fk.fk_name = $2
                                                AND Fk.child_col_id = C.id
                                        )`,
            [schema_table_id, fk_name]);
        if (FkName.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ msg: "You already have a Foreign key constraint in this name in this table" });
        }
        await client.query(`
                        INSERT INTO
                            schema_foreign_keys (
                                child_col_id,
                                parent_col_id,
                                fk_name,
                                on_delete,
                                on_update
                            )
                        VALUES
                            ($1, $2, $3, $4, $5)`,
            [child_col_id, parent_col_id, fk_name, on_delete, on_update]);
        await client.query("COMMIT");
        return res.status(200).json({ msg: "Foreign key constraint successfully added to the table" });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(e.status || 500).json({ msg: e.status ? e.message : 'There was a server side error, please try again later' });
    } finally {
        client.release();
    }
});

router.post('/removeForeignKey', requireAuth, isProjectActive, async (req, res) => {
    const { proj_id, schema_table_id, child_col_id } = req.body;
    const result = await query(`
                                DELETE FROM schema_foreign_keys FK USING schema_columns C,
                                schema_tables T,
                                projects P
                                WHERE
                                    FK.child_col_id = C.id
                                    AND C.schema_table_id = T.id
                                    AND T.project_id = P.id
                                    AND FK.child_col_id = $1
                                    AND T.id = $2
                                    AND P.id = $3
                                    AND (
                                        P.author_id = $4
                                        OR EXISTS (
                                            SELECT
                                                1
                                            FROM
                                                project_collaborators PC
                                            WHERE
                                                PC.project_id = P.id
                                                AND PC.user_id = $4
                                                AND PC.role = 'editor'
                                                AND PC.status = 'accepted'
                                        )
                                    )`,
        [child_col_id, schema_table_id, proj_id, req.loggedInUser.id]);

    if (result.rowCount === 0) return res.status(400).json({ msg: 'Can\'t remove the foreign key. Try again later!' });
    return res.status(200).json({ msg: 'Successfully deleted the foreign key' });

});


router.post('/createTemplate', requireAuth, async (req, res) => {
    const { template_name, proj_id } = req.body;
    const author_id = req.loggedInUser.id;
    if (!template_name) {
        return res.status(400).json({ msg: 'Please fill in project name' });
    }
    if (!/^[A-Za-z][a-zA-Z0-9_]{0,29}$/.test(template_name)) {
        return res.status(400).json({ msg: 'Please give tamplate name within 30 characters using a-z, 0-9 or _ only and first letter within a-z' });
    }

    const result = await query('SELECT * FROM projects WHERE author_id = $1 AND name = $2', [author_id, template_name]);
    if (result.rows.length > 0) {
        return res.status(400).json({ msg: 'You already have a project in this name' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const proj = await client.query(`
            SELECT 
            description, auth_enabled 
            FROM projects 
            WHERE id= $1 AND author_id = $2`, [proj_id, author_id]);
        if (proj.rows.length < 1) {
            await client.query('ROLLBACK ');
            return res.status(404).json({ msg: 'You are not allowed to create template of this project ' });
        }
        await checkPlanLimit(client, author_id, 'project');
        const template = await client.query(`
            INSERT INTO projects
            (author_id, name, description, auth_enabled, is_template, originates_from_id )
            VALUES($1, $2, $3, $4, $5, $6)
            RETURNING id`,
            [author_id, template_name, proj.rows[0].description, (proj.rows[0].auth_enabled === true ? true : false), true, proj_id]
        );
        const tags = await client.query(`
                        INSERT INTO project_tags 
                         (project_id, tag_id) 
                         SELECT $1, tag_id 
                         FROM project_tags 
                         WHERE project_id = $2 `,
            [template.rows[0].id, proj_id]);
        await client.query('COMMIT');
        res.status(201).json({ msg: 'Template created successfully' });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(e.status || 500).json({ msg: e.status ? e.message : 'There was a server side error, please try again later' });
    } finally {
        client.release();
    }
});

router.post('/cloneTemplate', requireAuth, async (req, res) => {
    const { clone_name, auth_enabled, cloned_from_id } = req.body;
    const author_id = req.loggedInUser.id;
    if (!clone_name) {
        return res.status(400).json({ msg: 'Please fill in clone name' });
    }
    if (!/^[A-Za-z][a-zA-Z0-9_]{0,29}$/.test(clone_name)) {
        return res.status(400).json({ msg: 'Please give clone name within 30 characters using a-z, 0-9 or _ only and first letter within a-z' });
    }

    const result = await query(`SELECT * 
                                FROM projects 
                                WHERE author_id = $1 AND name = $2`,
        [author_id, clone_name]);
    if (result.rows.length > 0) {
        return res.status(400).json({ msg: 'You already have a project in this name' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const template = await client.query(`
            SELECT 
            description
            FROM projects 
            WHERE id = $1 AND is_template = $2`, [cloned_from_id, true]);
        if (template.rows.length < 1) {
            await client.query('ROLLBACK');
            return res.status(404).json({ msg: 'You are not allowed to clone the template ' });
        }
        await checkPlanLimit(client, author_id, 'project');
        const clone = await client.query(`
            INSERT INTO projects
            (author_id, name, description, auth_enabled, is_clone, cloned_from_id )
            VALUES($1, $2, $3, $4, $5, $6)
            RETURNING id`,
            [author_id, clone_name, template.rows[0].description, (auth_enabled === true ? true : false), true, cloned_from_id]
        );
        const tags = await client.query(`
                        INSERT INTO project_tags 
                         (project_id, tag_id) 
                         SELECT $1, tag_id 
                         FROM project_tags 
                         WHERE project_id = $2 `,
            [clone.rows[0].id, cloned_from_id]);
        await client.query('COMMIT');
        res.status(201).json({ msg: 'Template cloned successfully' });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(e.status || 500).json({ msg: e.status ? e.message : 'There was a server side error, please try again later' });
    } finally {
        client.release();
    }
})

router.put('/updateProject/:projectId', requireAuth, requireProjectAuthor, async (req, res) => {
    const { proj_name, description, enable_auth, tags } = req.body;
    const author_id = req.loggedInUser.id;
    if (!proj_name && !description && enable_auth == null && !tags) {
        return res.status(400).json({ msg: 'Please provide the value you want to change' });
    }
    if (proj_name != null && !/^[A-Za-z][a-zA-Z0-9_]{0,29}$/.test(proj_name)) {
        return res.status(400).json({ msg: 'Please give project name within 30 characters using a-z, 0-9 or _ only and first letter within A-Z or a-z' });
    }

    if (description != null && description.length > 500) {
        return res.status(400).json({ msg: 'Please give project description within 500 characters' });
    }
    if (tags != null) {
         for (let i = 0; i < tags.length; i++) { // Try to complete all types of input validation before executing any query if its not query dependent;
            const t = tags[i].trim().toLowerCase();
            if (t.length < 2 || t.length > 20) return res.status(400).json({ msg: 'Tag length must be between 2 to 20 characters' });
            if (!(t[0] >= 'a' && t[0] <= 'z')) return res.status(400).json({ msg: 'Tag name must start with an alphabet(a-z or A-Z)' });
        }
        const tag_count = await query(`
                                    SELECT 
                                    COUNT(*) AS total
                                    FROM project_tags 
                                    WHERE project_id = $1 `, [req.params.projectId]);
        const total_tags = parseInt(tag_count.rows[0].total);
        if (tags.length + total_tags > 10) {
            return res.status(400).json({ msg: 'Adding more than 10 tags is not allowed!' });
        }
    }
    if (proj_name != null) {
        const result = await query('SELECT * FROM projects WHERE author_id = $1 AND name = $2', [author_id, proj_name]);
        if (result.rows.length > 0) {
            return res.status(400).json({ msg: 'You already have a project in this name' });
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            UPDATE projects
            SET 
            name = COALESCE($1 , name) , description = COALESCE($2 , description)  , auth_enabled = COALESCE($3 , auth_enabled)`,
            [proj_name, description, enable_auth]
        );
        if (tags != null) {
            for (let i = 0; i < tags.length; i++) {
                const t1 = tags[i].trim().toLowerCase();
                const tag_result = await client.query('SELECT id FROM tags WHERE name=$1', [t1]);
                let tag_id = -1;
                if (tag_result.rows.length === 0) {
                    const proj_tag = await client.query('INSERT INTO tags(name) VALUES($1) RETURNING id', [t1]);
                    tag_id = proj_tag.rows[0].id;
                }
                else tag_id = tag_result.rows[0].id;

                await client.query('INSERT INTO project_tags(project_id , tag_id) VALUES ($1,$2)', [req.params.projectId, tag_id]);
            }
        }
        await client.query('COMMIT');
        res.status(200).json({ msg: 'Project updated successfully' });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(e.status || 500).json({ msg: e.status ? e.message : 'There was a server side error, please try again later' });
    } finally {
        client.release();
    }
});

router.delete('/deleteProject/:projectId', requireAuth,  async (req, res) => {
    const result = await query('DELETE FROM projects WHERE id = $1 AND author_id = $2', [req.params.projectId, req.loggedInUser.id]);
    if(result.rowCount === 0)  return res.status(400).json({msg : "You don't have access to delete the project or the project doesn't exist."});
    return res.status(200).json({msg : "Project was deleted successfully"});
});
module.exports = router;