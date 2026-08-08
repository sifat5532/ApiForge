const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const query = require('./../db/query');
const router = express.Router();

const saltRounds = 10;


function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

const requireGuest = async (req, res, next) =>{
    if(req.cookies.session_token){
        const hashedToken = hashToken(req.cookies.session_token);
        const result = await query(
            'SELECT * FROM user_sessions WHERE session_token_hashed = $1 AND expires_at > now() AND revoked_at IS NULL',
            [hashedToken]
        );
        if(result.rows.length > 0){
            return res.status(409).json({msg: 'You are already logged in'});
        }else{
            res.clearCookie('session_token');
        }
    }
    next();
};

const requireAuth = async (req, res, next) =>{
    const token = req.cookies.session_token;
    if(!token){
        return res.status(403).json({msg: 'You are not logged in'});
    }else{
        const hashedToken = hashToken(token);
        const result = await query('SELECT * FROM user_sessions WHERE session_token_hashed = $1 AND expires_at > now() AND revoked_at IS NULL',[hashedToken]);
        if(result.rows.length === 0){
            res.clearCookie('session_token');
            return res.status(403).json({msg: 'You are not logged in'});
        }else{
            // await query('UPDATE user_sessions SET last_active_at = now() WHERE session_token_hashed = $1',[hashedToken]);
            
            const userData = await query('SELECT id, username, email, name from users WHERE id = $1',[result.rows[0].user_id]);
            req.loggedInUser = userData.rows[0];
            next();
        } 
    }
};

router.post('/register', requireGuest, async(req, res) =>{
    const { name, email, username, password, confirm_password} = req.body;
    if(!name || !email || !username || !password || !confirm_password){
        return res.status(400).json({msg: 'Please fill in all fields'});
    }
    if(email.indexOf('@') === -1){
        return res.status(400).json({msg: 'Please enter a valid email'});
    }
    if(password.length < 6){
        return res.status(400).json({msg: 'Password must be at least 6 characters'});
    }
    if(password !== confirm_password){
        return res.status(400).json({msg: 'Passwords do not match'});
    }

    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    if(result.rows.length > 0){
        return res.status(400).json({msg: 'Username already exists'});
    }

    const emailResult = await query('SELECT * FROM users WHERE email = $1', [email]);
    if(emailResult.rows.length > 0){
        return res.status(400).json({msg: 'There was an error, please try again later'}); // not gonna let anyone know if the email is already registered for security reasons
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    await query('INSERT INTO users (name, email, username, password_hash) VALUES ($1, $2, $3, $4)', [name, email, username, hashedPassword]);
    
    res.status(201).json({msg: 'User registered successfully'});
});

router.post('/login', requireGuest, async(req, res) =>{
    const { identity, password } = req.body;
    if(!identity || !password){
        return res.status(400).json({msg: 'Please fill in all fields'});
    }
    
    const result = await query('SELECT * FROM users WHERE username = $1 OR email = $1', [identity]);
    if(result.rows.length === 0){
        return res.status(400).json({msg: 'Invalid username/email or password'});
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if(!isMatch){
        return res.status(400).json({msg: 'Invalid username/email or password'});
    }

    const sessionToken = generateSessionToken();
    const hashedToken = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10); // 10 days
    await query(
        `INSERT INTO user_sessions (user_id, session_token_hashed, device_label, ip_address, expires_at, last_active_at)
        VALUES ($1, $2, $3, $4, $5, now())`,
        [
            user.id,
            hashedToken,
            req.headers['user-agent']?.slice(0, 100) || 'Unknown device',
            req.ip,
            expiresAt
        ]
    );
    res.cookie('session_token', sessionToken, {
        httpOnly: true, // Blocks JavaScript from reading this cookie via document.cookie
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // CORS protection
        maxAge: 1000 * 60 * 60 * 24 * 10
    });
    
    res.status(200).json({msg: 'Login successful'});
});

router.post('/logout', requireAuth, async(req, res) =>{
    res.clearCookie('session_token');
    res.status(200).json({msg: 'Logout successful'});
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireGuest = requireGuest;