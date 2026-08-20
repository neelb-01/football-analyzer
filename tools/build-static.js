/**
 * Bake the API into static JSON.
 *
 * `data/` is 12 GB of StatsBomb events — far past what any host will take, and
 * nothing in it changes. But the API's *output* is small: every shot in every
 * match, xG resolved, comes to about 21 MB. So the deployed site is the output
 * with the input left behind.
 *
 * Writes, mirroring the express routes one-for-one:
 *
 *   frontend/api/matches.json      <- GET /matches
 *   frontend/api/xg/<id>.json      <- GET /xg/:id
 *
 * `GET /match/:id` (raw events, multi-MB) has no static equivalent and the
 * frontend never calls it — it stays a local-only route.
 *
 * Run before deploying:  npm run build
 */

const fs = require("fs");
const path = require("path");

const { calculateXG, isCountableShot } = require("../xg/model");
const { aggregateByPlayer, aggregateByTeam } = require("../xg/aggregate");
const { buildMetadataIndex } = require("../data/getMatchMetadata");
const { listAllMatches } = require("../data/listMatches");
const { getPlayerNames } = require("../data/getPlayerNames");

const ROOT = path.join(__dirname, "..");
const EVENTS = path.join(ROOT, "data", "events");
const OUT = path.join(ROOT, "frontend", "api");
const OUT_XG = path.join(OUT, "xg");

/**
 * The `/xg/:id` payload, assembled exactly as server.js does.
 *
 * The ordering matters and is load-bearing: display names are swapped in before
 * aggregation, because playerTotals is keyed by `player` and aggregating first
 * would key the totals by the registered name instead.
 */
function buildMatch(matchId, metadata) {
    const events = JSON.parse(fs.readFileSync(path.join(EVENTS, matchId + ".json"), "utf-8"));

    // isCountableShot also drops penalty shootouts, which are not match xG
    const shots = events.filter(isCountableShot);
    const xgResult = calculateXG(shots);

    const displayNames = getPlayerNames(matchId);
    const breakdown = xgResult.shots.map(shot => ({
        ...shot,
        player: displayNames[shot.player] || shot.player,
        playerFull: shot.player
    }));

    return {
        match: metadata,
        shots: shots.length,
        totalXG: xgResult.totalXG,
        teamTotals: aggregateByTeam(breakdown),
        playerTotals: aggregateByPlayer(breakdown),
        breakdown
    };
}

function main() {
    const started = Date.now();

    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT_XG, { recursive: true });

    process.stdout.write("indexing match metadata… ");
    const index = buildMetadataIndex();
    console.log(index.size + " matches");

    const ids = fs.readdirSync(EVENTS)
        .filter(f => f.endsWith(".json"))
        .map(f => path.basename(f, ".json"));

    console.log("building " + ids.length + " match files…");

    let written = 0, skipped = 0, bytes = 0;

    for (const id of ids) {
        const metadata = index.get(Number(id));

        // The live route 404s these rather than serving a match with no name on
        // it; a missing static file is the same answer.
        if (!metadata) { skipped++; continue; }

        const json = JSON.stringify(buildMatch(id, metadata));
        fs.writeFileSync(path.join(OUT_XG, id + ".json"), json);

        written++;
        bytes += Buffer.byteLength(json);

        if (written % 500 === 0) console.log("  " + written + " / " + ids.length);
    }

    const listJson = JSON.stringify(listAllMatches());
    fs.writeFileSync(path.join(OUT, "matches.json"), listJson);
    bytes += Buffer.byteLength(listJson);

    const mb = (bytes / 1024 / 1024).toFixed(1);
    const secs = ((Date.now() - started) / 1000).toFixed(0);

    console.log("");
    console.log("wrote   " + written + " match files + matches.json");
    if (skipped) console.log("skipped " + skipped + " (events present, no metadata)");
    console.log("size    " + mb + " MB");
    console.log("time    " + secs + "s");
    console.log("out     frontend/api/");
}

main();
