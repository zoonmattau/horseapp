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

## Current API

- `GET /api/bookmakers`
- `GET /api/races?race_date=YYYY-MM-DD`
- `GET /api/races/{race_id}/tips?min_edge=3&books=sportsbet,tab`
- `POST /api/races/{race_id}/simulate-odds-move`
- `POST /api/tips/track?...`
- `GET /api/tips/tracked`

## Notes

- Data is seeded into `app/horse.db` on first startup.
- Replace dummy loaders with real adapters for:
  - SectionalTimes (`Sect Pro Form`)
  - Odds API provider
