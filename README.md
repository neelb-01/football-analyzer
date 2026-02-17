# ⚽ Football Analyzer

A full-stack football analytics web application that computes **Expected Goals (xG)** from real match event data and enriches it with **match metadata** such as teams, competition, season, and score.

Built using **StatsBomb Open Data**, focusing on event-level football analytics and clean backend architecture.

---

## 🚀 Features

- Node.js + Express backend  
- File-based football data (StatsBomb Open Data)  
- Expected Goals (xG) calculation engine  
- Shot-level xG breakdown  
- Player-wise xG aggregation  
- Team-wise xG aggregation  
- Match metadata (competition, season, teams, score, date)  
- REST API  
- Web frontend (HTML, CSS, Vanilla JS) 

---

## 🛠 Tech Stack

- Node.js  
- Express  
- Vanilla JavaScript  
- HTML / CSS  
- StatsBomb Open Data (JSON)

---

## 📂 Project Structure

```
Football-Analyzer/
│
├── data/
│ ├── events/ # Match event data
│ ├── matches/ # Match metadata (competition, season, score)
│ ├── lineups/ # Lineups and substitutions
│ ├── three-sixty/ # Freeze-frame data (not yet used)
│ └── competitions.json
│
├── frontend/ # Frontend files
│ ├── index.html
│ ├── style.css
│ └── script.js
│
├── xg/
│ ├── model.js # xG calculation logic
│ ├── aggregate.js # Player & team aggregation
│ └── metadata.js # Match metadata loader
│
├── server.js # Backend server
├── package.json
└── README.md
```

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

### 4. Open in browser

```
http://localhost:3000
```

---

## 📡 API Endpoints

### Get match data

```
GET /xg/:id
```

Example:

```
http://localhost:3000/match/7298
```

---

### Get xG analysis

```
GET /xg/:id
```

Example:

```
http://localhost:3000/xg/3754058
```

---

## 📈 Example Output

- Total shots
- Total xG
- Player-wise xG breakdown
- Team-wise xG totals
- Team-wise xG totals
- Per-shot xG breakdown 

---

## 📌 Status

This project is under active development.

Planned improvements include:

- Match list and selector UI
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


---