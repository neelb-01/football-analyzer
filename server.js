console.log("SERVER FILE LOADED FROM:", __dirname);

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static("frontend"));

// Simple xG model (basic version)
function calculateXG(shots) {
    let total = 0;

    const results = shots.map(shot => {
        const x = shot.location?.[0] || 0;
        const y = shot.location?.[1] || 0;

        // Distance from goal (very rough)
        const distance = Math.sqrt(
            Math.pow(120 - x, 2) + Math.pow(40 - y, 2)
        );

        // Basic formula
        let xg = Math.max(0, 1 - distance / 50);

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

    res.json({
        matchId: matchId,
        shots: shots.length,
        totalXG: result.totalXG,
        breakdown: result.shots
    });
});

// Emergency test route
app.get("/ping", (req, res) => {
    res.send("PONG");
});

// Root test
app.get("/", (req, res) => {
    res.send("Football Analyzer Backend Running");
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
