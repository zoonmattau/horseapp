# Horse Tips MVP (Dummy Data)

This is a starter web app for Australian horse racing tips using dummy data.

## Included

- Race list for today/tomorrow (dummy metro/provincial-style cards)
- Bookmaker select/deselect controls
- Numeric tips only:
  - `predicted_price`
  - `edge_pct`
- Tip tracking table
- Dummy "odds move" simulation endpoint

## Run

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

`http://127.0.0.1:8000`

## Parallel sessions (Codex + Claude)

Use a different SQLite file and port per session:

```powershell
# Session A
$env:HORSE_DB_PATH = "horse-codex.db"
uvicorn app.main:app --reload --port 8000

# Session B (separate terminal)
$env:HORSE_DB_PATH = "horse-claude.db"
uvicorn app.main:app --reload --port 8001
```

Notes:

- Each session gets its own isolated DB file.
- SQLite now runs in WAL mode with a busy timeout for safer concurrent access.
- If `HORSE_DB_PATH` is relative, it is created under the project root.

## Current API

- `GET /api/bookmakers`
- `GET /api/races?race_date=YYYY-MM-DD`
- `GET /api/races/{race_id}/board?min_edge=3&books=sportsbet,tab`
- `POST /api/races/{race_id}/simulate-odds-move`
- `POST /api/tips/track` (JSON body)
- `GET /api/tips/tracked`

## Notes

- Data is seeded into the database file selected by `HORSE_DB_PATH` (default: `horse.db` in project root).
- Replace dummy loaders with real adapters for:
  - SectionalTimes (`Sect Pro Form`)
  - Odds API provider
