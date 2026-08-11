// Fit the xG fallback model used by xg/model.js when statsbomb_xg is absent.
//
// L2-regularised logistic regression solved by damped Newton/IRLS. Separate models
// for open play and direct free kicks; penalties use the empirical conversion rate.
// Train/test is split by match so no shot from a test match influences training.
//
//   node xg/tools/extract-features.js data/events shots.tsv
//   LAM_OPEN=150 LAM_FK=60 node xg/tools/fit-model.js shots.tsv coef.json
//   SWEEP=1 node xg/tools/fit-model.js shots.tsv /dev/null   # regularisation sweep
//
// Paste the resulting coefficients into FITTED_MODEL in xg/model.js.
const fs = require('fs');

const TSV = process.argv[2];
const lines = fs.readFileSync(TSV, 'utf-8').trim().split('\n');
const cols = lines[0].split('\t');
const rows = lines.slice(1).map((l) => {
    const p = l.split('\t');
    const o = {};
    cols.forEach((c, i) => { o[c] = (c === 'type' || c === 'matchId') ? p[i] : Number(p[i]); });
    return o;
});
console.log('rows', rows.length);

// ---- shot classes -------------------------------------------------
// Exclude penalty shootouts (period 5): FotMob/Sofascore never count them in match xG.
const live = rows.filter((r) => r.period !== 5);
const pens = live.filter((r) => r.type === 'Penalty');
const fks = live.filter((r) => r.type === 'Free Kick');
const open = live.filter((r) => r.type === 'Open Play');
console.log('live', live.length, '| open', open.length, 'fk', fks.length, 'pen', pens.length,
    '| shootout excluded', rows.length - live.length);

const penRate = pens.reduce((a, r) => a + r.goal, 0) / pens.length;
const penSb = pens.reduce((a, r) => a + r.sbxg, 0) / pens.length;
console.log('penalty: empirical', penRate.toFixed(4), 'statsbomb mean', penSb.toFixed(4), 'n', pens.length);

// ---- feature builders --------------------------------------------
// GK features are imputed at the open-play mean when no freeze frame exists.
const gkMeans = {};
for (const k of ['gkDistToGoal', 'gkDistToShot', 'gkOffLine']) {
    const v = open.filter((r) => r.hasGk === 1).map((r) => r[k]);
    gkMeans[k] = v.reduce((a, b) => a + b, 0) / v.length;
}
const gk = (r, k) => (r.hasGk === 1 ? r[k] : gkMeans[k]);

function openFeats(r) {
    const d = Math.max(r.distance, 0.5);
    const a = Math.max(r.angle, 0.01);
    return {
        logDist: Math.log(d),
        invDist: 1 / d,
        logAngle: Math.log(a),
        head: r.head, otherBp: r.otherBp,
        volley: r.volley, halfVolley: r.halfVolley, lob: r.lob, awkward: r.awkward,
        pressure: r.pressure, firstTime: r.firstTime,
        oneOnOne: r.oneOnOne, openGoal: r.openGoal,
        followsDribble: r.followsDribble, aerialWon: r.aerialWon,
        fromCorner: r.fromCorner, fromFreeKick: r.fromFreeKick,
        fromThrowIn: r.fromThrowIn, fromCounter: r.fromCounter,
        gkDistToGoal: gk(r, 'gkDistToGoal'),
        gkOffLine: gk(r, 'gkOffLine'),
        gkInCone: r.hasGk === 1 ? r.gkInCone : 1,
        noGk: r.hasGk === 1 ? 0 : 1,
        defInCone: Math.min(r.defInCone, 6),
        defClose: Math.min(r.defClose, 4),
        mateInCone: Math.min(r.mateInCone, 4),
    };
}

function fkFeats(r) {
    const d = Math.max(r.distance, 0.5);
    const a = Math.max(r.angle, 0.01);
    // Direct free kicks: only ~3.3k training rows, so keep this deliberately
    // low-dimensional. invDist is dropped as collinear with logDist.
    return { logDist: Math.log(d), logAngle: Math.log(a), pressure: r.pressure };
}

