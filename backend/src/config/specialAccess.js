// Single hardcoded account allowed to hard-edit/delete grievances & alerts.
const SPECIAL_ACCESS_EMAIL = 'sreenu@gmail.com';

const isSpecialUser = (user) => user?.email === SPECIAL_ACCESS_EMAIL;

module.exports = { SPECIAL_ACCESS_EMAIL, isSpecialUser };
