/**
 * stateLocations.js
 * ─────────────────────────────────────────────────────────────────────
 * State-neutral facade over the active state's location database.
 *
 * Feature code (dashboard rollups, geo-intelligence, grievance location
 * stats) imports THIS module rather than `telanganaLocations` directly, so
 * that retargeting the platform to another state is a one-line change here
 * instead of a hunt through every controller.
 *
 * This repo has already shipped against Punjab and Andhra Pradesh; the
 * indirection exists because that keeps happening.
 */

const {
    TELANGANA_DISTRICTS,
    TELANGANA_CONSTITUENCIES,
    TELANGANA_CITIES_AND_VILLAGES,
    TOWN_TO_CONSTITUENCY,
    ALL_TELANGANA_LOCATIONS,
    isTelanganaLocation,
} = require('./telanganaLocations');

/** Human-readable name of the state this deployment monitors. */
const STATE_NAME = 'Telangana';

/** Number of assembly constituencies, used for coverage percentages. */
const TOTAL_CONSTITUENCIES = 119;

module.exports = {
    STATE_NAME,
    TOTAL_CONSTITUENCIES,

    STATE_DISTRICTS: TELANGANA_DISTRICTS,
    STATE_CONSTITUENCIES: TELANGANA_CONSTITUENCIES,
    STATE_CITIES_AND_VILLAGES: TELANGANA_CITIES_AND_VILLAGES,
    ALL_STATE_LOCATIONS: ALL_TELANGANA_LOCATIONS,
    TOWN_TO_CONSTITUENCY,

    isStateLocation: isTelanganaLocation,
};