// ---- linear algebra ----------------------------------------------
function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        [M[c], M[piv]] = [M[piv], M[c]];
        if (!Number.isFinite(M[c][c]) || Math.abs(M[c][c]) < 1e-10) {
            throw new Error(`singular Hessian at column ${c}`);
        }
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const f = M[r][c] / M[c][c];
            for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
    }
    // M is diagonal now: row[i] is the pivot, row[n] the rhs
    return M.map((row, i) => row[n] / row[i]);
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Fit on standardised features, then de-standardise the coefficients.
function fit(data, featFn, lambda = 1.0) {
    const names = Object.keys(featFn(data[0]));
    const X = data.map((r) => { const f = featFn(r); return names.map((n) => f[n]); });
    const y = data.map((r) => r.goal);
    const p = names.length;

    const mean = names.map((_, j) => X.reduce((a, row) => a + row[j], 0) / X.length);
    const sd = names.map((_, j) => {
        const m = mean[j];
        const v = X.reduce((a, row) => a + (row[j] - m) ** 2, 0) / X.length;
        return Math.sqrt(v) || 1;
    });
    const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / sd[j]));

    let w = new Array(p + 1).fill(0);
    w[0] = Math.log((y.reduce((a, b) => a + b, 0) + 1) / (y.length - y.reduce((a, b) => a + b, 0) + 1));

    const penLoss = (ww) => {
        let L = 0;
        for (let i = 0; i < Z.length; i++) {
            let eta = ww[0];
            for (let j = 0; j < p; j++) eta += ww[j + 1] * Z[i][j];
            const q = Math.min(Math.max(sigmoid(eta), 1e-12), 1 - 1e-12);
            L -= y[i] ? Math.log(q) : Math.log(1 - q);
        }
        for (let j = 1; j <= p; j++) L += 0.5 * lambda * ww[j] * ww[j];
        return L / Z.length;
    };

    for (let iter = 0; iter < 60; iter++) {
        const H = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0));
        const g = new Array(p + 1).fill(0);
        for (let i = 0; i < Z.length; i++) {
            const z = [1, ...Z[i]];
            let eta = 0;
            for (let j = 0; j <= p; j++) eta += w[j] * z[j];
            const mu = sigmoid(eta);
            const wt = Math.max(mu * (1 - mu), 1e-8);
            const resid = y[i] - mu;
            for (let j = 0; j <= p; j++) {
                g[j] += resid * z[j];
                for (let k = j; k <= p; k++) H[j][k] += wt * z[j] * z[k];
            }
        }
        for (let j = 0; j <= p; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
        for (let j = 1; j <= p; j++) { H[j][j] += lambda; g[j] -= lambda * w[j]; }

        const step = solve(H, g);

        // damped Newton: halve the step until the penalised loss actually decreases
        const before = penLoss(w);
        let t = 1, next = w, ok = false;
        for (let b = 0; b < 25; b++) {
            next = w.map((v, j) => v + t * step[j]);
            if (next.every(Number.isFinite) && penLoss(next) <= before + 1e-12) { ok = true; break; }
            t /= 2;
        }
        if (!ok) { console.log(`  line search stalled at iter ${iter + 1}, loss ${before.toFixed(6)}`); break; }
        const maxd = Math.max(...step.map((s) => Math.abs(s * t)));
        w = next;
        if (maxd < 1e-10) { console.log(`  converged in ${iter + 1} Newton steps, loss ${penLoss(w).toFixed(6)}`); break; }
        if (iter === 59) console.log(`  hit iteration cap, loss ${penLoss(w).toFixed(6)}, maxstep ${maxd.toExponential(2)}`);
    }

    // Predict in standardised space (numerically stable), but also export the
    // equivalent raw-feature coefficients for a closed-form implementation.
    const coef = {};
    let intercept = w[0];
    names.forEach((n, j) => {
        const b = w[j + 1] / sd[j];
        coef[n] = b;
        intercept -= b * mean[j];
    });
    return { intercept, coef, names, mean, sd, w, predict: (r) => {
        const f = featFn(r);
        let eta = w[0];
        for (let j = 0; j < names.length; j++) eta += w[j + 1] * (f[names[j]] - mean[j]) / sd[j];
        return sigmoid(eta);
    } };
}

// ---- split by match ----------------------------------------------
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000; return h; };
const isTest = (r) => hash(r.matchId) < 200;

function report(name, data, predict) {
    const ll = (set) => -set.reduce((a, r) => {
        const p = Math.min(Math.max(predict(r), 1e-9), 1 - 1e-9);
        return a + (r.goal ? Math.log(p) : Math.log(1 - p));
    }, 0) / set.length;
    const brier = (set) => set.reduce((a, r) => a + (predict(r) - r.goal) ** 2, 0) / set.length;
    const tr = data.filter((r) => !isTest(r)), te = data.filter((r) => isTest(r));
    const base = tr.reduce((a, r) => a + r.goal, 0) / tr.length;
    const llBase = -te.reduce((a, r) => a + (r.goal ? Math.log(base) : Math.log(1 - base)), 0) / te.length;
    console.log(`\n== ${name} == train ${tr.length} test ${te.length}`);
    console.log(`  logloss train ${ll(tr).toFixed(4)} test ${ll(te).toFixed(4)} (intercept-only ${llBase.toFixed(4)})`);
    console.log(`  brier   test ${brier(te).toFixed(4)}`);
    const sbll = -te.reduce((a, r) => {
        const p = Math.min(Math.max(r.sbxg, 1e-9), 1 - 1e-9);
        return a + (r.goal ? Math.log(p) : Math.log(1 - p));
    }, 0) / te.length;
    console.log(`  StatsBomb's own model on same test rows: logloss ${sbll.toFixed(4)}`);
    const sumP = te.reduce((a, r) => a + predict(r), 0), sumG = te.reduce((a, r) => a + r.goal, 0);
    console.log(`  calibration: predicted ${sumP.toFixed(1)} vs actual ${sumG} goals (ratio ${(sumP / sumG).toFixed(4)})`);
    const mae = te.reduce((a, r) => a + Math.abs(predict(r) - r.sbxg), 0) / te.length;
    console.log(`  per-shot MAE vs statsbomb_xg ${mae.toFixed(4)}`);
    // decile calibration
    const sorted = [...te].sort((a, b) => predict(a) - predict(b));
    const q = Math.ceil(sorted.length / 10);
    const bins = [];
    for (let i = 0; i < sorted.length; i += q) {
        const b = sorted.slice(i, i + q);
        bins.push(`${(b.reduce((a, r) => a + predict(r), 0) / b.length).toFixed(3)}/${(b.reduce((a, r) => a + r.goal, 0) / b.length).toFixed(3)}`);
    }
    console.log(`  decile pred/actual: ${bins.join('  ')}`);
}

