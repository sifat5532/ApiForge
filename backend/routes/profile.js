const express = require('express');
const query = require('./../db/query');
const pool = require('./../db/connection');
const { requireAuth } = require('./auth');
const bcrypt = require('bcrypt');
const router = express.Router();

const saltRounds = 10;
const ALLOWED_SETTINGS = {
    login_notifications: 'boolean',
    feedback_notifications: 'boolean',
    rating_notifications: 'boolean'
   
};
const DEFAULT_SETTINGS = {
    login_notifications: true,
    feedback_notifications: true,
    rating_notifications: true
   
};
router.patch('/updateProfile' , requireAuth , async ( req ,res )=>{
    const {  username ,name , email } = req.body;
    if (!name || !email || !username ) {
        return res.status(400).json({ msg: 'None of the field can be empty' });
    }
    if (email.indexOf('@') === -1) {
        return res.status(400).json({ msg: 'Please enter a valid email' });
    }
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0 && result.rows[0].id !=  req.loggedInUser.id ) {
        return res.status(400).json({ msg: 'Username already exists' });
    }

    const emailResult = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (emailResult.rows.length > 0 && emailResult.rows[0].id !=  req.loggedInUser.id ) {
        return res.status(400).json({ msg: 'There was an error, please try again later' }); // not gonna let anyone know if the email is already registered for security reasons
    }
   
      await query(`
                        UPDATE users SET username = $1 , name = $2 , email = $3 where id = $4`, [ username , name , email , req.loggedInUser.id ]);
      return res.status(200).json( {msg : 'profile successfully updated'} );
});

router.patch('/changePassword' , requireAuth , async( req , res)=>{

    const { current_password , new_password ,confirm_password} = req.body;
    if (!current_password || !new_password || !confirm_password) {
        return res.status(400).json({ msg: 'Please fill in all fields' });
    }
     if (new_password !== confirm_password) {
        return res.status(400).json({ msg: 'Passwords do not match' });
    }
     if (new_password !== confirm_password) {
        return res.status(400).json({ msg: 'Passwords do not match' });
    }
    if(current_password === new_password)  return res.status(400).json({ msg : 'Current and new passsword can not be same' });
    const result = await query('SELECT * FROM users WHERE id = $1 ', [req.loggedInUser.id]);
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
        return res.status(400).json({ msg: 'Invalid password' });
    }
   
    const hashedPassword = await bcrypt.hash(new_password, saltRounds);
    await query(`
                              UPDATE users SET password_hash = $2  WHERE id = $1 ` ,
                              [req.loggedInUser.id , hashedPassword]);
     await query(
            `UPDATE user_sessions
             SET revoked_at = now()
             WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL
            `,
            [req.loggedInUser.id  , req.currentSession.id]
        );
      
     res.status(200).json( { msg: 'Password successfully changed' } );
     
});
router.get('/viewUserSessions', requireAuth, async (req, res) => {

    const result = await query(`
                            SELECT 
                            id ,
                            user_id , 
                            device_label ,
                            ip_address ,
                            created_at ,
                            expires_at ,
                            last_active_at ,
                            revoked_at 
                            FROM user_sessions 
                            WHERE user_id = $1 AND created_at > CURRENT_DATE - INTERVAL '1 month'
                            ORDER BY last_active_at DESC 
                            `, [req.loggedInUser.id]
    );
      const sessions = result.rows.map(s => ({
            ...s,
            is_current: s.id === req.currentSession.id
        }));
    res.status(200).json({ msg: "Successfully show user sessions", data: result.rows , data : sessions });
});
router.post('/logoutothersSessions', requireAuth, async (req, res) => {
    
        await query(
            `UPDATE user_sessions
             SET revoked_at = now()
             WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
            [req.loggedInUser.id, req.currentSession.id]
        );
        return res.status(200).json({ msg: 'Logged out of all other devices' });
  
});
router.delete('/removeSessions/:id', requireAuth, async (req, res) => {

        const sessionId = req.params.id;
        const result = await query(
            `UPDATE user_sessions
             SET revoked_at = now()
             WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
             RETURNING id`,
            [sessionId, req.loggedInUser.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Session not found' });
        }
        return res.status(200).json({ msg: 'Session revoked' });
  
});
router.get('/settings', requireAuth, async (req, res) => {
  
        const result = await query('SELECT settings FROM users WHERE id = $1', [req.loggedInUser.id]);
        const settings = { ...DEFAULT_SETTINGS, ...result.rows[0].settings };
        return res.status(200).json({ settings });
});
router.patch('/settings/:key', requireAuth, async (req, res) => {
   
        const { key } = req.params;
        const { value } = req.body;

        if (!Object.prototype.hasOwnProperty.call(ALLOWED_SETTINGS, key)) {
            return res.status(400).json({ msg: 'Unknown setting' });
        }
        if (typeof value !== 'boolean') {
            return res.status(400).json({ msg: 'Value must be true or false' });
        }

        // jsonb_set merges the single key in without clobbering the rest of the object
        const result = await query(
            `UPDATE users
             SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), $1, $2::jsonb, true)
             WHERE id = $3
             RETURNING settings`,
            [`{${key}}`, JSON.stringify(value), req.loggedInUser.id]
        );

        return res.status(200).json({ settings: result.rows[0].settings });
   
});
module.exports = router;