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

        // Player totals
        text += "Player Totals:\n";

        for (let player in data.playerTotals) {
            text += `${player}: ${data.playerTotals[player]}\n`;
        }

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
