const pool = require('./connection');

async function query(text, params) {
    try {
        return await pool.query(text, params);
    } catch (err) {
        console.error(err);
        const e = new Error('There was a server side error, please try again later');
        e.status = 500;
        throw e;
    }
}


module.exports = query;