console.log("SERVER FILE LOADED FROM:", __dirname);

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static("frontend"));

// xG model
function calculateXG(shots) {
    let total = 0;

    const results = shots.map(shot => {
        const x = shot.location?.[0] || 0;
        const y = shot.location?.[1] || 0;

        const goalX = 120;
        const goalY = 40;

        const dx = goalX - x;
        const dy = goalY - y;

        const distance = Math.sqrt(dx * dx + dy * dy);

        // --- ANGLE CALCULATION ---
        const leftPostY = 36;
        const rightPostY = 44;

        const angleToLeft = Math.atan2(leftPostY - y, goalX - x);
        const angleToRight = Math.atan2(rightPostY - y, goalX - x);

        let angle = Math.abs(angleToRight - angleToLeft);

        if (angle > Math.PI) {
            angle = 2 * Math.PI - angle;
        }

        // --- PENALTY OVERRIDE ---
        if (shot.shot?.type?.name === "Penalty") {
            total += 0.79;

            return {
                player: shot.player?.name || "Unknown",
                xg: 0.79
            };
        }

        // --- BODY PART FACTOR ---
        let bodyFactor = 1;
        const bodyPart = shot.shot?.body_part?.name;

        if (bodyPart === "Head") {
            bodyFactor = 0.7;  // headers generally lower xG
        }

        // --- SHOT TYPE FACTOR ---
        let typeFactor = 1;
        const shotType = shot.shot?.type?.name;

        if (shotType === "Free Kick") {
            typeFactor = 0.6;
        }

        // --- DEFENSIVE PRESSURE ---
        let pressureFactor = 1;

        if (shot.under_pressure === true) {
            pressureFactor = 0.8;
        }

        // --- LOGISTIC BASE MODEL ---
        const linear =
            -2.0
            - 0.04 * distance
            + 2.0 * angle;

        let xg = 1 / (1 + Math.exp(-linear));

        // Apply modifiers
        xg = xg * bodyFactor * typeFactor * pressureFactor;

        xg = Math.max(0, Math.min(1, xg));

        total += xg;

        return {
            player: shot.player?.name || "Unknown",
            xg: Number(xg.toFixed(3))
        };
    });

    return {
        totalXG: Number(total.toFixed(3)),
        shots: results
    };
}

// xG endpoint
app.get("/xg/:id", (req, res) => {
    const matchId = req.params.id;

    const filePath = path.join(
        __dirname,
        "data",
        "events",
        matchId + ".json"
    );

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Match not found" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    const shots = data.filter(
        e => e.type?.name === "Shot"
    );

    const result = calculateXG(shots);

    // --- TEAM TOTALS ---
    const teamTotals = {};

    shots.forEach((shot, index) => {
        const teamName = shot.team?.name || "Unknown";

        const shotXG = result.shots[index].xg;

        if (!teamTotals[teamName]) {
            teamTotals[teamName] = 0;
        }

        teamTotals[teamName] += shotXG;
    });

    // Round team totals
    for (let t in teamTotals) {
        teamTotals[t] = Number(teamTotals[t].toFixed(3));
    }

    // --- PLAYER TOTALS ---
    const playerTotals = {};

    result.shots.forEach(s => {
        if (!playerTotals[s.player]) {
            playerTotals[s.player] = 0;
        }
        playerTotals[s.player] += s.xg;
    });

    for (let p in playerTotals) {
        playerTotals[p] = Number(playerTotals[p].toFixed(3));
    }

    res.json({
        matchId,
        shots: shots.length,
        totalXG: result.totalXG,
        teamTotals,
        playerTotals,
        breakdown: result.shots
    });

    result.shots.forEach(s => {
        if (!playerTotals[s.player]) {
            playerTotals[s.player] = 0;
        }
        playerTotals[s.player] += s.xg;
    });

    for (let p in playerTotals) {
        playerTotals[p] = Number(playerTotals[p].toFixed(3));
    }

    res.json({
        matchId,
        shots: shots.length,
        totalXG: result.totalXG,
        playerTotals,
        breakdown: result.shots
    });
});

// Emergency test route
app.get("/ping", (req, res) => {
    res.send("PONG");
});

// Match endpoint
app.get("/match/:id", (req, res) => {
    const matchId = req.params.id;

    const filePath = path.join(
        __dirname,
        "data",
        "events",
        matchId + ".json"
    );

    console.log("Looking for:", filePath);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            error: "Match file not found",
            file: filePath
        });
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);

    res.json(json);
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
