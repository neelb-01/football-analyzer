# ⚽ Football Analyzer

A full-stack football analytics web app that calculates and visualizes Expected Goals (xG) using real match event data.

---

## 🚀 Features

- Node.js + Express backend  
- File-based match database (JSON)  
- xG calculation engine  
- REST API  
- Web frontend  
- Player shot analysis  

---

## 🛠 Tech Stack

- Node.js  
- Express  
- Vanilla JavaScript  
- HTML / CSS  

---

## 📂 Project Structure

```
Football-Analyzer/
│
├── data/events/      # Match JSON files
├── frontend/         # Website files
├── server.js         # Backend server
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
GET /match/:id
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
http://localhost:3000/xg/7298
```

---

## 📈 Example Output

- Total shots  
- Total xG  
- Player-wise xG breakdown  

---

## 📌 Status

This project is under active development.  
More features and improvements coming soon.

---

## 👤 Author

Neel Bapat