const LAM_OPEN = Number(process.env.LAM_OPEN || 1.0);
const LAM_FK = Number(process.env.LAM_FK || 2.0);

if (process.env.SWEEP) {
    const testLL = (data, predict) => {
        const te = data.filter(isTest);
        return -te.reduce((a, r) => {
            const p = Math.min(Math.max(predict(r), 1e-9), 1 - 1e-9);
            return a + (r.goal ? Math.log(p) : Math.log(1 - p));
        }, 0) / te.length;
    };
    for (const [label, set, fn] of [['open', open, openFeats], ['fk', fks, fkFeats]]) {
        for (const lam of [0.1, 0.5, 1, 2, 5, 10, 25, 60, 150]) {
            const m = fit(set.filter((r) => !isTest(r)), fn, lam);
            const mx = Math.max(...Object.values(m.coef).map(Math.abs));
            console.log(`SWEEP ${label} lambda ${String(lam).padStart(5)} testLL ${testLL(set, m.predict).toFixed(5)} max|coef| ${mx.toFixed(2)}`);
        }
    }
    process.exit(0);
}

console.log('\nfitting open play...');
const openModel = fit(open.filter((r) => !isTest(r)), openFeats, LAM_OPEN);
report('open play', open, openModel.predict);

console.log('\nfitting direct free kicks...');
const fkModel = fit(fks.filter((r) => !isTest(r)), fkFeats, LAM_FK);
report('free kick', fks, fkModel.predict);

// ---- combined per-match evaluation --------------------------------
function predictAny(r) {
    if (r.type === 'Penalty') return penRate;
    if (r.type === 'Free Kick') return fkModel.predict(r);
    return openModel.predict(r);
}
const byMatch = {};
for (const r of live.filter(isTest)) {
    (byMatch[r.matchId] ||= []).push(r);
}
let maeNew = 0, maeOld = 0, biasNew = 0, n = 0;
const OLD = (r) => { // reproduce the current repo model
    const d = Math.min(r.distance / 40, 1);
    const a = Math.min(r.angle / (Math.PI / 2), 1);
    if (r.type === 'Penalty') return 0.79;
    const bf = r.head ? 0.7 : 1, tf = r.type === 'Free Kick' ? 0.6 : 1, pf = r.pressure ? 0.8 : 1;
    return Math.max(0, Math.min(1, sigmoid(-2.2 - 4.0 * d + 1.8 * a) * bf * tf * pf));
};
for (const m of Object.values(byMatch)) {
    const sb = m.reduce((a, r) => a + r.sbxg, 0);
    const nw = m.reduce((a, r) => a + predictAny(r), 0);
    const od = m.reduce((a, r) => a + OLD(r), 0);
    maeNew += Math.abs(nw - sb); maeOld += Math.abs(od - sb); biasNew += nw - sb; n++;
}
console.log(`\n== per-match total xG vs StatsBomb (${n} held-out matches) ==`);
console.log(`  new model  MAE ${(maeNew / n).toFixed(3)}  bias ${(biasNew / n).toFixed(3)}`);
console.log(`  old model  MAE ${(maeOld / n).toFixed(3)}`);

// Confirm the exported raw-feature closed form reproduces the standardised
// prediction, so xg/model.js can ship a plain formula with no mean/sd blob.
for (const [label, model, featFn, set] of [['open', openModel, openFeats, open], ['fk', fkModel, fkFeats, fks]]) {
    let worst = 0;
    for (const r of set) {
        const f = featFn(r);
        let eta = model.intercept;
        for (const n of model.names) eta += model.coef[n] * f[n];
        worst = Math.max(worst, Math.abs(sigmoid(eta) - model.predict(r)));
    }
    console.log(`closed-form equivalence (${label}): max abs diff ${worst.toExponential(3)}`);
}

fs.writeFileSync(process.argv[3], JSON.stringify({
    penRate, gkMeans,
    open: { intercept: openModel.intercept, coef: openModel.coef },
    fk: { intercept: fkModel.intercept, coef: fkModel.coef },
}, null, 2));
console.log('\ncoefficients written to', process.argv[3]);
