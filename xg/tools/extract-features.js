// Extract per-shot features + labels from StatsBomb events into a compact TSV.
const fs = require('fs');
const path = require('path');

const EVENTS = process.argv[2];
const OUT = process.argv[3];

const GOAL_X = 120, GOAL_Y = 40, POST_L = 36, POST_R = 44;

function geom(x, y) {
    const dx = GOAL_X - x, dy = GOAL_Y - y;
    const distance = Math.hypot(dx, dy);
    // angle subtended by the goal mouth from the shot location
    const aL = Math.atan2(POST_L - y, GOAL_X - x);
    const aR = Math.atan2(POST_R - y, GOAL_X - x);
    let angle = Math.abs(aR - aL);
    if (angle > Math.PI) angle = 2 * Math.PI - angle;
    return { distance, angle };
}

// is point p inside triangle (shooter, leftPost, rightPost)
function inCone(px, py, sx, sy) {
    const tri = [[sx, sy], [GOAL_X, POST_L], [GOAL_X, POST_R]];
    let sign = 0;
    for (let i = 0; i < 3; i++) {
        const [ax, ay] = tri[i], [bx, by] = tri[(i + 1) % 3];
        const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        if (cross === 0) continue;
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return true;
}

function features(e) {
    const [x, y] = e.location;
    const { distance, angle } = geom(x, y);
    const s = e.shot;
    const ff = Array.isArray(s.freeze_frame) ? s.freeze_frame : [];

    let gkDistToGoal = -1, gkDistToShot = -1, gkOffLine = -1, gkInCone = 0, hasGk = 0;
    let defInCone = 0, defClose = 0, mateInCone = 0;

    for (const p of ff) {
        const [px, py] = p.location;
        const isGk = p.position?.name === 'Goalkeeper';
        if (isGk && !p.teammate) {
            hasGk = 1;
            gkDistToGoal = Math.hypot(GOAL_X - px, GOAL_Y - py);
            gkDistToShot = Math.hypot(px - x, py - y);
            // perpendicular distance of GK from the shot->goal-centre line
            const vx = GOAL_X - x, vy = GOAL_Y - y;
            const L = Math.hypot(vx, vy) || 1;
            gkOffLine = Math.abs((px - x) * vy - (py - y) * vx) / L;
            gkInCone = inCone(px, py, x, y) ? 1 : 0;
            continue;
        }
        const cone = inCone(px, py, x, y);
        if (!p.teammate) {
            if (cone) defInCone++;
            if (Math.hypot(px - x, py - y) <= 3) defClose++;
        } else if (cone) mateInCone++;
    }

    const tech = s.technique?.name || 'Normal';
    const pp = e.play_pattern?.name || 'Regular Play';
    const bp = s.body_part?.name || 'Right Foot';

    return {
        goal: s.outcome?.name === 'Goal' ? 1 : 0,
        sbxg: typeof s.statsbomb_xg === 'number' ? s.statsbomb_xg : -1,
        type: s.type?.name || 'Open Play',
        period: e.period,
        distance, angle,
        x, y,
        head: bp === 'Head' ? 1 : 0,
        otherBp: bp === 'Other' ? 1 : 0,
        volley: tech === 'Volley' ? 1 : 0,
        halfVolley: tech === 'Half Volley' ? 1 : 0,
        lob: tech === 'Lob' ? 1 : 0,
        awkward: (tech === 'Overhead Kick' || tech === 'Backheel' || tech === 'Diving Header') ? 1 : 0,
        pressure: e.under_pressure ? 1 : 0,
        firstTime: s.first_time ? 1 : 0,
        oneOnOne: s.one_on_one ? 1 : 0,
        openGoal: s.open_goal ? 1 : 0,
        followsDribble: s.follows_dribble ? 1 : 0,
        aerialWon: s.aerial_won ? 1 : 0,
        fromCorner: pp === 'From Corner' ? 1 : 0,
        fromFreeKick: pp === 'From Free Kick' ? 1 : 0,
        fromThrowIn: pp === 'From Throw In' ? 1 : 0,
        fromCounter: pp === 'From Counter' ? 1 : 0,
        hasGk, gkDistToGoal, gkDistToShot, gkOffLine, gkInCone,
        defInCone, defClose, mateInCone,
    };
}

const COLS = ['matchId', 'goal', 'sbxg', 'type', 'period', 'distance', 'angle', 'x', 'y', 'head', 'otherBp',
    'volley', 'halfVolley', 'lob', 'awkward', 'pressure', 'firstTime', 'oneOnOne', 'openGoal',
    'followsDribble', 'aerialWon', 'fromCorner', 'fromFreeKick', 'fromThrowIn', 'fromCounter',
    'hasGk', 'gkDistToGoal', 'gkDistToShot', 'gkOffLine', 'gkInCone', 'defInCone', 'defClose', 'mateInCone'];

const files = fs.readdirSync(EVENTS).filter((f) => f.endsWith('.json'));
const out = fs.createWriteStream(OUT);
out.write(COLS.join('\t') + '\n');

let nShots = 0, nFiles = 0, nBad = 0;
for (const f of files) {
    let ev;
    try {
        ev = JSON.parse(fs.readFileSync(path.join(EVENTS, f), 'utf-8'));
    } catch (err) { nBad++; continue; }
    if (!Array.isArray(ev)) { nBad++; continue; }
    const matchId = f.replace(/\.json$/, '');
    for (const e of ev) {
        if (e.type?.name !== 'Shot' || !e.shot || !Array.isArray(e.location)) continue;
        const r = features(e);
        r.matchId = matchId;
        out.write(COLS.map((c) => {
            const v = r[c];
            return typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : v;
        }).join('\t') + '\n');
        nShots++;
    }
    nFiles++;
    if (nFiles % 500 === 0) console.log(`  ${nFiles}/${files.length} files, ${nShots} shots`);
}
out.end();
console.log(`done: ${nFiles} files, ${nShots} shots, ${nBad} unreadable`);
