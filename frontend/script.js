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

        let text = `Match ID: ${data.matchId}\n`;
        text += `Shots: ${data.shots}\n`;
        text += `xG: ${data.totalXG}\n\n`;

        text += "Team xG:\n";

        for (let team in data.teamTotals) {
            text += `${team}: ${data.teamTotals[team]}\n`;
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
            text += `${s.player}: ${s.xg}\n`;
        });

        output.textContent = text;

    } catch (err) {
        output.textContent = "Failed to load data";
        console.error(err);
    }
}
