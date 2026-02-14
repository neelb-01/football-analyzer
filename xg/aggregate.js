// xg/aggregate.js

function aggregateByPlayer(shots) {
    const totals = {};

    shots.forEach(s => {
        if (!totals[s.player]) totals[s.player] = 0;
        totals[s.player] += s.xg;
    });

    for (let p in totals) {
        totals[p] = Number(totals[p].toFixed(3));
    }

    return totals;
}

function aggregateByTeam(shots, shotResults) {
    const totals = {};

    shots.forEach((shot, index) => {
        const teamName = shot.team?.name || "Unknown";
        const xg = shotResults[index].xg;

        if (!totals[teamName]) totals[teamName] = 0;
        totals[teamName] += xg;
    });

    for (let t in totals) {
        totals[t] = Number(totals[t].toFixed(3));
    }

    return totals;
}

module.exports = {
    aggregateByPlayer,
    aggregateByTeam
};