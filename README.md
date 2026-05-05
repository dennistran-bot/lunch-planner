# 🍽 Lunch Planner

Lunchplaneringsapp för teamet – visar vem som är ledig, hämtar menyer från PDF och Araslövs hemsida.

## Lokal utveckling

```bash
cd lunch-planner
npm install
cp .env.example .env.local
# Fyll i ANTHROPIC_API_KEY i .env.local
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000)

## Deploy till Vercel

### 1. Skapa GitHub-repo
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/DITT-NAMN/lunch-planner.git
git push -u origin main
```

### 2. Koppla till Vercel
1. Gå till [vercel.com](https://vercel.com) → New Project
2. Importera ditt GitHub-repo
3. Lägg till miljövariabel:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** din API-nyckel från console.anthropic.com
4. Klicka Deploy

### 3. Dela länken med teamet
Vercel ger dig en URL typ `lunch-planner.vercel.app` – dela den med kollegorna.

## Struktur

```
app/
├── page.js                    # Root page
├── LunchPlanner.js            # Huvudkomponent (klientside)
├── layout.js                  # HTML-layout
└── api/
    ├── extract-menu/route.js  # Läser PDF-meny via Claude
    └── araslof-menu/route.js  # Hämtar Araslövs meny via webbsökning
```

## OBS om data
Tillgänglighet sparas i varje persons **localStorage** – dvs. varje person markerar sin tillgänglighet på sin egna enhet. Menyer sparas likaså lokalt av den som laddar upp/hämtar dem.

Vill du ha delad realtidsdata (alla ser alla direkt) behövs en databas – hör av dig så löser vi det.
