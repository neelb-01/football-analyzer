const fs = require("fs");
const path = require("path");

function listAllMatches() {
    const matchesDir = path.join(__dirname, "matches");
    const results = [];

    const competitions = fs.readdirSync(matchesDir);

    for (const compId of competitions) {
        const compPath = path.join(matchesDir, compId);
        if (!fs.statSync(compPath).isDirectory()) continue;

        const seasons = fs.readdirSync(compPath);

        for (const seasonFile of seasons) {
            const seasonPath = path.join(compPath, seasonFile);
            const matches = JSON.parse(fs.readFileSync(seasonPath, "utf-8"));

            matches.forEach(match => {
                results.push({
                    matchId: match.match_id,
                    date: match.match_date,
                    competition: match.competition.competition_name,
                    season: match.season.season_name,
                    homeTeam: match.home_team.home_team_name,
                    awayTeam: match.away_team.away_team_name,
                    score: `${match.home_score}–${match.away_score}`
                });
            });
        }
    }

    return results;
}

module.exports = { listAllMatches };