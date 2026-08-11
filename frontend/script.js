async function loadMatch() {
    const id = document.getElementById("matchId").value;
    const output = document.getElementById("output");

    if (!id) {
        alert("Enter match ID");
        return;
    }

    output.textContent = "Loading xG...";

    try {
        const res = await fetch(`http://localhost:3000/xg/${id}`);
        const data = await res.json();

        if (data.error) {
            output.textContent = data.error;
            return;
        }

        // metadata lives under data.match, not on the root object
        const m = data.match;
        let text = `${m.homeTeam} ${m.score} ${m.awayTeam}\n`;
        text += `${m.competition} ${m.season} — ${m.date}\n\n`;
        text += `Shots: ${data.shots}\n`;
        text += `xG: ${data.totalXG}\n\n`;

        text += "\nTeam xG:\n";

        for (const [team, xg] of Object.entries(data.teamTotals)) {
            text += `${team}: ${xg}\n`;
        }

        text += "\n";

        // Leaderboard
        text += "🏆 Top Players (xG)\n\n";

        // Sort players by xG descending
        const sortedPlayers = Object.entries(data.playerTotals)
            .sort((a, b) => b[1] - a[1]);

        let rank = 1;

        sortedPlayers.forEach(([player, xg]) => {
            text += `${rank}. ${player}: ${xg}\n`;
            rank++;
        });

        text += "\n------------------\n\n";
        text += "Shot Breakdown:\n";

        // Individual shots
        data.breakdown.forEach(s => {
            text += `${s.minute}' ${s.player}: ${s.xg}${s.isGoal ? "  ⚽ GOAL" : ""}\n`;
        });

        output.textContent = text;

    } catch (err) {
        output.textContent = "Failed to load data";
        console.error(err);
    }
}
