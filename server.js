console.log("SERVER FILE LOADED FROM:", __dirname);

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// xG modules
const { calculateXG } = require("./xg/model");
const { aggregateByPlayer, aggregateByTeam } = require("./xg/aggregate");
const { getMatchMetadata } = require("./data/getMatchMetadata");
const { listAllMatches } = require("./data/listMatches");

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

// List available matches
app.get("/matches", (req, res) => {
    const matches = listAllMatches();
    res.json(matches);
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

    const metadata = getMatchMetadata(matchId);

    if (!metadata) {
        return res.status(404).json({ error: "Match metadata not found" });
    }

    const events = JSON.parse(fs.readFileSync(eventsPath, "utf-8"));

    const shots = events.filter(
        e => e.type?.name === "Shot"
    );

    const xgResult = calculateXG(shots);

    const playerTotals = aggregateByPlayer(xgResult.shots);
    const teamTotals = aggregateByTeam(xgResult.shots);

    res.json({
        match: metadata,
        shots: shots.length,
        totalXG: xgResult.totalXG,
        teamTotals,
        playerTotals,
        breakdown: xgResult.shots
    });
});

/* =========================
   SERVER
========================= */

const PORT = 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});