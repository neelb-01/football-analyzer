# ⚽ Football Analyzer

A full-stack football analytics web application that reports **Expected Goals (xG)** from real match event data and enriches it with **match metadata** such as teams, competition, season, and score.

Built on **StatsBomb Open Data**, covering 3,464 matches and 88,023 shots.

---

## 🚀 Features

- Node.js + Express backend
- File-based football data (StatsBomb Open Data) — no database
- Industry-grade xG: StatsBomb's own production model, read straight from the event data
- A fitted logistic xG model as a fallback for shots without a published value
- Penalty shootouts correctly excluded from match xG
- Shot-level xG breakdown with minute, outcome, body part, and shot type
- Player-wise and team-wise xG aggregation
- Match metadata (competition, season, teams, score, date, stadium, referee)
- REST API
- Web frontend (HTML, CSS, vanilla JS)

---

## 🛠 Tech Stack

- Node.js
- Express 5
- Vanilla JavaScript
- HTML / CSS
- StatsBomb Open Data (JSON)

---

## 📂 Project Structure

```
Football-Analyzer/
│
├── data/
│ ├── events/            # Match event data (~9.8 GB)
│ ├── matches/           # Match metadata, by competition/season
│ ├── lineups/           # Lineups and substitutions (not yet used)
│ ├── three-sixty/       # Freeze-frame data (not yet used)
│ ├── competitions.json
│ ├── getMatchMetadata.js
│ └── listMatches.js
│
├── frontend/
│ ├── index.html
│ ├── style.css
│ └── script.js
│
├── xg/
│ ├── model.js           # xG resolution + fitted fallback model
│ ├── aggregate.js       # Player & team aggregation
│ ├── metadata.js
│ └── tools/             # Feature extraction + model fitting pipeline
│
├── server.js
├── CLAUDE.md            # Notes for AI coding assistants
├── package.json
└── README.md
```

> **Note:** `data/` is roughly 13 GB and is committed to this repository. Cloning takes a while, and repo-wide searches should exclude it.

---

## ▶️ How to Run

### 1. Clone the repository

```bash
git clone https://github.com/neelb-01/football-analyzer.git
cd football-analyzer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
node server.js
```

Run it from the repository root — the server resolves `data/` relative to the working directory. The port is hardcoded to `3000`.

### 4. Open in browser

```
http://localhost:3000
```

Enter a match ID and click **Load Match**. Use `GET /matches` to find IDs.

---

## 📡 API Endpoints

### List all matches

```
GET /matches
```

Returns all 3,464 matches with ID, date, competition, season, teams, and score.

---

### Raw match events

```
GET /match/:id
```

Returns the unmodified StatsBomb event array for a match. These responses are large (several MB).

Example: `http://localhost:3000/match/3773565`

---

### xG analysis

```
GET /xg/:id
```

Example: `http://localhost:3000/xg/3773565`

```json
{
  "match": {
    "matchId": 3773565,
    "date": "2021-01-09",
    "competition": "La Liga",
    "season": "2020/2021",
    "homeTeam": "Granada",
    "awayTeam": "Barcelona",
    "score": "0–4",
    "stadium": "Estadio Nuevo Los Cármenes",
    "referee": "Ricardo De Burgos Bengoetxea"
  },
  "shots": 22,
  "totalXG": 1.944,
  "teamTotals": { "Granada": 0.452, "Barcelona": 1.492 },
  "playerTotals": { "Antoine Griezmann": 0.6, "...": 0 },
  "breakdown": [
    {
      "player": "Antoine Griezmann",
      "team": "Barcelona",
      "xg": 0.418,
      "minute": 11,
      "outcome": "Goal",
      "isGoal": true,
      "shotType": "Open Play",
      "bodyPart": "Left Foot",
      "source": "statsbomb"
    }
  ]
}
```

Unknown or malformed match IDs return `404` with a JSON `error` field.

---

## 📈 How xG is calculated

xG comes from two sources, in priority order.

**1. StatsBomb's published model.** Every shot in `data/events` carries a `shot.statsbomb_xg` value produced by StatsBomb's own production model. When present it is used verbatim — nothing computed locally improves on it. In practice this is the path that always runs, which is why `breakdown[].source` reads `"statsbomb"`.

**2. A fitted fallback model.** For shots without a published value, `xg/model.js` uses an L2-regularised logistic regression fitted on all 88,023 shots in this dataset. Separate models are fitted per shot class, because the relationship between distance and conversion differs sharply between them:

- **Open play** — shot distance and the angle the goal mouth subtends, plus body part, technique, whether the shot was first-time or under pressure, and defensive context derived from the freeze frame (goalkeeper position, defenders inside the shooting cone).
- **Direct free kicks** — a deliberately low-dimensional distance/angle model, since only ~4,200 such shots exist.
- **Penalties** — the empirical conversion rate of 0.7575, measured over 998 non-shootout penalties.

Validated on 686 held-out matches, split by match so no shot from a test match influenced training:

| | fitted fallback | StatsBomb's own model |
| --- | --- | --- |
| Open-play test log-loss | 0.2768 | 0.2756 |
| Free-kick test log-loss | 0.2326 | 0.2442 |
| Calibration | 1731.8 xG predicted vs 1752 actual goals (0.989) | — |
| Per-match total xG, mean abs. error | 0.247 | — |

**Penalty shootouts are excluded.** Shootout kicks are not part of the match, and no mainstream provider counts them in match xG. Including them inflated the 2016 Champions League final from 5.12 to 12.17 xG. In-game penalties are still counted.

### Comparing against other providers

FotMob uses Opta's model and Sofascore uses its own, so their numbers differ from each other and from StatsBomb's on the same match — typically by 0.1–0.3 xG on a match total. Expect close agreement here rather than an exact match.

### Refitting the fallback model

The pipeline lives in `xg/tools/` and reproduces the shipped coefficients exactly:

```bash
node xg/tools/extract-features.js data/events shots.tsv
LAM_OPEN=150 LAM_FK=60 node xg/tools/fit-model.js shots.tsv coef.json
```

Then paste the coefficients into `FITTED_MODEL` in `xg/model.js`. `SWEEP=1` runs a regularisation sweep instead of a single fit. See `CLAUDE.md` for the details worth knowing before editing the fitter.

---

## ⚠️ Limitations

- **This is a local development server, not a hardened one.** Match IDs are interpolated into file paths without validation, so `GET /match/:id` can be coaxed into reading `.json` files outside `data/events` via a traversal sequence, and its 404 response echoes absolute host paths. Don't expose this server to a network as-is.
- Match metadata is resolved by scanning every competition/season file on each request, with no caching, so response times grow with the dataset.
- `data/lineups/` and `data/three-sixty/` are downloaded but not yet used.
- There is no test suite; `npm test` is a placeholder that exits 1.

---

## 📌 Status

This project is under active development.

Planned improvements include:

- Match list and selector UI (the `/matches` endpoint exists but the frontend doesn't use it)
- Shot map visualizations
- Expected Threat (xT) model
- Possession chains and build-up metrics
- Per-90 statistics using lineup data
- Improved frontend UI/UX

---

## 👤 Author

Neel Bapat

---

## 📄 License

This project uses StatsBomb Open Data, which is subject to their license terms.
The code is intended for educational and non-commercial use.
