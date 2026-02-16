// xg/metadata.js
const fs = require("fs");
const path = require("path");

function getMatchMetadata(matchId) {
    const matchesDir = path.join(__dirname, "..", "data", "matches");

    const competitions = fs.readdirSync(matchesDir);

    for (const compId of competitions) {
        const compPath = path.join(matchesDir, compId);
        const seasons = fs.readdirSync(compPath);

        for (const seasonFile of seasons) {
            const seasonPath = path.join(compPath, seasonFile);
            const matches = JSON.parse(fs.readFileSync(seasonPath, "utf-8"));

            const match = matches.find(m => String(m.match_id) === String(matchId));
            if (match) {
                return {
                    competition: match.competition?.competition_name,
                    season: match.season?.season_name,
                    date: match.match_date,
                    homeTeam: match.home_team?.home_team_name,
                    awayTeam: match.away_team?.away_team_name,
                    homeScore: match.home_score,
                    awayScore: match.away_score
                };
            }
        }
    }

    return null;
}

module.exports = { getMatchMetadata };