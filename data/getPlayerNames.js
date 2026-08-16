const fs = require("fs");
const path = require("path");

/**
 * Map each player's full registered name to the name a commentator would use.
 *
 * StatsBomb event data carries only the full legal name — "Lionel Andrés Messi
 * Cuccittini" — which no surname heuristic reduces to "Messi" reliably: Iberian
 * double surnames and French middle names pull in opposite directions. The
 * lineup files carry `player_nickname` for exactly this, and where it is null
 * the full name is already short and correct ("Antoine Griezmann").
 *
 * Joins on full name, which is safe: both files come from the same source.
 *
 * @param {string|number} matchId
 * @returns {Object<string,string>} full name -> display name. Empty if the
 *          lineup file is missing, in which case callers keep the full name.
 */
function getPlayerNames(matchId) {
    const file = path.join(__dirname, "lineups", matchId + ".json");
    if (!fs.existsSync(file)) return {};

    const names = {};

    try {
        const teams = JSON.parse(fs.readFileSync(file, "utf-8"));

        for (const team of teams) {
            for (const player of team.lineup || []) {
                if (player.player_name && player.player_nickname) {
                    names[player.player_name] = player.player_nickname;
                }
            }
        }
    } catch {
        return {};
    }

    return names;
}

module.exports = { getPlayerNames };
