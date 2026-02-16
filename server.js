console.log("SERVER FILE LOADED FROM:", __dirname);

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// xG modules
const { calculateXG } = require("./xg/model");
const { aggregateByPlayer, aggregateByTeam } = require("./xg/aggregate");
const { getMatchMetadata } = require("./xg/metadata");

const app = express();
app.use(cors());
app.use(express.static("frontend"));

/* =========================
   ROUTES
========================= */

// Raw match events
app.get("/match/:id", (req, res) => {
    const matchId = req.params.id;

    const filePath = path.join(
        __dirname,
        "data",
        "events",
        matchId + ".json"
    );

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            error: "Match file not found",
            file: filePath
        });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
});

// xG + metadata endpoint
app.get("/xg/:id", (req, res) => {
    const matchId = req.params.id;

    const eventsPath = path.join(
        __dirname,
        "data",
        "events",
        matchId + ".json"
    );

    if (!fs.existsSync(eventsPath)) {
        return res.status(404).json({ error: "Match not found" });
    }

    const events = JSON.parse(fs.readFileSync(eventsPath, "utf-8"));

    const shots = events.filter(
        e => e.type?.name === "Shot"
    );

    const result = calculateXG(shots);

    const playerTotals = aggregateByPlayer(result.shots);
    const teamTotals = aggregateByTeam(result.shots);

    const metadata = getMatchMetadata(matchId);

    res.json({
        matchId,
        metadata,
        shots: shots.length,
        totalXG: result.totalXG,
        teamTotals,
        playerTotals,
        breakdown: result.shots
    });
});

/* =========================
   SERVER
========================= */

const PORT = 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});