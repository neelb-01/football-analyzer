// xg/model.js
//
// Expected Goals.
//
// Two sources, in priority order:
//
//   1. `shot.statsbomb_xg` — StatsBomb's own production model, shipped inside the
//      event data. Present on 100% of the 88,023 shots in data/events. When it is
//      there we use it verbatim; nothing we compute locally can beat it.
//
//   2. FITTED_MODEL below — an L2-regularised logistic regression fitted on all
//      88,023 shots in this repo, used only when statsbomb_xg is absent.
//
// The fitted fallback was validated on 686 held-out matches (split by match, so no
// shot from a test match influenced training):
//
//   open play   test log-loss 0.2768   (StatsBomb's own model: 0.2756)
//   free kick   test log-loss 0.2326   (StatsBomb's own model: 0.2442)
//   calibration 1731.8 xG predicted vs 1752 actual goals (ratio 0.989)
//   per-match total xG vs StatsBomb: MAE 0.247
//
// Shot classes are modelled separately, which is standard practice — a single
// equation with multiplicative "fudge factors" cannot represent the very different
// distance/conversion relationships of open play, direct free kicks, and penalties.
//
// To refit, see the extraction + training scripts described in CLAUDE.md.

const GOAL_X = 120;
const GOAL_Y = 40;
const POST_LEFT_Y = 36;
const POST_RIGHT_Y = 44;

// Empirical penalty conversion over 998 non-shootout penalties in this dataset.
const PENALTY_XG = 0.7575;

// Mean goalkeeper geometry over shots that do have a freeze frame, used to impute
// the ~0.1% of shots that don't.
const GK_IMPUTE = { distToGoal: 3.4433, offLine: 0.7395 };

