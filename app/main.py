import random
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DB_PATH = PROJECT_DIR / "horse.db"
STATIC_DIR = BASE_DIR / "static"

BOOKMAKERS = ["sportsbet", "ladbrokes", "tab", "neds", "pointsbet"]
BOOK_SYMBOLS = {
    "sportsbet": "SB",
    "ladbrokes": "LB",
    "tab": "TAB",
    "neds": "NEDS",
    "pointsbet": "PB",
}
TRACK_POOL = ["Flemington", "Randwick", "Doomben", "Morphettville", "Caulfield", "Rosehill"]
TRAINER_POOL = [
    "Chris Waller",
    "Ciaron Maher",
    "Annabel Neasham",
    "Gai Waterhouse",
    "Bjorn Baker",
    "Michael Price",
    "Tony Gollan",
    "Peter Moody",
]
JOCKEY_POOL = [
    "James McDonald",
    "Damian Lane",
    "Craig Williams",
    "Tim Clark",
    "Jamie Kah",
    "Mark Zahra",
    "Tommy Berry",
    "Nash Rawiller",
]
LEGACY_TRAINER_MAP = {
    "C. Waller": "Chris Waller",
    "A. Neasham": "Annabel Neasham",
    "G. Waterhouse": "Gai Waterhouse",
    "B. Baker": "Bjorn Baker",
    "M. Price": "Michael Price",
    "T. Busuttin": "Trent Busuttin",
}
LEGACY_JOCKEY_MAP = {
    "J. McDonald": "James McDonald",
    "D. Lane": "Damian Lane",
    "C. Williams": "Craig Williams",
    "T. Clark": "Tim Clark",
    "J. Kah": "Jamie Kah",
    "M. Zahra": "Mark Zahra",
}
HORSE_NAME_PART_A = [
    "Golden",
    "Silver",
    "Coastal",
    "Midnight",
    "Southern",
    "Royal",
    "Crimson",
    "Electric",
    "Hidden",
    "Lucky",
    "Rapid",
    "Bold",
    "Misty",
    "Desert",
    "Ocean",
    "Velvet",
]
HORSE_NAME_PART_B = [
    "Comet",
    "Thunder",
    "Dancer",
    "Spirit",
    "Arrow",
    "Echo",
    "Blaze",
    "Harbor",
    "Voyager",
    "Ranger",
    "Promise",
    "Sovereign",
    "Falcon",
    "Charm",
    "Avenue",
    "Legend",
]

