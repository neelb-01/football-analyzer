const fs = require("fs");
const path = require("path");

function toMetadata(match) {
    return {
        matchId: match.match_id,
        date: match.match_date,
        kickOff: match.kick_off,
        competition: match.competition.competition_name,
        season: match.season.season_name,
        homeTeam: match.home_team.home_team_name,
        awayTeam: match.away_team.away_team_name,
        score: `${match.home_score}–${match.away_score}`,
        stadium: match.stadium?.name || null,
        referee: match.referee?.name || null
    };
}

/**
 * Walk every competition/season file once and key the lot by match id.
 *
 * Events are addressed directly by match id but metadata is not, so resolving a
 * single id otherwise means scanning `matches/**` until it turns up — 25ms a
 * call, and the static build needs all 3464 of them. Building the whole index
 * costs about as much as one miss.
 *
 * @returns {Map<number,object>} match id -> metadata, first occurrence wins.
 */
function buildMetadataIndex() {
    const matchesDir = path.join(__dirname, "matches");
    const index = new Map();

    for (const compId of fs.readdirSync(matchesDir)) {
        const compPath = path.join(matchesDir, compId);
        if (!fs.statSync(compPath).isDirectory()) continue;

        for (const seasonFile of fs.readdirSync(compPath)) {
            const seasonPath = path.join(compPath, seasonFile);
            const matches = JSON.parse(fs.readFileSync(seasonPath, "utf-8"));

            for (const match of matches) {
                if (!index.has(match.match_id)) index.set(match.match_id, toMetadata(match));
            }
        }
    }

    return index;
}

// Cached for the life of the process — `data/` is a static dump, so a new match
// file means a restart.
let index = null;

function getMatchMetadata(matchId) {
    if (!index) index = buildMetadataIndex();
    return index.get(Number(matchId)) || null;
}

module.exports = { getMatchMetadata, buildMetadataIndex };