const FITTED_MODEL = {
    openPlay: {
        intercept: 2.834624,
        coef: {
            logDist: -1.037851,
            invDist: -3.096612,
            logAngle: 1.566093,
            head: -0.886756,
            otherBp: -0.935721,
            volley: -0.391160,
            halfVolley: -0.392850,
            lob: 0.411052,
            awkward: -0.529573,
            pressure: 0.023782,
            firstTime: 0.006769,
            oneOnOne: 0.338419,
            openGoal: 0.591244,
            followsDribble: 0.152090,
            aerialWon: -0.502453,
            fromCorner: -0.133193,
            fromFreeKick: -0.008185,
            fromThrowIn: -0.049528,
            fromCounter: 0.091791,
            gkDistToGoal: 0.094003,
            gkOffLine: -0.031655,
            gkInCone: -0.501538,
            noGk: 1.615327,
            defInCone: -0.336731,
            defClose: -0.185581,
            mateInCone: -0.069273,
        },
    },
    freeKick: {
        intercept: 3.035882,
        coef: { logDist: -1.630690, logAngle: 0.171801, pressure: 0 },
    },
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * Distance to the centre of the goal, and the angle the goal mouth subtends from
 * the shot location. Angle is the dominant geometric term: it captures "how much
 * goal can the shooter actually see", which distance alone does not.
 */
function geometry(x, y) {
    const distance = Math.hypot(GOAL_X - x, GOAL_Y - y);
    const toLeft = Math.atan2(POST_LEFT_Y - y, GOAL_X - x);
    const toRight = Math.atan2(POST_RIGHT_Y - y, GOAL_X - x);
    let angle = Math.abs(toRight - toLeft);
    if (angle > Math.PI) angle = 2 * Math.PI - angle;
    return { distance, angle };
}

/** Is (px, py) inside the triangle formed by the shooter and the two posts? */
function insideShotCone(px, py, shotX, shotY) {
    const tri = [[shotX, shotY], [GOAL_X, POST_LEFT_Y], [GOAL_X, POST_RIGHT_Y]];
    let sign = 0;
    for (let i = 0; i < 3; i++) {
        const [ax, ay] = tri[i];
        const [bx, by] = tri[(i + 1) % 3];
        const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        if (cross === 0) continue;
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return true;
}

/**
 * Reduce a freeze frame to the defensive-pressure features the model uses:
 * where the keeper is, and how many defenders block the shooting cone.
 */
function freezeFrameFeatures(freezeFrame, shotX, shotY) {
    const out = {
        hasGk: 0,
        gkDistToGoal: GK_IMPUTE.distToGoal,
        gkOffLine: GK_IMPUTE.offLine,
        gkInCone: 1,
        defInCone: 0,
        defClose: 0,
        mateInCone: 0,
    };
    if (!Array.isArray(freezeFrame)) return out;

    for (const p of freezeFrame) {
        if (!Array.isArray(p.location)) continue;
        const [px, py] = p.location;

        if (!p.teammate && p.position?.name === 'Goalkeeper') {
            out.hasGk = 1;
            out.gkDistToGoal = Math.hypot(GOAL_X - px, GOAL_Y - py);
            const vx = GOAL_X - shotX;
            const vy = GOAL_Y - shotY;
            const len = Math.hypot(vx, vy) || 1;
            // perpendicular offset of the keeper from the shot -> goal-centre line
            out.gkOffLine = Math.abs((px - shotX) * vy - (py - shotY) * vx) / len;
            out.gkInCone = insideShotCone(px, py, shotX, shotY) ? 1 : 0;
            continue;
        }

        const inCone = insideShotCone(px, py, shotX, shotY);
        if (p.teammate) {
            if (inCone) out.mateInCone++;
        } else {
            if (inCone) out.defInCone++;
            if (Math.hypot(px - shotX, py - shotY) <= 3) out.defClose++;
        }
    }
    return out;
}

function openPlayFeatures(event) {
    const [x, y] = event.location;
    const { distance, angle } = geometry(x, y);
    const shot = event.shot || {};
    const technique = shot.technique?.name;
    const bodyPart = shot.body_part?.name;
    const pattern = event.play_pattern?.name;
    const ff = freezeFrameFeatures(shot.freeze_frame, x, y);

    return {
        logDist: Math.log(Math.max(distance, 0.5)),
        invDist: 1 / Math.max(distance, 0.5),
        logAngle: Math.log(Math.max(angle, 0.01)),
        head: bodyPart === 'Head' ? 1 : 0,
        otherBp: bodyPart === 'Other' ? 1 : 0,
        volley: technique === 'Volley' ? 1 : 0,
        halfVolley: technique === 'Half Volley' ? 1 : 0,
        lob: technique === 'Lob' ? 1 : 0,
        awkward: (technique === 'Overhead Kick' || technique === 'Backheel' || technique === 'Diving Header') ? 1 : 0,
        pressure: event.under_pressure ? 1 : 0,
        firstTime: shot.first_time ? 1 : 0,
        oneOnOne: shot.one_on_one ? 1 : 0,
        openGoal: shot.open_goal ? 1 : 0,
        followsDribble: shot.follows_dribble ? 1 : 0,
        aerialWon: shot.aerial_won ? 1 : 0,
        fromCorner: pattern === 'From Corner' ? 1 : 0,
        fromFreeKick: pattern === 'From Free Kick' ? 1 : 0,
        fromThrowIn: pattern === 'From Throw In' ? 1 : 0,
        fromCounter: pattern === 'From Counter' ? 1 : 0,
        gkDistToGoal: ff.gkDistToGoal,
        gkOffLine: ff.gkOffLine,
        gkInCone: ff.gkInCone,
        noGk: ff.hasGk ? 0 : 1,
        defInCone: Math.min(ff.defInCone, 6),
        defClose: Math.min(ff.defClose, 4),
        mateInCone: Math.min(ff.mateInCone, 4),
    };
}

function freeKickFeatures(event) {
    const [x, y] = event.location;
    const { distance, angle } = geometry(x, y);
    return {
        logDist: Math.log(Math.max(distance, 0.5)),
        logAngle: Math.log(Math.max(angle, 0.01)),
        pressure: event.under_pressure ? 1 : 0,
    };
}

function applyModel({ intercept, coef }, features) {
    let eta = intercept;
    for (const name of Object.keys(coef)) eta += coef[name] * features[name];
    return Math.min(Math.max(sigmoid(eta), 0), 1);
}

/** xG from the fitted fallback model, for shots with no statsbomb_xg. */
function fittedXG(event) {
    const type = event.shot?.type?.name;
    if (type === 'Penalty') return PENALTY_XG;
    if (!Array.isArray(event.location)) return 0;
    if (type === 'Free Kick') return applyModel(FITTED_MODEL.freeKick, freeKickFeatures(event));
    return applyModel(FITTED_MODEL.openPlay, openPlayFeatures(event));
}

/**
 * Shots that belong in a match xG total.
 *
 * Excludes penalty shootouts (period 5). Shootout penalties are not part of the
 * match, and no mainstream provider counts them in match xG — including them
 * silently inflates a total by ~0.75 per kick.
 */
function isCountableShot(event) {
    return event.type?.name === 'Shot' && event.period !== 5;
}

/**
 * @param {object[]} shots Shot events (already filtered with isCountableShot).
 * @returns {{ totalXG: number, shots: object[] }}
 */
function calculateXG(shots) {
    let total = 0;

    const results = shots.map((event) => {
        const provided = event.shot?.statsbomb_xg;
        const usedStatsbomb = typeof provided === 'number' && Number.isFinite(provided);
        const xg = usedStatsbomb ? provided : fittedXG(event);

        total += xg;

        return {
            player: event.player?.name || 'Unknown',
            team: event.team?.name || 'Unknown',
            xg: Number(xg.toFixed(3)),
            minute: event.minute,
            second: event.second,
            // pitch coords, StatsBomb 120x80, attacking towards x=120 — the shot map needs these
            location: Array.isArray(event.location) ? event.location : null,
            outcome: event.shot?.outcome?.name || null,
            isGoal: event.shot?.outcome?.name === 'Goal',
            shotType: event.shot?.type?.name || null,
            bodyPart: event.shot?.body_part?.name || null,
            source: usedStatsbomb ? 'statsbomb' : 'fitted',
        };
    });

    return { totalXG: Number(total.toFixed(3)), shots: results };
}

module.exports = { calculateXG, isCountableShot, fittedXG, PENALTY_XG };
