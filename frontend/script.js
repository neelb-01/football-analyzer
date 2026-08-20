/* Football Analyzer — "Floodlit"
   Renders one match: the dual scoreline, the xG race, the shot map, the log. */

/* The data is static. `npm run build` bakes what the API used to compute into
   frontend/api/, so these are plain files — served by the express server in dev
   and by the host in production, with no route doing 12 GB of work per request.
   Relative paths, so the site works from any mount point. */
const MATCH_LIST = "api/matches.json";
const matchFile = (id) => `api/xg/${id}.json`;

const HOME = "var(--lamp)";   // cold floodlight
const AWAY = "var(--sodium)"; // warm sodium

const stage = document.getElementById("stage");
const search = document.getElementById("matchSearch");
const list = document.getElementById("matchList");

let allMatches = [];
let options = [];
let active = -1;

/* ------------------------------------------------------------------ helpers */

const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt2 = (n) => n.toFixed(2);

/**
 * Names arrive already shortened to the commentary form by the server, which
 * reads `player_nickname` from the lineups. A few players have no nickname and
 * a long registered name; trim those to the surname pair so a chart label fits.
 */
function labelName(name) {
    if (name.length <= 18) return name;
    const parts = name.trim().split(/\s+/);
    return parts.length > 2 ? parts.slice(-2).join(" ") : name;
}

function prettyDate(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------- match picker */

async function loadMatchList() {
    try {
        const res = await fetch(MATCH_LIST);
        allMatches = await res.json();
        allMatches.sort((a, b) => (a.date < b.date ? 1 : -1));
        renderJumps();
    } catch {
        search.placeholder = "Match list unavailable — enter an ID";
    }
}

function filterMatches(q) {
    const term = q.trim().toLowerCase();
    if (!term) return allMatches.slice(0, 40);
    return allMatches
        .filter((m) =>
            `${m.homeTeam} ${m.awayTeam} ${m.competition} ${m.season} ${m.matchId}`
                .toLowerCase()
                .includes(term))
        .slice(0, 40);
}

function openList(q) {
    options = filterMatches(q);
    active = -1;

    if (!options.length) {
        list.innerHTML = `<li class="picker-none">No match for “${esc(q)}”.</li>`;
    } else {
        list.innerHTML = options
            .map(
                (m, i) => `
        <li class="opt" role="option" id="opt-${i}" aria-selected="false" data-i="${i}">
          <span>${esc(m.homeTeam)} v ${esc(m.awayTeam)}
            <span class="opt-meta">— ${esc(m.competition)} ${esc(m.season)}</span>
          </span>
          <span class="opt-score">${esc(m.score)}</span>
        </li>`)
            .join("");
    }

    list.hidden = false;
    search.setAttribute("aria-expanded", "true");
}

function closeList() {
    list.hidden = true;
    search.setAttribute("aria-expanded", "false");
    search.removeAttribute("aria-activedescendant");
    active = -1;
}

function setActive(i) {
    const items = list.querySelectorAll(".opt");
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, n) => el.setAttribute("aria-selected", String(n === active)));
    items[active].scrollIntoView({ block: "nearest" });
    search.setAttribute("aria-activedescendant", `opt-${active}`);
}

function choose(i) {
    const m = options[i];
    if (!m) return;
    search.value = `${m.homeTeam} v ${m.awayTeam}`;
    closeList();
    loadMatch(m.matchId);
}

search.addEventListener("input", () => openList(search.value));
search.addEventListener("focus", () => openList(search.value));

search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) openList(search.value); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
        e.preventDefault();
        if (active >= 0) choose(active);
        else if (/^\d+$/.test(search.value.trim())) { closeList(); loadMatch(search.value.trim()); }
        else if (options.length) choose(0);
    } else if (e.key === "Escape") closeList();
});

list.addEventListener("mousedown", (e) => {
    const opt = e.target.closest(".opt");
    if (opt) { e.preventDefault(); choose(Number(opt.dataset.i)); }
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".picker")) closeList();
});

/* --------------------------------------------------------------- empty state */

const PRESETS = [
    { id: 3773565, note: "0–4, but 1.49 xG" },
    { id: 3869685, note: "the 2022 final" },
    { id: 18243, note: "extra time in Milan" },
];

function renderJumps() {
    const ul = document.getElementById("emptyJump");
    if (!ul) return;

    const rows = PRESETS
        .map((p) => ({ p, m: allMatches.find((m) => m.matchId === p.id) }))
        .filter((r) => r.m);

    if (!rows.length) return;

    ul.innerHTML = rows
        .map(({ p, m }) => `
      <li>
        <button class="jump" type="button" data-id="${m.matchId}">
          <span>${esc(m.homeTeam)} v ${esc(m.awayTeam)}</span>
          <span class="jump-note">${esc(p.note)}</span>
        </button>
      </li>`)
        .join("");

    ul.querySelectorAll(".jump").forEach((b) =>
        b.addEventListener("click", () => loadMatch(b.dataset.id)));
}

