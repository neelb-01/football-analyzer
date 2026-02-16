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

function aggregateByTeam(shots) {
    const totals = {};

    shots.forEach(s => {
        if (!totals[s.team]) totals[s.team] = 0;
        totals[s.team] += s.xg;
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