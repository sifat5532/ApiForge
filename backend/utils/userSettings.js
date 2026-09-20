const ALLOWED_SETTINGS = {
    login_notifications: 'boolean',
    feedback_notifications: 'boolean',
    rating_notifications: 'boolean'
};

const DEFAULT_SETTINGS = {
    login_notifications: false,
    feedback_notifications: true,
    rating_notifications: true
};

module.exports = {
    ALLOWED_SETTINGS,
    DEFAULT_SETTINGS
};