app = FastAPI(title="Horse Tips MVP", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Reduce locking/journal issues on some Windows mapped drives.
    conn.execute("PRAGMA journal_mode=OFF;")
    conn.execute("PRAGMA synchronous=OFF;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    return conn


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS races (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_date TEXT NOT NULL,
            track TEXT NOT NULL,
            race_number INTEGER NOT NULL,
            distance_m INTEGER NOT NULL,
            jump_time TEXT NOT NULL,
            race_name TEXT NOT NULL,
            starters INTEGER NOT NULL,
            prize_pool REAL NOT NULL,
            track_rating TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS runners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_id INTEGER NOT NULL,
            horse_number INTEGER NOT NULL,
            horse_name TEXT NOT NULL,
            barrier INTEGER NOT NULL,
            trainer TEXT NOT NULL,
            jockey TEXT NOT NULL,
            model_prob REAL NOT NULL,
            predicted_price REAL NOT NULL,
            FOREIGN KEY (race_id) REFERENCES races(id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS odds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            runner_id INTEGER NOT NULL,
            bookmaker TEXT NOT NULL,
            current_odds REAL NOT NULL,
            bet_url TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (runner_id) REFERENCES runners(id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS runner_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            runner_id INTEGER NOT NULL,
            run_date TEXT NOT NULL,
            track TEXT NOT NULL,
            distance_m INTEGER NOT NULL,
            finish_pos INTEGER NOT NULL,
            starting_price REAL NOT NULL,
            carried_weight_kg REAL NOT NULL,
            jockey TEXT NOT NULL,
            FOREIGN KEY (runner_id) REFERENCES runners(id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trainer_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trainer TEXT NOT NULL,
            run_date TEXT NOT NULL,
            horse_name TEXT NOT NULL,
            track TEXT NOT NULL,
            distance_m INTEGER NOT NULL,
            finish_pos INTEGER NOT NULL,
            starting_price REAL NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS jockey_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jockey TEXT NOT NULL,
            run_date TEXT NOT NULL,
            horse_name TEXT NOT NULL,
            track TEXT NOT NULL,
            distance_m INTEGER NOT NULL,
            finish_pos INTEGER NOT NULL,
            starting_price REAL NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tracked_tips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'demo',
            race_id INTEGER NOT NULL,
            runner_id INTEGER NOT NULL,
            bookmaker TEXT NOT NULL,
            edge_pct REAL NOT NULL,
            odds_at_tip REAL NOT NULL,
            stake REAL NOT NULL DEFAULT 0,
            result TEXT NOT NULL DEFAULT 'pending',
            tracked_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            email TEXT NOT NULL,
            plan TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            timezone TEXT NOT NULL,
            default_min_edge REAL NOT NULL,
            notifications_enabled INTEGER NOT NULL,
            notify_min_edge REAL NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def ensure_schema_compat() -> None:
    conn = get_conn()
    cur = conn.cursor()

    races_cols = {r[1] for r in cur.execute("PRAGMA table_info(races)").fetchall()}
    if "jump_time" not in races_cols:
        cur.execute("ALTER TABLE races ADD COLUMN jump_time TEXT")
    if "race_name" not in races_cols:
        cur.execute("ALTER TABLE races ADD COLUMN race_name TEXT")
    if "starters" not in races_cols:
        cur.execute("ALTER TABLE races ADD COLUMN starters INTEGER")
    if "prize_pool" not in races_cols:
        cur.execute("ALTER TABLE races ADD COLUMN prize_pool REAL")
    if "track_rating" not in races_cols:
        cur.execute("ALTER TABLE races ADD COLUMN track_rating TEXT")

    runners_cols = {r[1] for r in cur.execute("PRAGMA table_info(runners)").fetchall()}
    if "horse_number" not in runners_cols:
        cur.execute("ALTER TABLE runners ADD COLUMN horse_number INTEGER")
        cur.execute("UPDATE runners SET horse_number = barrier WHERE horse_number IS NULL")
    if "trainer" not in runners_cols:
        cur.execute("ALTER TABLE runners ADD COLUMN trainer TEXT")
        cur.execute("UPDATE runners SET trainer = 'Unknown Trainer' WHERE trainer IS NULL")
    if "jockey" not in runners_cols:
        cur.execute("ALTER TABLE runners ADD COLUMN jockey TEXT")
        cur.execute("UPDATE runners SET jockey = 'Unknown Jockey' WHERE jockey IS NULL")

    odds_cols = {r[1] for r in cur.execute("PRAGMA table_info(odds)").fetchall()}
    if "bet_url" not in odds_cols:
        cur.execute("ALTER TABLE odds ADD COLUMN bet_url TEXT")
        cur.execute(
            """
            UPDATE odds
            SET bet_url = 'https://example.com/bet/' || bookmaker || '/legacy/' || runner_id
            WHERE bet_url IS NULL
            """
        )

    # Ensure new history tables exist for clickable trainer/jockey views.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trainer_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trainer TEXT NOT NULL,
            run_date TEXT NOT NULL,
            horse_name TEXT NOT NULL,
            track TEXT NOT NULL,
            distance_m INTEGER NOT NULL,
            finish_pos INTEGER NOT NULL,
            starting_price REAL NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS jockey_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jockey TEXT NOT NULL,
            run_date TEXT NOT NULL,
            horse_name TEXT NOT NULL,
            track TEXT NOT NULL,
            distance_m INTEGER NOT NULL,
            finish_pos INTEGER NOT NULL,
            starting_price REAL NOT NULL
        )
        """
    )
    tracked_cols = {r[1] for r in cur.execute("PRAGMA table_info(tracked_tips)").fetchall()}
    if "user_id" not in tracked_cols:
        cur.execute("ALTER TABLE tracked_tips ADD COLUMN user_id TEXT")
        cur.execute("UPDATE tracked_tips SET user_id = 'demo' WHERE user_id IS NULL")
    if "stake" not in tracked_cols:
        cur.execute("ALTER TABLE tracked_tips ADD COLUMN stake REAL")
        cur.execute("UPDATE tracked_tips SET stake = 0 WHERE stake IS NULL")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            email TEXT NOT NULL,
            plan TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            timezone TEXT NOT NULL,
            default_min_edge REAL NOT NULL,
            notifications_enabled INTEGER NOT NULL,
            notify_min_edge REAL NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    # Backfill jump_time for legacy race rows.
    races_without_jump = cur.execute(
        "SELECT id, race_number FROM races WHERE jump_time IS NULL OR jump_time = ''"
    ).fetchall()
    for race in races_without_jump:
        base_minutes = 12 * 60 + 5 + ((race["race_number"] - 1) * 35)
        hour = base_minutes // 60
        minute = base_minutes % 60
        cur.execute(
            "UPDATE races SET jump_time = ? WHERE id = ?",
            (f"{hour:02d}:{minute:02d}", race["id"]),
        )

    races_with_bad_minutes = cur.execute(
        """
        SELECT id, jump_time
        FROM races
        WHERE substr(jump_time, 4, 2) = '60'
        """
    ).fetchall()
    for race in races_with_bad_minutes:
        hh = int((race["jump_time"] or "00:00").split(":")[0])
        cur.execute(
            "UPDATE races SET jump_time = ? WHERE id = ?",
            (f"{hh + 1:02d}:00", race["id"]),
        )

    races_without_meta = cur.execute(
        """
        SELECT id, race_number
        FROM races
        WHERE race_name IS NULL OR race_name = ''
           OR starters IS NULL
           OR prize_pool IS NULL
           OR track_rating IS NULL OR track_rating = ''
        """
    ).fetchall()
    for race in races_without_meta:
        rn = int(race["race_number"] or 1)
        race_name = f"Benchmark {58 + (rn * 2)} Handicap"
        starters = 10
        prize_pool = float(35000 + (rn * 7000))
        track_rating = "Good 4"
        cur.execute(
            """
            UPDATE races
            SET race_name = ?, starters = ?, prize_pool = ?, track_rating = ?
            WHERE id = ?
            """,
            (race_name, starters, prize_pool, track_rating, race["id"]),
        )

    now = datetime.utcnow().isoformat()
    cur.execute(
        """
        INSERT OR IGNORE INTO user_profiles (user_id, display_name, email, plan, created_at, updated_at)
        VALUES ('demo', 'Demo User', 'demo@horseedge.au', 'free', ?, ?)
        """,
        (now, now),
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO user_settings (
            user_id, timezone, default_min_edge, notifications_enabled, notify_min_edge, updated_at
        )
        VALUES ('demo', 'Australia/Sydney', 1.0, 1, 1.0, ?)
        """,
        (now,),
    )

    conn.commit()
    conn.close()


def seed_dummy_data() -> None:
    conn = get_conn()
    cur = conn.cursor()
    count = cur.execute("SELECT COUNT(*) FROM races").fetchone()[0]
    if count > 0:
        conn.close()
        return

    rng = random.Random(42)
    today = datetime.now().date()
    dates = [today, today + timedelta(days=1)]
    tracks = TRACK_POOL

    for race_date in dates:
        for track in tracks:
            for race_number in range(1, 7):
                distance_m = rng.choice([1000, 1100, 1200, 1400, 1600, 2000])
                cur.execute(
                    """
                    INSERT INTO races (
                        race_date, track, race_number, distance_m, jump_time,
                        race_name, starters, prize_pool, track_rating
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        race_date.isoformat(),
                        track,
                        race_number,
                        distance_m,
                        f"{(11 + race_number):02d}:{(10 + (race_number * 7)) % 60:02d}",
                        f"Benchmark {58 + (race_number * 2)} Handicap",
                        10,
                        float(35000 + (race_number * 7000)),
                        rng.choice(["Good 3", "Good 4", "Soft 5", "Soft 6"]),
                    ),
                )
                race_id = cur.lastrowid

                raw_strength = [rng.uniform(0.5, 1.5) for _ in range(10)]
                total = sum(raw_strength)
                probs = [x / total for x in raw_strength]

                for idx, prob in enumerate(probs, start=1):
                    horse_name = build_horse_name((race_id * 100) + idx)
                    predicted_price = round(1.0 / prob, 2)
                    trainer = rng.choice(TRAINER_POOL)
                    jockey = rng.choice(JOCKEY_POOL)
                    cur.execute(
                        """
                        INSERT INTO runners (
                            race_id, horse_number, horse_name, barrier, trainer, jockey, model_prob, predicted_price
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (race_id, idx, horse_name, idx, trainer, jockey, prob, predicted_price),
                    )
                    runner_id = cur.lastrowid

                    for book in BOOKMAKERS:
                        book_margin = rng.uniform(0.05, 0.11)
                        noise = rng.uniform(-0.05, 0.09)
                        odds = max(1.2, round(predicted_price * (1 - book_margin + noise), 2))
                        bet_url = f"https://example.com/bet/{book}/{race_id}/{runner_id}"
                        cur.execute(
                            """
                            INSERT INTO odds (runner_id, bookmaker, current_odds, bet_url, updated_at)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (
                                runner_id,
                                book,
                                odds,
                                bet_url,
                                datetime.utcnow().isoformat(),
                            ),
                        )

                    history_runs = rng.randint(6, 10)
                    for n in range(history_runs):
                        run_date = race_date - timedelta(days=(n + 1) * rng.randint(9, 28))
                        hist_track = rng.choice(tracks)
                        hist_distance = rng.choice([1000, 1100, 1200, 1400, 1600, 2000])
                        finish_pos = rng.randint(1, 14)
                        sp = max(1.2, round(predicted_price * rng.uniform(0.75, 1.35), 2))
                        weight = round(rng.uniform(52.0, 60.0), 1)
                        hist_jockey = rng.choice(JOCKEY_POOL)
                        cur.execute(
                            """
                            INSERT INTO runner_history (
                                runner_id, run_date, track, distance_m, finish_pos,
                                starting_price, carried_weight_kg, jockey
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                runner_id,
                                run_date.isoformat(),
                                hist_track,
                                hist_distance,
                                finish_pos,
                                sp,
                                weight,
                                hist_jockey,
                            ),
                        )
                        cur.execute(
                            """
                            INSERT INTO trainer_history (
                                trainer, run_date, horse_name, track, distance_m, finish_pos, starting_price
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                trainer,
                                run_date.isoformat(),
                                horse_name,
                                hist_track,
                                hist_distance,
                                finish_pos,
                                sp,
                            ),
                        )
                        cur.execute(
                            """
                            INSERT INTO jockey_history (
                                jockey, run_date, horse_name, track, distance_m, finish_pos, starting_price
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                hist_jockey,
                                run_date.isoformat(),
                                horse_name,
                                hist_track,
                                hist_distance,
                                finish_pos,
                                sp,
                            ),
                        )

    conn.commit()
    conn.close()


def calc_edge_pct(model_prob: float, market_odds: float) -> float:
    return ((model_prob * market_odds) - 1.0) * 100.0


def build_horse_name(seed_value: int) -> str:
    a = HORSE_NAME_PART_A[seed_value % len(HORSE_NAME_PART_A)]
    b = HORSE_NAME_PART_B[(seed_value // len(HORSE_NAME_PART_A)) % len(HORSE_NAME_PART_B)]
    return f"{a} {b}"


def normalized_probs_from_prices(price_by_runner: dict[int, float]) -> dict[int, float]:
    raw = {rid: (1.0 / max(price, 1.01)) for rid, price in price_by_runner.items()}
    total = sum(raw.values()) or 1.0
    return {rid: p / total for rid, p in raw.items()}


def backfill_dummy_profiles() -> None:
    conn = get_conn()
    cur = conn.cursor()
    rng = random.Random(20260216)

    runners = cur.execute(
        """
        SELECT r.id, r.horse_name, r.trainer, r.jockey, r.predicted_price, ra.race_date
        FROM runners r
        JOIN races ra ON ra.id = r.race_id
        """
    ).fetchall()

    for row in runners:
        trainer = row["trainer"]
        jockey = row["jockey"]

        if trainer in LEGACY_TRAINER_MAP:
            trainer = LEGACY_TRAINER_MAP[trainer]
            cur.execute("UPDATE runners SET trainer = ? WHERE id = ?", (trainer, row["id"]))
        elif (not trainer) or trainer.startswith("Unknown"):
            trainer = rng.choice(TRAINER_POOL)
            cur.execute("UPDATE runners SET trainer = ? WHERE id = ?", (trainer, row["id"]))

        if jockey in LEGACY_JOCKEY_MAP:
            jockey = LEGACY_JOCKEY_MAP[jockey]
            cur.execute("UPDATE runners SET jockey = ? WHERE id = ?", (jockey, row["id"]))
        elif (not jockey) or jockey.startswith("Unknown"):
            jockey = rng.choice(JOCKEY_POOL)
            cur.execute("UPDATE runners SET jockey = ? WHERE id = ?", (jockey, row["id"]))

        if "-HORSE-" in row["horse_name"]:
            cur.execute(
                "UPDATE runners SET horse_name = ? WHERE id = ?",
                (build_horse_name(row["id"]), row["id"]),
            )

        run_count = cur.execute(
            "SELECT COUNT(*) FROM runner_history WHERE runner_id = ?",
            (row["id"],),
        ).fetchone()[0]
        if run_count == 0:
            race_date = datetime.fromisoformat(row["race_date"]).date()
            for n in range(8):
                run_date = race_date - timedelta(days=(n + 1) * rng.randint(8, 30))
                hist_track = rng.choice(TRACK_POOL)
                hist_distance = rng.choice([1000, 1100, 1200, 1400, 1600, 2000])
                finish_pos = rng.randint(1, 14)
                sp = max(1.2, round(row["predicted_price"] * rng.uniform(0.75, 1.35), 2))
                weight = round(rng.uniform(52.0, 60.0), 1)
                hist_jockey = rng.choice(JOCKEY_POOL)
                cur.execute(
                    """
                    INSERT INTO runner_history (
                        runner_id, run_date, track, distance_m, finish_pos,
                        starting_price, carried_weight_kg, jockey
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["id"],
                        run_date.isoformat(),
                        hist_track,
                        hist_distance,
                        finish_pos,
                        sp,
                        weight,
                        hist_jockey,
                    ),
                )

    cur.execute("DELETE FROM trainer_history")
    cur.execute(
        """
        INSERT INTO trainer_history (
            trainer, run_date, horse_name, track, distance_m, finish_pos, starting_price
        )
        SELECT r.trainer, h.run_date, r.horse_name, h.track, h.distance_m, h.finish_pos, h.starting_price
        FROM runner_history h
        JOIN runners r ON r.id = h.runner_id
        """
    )
    cur.execute("DELETE FROM jockey_history")
    cur.execute(
        """
        INSERT INTO jockey_history (
            jockey, run_date, horse_name, track, distance_m, finish_pos, starting_price
        )
        SELECT h.jockey, h.run_date, r.horse_name, h.track, h.distance_m, h.finish_pos, h.starting_price
        FROM runner_history h
        JOIN runners r ON r.id = h.runner_id
        """
    )

    conn.commit()
    conn.close()


def rebalance_dummy_odds() -> None:
    conn = get_conn()
    cur = conn.cursor()
    rng = random.Random(260401)
    rows = cur.execute(
        """
        SELECT o.id, r.predicted_price
        FROM odds o
        JOIN runners r ON r.id = o.runner_id
        """
    ).fetchall()
    for row in rows:
        book_margin = rng.uniform(0.05, 0.11)
        noise = rng.uniform(-0.05, 0.09)
        odds = max(1.2, round(row["predicted_price"] * (1 - book_margin + noise), 2))
        cur.execute(
            "UPDATE odds SET current_odds = ?, updated_at = ? WHERE id = ?",
            (odds, datetime.utcnow().isoformat(), row["id"]),
        )
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup() -> None:
    init_db()
    ensure_schema_compat()
    seed_dummy_data()
    backfill_dummy_profiles()
    rebalance_dummy_odds()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/tips")
def tips_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "tips.html")


@app.get("/settings")
def settings_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "settings.html")


@app.get("/my-bets")
def my_bets_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "my-bets.html")


@app.get("/api/bookmakers")
def get_bookmakers():
    return {
        "bookmakers": [
            {"id": b, "symbol": BOOK_SYMBOLS.get(b, b.upper())}
            for b in BOOKMAKERS
        ]
    }


@app.get("/api/races")
def get_races(
    race_date: Optional[str] = Query(default=None),
    track: Optional[str] = Query(default=None),
):
    day = race_date or datetime.now().date().isoformat()
    conn = get_conn()
    if track:
        rows = conn.execute(
            """
            SELECT id, race_date, track, race_number, distance_m, jump_time,
                   race_name, starters, prize_pool, track_rating
            FROM races
            WHERE race_date = ? AND track = ?
            ORDER BY race_number
            """,
            (day, track),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, race_date, track, race_number, distance_m, jump_time,
                   race_name, starters, prize_pool, track_rating
            FROM races
            WHERE race_date = ?
            ORDER BY track, race_number
            """,
            (day,),
        ).fetchall()
    conn.close()
    return {"date": day, "races": [dict(r) for r in rows]}


@app.get("/api/tracks")
def get_tracks(race_date: Optional[str] = Query(default=None)):
    day = race_date or datetime.now().date().isoformat()
    conn = get_conn()
    rows = conn.execute(
        "SELECT DISTINCT track FROM races WHERE race_date = ? ORDER BY track",
        (day,),
    ).fetchall()
    conn.close()
    return {"date": day, "tracks": [r["track"] for r in rows]}


@app.get("/api/races/{race_id}/board")
def get_race_board(
    race_id: int,
    min_edge: float = Query(default=0.0),
    books: Optional[str] = Query(default=None),
):
    selected_books = BOOKMAKERS if not books else [b.strip() for b in books.split(",") if b.strip()]
    if not selected_books:
        raise HTTPException(status_code=400, detail="At least one bookmaker must be selected.")

    conn = get_conn()
    race = conn.execute("SELECT * FROM races WHERE id = ?", (race_id,)).fetchone()
    if not race:
        conn.close()
        raise HTTPException(status_code=404, detail="Race not found.")

    placeholders = ",".join("?" for _ in selected_books)
    query = f"""
        SELECT
            r.id AS runner_id,
            r.horse_number,
            r.horse_name,
            r.barrier,
            r.trainer,
            r.jockey,
            r.model_prob,
            r.predicted_price,
            o.bookmaker,
            o.current_odds,
            o.bet_url
        FROM runners r
        JOIN odds o ON o.runner_id = r.id
        WHERE r.race_id = ?
          AND o.bookmaker IN ({placeholders})
    """
    rows = conn.execute(query, [race_id, *selected_books]).fetchall()
    conn.close()

    by_runner = {}
    for row in rows:
        rid = row["runner_id"]
        candidate = by_runner.get(rid)
        if candidate is None or row["current_odds"] > candidate["market_odds"]:
            market_odds = round(row["current_odds"], 2)
            by_runner[rid] = {
                "runner_id": rid,
                "horse_number": row["horse_number"],
                "horse_name": row["horse_name"],
                "barrier": row["barrier"],
                "trainer": row["trainer"],
                "jockey": row["jockey"],
                "predicted_price": round(row["predicted_price"], 2),
                "market_odds": market_odds,
                "best_bookmaker": row["bookmaker"],
                "best_book_symbol": BOOK_SYMBOLS.get(row["bookmaker"], row["bookmaker"].upper()),
                "bet_url": row["bet_url"],
            }

    probs = normalized_probs_from_prices(
        {rid: item["predicted_price"] for rid, item in by_runner.items()}
    )
    for rid, item in by_runner.items():
        model_prob = probs.get(rid, 0.0)
        item["model_prob_pct"] = round(model_prob * 100.0, 2)
        item["predicted_price_pct"] = round((1.0 / max(item["predicted_price"], 1.01)) * 100.0, 2)
        item["edge_pct"] = round(calc_edge_pct(model_prob, item["market_odds"]), 2)

    board = list(by_runner.values())
    for item in board:
        item["qualifies"] = item["edge_pct"] >= min_edge
    board.sort(key=lambda x: x["horse_number"])
    return {"race": dict(race), "min_edge": min_edge, "selected_books": selected_books, "rows": board}


@app.get("/api/race-signals")
def get_race_signals(
    race_date: Optional[str] = Query(default=None),
    books: Optional[str] = Query(default=None),
    rec_edge: float = Query(default=1.0),
):
    day = race_date or datetime.now().date().isoformat()
    selected_books = BOOKMAKERS if not books else [b.strip() for b in books.split(",") if b.strip()]
    if not selected_books:
        raise HTTPException(status_code=400, detail="At least one bookmaker must be selected.")

    conn = get_conn()
    races = conn.execute(
        """
        SELECT id
        FROM races
        WHERE race_date = ?
        ORDER BY track, race_number
        """,
        (day,),
    ).fetchall()
    conn.close()

    signals = {}
    for race in races:
        board = get_race_board(race_id=race["id"], min_edge=0.0, books=",".join(selected_books))
        qualifying = [r for r in board["rows"] if r["edge_pct"] >= rec_edge]
        signals[str(race["id"])] = {
            "has_tip": len(qualifying) > 0,
            "tip_count": len(qualifying),
            "max_edge": max((r["edge_pct"] for r in board["rows"]), default=0.0),
        }

    return {"date": day, "rec_edge": rec_edge, "signals": signals}


@app.get("/api/tips/daily")
def get_daily_tips(
    race_date: Optional[str] = Query(default=None),
    min_edge: float = Query(default=0.0),
    books: Optional[str] = Query(default=None),
):
    day = race_date or datetime.now().date().isoformat()
    selected_books = BOOKMAKERS if not books else [b.strip() for b in books.split(",") if b.strip()]
    if not selected_books:
        raise HTTPException(status_code=400, detail="At least one bookmaker must be selected.")

    conn = get_conn()
    races = conn.execute(
        """
        SELECT id, race_date, track, race_number, distance_m, jump_time,
               race_name, starters, prize_pool, track_rating
        FROM races
        WHERE race_date = ?
        ORDER BY track, race_number
        """,
        (day,),
    ).fetchall()

    all_tips = []
    for race in races:
        placeholders = ",".join("?" for _ in selected_books)
        query = f"""
            SELECT
                r.id AS runner_id,
                r.horse_number,
                r.horse_name,
                r.barrier,
                r.trainer,
                r.jockey,
                r.predicted_price,
                o.bookmaker,
                o.current_odds,
                o.bet_url
            FROM runners r
            JOIN odds o ON o.runner_id = r.id
            WHERE r.race_id = ?
              AND o.bookmaker IN ({placeholders})
        """
        rows = conn.execute(query, [race["id"], *selected_books]).fetchall()
        by_runner = {}
        for row in rows:
            rid = row["runner_id"]
            candidate = by_runner.get(rid)
            if candidate is None or row["current_odds"] > candidate["market_odds"]:
                by_runner[rid] = {
                    "runner_id": rid,
                    "horse_number": row["horse_number"],
                    "horse_name": row["horse_name"],
                    "barrier": row["barrier"],
                    "trainer": row["trainer"],
                    "jockey": row["jockey"],
                    "predicted_price": round(row["predicted_price"], 2),
                    "market_odds": round(row["current_odds"], 2),
                    "best_bookmaker": row["bookmaker"],
                    "best_book_symbol": BOOK_SYMBOLS.get(row["bookmaker"], row["bookmaker"].upper()),
                    "bet_url": row["bet_url"],
                }

        probs = normalized_probs_from_prices(
            {rid: item["predicted_price"] for rid, item in by_runner.items()}
        )
        for rid, item in by_runner.items():
            model_prob = probs.get(rid, 0.0)
            edge = round(calc_edge_pct(model_prob, item["market_odds"]), 2)
            if edge >= min_edge:
                all_tips.append(
                    {
                        "race_id": race["id"],
                        "race_date": race["race_date"],
                        "track": race["track"],
                        "race_number": race["race_number"],
                        **item,
                        "model_prob_pct": round(model_prob * 100.0, 2),
                        "predicted_price_pct": round((1.0 / max(item["predicted_price"], 1.01)) * 100.0, 2),
                        "edge_pct": edge,
                    }
                )

    conn.close()
    all_tips.sort(key=lambda x: x["edge_pct"], reverse=True)
    return {
        "date": day,
        "min_edge": min_edge,
        "selected_books": selected_books,
        "tips": all_tips,
    }


@app.post("/api/races/{race_id}/simulate-odds-move")
def simulate_odds_move(race_id: int):
    conn = get_conn()
    runner_ids = conn.execute("SELECT id FROM runners WHERE race_id = ?", (race_id,)).fetchall()
    if not runner_ids:
        conn.close()
        raise HTTPException(status_code=404, detail="Race not found.")

    rng = random.Random()
    for rid in runner_ids:
        for book in BOOKMAKERS:
            row = conn.execute(
                "SELECT id, current_odds FROM odds WHERE runner_id = ? AND bookmaker = ?",
                (rid["id"], book),
            ).fetchone()
            if row:
                delta = rng.uniform(-0.06, 0.06)
                new_odds = max(1.2, round(row["current_odds"] * (1 + delta), 2))
                conn.execute(
                    "UPDATE odds SET current_odds = ?, updated_at = ? WHERE id = ?",
                    (new_odds, datetime.utcnow().isoformat(), row["id"]),
                )

    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Dummy odds updated."}


@app.post("/api/tips/track")
def track_tip(
    race_id: int,
    runner_id: int,
    bookmaker: str,
    edge_pct: float,
    odds_at_tip: float,
    stake: float = 0.0,
):
    if bookmaker not in BOOKMAKERS:
        raise HTTPException(status_code=400, detail="Unknown bookmaker.")
    if odds_at_tip <= 1:
        raise HTTPException(status_code=400, detail="Odds must be greater than 1.0")
    if stake < 0:
        raise HTTPException(status_code=400, detail="Stake must be non-negative")

    conn = get_conn()
    conn.execute(
        """
        INSERT INTO tracked_tips (
            user_id, race_id, runner_id, bookmaker, edge_pct, odds_at_tip, stake, tracked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "demo",
            race_id,
            runner_id,
            bookmaker,
            edge_pct,
            odds_at_tip,
            stake,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "tracked"}


@app.get("/api/tips/tracked")
def tracked_tips():
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT
          t.id,
          t.race_id,
          ra.race_date,
          ra.track,
          ra.race_number,
          ra.jump_time,
          r.horse_name,
          t.bookmaker,
          t.edge_pct,
          t.odds_at_tip,
          t.stake,
          t.result,
          t.tracked_at
        FROM tracked_tips t
        JOIN runners r ON r.id = t.runner_id
        JOIN races ra ON ra.id = t.race_id
        WHERE t.user_id = 'demo'
        ORDER BY t.tracked_at DESC
        LIMIT 200
        """
    ).fetchall()
    conn.close()
    return {"tips": [dict(r) for r in rows]}


@app.get("/api/user/profile")
def get_user_profile():
    conn = get_conn()
    row = conn.execute(
        """
        SELECT user_id, display_name, email, plan, created_at, updated_at
        FROM user_profiles
        WHERE user_id = 'demo'
        """
    ).fetchone()
    conn.close()
    return {"profile": dict(row) if row else None}


@app.post("/api/user/profile")
def update_user_profile(display_name: str, email: str):
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    conn.execute(
        """
        INSERT INTO user_profiles (user_id, display_name, email, plan, created_at, updated_at)
        VALUES ('demo', ?, ?, 'free', ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          display_name = excluded.display_name,
          email = excluded.email,
          updated_at = excluded.updated_at
        """,
        (display_name, email, now, now),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/api/user/settings")
def get_user_settings():
    conn = get_conn()
    row = conn.execute(
        """
        SELECT user_id, timezone, default_min_edge, notifications_enabled, notify_min_edge, updated_at
        FROM user_settings
        WHERE user_id = 'demo'
        """
    ).fetchone()
    conn.close()
    return {"settings": dict(row) if row else None}


@app.post("/api/user/settings")
def update_user_settings(
    timezone: str,
    default_min_edge: float,
    notifications_enabled: int,
    notify_min_edge: float,
):
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    conn.execute(
        """
        INSERT INTO user_settings (
            user_id, timezone, default_min_edge, notifications_enabled, notify_min_edge, updated_at
        )
        VALUES ('demo', ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          timezone = excluded.timezone,
          default_min_edge = excluded.default_min_edge,
          notifications_enabled = excluded.notifications_enabled,
          notify_min_edge = excluded.notify_min_edge,
          updated_at = excluded.updated_at
        """,
        (timezone, default_min_edge, notifications_enabled, notify_min_edge, now),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/api/user/bets")
def get_user_bets():
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT
          t.id,
          t.tracked_at,
          t.race_id,
          ra.track,
          ra.race_number,
          r.horse_name,
          t.bookmaker,
          t.edge_pct,
          t.odds_at_tip,
          t.stake,
          t.result
        FROM tracked_tips t
        JOIN runners r ON r.id = t.runner_id
        JOIN races ra ON ra.id = t.race_id
        WHERE t.user_id = 'demo'
        ORDER BY t.tracked_at DESC
        LIMIT 1000
        """
    ).fetchall()
    conn.close()
    return {"bets": [dict(r) for r in rows]}


@app.post("/api/user/bets/{bet_id}/result")
def update_bet_result(bet_id: int, result: str):
    if result not in {"pending", "won", "lost"}:
        raise HTTPException(status_code=400, detail="Invalid result.")
    conn = get_conn()
    conn.execute(
        """
        UPDATE tracked_tips
        SET result = ?
        WHERE id = ? AND user_id = 'demo'
        """,
        (result, bet_id),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/api/runners/{runner_id}/history")
def runner_history(runner_id: int):
    conn = get_conn()
    runner = conn.execute(
        """
        SELECT id, horse_number, horse_name, barrier, trainer, jockey
        FROM runners
        WHERE id = ?
        """,
        (runner_id,),
    ).fetchone()
    if not runner:
        conn.close()
        raise HTTPException(status_code=404, detail="Runner not found.")

    rows = conn.execute(
        """
        SELECT run_date, track, distance_m, finish_pos, starting_price, carried_weight_kg, jockey
        FROM runner_history
        WHERE runner_id = ?
        ORDER BY run_date DESC
        LIMIT 20
        """,
        (runner_id,),
    ).fetchall()
    conn.close()
    return {"runner": dict(runner), "runs": [dict(r) for r in rows]}


@app.get("/api/trainers/history")
def trainer_history(name: str):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT run_date, horse_name, track, distance_m, finish_pos, starting_price
        FROM trainer_history
        WHERE trainer = ?
        ORDER BY run_date DESC
        LIMIT 25
        """,
        (name,),
    ).fetchall()
    conn.close()
    return {"trainer": name, "runs": [dict(r) for r in rows]}


@app.get("/api/jockeys/history")
def jockey_history(name: str):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT run_date, horse_name, track, distance_m, finish_pos, starting_price
        FROM jockey_history
        WHERE jockey = ?
        ORDER BY run_date DESC
        LIMIT 25
        """,
        (name,),
    ).fetchall()
    conn.close()
    return {"jockey": name, "runs": [dict(r) for r in rows]}