function showMessage(head, body) {
    stage.innerHTML = `
    <section class="empty">
      <div class="empty-text">
        <h1 class="empty-head">${esc(head)}</h1>
        <p class="empty-body">${esc(body)}</p>
      </div>
    </section>`;
}

/* ------------------------------------------------------------------ xG race
   Cumulative xG for both sides across the match clock. Goals are marked where
   they happened, so the gap between the lines and the gap on the scoreboard
   can be read against each other. */

function raceChart(shots, home, away) {
    // A 1000x300 frame squeezed into a phone is 100px tall with illegible axes.
    // Narrow screens get a squarer frame, bigger type and minute-only markers.
    const compact = window.innerWidth < 700;

    const W = compact ? 520 : 1000;
    const H = compact ? 380 : 300;
    const L = compact ? 62 : 46;
    const R = 14, T = 22;
    const B = compact ? 38 : 30;
    const axisPx = compact ? 15 : 10;
    const labelPx = compact ? 14 : 9.5;
    const tickEvery = compact ? 30 : 15;

    const ordered = shots
        .slice()
        .sort((a, b) => (a.minute - b.minute) || ((a.second || 0) - (b.second || 0)));

    const lastMin = ordered.length ? ordered[ordered.length - 1].minute : 90;
    const xMax = Math.max(90, Math.ceil(lastMin / 5) * 5);

    const series = { [home]: [{ m: 0, c: 0 }], [away]: [{ m: 0, c: 0 }] };
    const goals = [];
    const cum = { [home]: 0, [away]: 0 };

    for (const s of ordered) {
        if (!(s.team in cum)) continue;
        cum[s.team] += s.xg;
        series[s.team].push({ m: s.minute, c: cum[s.team] });
        if (s.isGoal) goals.push({ ...s, c: cum[s.team] });
    }

    const yMax = Math.max(0.5, Math.max(cum[home], cum[away]) * 1.15);
    const x = (m) => L + (m / xMax) * (W - L - R);
    const y = (v) => H - B - (v / yMax) * (H - T - B);

    const stepPath = (pts) => {
        let d = `M ${x(0)} ${y(0)}`;
        let prev = 0;
        for (const p of pts.slice(1)) {
            d += ` L ${x(p.m).toFixed(1)} ${y(prev).toFixed(1)} L ${x(p.m).toFixed(1)} ${y(p.c).toFixed(1)}`;
            prev = p.c;
        }
        d += ` L ${x(xMax).toFixed(1)} ${y(prev).toFixed(1)}`;
        return d;
    };

    // y gridlines at sensible xG intervals
    const step = yMax > 3 ? 1 : yMax > 1.5 ? 0.5 : 0.25;
    let grid = "";
    for (let v = 0; v <= yMax; v += step) {
        grid += `<line class="grid-line" x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}"/>
             <text class="axis-text" font-size="${axisPx}" x="${L - 8}" y="${(y(v) + axisPx / 3).toFixed(1)}"
                   text-anchor="end">${v.toFixed(2)}</text>`;
    }

    let ticks = "";
    for (let m = 0; m <= xMax; m += tickEvery) {
        ticks += `<text class="axis-text" font-size="${axisPx}" x="${x(m).toFixed(1)}"
                        y="${H - B + axisPx + 5}" text-anchor="middle">${m}'</text>`;
    }
    // half-time
    ticks += `<line class="grid-line" x1="${x(45).toFixed(1)}" y1="${T}" x2="${x(45).toFixed(1)}" y2="${H - B}" stroke-dasharray="2 4"/>`;

    // goal markers, nudged upward when they crowd each other
    const sorted = goals.slice().sort((a, b) => a.minute - b.minute);
    let lastX = -Infinity, level = 0, marks = "";

    const crowding = compact ? 46 : 110;

    sorted.forEach((g, i) => {
        const gx = x(g.minute), gy = y(g.c);
        level = gx - lastX < crowding ? (level + 1) % 3 : 0;
        lastX = gx;
        const ly = gy - labelPx - 4 - level * (labelPx + 4);
        const col = g.team === home ? HOME : AWAY;
        // on a phone there is no room for names — the log carries those
        const text = compact ? `${g.minute}'` : `${esc(labelName(g.player))} ${g.minute}'`;

        marks += `<g class="race-pop" style="animation-delay:${900 + i * 70}ms">
        <line x1="${gx.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${gx.toFixed(1)}" y2="${(ly + 4).toFixed(1)}"
              stroke="${col}" stroke-width="1" opacity="0.45"/>
        <circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${compact ? 5 : 4}" fill="${col}"/>
        <text class="race-goal-label" font-size="${labelPx}" x="${gx.toFixed(1)}"
              y="${ly.toFixed(1)}" text-anchor="middle">${text}</text>
      </g>`;
    });

    // The draw-on dash length is measured from the real path after insertion
    // (see startDraw) — a guessed length either clips the tail or stalls the ease.
    const line = (team, col) =>
        `<path class="race-line" data-draw d="${stepPath(series[team])}" stroke="${col}"/>`;

    return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="Cumulative expected goals for both teams across the match">
      ${grid}${ticks}
      ${line(away, AWAY)}
      ${line(home, HOME)}
      ${marks}
    </svg>`;
}

/* ----------------------------------------------------------------- shot map
   Both sides attacking the same goal, seen from behind it. Dot area is xG,
   so a big chance looks like a big chance. Goals are solid. */

function shotMap(shots, home) {
    // 99.4% of shots in this data land within 40m of the goal line, so the map
    // is cropped to 46 rather than the full half — the rest was empty grass.
    const DEPTH = 46;
    const BAND = DEPTH / 6;

    // mown bands — the pitch has them, and they give the panel a rhythm
    let mow = "";
    for (let i = 0; i < 6; i += 2) {
        mow += `<rect class="pitch-mow" x="0" y="${(i * BAND).toFixed(2)}" width="80" height="${BAND.toFixed(2)}"/>`;
    }

    const dots = shots
        .filter((s) => Array.isArray(s.location))
        .slice()
        .sort((a, b) => b.xg - a.xg) // big chances underneath, small ones legible on top
        .map((s) => {
            const [px, py] = s.location;
            const cx = py;
            // the rare long-range effort is pinned to the back edge rather than dropped
            const cy = Math.min(120 - px, DEPTH - 1.5);
            const r = Math.max(0.9, Math.sqrt(s.xg) * 4.2);
            const col = s.team === home ? HOME : AWAY;
            return `<circle class="shot-dot" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}"
                fill="${s.isGoal ? col : "none"}" stroke="${col}" opacity="${s.isGoal ? 1 : 0.8}">
        <title>${esc(s.player)} ${s.minute}' — ${fmt2(s.xg)} xG, ${esc(s.outcome || "shot")}</title>
      </circle>`;
        })
        .join("");

    return `
    <svg class="chart" viewBox="-1 -1 82 ${DEPTH + 2}" role="img"
         aria-label="Shot locations for both teams, dot size proportional to expected goals">
      <rect class="pitch-turf" x="0" y="0" width="80" height="${DEPTH}"/>
      ${mow}
      <g class="pitch-line">
        <rect x="0" y="0" width="80" height="${DEPTH}"/>
        <rect x="18" y="0" width="44" height="18"/>
        <rect x="30" y="0" width="20" height="6"/>
        <path d="M 32 18 A 10 10 0 0 0 48 18"/>
        <circle cx="40" cy="12" r="0.4" fill="#24332F"/>
      </g>
      <line x1="36" y1="0" x2="44" y2="0" stroke="var(--chalk)" stroke-width="0.9"/>
      ${dots}
    </svg>`;
}

/**
 * Kick off the one motion moment.
 *
 * The race lines use `vector-effect: non-scaling-stroke` so they stay 2px at any
 * viewport. That also makes the browser measure stroke dashes in *screen* space,
 * while getTotalLength() reports *user* units — so the dash has to be scaled by
 * the viewBox factor or it clips the tail of every line. Once the draw is done
 * the dash is dropped entirely, which keeps the line whole through a resize.
 */
function startDraw() {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const path of document.querySelectorAll(".race-line[data-draw]")) {
        path.removeAttribute("data-draw");
        if (reduce) continue; // already solid — nothing to animate

        const ctm = path.ownerSVGElement && path.ownerSVGElement.getScreenCTM();
        const scale = ctm && Number.isFinite(ctm.a) && ctm.a > 0 ? ctm.a : 1;

        path.style.setProperty("--len", path.getTotalLength() * scale);
        path.classList.add("race-draw");

        path.addEventListener("animationend", () => {
            path.style.strokeDasharray = "none";
            path.style.strokeDashoffset = "0";
        }, { once: true });
    }
}

/* -------------------------------------------------------------------- render */

let lastData = null;
let lastCompact = window.innerWidth < 700;

// the race chart picks its frame from the viewport, so redraw when that flips
window.addEventListener("resize", () => {
    const compact = window.innerWidth < 700;
    if (compact !== lastCompact && lastData) {
        lastCompact = compact;
        render(lastData);
    }
});

function render(data) {
    lastData = data;
    const m = data.match;
    const shots = data.breakdown;
    const home = m.homeTeam;
    const away = m.awayTeam;

    const goalsMatch = /(\d+)\D+(\d+)/.exec(m.score) || [0, "0", "0"];
    const xgHome = data.teamTotals[home] || 0;
    const xgAway = data.teamTotals[away] || 0;

    // player -> team, for the pips
    const teamOf = {};
    shots.forEach((s) => { teamOf[s.player] = s.team; });

    const ranked = Object.entries(data.playerTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 9);
    const topVal = ranked.length ? ranked[0][1] : 1;

    const meta = [m.competition, m.season, prettyDate(m.date), m.stadium]
        .filter(Boolean)
        .join(" · ");

    const rows = shots
        .slice()
        .sort((a, b) => (a.minute - b.minute) || ((a.second || 0) - (b.second || 0)))
        .map((s) => {
            const col = s.team === home ? HOME : AWAY;
            return `
        <tr class="${s.isGoal ? "log-goal" : "log-row"}">
          <td class="col-num">${s.minute}'</td>
          <td><span class="pip" style="background:${col}"></span></td>
          <td class="cell-player">${esc(s.player)}</td>
          <td class="col-shot">${esc(s.shotType || "")}${s.bodyPart ? " · " + esc(s.bodyPart) : ""}</td>
          <td class="col-num cell-xg">${fmt2(s.xg)}</td>
          <td>${s.isGoal
                    ? `<span class="goal-tag" style="color:${col}">Goal</span>`
                    : esc(s.outcome || "")}</td>
        </tr>`;
        })
        .join("");

    stage.innerHTML = `
    <section class="score">
      <h1 class="vh">${esc(home)} ${goalsMatch[1]}–${goalsMatch[2]} ${esc(away)},
        ${fmt2(xgHome)} against ${fmt2(xgAway)} expected goals</h1>
      <div class="score-grid">
        <p class="side side-home">${esc(home)}</p>

        <div class="tally">
          <span class="num num-home">${goalsMatch[1]}</span>
          <span class="sep">—</span>
          <span class="num num-away">${goalsMatch[2]}</span>

          <span class="num num-xg num-home">${fmt2(xgHome)}</span>
          <span class="sep-xg">xG</span>
          <span class="num num-xg num-away">${fmt2(xgAway)}</span>
        </div>

        <p class="side side-away">${esc(away)}</p>
      </div>
      <p class="score-meta">${esc(meta)}</p>
    </section>

    <section class="panel">
      <div class="head">
        <h2 class="head-title">xG race</h2>
        <p class="head-note">Cumulative · goals marked</p>
      </div>
      ${raceChart(shots, home, away)}
    </section>

    <div class="split">
      <section class="panel">
        <div class="head">
          <h2 class="head-title">Shot map</h2>
          <p class="head-note">${data.shots} shots</p>
        </div>
        ${shotMap(shots, home)}
        <ul class="legend">
          <li><b>Solid</b> goal</li>
          <li><b>Hollow</b> no goal</li>
          <li><b>Dot area</b> xG</li>
        </ul>
      </section>

      <section class="panel">
        <div class="head">
          <h2 class="head-title">Chances by player</h2>
          <p class="head-note">Total xG</p>
        </div>
        <ol class="rank">
          ${ranked.map(([player, val]) => {
                const col = teamOf[player] === home ? HOME : AWAY;
                return `
              <li class="rank-row">
                <span class="pip" style="background:${col}"></span>
                <span class="rank-name">${esc(player)}</span>
                <span class="bar-track">
                  <span class="bar-fill" style="width:${Math.max(4, (val / topVal) * 100)}%;background:${col}"></span>
                </span>
                <span class="rank-val">${fmt2(val)}</span>
              </li>`;
            }).join("")}
        </ol>
      </section>
    </div>

    <section class="panel">
      <div class="head">
        <h2 class="head-title">Shot log</h2>
        <p class="head-note">Chronological</p>
      </div>
      <div class="scroller">
        <table class="log">
          <thead>
            <tr>
              <th class="col-num">Min</th><th></th><th>Player</th>
              <th class="col-shot">Shot</th><th class="col-num">xG</th><th>Outcome</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;

    requestAnimationFrame(startDraw);
}

/* ---------------------------------------------------------------- controller */

async function loadMatch(id) {
    showMessage("Loading…", `Reading every shot in match ${id}.`);

    try {
        const res = await fetch(matchFile(id));
        if (!res.ok) {
            showMessage("No match there.", `Nothing in the data for ID ${id}. Search by team name instead.`);
            return;
        }
        const data = await res.json();
        if (data.error) {
            showMessage("No match there.", data.error);
            return;
        }
        render(data);
        history.replaceState(null, "", `#${id}`);
        window.scrollTo({ top: 0 });
    } catch {
        showMessage("Couldn't load that match.", "Check your connection and try again.");
    }
}

loadMatchList();

const fromHash = location.hash.slice(1);
if (/^\d+$/.test(fromHash)) loadMatch(fromHash);
