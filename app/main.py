import random
import sqlite3
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"


def resolve_db_path() -> Path:
    db_value = os.getenv("HORSE_DB_PATH", "horse.db").strip()
    db_path = Path(db_value)
    if not db_path.is_absolute():
        db_path = PROJECT_DIR / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


DB_PATH = resolve_db_path()

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
DEFAULT_USER_SETTINGS = {
    "timezone": "Australia/Sydney",
    "default_min_edge": 1.0,
    "notifications_enabled": 1,
    "notify_min_edge": 1.0,
    "theme": "system",
    "odds_format": "decimal",
    "default_stake": 1.0,
    "bankroll_units": 100.0,
    "auto_settle_enabled": 1,
    "analytics_top_n": 8,
}

app = FastAPI(title="Horse Tips MVP", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class TrackTipRequest(BaseModel):
    race_id: int
    runner_id: int
    bookmaker: str
    edge_pct: float
    odds_at_tip: float
    stake: float = 0.0


class UpdateTrackedTipRequest(BaseModel):
    odds_at_tip: float
    stake: float


class UpdateUserProfileRequest(BaseModel):
    display_name: str
    email: str


class UpdateUserSettingsRequest(BaseModel):
    timezone: Optional[str] = None
    default_min_edge: Optional[float] = None
    notifications_enabled: Optional[int] = None
    notify_min_edge: Optional[float] = None
    theme: Optional[str] = None
    odds_format: Optional[str] = None
    default_stake: Optional[float] = None
    bankroll_units: Optional[float] = None
    auto_settle_enabled: Optional[int] = None
    analytics_top_n: Optional[int] = None


class UpdateBetResultRequest(BaseModel):
    result: Literal["pending", "won", "lost"]


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    # Safer defaults for concurrent local development sessions.
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=10000;")
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
            tracked_at TEXT NOT NULL,
            settled_at TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS race_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_id INTEGER NOT NULL,
            runner_id INTEGER NOT NULL,
            finish_pos INTEGER NOT NULL,
            closing_odds REAL,
            official_at TEXT NOT NULL,
            UNIQUE(race_id, runner_id),
            FOREIGN KEY (race_id) REFERENCES races(id),
            FOREIGN KEY (runner_id) REFERENCES runners(id)
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
            theme TEXT NOT NULL DEFAULT 'system',
            odds_format TEXT NOT NULL DEFAULT 'decimal',
            default_stake REAL NOT NULL DEFAULT 1.0,
            bankroll_units REAL NOT NULL DEFAULT 100.0,
            auto_settle_enabled INTEGER NOT NULL DEFAULT 1,
            analytics_top_n INTEGER NOT NULL DEFAULT 8,
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
    if "settled_at" not in tracked_cols:
        cur.execute("ALTER TABLE tracked_tips ADD COLUMN settled_at TEXT")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS race_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_id INTEGER NOT NULL,
            runner_id INTEGER NOT NULL,
            finish_pos INTEGER NOT NULL,
            closing_odds REAL,
            official_at TEXT NOT NULL,
            UNIQUE(race_id, runner_id),
            FOREIGN KEY (race_id) REFERENCES races(id),
            FOREIGN KEY (runner_id) REFERENCES runners(id)
        )
        """
    )
    race_results_cols = {r[1] for r in cur.execute("PRAGMA table_info(race_results)").fetchall()}
    if "closing_odds" not in race_results_cols:
        cur.execute("ALTER TABLE race_results ADD COLUMN closing_odds REAL")

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
            theme TEXT NOT NULL DEFAULT 'system',
            odds_format TEXT NOT NULL DEFAULT 'decimal',
            default_stake REAL NOT NULL DEFAULT 1.0,
            bankroll_units REAL NOT NULL DEFAULT 100.0,
            auto_settle_enabled INTEGER NOT NULL DEFAULT 1,
            analytics_top_n INTEGER NOT NULL DEFAULT 8,
            updated_at TEXT NOT NULL
        )
        """
    )
    settings_cols = {r[1] for r in cur.execute("PRAGMA table_info(user_settings)").fetchall()}
    if "theme" not in settings_cols:
        cur.execute("ALTER TABLE user_settings ADD COLUMN theme TEXT")
        cur.execute("UPDATE user_settings SET theme = 'system' WHERE theme IS NULL OR theme = ''")
    if "odds_format" not in settings_cols:
        cur.execute("ALTER TABLE user_settings ADD COLUMN odds_format TEXT")
        cur.execute("UPDATE user_settings SET odds_format = 'decimal' WHERE odds_format IS NULL OR odds_format = ''")
    if "default_stake" not in settings_cols:
        cur.execute("ALTER TABLE user_settings ADD COLUMN default_stake REAL")
        cur.execute("UPDATE user_settings SET default_stake = 1.0 WHERE default_stake IS NULL")
    if "bankroll_units" not in settings_cols:
        cur.execute("ALTER TABLE user_settings ADD COLUMN bankroll_units REAL")
        cur.execute("UPDATE user_settings SET bankroll_units = 100.0 WHERE bankroll_units IS NULL")
    if "auto_settle_enabled" not in settings_cols:
        cur.execute("ALTER TABLE user_settings ADD COLUMN auto_settle_enabled INTEGER")
        cur.execute("UPDATE user_settings SET auto_settle_enabled = 1 WHERE auto_settle_enabled IS NULL")
    if "analytics_top_n" not in settings_cols:
        cur.execute("ALTER TABLE user_settings ADD COLUMN analytics_top_n INTEGER")
        cur.execute("UPDATE user_settings SET analytics_top_n = 8 WHERE analytics_top_n IS NULL")

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
            user_id, timezone, default_min_edge, notifications_enabled, notify_min_edge,
            theme, odds_format, default_stake, bankroll_units, auto_settle_enabled, analytics_top_n,
            updated_at
        )
        VALUES ('demo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            DEFAULT_USER_SETTINGS["timezone"],
            DEFAULT_USER_SETTINGS["default_min_edge"],
            DEFAULT_USER_SETTINGS["notifications_enabled"],
            DEFAULT_USER_SETTINGS["notify_min_edge"],
            DEFAULT_USER_SETTINGS["theme"],
            DEFAULT_USER_SETTINGS["odds_format"],
            DEFAULT_USER_SETTINGS["default_stake"],
            DEFAULT_USER_SETTINGS["bankroll_units"],
            DEFAULT_USER_SETTINGS["auto_settle_enabled"],
            DEFAULT_USER_SETTINGS["analytics_top_n"],
            now,
        ),
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
                        # Use stronger dummy overround so combined book % is realistically >100.
                        book_margin = rng.uniform(0.14, 0.24)
                        noise = rng.uniform(-0.03, 0.02)
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
        # Keep legacy DB rows aligned with stronger overround assumptions.
        book_margin = rng.uniform(0.14, 0.24)
        noise = rng.uniform(-0.03, 0.02)
        odds = max(1.2, round(row["predicted_price"] * (1 - book_margin + noise), 2))
        cur.execute(
            "UPDATE odds SET current_odds = ?, updated_at = ? WHERE id = ?",
            (odds, datetime.utcnow().isoformat(), row["id"]),
        )
    conn.commit()
    conn.close()


def publish_dummy_race_result(conn: sqlite3.Connection, race_id: int) -> dict:
    race_row = conn.execute(
        """
        SELECT id, race_date, track, race_number
        FROM races
        WHERE id = ?
        """,
        (race_id,),
    ).fetchone()
    if not race_row:
        raise HTTPException(status_code=404, detail="Race not found.")

    runners = conn.execute(
        """
        SELECT r.id, r.predicted_price
        FROM runners r
        WHERE r.race_id = ?
        ORDER BY r.horse_number
        """,
        (race_id,),
    ).fetchall()
    if not runners:
        raise HTTPException(status_code=404, detail="No runners found for race.")

    rng = random.Random(race_id + len(runners))
    ranked = []
    odds_rows = conn.execute(
        """
        SELECT runner_id, AVG(current_odds) AS closing_odds
        FROM odds
        WHERE runner_id IN (
            SELECT id FROM runners WHERE race_id = ?
        )
        GROUP BY runner_id
        """,
        (race_id,),
    ).fetchall()
    closing_by_runner = {row["runner_id"]: float(row["closing_odds"] or 0) for row in odds_rows}
    for row in runners:
        price = max(float(row["predicted_price"] or 20.0), 1.01)
        # Favor stronger runners while preserving race-day randomness.
        score = (1.0 / price) + rng.uniform(-0.12, 0.12)
        ranked.append((row["id"], score))

    ranked.sort(key=lambda item: item[1], reverse=True)
    now = datetime.utcnow().isoformat()
    conn.executemany(
        """
        INSERT INTO race_results (race_id, runner_id, finish_pos, closing_odds, official_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(race_id, runner_id) DO UPDATE SET
          finish_pos = excluded.finish_pos,
          closing_odds = excluded.closing_odds,
          official_at = excluded.official_at
        """,
        [
            (race_id, runner_id, idx + 1, closing_by_runner.get(runner_id), now)
            for idx, (runner_id, _) in enumerate(ranked)
        ],
    )
    return {
        "race_id": race_row["id"],
        "race_date": race_row["race_date"],
        "track": race_row["track"],
        "race_number": race_row["race_number"],
        "runner_count": len(ranked),
    }


def settle_pending_tips(conn: sqlite3.Connection, user_id: str = "demo") -> dict:
    pending = conn.execute(
        """
        SELECT t.id, rr.finish_pos
        FROM tracked_tips t
        JOIN race_results rr ON rr.race_id = t.race_id AND rr.runner_id = t.runner_id
        WHERE t.user_id = ? AND t.result = 'pending'
        """,
        (user_id,),
    ).fetchall()
    if not pending:
        return {"checked": 0, "settled": 0, "won": 0, "lost": 0}

    now = datetime.utcnow().isoformat()
    won = 0
    lost = 0
    updates = []
    for row in pending:
        if int(row["finish_pos"]) == 1:
            result = "won"
            won += 1
        else:
            result = "lost"
            lost += 1
        updates.append((result, now, row["id"]))

    conn.executemany(
        """
        UPDATE tracked_tips
        SET result = ?, settled_at = ?
        WHERE id = ?
        """,
        updates,
    )
    return {"checked": len(pending), "settled": len(updates), "won": won, "lost": lost}


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


@app.get("/stats")
def stats_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "stats.html")


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

    by_runner = {}
    raw_model_prob = {}
    for row in rows:
        rid = row["runner_id"]
        raw_model_prob[rid] = float(row["model_prob"] or 0.0)
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

    model_total = sum(raw_model_prob.values()) or 1.0
    race_probs = {rid: (raw_model_prob.get(rid, 0.0) / model_total) for rid in by_runner.keys()}
    for rid, item in by_runner.items():
        model_prob = race_probs.get(rid, 0.0)
        item["model_prob_pct"] = round(model_prob * 100.0, 2)
        item["bookmaker_pct"] = round((1.0 / max(item["market_odds"], 1.01)) * 100.0, 2)
        item["edge_pct"] = round(calc_edge_pct(model_prob, item["market_odds"]), 2)

    # Compute form string (last 5 finishes) for each runner
    runner_ids_list = list(by_runner.keys())
    if runner_ids_list:
        ph = ",".join("?" for _ in runner_ids_list)
        form_rows = conn.execute(
            f"""
            SELECT runner_id, finish_pos
            FROM runner_history
            WHERE runner_id IN ({ph})
            ORDER BY runner_id, run_date DESC
            """,
            runner_ids_list,
        ).fetchall()
        form_map: dict[int, list[int]] = {}
        for fr in form_rows:
            rid = fr["runner_id"]
            form_map.setdefault(rid, [])
            if len(form_map[rid]) < 5:
                form_map[rid].append(fr["finish_pos"])

        jockey_names = list({item["jockey"] for item in by_runner.values()})
        trainer_names = list({item["trainer"] for item in by_runner.values()})

        jockey_roi: dict[str, float] = {}
        if jockey_names:
            jph = ",".join("?" for _ in jockey_names)
            jrows = conn.execute(
                f"SELECT jockey, COUNT(*) AS runs, SUM(CASE WHEN finish_pos = 1 THEN starting_price ELSE 0 END) AS returns FROM jockey_history WHERE jockey IN ({jph}) GROUP BY jockey",
                jockey_names,
            ).fetchall()
            for jr in jrows:
                jockey_roi[jr["jockey"]] = round(((jr["returns"] - jr["runs"]) / max(jr["runs"], 1)) * 100.0, 1)

        trainer_roi: dict[str, float] = {}
        if trainer_names:
            tph = ",".join("?" for _ in trainer_names)
            trows = conn.execute(
                f"SELECT trainer, COUNT(*) AS runs, SUM(CASE WHEN finish_pos = 1 THEN starting_price ELSE 0 END) AS returns FROM trainer_history WHERE trainer IN ({tph}) GROUP BY trainer",
                trainer_names,
            ).fetchall()
            for tr_row in trows:
                trainer_roi[tr_row["trainer"]] = round(((tr_row["returns"] - tr_row["runs"]) / max(tr_row["runs"], 1)) * 100.0, 1)
    else:
        form_map = {}
        jockey_roi = {}
        trainer_roi = {}

    conn.close()

    for rid, item in by_runner.items():
        positions = form_map.get(rid, [])
        item["form_last5"] = "".join(str(p) if p < 10 else "x" for p in reversed(positions))
        item["jockey_roi_pct"] = jockey_roi.get(item["jockey"], 0.0)
        item["trainer_roi_pct"] = trainer_roi.get(item["trainer"], 0.0)

    board = list(by_runner.values())
    for item in board:
        item["qualifies"] = item["edge_pct"] >= min_edge
    board.sort(key=lambda x: x["edge_pct"], reverse=True)
    totals = {
        "model_pct_total": round(sum(x["model_prob_pct"] for x in board), 2),
        "bookmaker_pct_total": round(sum(x["bookmaker_pct"] for x in board), 2),
    }
    return {"race": dict(race), "min_edge": min_edge, "selected_books": selected_books, "rows": board, "totals": totals}


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

        # Form strings for runners in this race
        race_runner_ids = list(by_runner.keys())
        race_form_map: dict[int, list[int]] = {}
        if race_runner_ids:
            fph = ",".join("?" for _ in race_runner_ids)
            frows = conn.execute(
                f"SELECT runner_id, finish_pos FROM runner_history WHERE runner_id IN ({fph}) ORDER BY runner_id, run_date DESC",
                race_runner_ids,
            ).fetchall()
            for fr in frows:
                rid2 = fr["runner_id"]
                race_form_map.setdefault(rid2, [])
                if len(race_form_map[rid2]) < 5:
                    race_form_map[rid2].append(fr["finish_pos"])

        race_jockeys = list({item["jockey"] for item in by_runner.values()})
        race_trainers = list({item["trainer"] for item in by_runner.values()})
        jroi: dict[str, float] = {}
        if race_jockeys:
            jph2 = ",".join("?" for _ in race_jockeys)
            for jr in conn.execute(f"SELECT jockey, COUNT(*) AS runs, SUM(CASE WHEN finish_pos = 1 THEN starting_price ELSE 0 END) AS returns FROM jockey_history WHERE jockey IN ({jph2}) GROUP BY jockey", race_jockeys).fetchall():
                jroi[jr["jockey"]] = round(((jr["returns"] - jr["runs"]) / max(jr["runs"], 1)) * 100.0, 1)
        troi: dict[str, float] = {}
        if race_trainers:
            tph2 = ",".join("?" for _ in race_trainers)
            for tr2 in conn.execute(f"SELECT trainer, COUNT(*) AS runs, SUM(CASE WHEN finish_pos = 1 THEN starting_price ELSE 0 END) AS returns FROM trainer_history WHERE trainer IN ({tph2}) GROUP BY trainer", race_trainers).fetchall():
                troi[tr2["trainer"]] = round(((tr2["returns"] - tr2["runs"]) / max(tr2["runs"], 1)) * 100.0, 1)

        probs = normalized_probs_from_prices(
            {rid: item["predicted_price"] for rid, item in by_runner.items()}
        )
        for rid, item in by_runner.items():
            model_prob = probs.get(rid, 0.0)
            edge = round(calc_edge_pct(model_prob, item["market_odds"]), 2)
            positions = race_form_map.get(rid, [])
            form_str = "".join(str(p) if p < 10 else "x" for p in reversed(positions))
            if edge >= min_edge:
                all_tips.append(
                    {
                        "race_id": race["id"],
                        "race_date": race["race_date"],
                        "track": race["track"],
                        "race_number": race["race_number"],
                        "jump_time": race["jump_time"],
                        **item,
                        "model_prob_pct": round(model_prob * 100.0, 2),
                        "bookmaker_pct": round((1.0 / max(item["market_odds"], 1.01)) * 100.0, 2),
                        "edge_pct": edge,
                        "form_last5": form_str,
                        "jockey_roi_pct": jroi.get(item["jockey"], 0.0),
                        "trainer_roi_pct": troi.get(item["trainer"], 0.0),
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


@app.post("/api/races/{race_id}/simulate-result")
def simulate_race_result(race_id: int):
    conn = get_conn()
    meta = publish_dummy_race_result(conn, race_id)
    settlement = settle_pending_tips(conn, user_id="demo")
    conn.commit()
    conn.close()
    return {"status": "ok", "result": meta, "settlement": settlement}


@app.post("/api/tips/track")
def track_tip(payload: TrackTipRequest):
    if payload.bookmaker not in BOOKMAKERS:
        raise HTTPException(status_code=400, detail="Unknown bookmaker.")
    if payload.odds_at_tip <= 1:
        raise HTTPException(status_code=400, detail="Odds must be greater than 1.0")
    if payload.stake < 0:
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
            payload.race_id,
            payload.runner_id,
            payload.bookmaker,
            payload.edge_pct,
            payload.odds_at_tip,
            payload.stake,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "tracked"}


@app.get("/api/tips/tracked")
def tracked_tips():
    conn = get_conn()
    settlement = settle_pending_tips(conn, user_id="demo")
    conn.commit()
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
          t.settled_at,
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
    return {"tips": [dict(r) for r in rows], "auto_settlement": settlement}


@app.post("/api/tips/tracked/{bet_id}/update")
def update_tracked_tip(bet_id: int, payload: UpdateTrackedTipRequest):
    if payload.odds_at_tip <= 1:
        raise HTTPException(status_code=400, detail="Odds must be greater than 1.0")
    if payload.stake < 0:
        raise HTTPException(status_code=400, detail="Stake must be non-negative")
    conn = get_conn()
    conn.execute(
        """
        UPDATE tracked_tips
        SET odds_at_tip = ?, stake = ?
        WHERE id = ? AND user_id = 'demo'
        """,
        (payload.odds_at_tip, payload.stake, bet_id),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.delete("/api/tips/tracked/{bet_id}")
def delete_tracked_tip(bet_id: int):
    conn = get_conn()
    conn.execute(
        """
        DELETE FROM tracked_tips
        WHERE id = ? AND user_id = 'demo'
        """,
        (bet_id,),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


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
def update_user_profile(payload: UpdateUserProfileRequest):
    display_name = payload.display_name.strip()
    email = payload.email.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Display name is required.")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required.")
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
        SELECT
          user_id,
          timezone,
          default_min_edge,
          notifications_enabled,
          notify_min_edge,
          theme,
          odds_format,
          default_stake,
          bankroll_units,
          auto_settle_enabled,
          analytics_top_n,
          updated_at
        FROM user_settings
        WHERE user_id = 'demo'
        """
    ).fetchone()
    if not row:
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO user_settings (
              user_id, timezone, default_min_edge, notifications_enabled, notify_min_edge,
              theme, odds_format, default_stake, bankroll_units, auto_settle_enabled, analytics_top_n, updated_at
            )
            VALUES ('demo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                DEFAULT_USER_SETTINGS["timezone"],
                DEFAULT_USER_SETTINGS["default_min_edge"],
                DEFAULT_USER_SETTINGS["notifications_enabled"],
                DEFAULT_USER_SETTINGS["notify_min_edge"],
                DEFAULT_USER_SETTINGS["theme"],
                DEFAULT_USER_SETTINGS["odds_format"],
                DEFAULT_USER_SETTINGS["default_stake"],
                DEFAULT_USER_SETTINGS["bankroll_units"],
                DEFAULT_USER_SETTINGS["auto_settle_enabled"],
                DEFAULT_USER_SETTINGS["analytics_top_n"],
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT
              user_id,
              timezone,
              default_min_edge,
              notifications_enabled,
              notify_min_edge,
              theme,
              odds_format,
              default_stake,
              bankroll_units,
              auto_settle_enabled,
              analytics_top_n,
              updated_at
            FROM user_settings
            WHERE user_id = 'demo'
            """
        ).fetchone()
    conn.close()
    return {"settings": dict(row) if row else None}


@app.post("/api/user/settings")
def update_user_settings(payload: UpdateUserSettingsRequest):
    conn = get_conn()
    existing = conn.execute(
        """
        SELECT
          timezone,
          default_min_edge,
          notifications_enabled,
          notify_min_edge,
          theme,
          odds_format,
          default_stake,
          bankroll_units,
          auto_settle_enabled,
          analytics_top_n
        FROM user_settings
        WHERE user_id = 'demo'
        """
    ).fetchone()
    conn.close()
    merged = dict(DEFAULT_USER_SETTINGS)
    if existing:
        merged.update(dict(existing))

    if payload.timezone is not None:
        merged["timezone"] = payload.timezone.strip() or DEFAULT_USER_SETTINGS["timezone"]
    if payload.default_min_edge is not None:
        merged["default_min_edge"] = float(payload.default_min_edge)
    if payload.notifications_enabled is not None:
        merged["notifications_enabled"] = int(payload.notifications_enabled)
    if payload.notify_min_edge is not None:
        merged["notify_min_edge"] = float(payload.notify_min_edge)
    if payload.theme is not None:
        merged["theme"] = payload.theme.strip().lower()
    if payload.odds_format is not None:
        merged["odds_format"] = payload.odds_format.strip().lower()
    if payload.default_stake is not None:
        merged["default_stake"] = float(payload.default_stake)
    if payload.bankroll_units is not None:
        merged["bankroll_units"] = float(payload.bankroll_units)
    if payload.auto_settle_enabled is not None:
        merged["auto_settle_enabled"] = int(payload.auto_settle_enabled)
    if payload.analytics_top_n is not None:
        merged["analytics_top_n"] = int(payload.analytics_top_n)

    if merged["notifications_enabled"] not in {0, 1}:
        raise HTTPException(status_code=400, detail="notifications_enabled must be 0 or 1.")
    if merged["auto_settle_enabled"] not in {0, 1}:
        raise HTTPException(status_code=400, detail="auto_settle_enabled must be 0 or 1.")
    if merged["theme"] not in {"system", "light", "dark"}:
        raise HTTPException(status_code=400, detail="theme must be one of: system, light, dark.")
    if merged["odds_format"] not in {"decimal", "american"}:
        raise HTTPException(status_code=400, detail="odds_format must be one of: decimal, american.")
    if merged["default_min_edge"] < -100:
        raise HTTPException(status_code=400, detail="default_min_edge is too low.")
    if merged["notify_min_edge"] < -100:
        raise HTTPException(status_code=400, detail="notify_min_edge is too low.")
    if merged["default_stake"] < 0:
        raise HTTPException(status_code=400, detail="default_stake must be non-negative.")
    if merged["bankroll_units"] < 0:
        raise HTTPException(status_code=400, detail="bankroll_units must be non-negative.")
    if merged["analytics_top_n"] < 3 or merged["analytics_top_n"] > 20:
        raise HTTPException(status_code=400, detail="analytics_top_n must be between 3 and 20.")

    now = datetime.utcnow().isoformat()
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO user_settings (
            user_id, timezone, default_min_edge, notifications_enabled, notify_min_edge,
            theme, odds_format, default_stake, bankroll_units, auto_settle_enabled, analytics_top_n, updated_at
        )
        VALUES ('demo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          timezone = excluded.timezone,
          default_min_edge = excluded.default_min_edge,
          notifications_enabled = excluded.notifications_enabled,
          notify_min_edge = excluded.notify_min_edge,
          theme = excluded.theme,
          odds_format = excluded.odds_format,
          default_stake = excluded.default_stake,
          bankroll_units = excluded.bankroll_units,
          auto_settle_enabled = excluded.auto_settle_enabled,
          analytics_top_n = excluded.analytics_top_n,
          updated_at = excluded.updated_at
        """,
        (
            merged["timezone"],
            merged["default_min_edge"],
            merged["notifications_enabled"],
            merged["notify_min_edge"],
            merged["theme"],
            merged["odds_format"],
            merged["default_stake"],
            merged["bankroll_units"],
            merged["auto_settle_enabled"],
            merged["analytics_top_n"],
            now,
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.post("/api/user/settings/reset")
def reset_user_settings():
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    conn.execute(
        """
        INSERT INTO user_settings (
            user_id, timezone, default_min_edge, notifications_enabled, notify_min_edge,
            theme, odds_format, default_stake, bankroll_units, auto_settle_enabled, analytics_top_n, updated_at
        )
        VALUES ('demo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          timezone = excluded.timezone,
          default_min_edge = excluded.default_min_edge,
          notifications_enabled = excluded.notifications_enabled,
          notify_min_edge = excluded.notify_min_edge,
          theme = excluded.theme,
          odds_format = excluded.odds_format,
          default_stake = excluded.default_stake,
          bankroll_units = excluded.bankroll_units,
          auto_settle_enabled = excluded.auto_settle_enabled,
          analytics_top_n = excluded.analytics_top_n,
          updated_at = excluded.updated_at
        """,
        (
            DEFAULT_USER_SETTINGS["timezone"],
            DEFAULT_USER_SETTINGS["default_min_edge"],
            DEFAULT_USER_SETTINGS["notifications_enabled"],
            DEFAULT_USER_SETTINGS["notify_min_edge"],
            DEFAULT_USER_SETTINGS["theme"],
            DEFAULT_USER_SETTINGS["odds_format"],
            DEFAULT_USER_SETTINGS["default_stake"],
            DEFAULT_USER_SETTINGS["bankroll_units"],
            DEFAULT_USER_SETTINGS["auto_settle_enabled"],
            DEFAULT_USER_SETTINGS["analytics_top_n"],
            now,
        ),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT
          user_id,
          timezone,
          default_min_edge,
          notifications_enabled,
          notify_min_edge,
          theme,
          odds_format,
          default_stake,
          bankroll_units,
          auto_settle_enabled,
          analytics_top_n,
          updated_at
        FROM user_settings
        WHERE user_id = 'demo'
        """
    ).fetchone()
    conn.close()
    return {"status": "ok", "settings": dict(row) if row else None}


@app.get("/api/user/settings/export")
def export_user_settings():
    conn = get_conn()
    profile = conn.execute(
        """
        SELECT user_id, display_name, email, plan, created_at, updated_at
        FROM user_profiles
        WHERE user_id = 'demo'
        """
    ).fetchone()
    settings = conn.execute(
        """
        SELECT
          user_id,
          timezone,
          default_min_edge,
          notifications_enabled,
          notify_min_edge,
          theme,
          odds_format,
          default_stake,
          bankroll_units,
          auto_settle_enabled,
          analytics_top_n,
          updated_at
        FROM user_settings
        WHERE user_id = 'demo'
        """
    ).fetchone()
    conn.close()
    return {
        "exported_at": datetime.utcnow().isoformat(),
        "profile": dict(profile) if profile else None,
        "settings": dict(settings) if settings else None,
    }


@app.get("/api/user/bets")
def get_user_bets():
    conn = get_conn()
    settlement = settle_pending_tips(conn, user_id="demo")
    conn.commit()
    rows = conn.execute(
        """
        SELECT
          t.id,
          t.tracked_at,
          t.race_id,
          ra.track,
          ra.race_number,
          ra.distance_m,
          r.horse_number AS back_number,
          r.barrier,
          r.horse_name,
          t.bookmaker,
          t.edge_pct,
          t.odds_at_tip,
          t.stake,
          t.settled_at,
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
    return {"bets": [dict(r) for r in rows], "auto_settlement": settlement}


@app.post("/api/user/bets/settle-pending")
def settle_pending_bets():
    conn = get_conn()
    settlement = settle_pending_tips(conn, user_id="demo")
    conn.commit()
    conn.close()
    return {"status": "ok", "settlement": settlement}


@app.get("/api/user/bets/analytics")
def get_user_bets_analytics():
    conn = get_conn()
    settlement = settle_pending_tips(conn, user_id="demo")
    conn.commit()
    rows = conn.execute(
        """
        SELECT
          t.id,
          t.tracked_at,
          t.race_id,
          t.bookmaker,
          t.odds_at_tip,
          t.stake,
          t.result,
          ra.track,
          rr.closing_odds
        FROM tracked_tips t
        JOIN races ra ON ra.id = t.race_id
        LEFT JOIN race_results rr ON rr.race_id = t.race_id
          AND rr.runner_id = t.runner_id
        WHERE t.user_id = 'demo'
        ORDER BY t.tracked_at ASC
        """
    ).fetchall()
    conn.close()

    bets = [dict(r) for r in rows]
    settled = [b for b in bets if b["result"] in {"won", "lost"}]
    wins = [b for b in settled if b["result"] == "won"]
    losses = [b for b in settled if b["result"] == "lost"]

    total_stake = sum(float(b.get("stake") or 1.0) if float(b.get("stake") or 0) > 0 else 1.0 for b in settled)

    def stake_of(b: dict) -> float:
        st = float(b.get("stake") or 0)
        return st if st > 0 else 1.0

    pnl_values = []
    for b in settled:
        stake = stake_of(b)
        odds = float(b.get("odds_at_tip") or 0)
        pnl = (stake * (odds - 1.0)) if b["result"] == "won" else (-stake)
        pnl_values.append(pnl)

    profit_units = sum(pnl_values)
    roi_pct = (profit_units / total_stake) * 100.0 if total_stake > 0 else 0.0
    win_rate_pct = (len(wins) / len(settled)) * 100.0 if settled else 0.0

    clv_rows = [b for b in settled if b.get("closing_odds") and float(b["closing_odds"]) > 1.0]
    clv_values = []
    for b in clv_rows:
        tip_odds = float(b.get("odds_at_tip") or 0)
        closing = float(b.get("closing_odds") or 0)
        clv = ((tip_odds / closing) - 1.0) * 100.0
        clv_values.append(clv)
    avg_clv_pct = sum(clv_values) / len(clv_values) if clv_values else 0.0

    equity = 0.0
    peak = 0.0
    max_drawdown = 0.0
    for pnl in pnl_values:
        equity += pnl
        peak = max(peak, equity)
        drawdown = peak - equity
        max_drawdown = max(max_drawdown, drawdown)

    best_win_streak = 0
    best_loss_streak = 0
    curr_win_streak = 0
    curr_loss_streak = 0
    for b in settled:
        if b["result"] == "won":
            curr_win_streak += 1
            curr_loss_streak = 0
        else:
            curr_loss_streak += 1
            curr_win_streak = 0
        best_win_streak = max(best_win_streak, curr_win_streak)
        best_loss_streak = max(best_loss_streak, curr_loss_streak)

    current_streak_type = "none"
    current_streak = 0
    for b in reversed(settled):
        if b["result"] == "won":
            if current_streak_type in {"none", "won"}:
                current_streak_type = "won"
                current_streak += 1
            else:
                break
        else:
            if current_streak_type in {"none", "lost"}:
                current_streak_type = "lost"
                current_streak += 1
            else:
                break

    by_track: dict[str, dict] = {}
    by_book: dict[str, dict] = {}
    for b in settled:
        stake = stake_of(b)
        odds = float(b.get("odds_at_tip") or 0)
        pnl = (stake * (odds - 1.0)) if b["result"] == "won" else (-stake)

        track = b["track"]
        by_track.setdefault(track, {"track": track, "bets": 0, "profit_units": 0.0})
        by_track[track]["bets"] += 1
        by_track[track]["profit_units"] += pnl

        book = b["bookmaker"]
        by_book.setdefault(book, {"bookmaker": book, "bets": 0, "profit_units": 0.0})
        by_book[book]["bets"] += 1
        by_book[book]["profit_units"] += pnl

    track_perf = []
    for row in by_track.values():
        row["roi_pct"] = round((row["profit_units"] / max(row["bets"], 1)) * 100.0, 2)
        row["profit_units"] = round(row["profit_units"], 2)
        track_perf.append(row)
    track_perf.sort(key=lambda x: x["profit_units"], reverse=True)

    book_perf = []
    for row in by_book.values():
        row["roi_pct"] = round((row["profit_units"] / max(row["bets"], 1)) * 100.0, 2)
        row["profit_units"] = round(row["profit_units"], 2)
        book_perf.append(row)
    book_perf.sort(key=lambda x: x["profit_units"], reverse=True)

    return {
        "auto_settlement": settlement,
        "summary": {
            "total_bets": len(bets),
            "settled_bets": len(settled),
            "pending_bets": len(bets) - len(settled),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate_pct": round(win_rate_pct, 2),
            "total_stake_units": round(total_stake, 2),
            "profit_units": round(profit_units, 2),
            "roi_pct": round(roi_pct, 2),
            "avg_clv_pct": round(avg_clv_pct, 2),
            "max_drawdown_units": round(max_drawdown, 2),
            "best_win_streak": best_win_streak,
            "best_loss_streak": best_loss_streak,
            "current_streak_type": current_streak_type,
            "current_streak": current_streak,
        },
        "by_track": track_perf,
        "by_bookmaker": book_perf,
    }


@app.get("/api/stats/filters")
def get_stats_filters():
    conn = get_conn()
    tracks = conn.execute(
        """
        SELECT DISTINCT track
        FROM races
        ORDER BY track
        """
    ).fetchall()
    conn.close()
    return {"tracks": [t["track"] for t in tracks]}


@app.get("/api/stats/dashboard")
def get_stats_dashboard(
    track: Optional[str] = Query(default=None),
    min_distance: Optional[int] = Query(default=None),
    max_distance: Optional[int] = Query(default=None),
    min_barrier: Optional[int] = Query(default=None),
    max_barrier: Optional[int] = Query(default=None),
    min_back_number: Optional[int] = Query(default=None),
    max_back_number: Optional[int] = Query(default=None),
):
    conn = get_conn()

    def build_filters(track_col: str, distance_col: str, runner_col_prefix: str):
        clauses = []
        params = []
        if track:
            clauses.append(f"{track_col} = ?")
            params.append(track)
        if min_distance is not None:
            clauses.append(f"{distance_col} >= ?")
            params.append(min_distance)
        if max_distance is not None:
            clauses.append(f"{distance_col} <= ?")
            params.append(max_distance)
        if min_barrier is not None:
            clauses.append(f"{runner_col_prefix}.barrier >= ?")
            params.append(min_barrier)
        if max_barrier is not None:
            clauses.append(f"{runner_col_prefix}.barrier <= ?")
            params.append(max_barrier)
        if min_back_number is not None:
            clauses.append(f"{runner_col_prefix}.horse_number >= ?")
            params.append(min_back_number)
        if max_back_number is not None:
            clauses.append(f"{runner_col_prefix}.horse_number <= ?")
            params.append(max_back_number)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return where_sql, params

    track_filter, params = build_filters("ra.track", "h.distance_m", "r")

    track_summary = conn.execute(
        f"""
        SELECT
          ra.track,
          COUNT(DISTINCT ra.id) AS races,
          COUNT(h.id) AS runs,
          SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) AS wins,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(h.id), 2) AS strike_rate_pct,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(h.id)), 2) AS profit_units,
          ROUND(((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(h.id)) * 100.0) / COUNT(h.id), 2) AS roi_pct,
          ROUND(AVG(ra.starters), 2) AS avg_starters,
          ROUND(AVG(ra.prize_pool), 2) AS avg_prize_pool,
          ROUND(AVG(CASE WHEN ra.track_rating LIKE 'Good%' THEN 1.0 ELSE 0.0 END) * 100.0, 2) AS good_rate_pct,
          ROUND(AVG(CASE WHEN ra.track_rating LIKE 'Soft%' THEN 1.0 ELSE 0.0 END) * 100.0, 2) AS soft_rate_pct
        FROM races ra
        JOIN runners r ON r.race_id = ra.id
        JOIN runner_history h ON h.runner_id = r.id
        {track_filter}
        GROUP BY ra.track
        ORDER BY races DESC, ra.track
        """,
        params,
    ).fetchall()

    bias_filter, bias_params = build_filters("h.track", "h.distance_m", "r")

    barrier_bias = conn.execute(
        f"""
        SELECT
          h.track,
          CASE
            WHEN r.barrier BETWEEN 1 AND 4 THEN 'Low (1-4)'
            WHEN r.barrier BETWEEN 5 AND 8 THEN 'Mid (5-8)'
            ELSE 'High (9+)'
          END AS barrier_bucket,
          COUNT(*) AS runs,
          SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) AS wins,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(*)), 2) AS profit_units,
          ROUND(((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(*)) * 100.0) / COUNT(*), 2) AS roi_pct,
          ROUND(AVG(h.finish_pos), 2) AS avg_finish_pos,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS strike_rate_pct
        FROM runner_history h
        JOIN runners r ON r.id = h.runner_id
        {bias_filter}
        GROUP BY h.track, barrier_bucket
        ORDER BY h.track, barrier_bucket
        """,
        bias_params,
    ).fetchall()

    jockey_stats = conn.execute(
        f"""
        SELECT
          h.jockey,
          COUNT(*) AS runs,
          SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) AS wins,
          ROUND(AVG(h.finish_pos), 2) AS avg_finish_pos,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS strike_rate_pct,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(*)), 2) AS profit_units,
          ROUND(((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(*)) * 100.0) / COUNT(*), 2) AS roi_pct,
          ROUND((SUM(CASE WHEN h.finish_pos <= 3 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS top3_rate_pct,
          SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END) AS short_fav_runs,
          SUM(CASE WHEN h.starting_price <= 3.0 AND h.finish_pos = 1 THEN 1 ELSE 0 END) AS short_fav_wins,
          ROUND(
            CASE
              WHEN SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END) = 0 THEN 0
              ELSE (
                SUM(CASE WHEN h.starting_price <= 3.0 AND h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0
              ) / SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END)
            END, 2
          ) AS short_fav_sr_pct,
          ROUND(
            CASE
              WHEN SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END) = 0 THEN 0
              ELSE (
                (
                  SUM(CASE WHEN h.starting_price <= 3.0 AND h.finish_pos = 1 THEN h.starting_price ELSE 0 END)
                  - SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END)
                ) * 100.0
              ) / SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END)
            END, 2
          ) AS short_fav_roi_pct
        FROM runner_history h
        JOIN runners r ON r.id = h.runner_id
        {bias_filter}
        GROUP BY h.jockey
        ORDER BY wins DESC, strike_rate_pct DESC
        LIMIT 20
        """,
        bias_params,
    ).fetchall()

    trainer_stats = conn.execute(
        f"""
        SELECT
          r.trainer,
          COUNT(*) AS runs,
          SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) AS wins,
          ROUND(AVG(h.finish_pos), 2) AS avg_finish_pos,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS strike_rate_pct,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(*)), 2) AS profit_units,
          ROUND(((SUM(CASE WHEN h.finish_pos = 1 THEN h.starting_price ELSE 0 END) - COUNT(*)) * 100.0) / COUNT(*), 2) AS roi_pct,
          ROUND((SUM(CASE WHEN h.finish_pos <= 3 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS top3_rate_pct,
          SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END) AS short_fav_runs,
          SUM(CASE WHEN h.starting_price <= 3.0 AND h.finish_pos = 1 THEN 1 ELSE 0 END) AS short_fav_wins,
          ROUND(
            CASE
              WHEN SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END) = 0 THEN 0
              ELSE (
                SUM(CASE WHEN h.starting_price <= 3.0 AND h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0
              ) / SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END)
            END, 2
          ) AS short_fav_sr_pct,
          ROUND(
            CASE
              WHEN SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END) = 0 THEN 0
              ELSE (
                (
                  SUM(CASE WHEN h.starting_price <= 3.0 AND h.finish_pos = 1 THEN h.starting_price ELSE 0 END)
                  - SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END)
                ) * 100.0
              ) / SUM(CASE WHEN h.starting_price <= 3.0 THEN 1 ELSE 0 END)
            END, 2
          ) AS short_fav_roi_pct
        FROM runner_history h
        JOIN runners r ON r.id = h.runner_id
        {bias_filter}
        GROUP BY r.trainer
        ORDER BY wins DESC, strike_rate_pct DESC
        LIMIT 20
        """,
        bias_params,
    ).fetchall()

    jockey_leaderboard = conn.execute(
        f"""
        SELECT
          h.jockey AS name,
          SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) AS wins,
          COUNT(*) AS runs,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS strike_rate_pct
        FROM runner_history h
        JOIN runners r ON r.id = h.runner_id
        {bias_filter}
        GROUP BY h.jockey
        ORDER BY wins DESC, strike_rate_pct DESC
        LIMIT 10
        """,
        bias_params,
    ).fetchall()

    trainer_leaderboard = conn.execute(
        f"""
        SELECT
          r.trainer AS name,
          SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) AS wins,
          COUNT(*) AS runs,
          ROUND((SUM(CASE WHEN h.finish_pos = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS strike_rate_pct
        FROM runner_history h
        JOIN runners r ON r.id = h.runner_id
        {bias_filter}
        GROUP BY r.trainer
        ORDER BY wins DESC, strike_rate_pct DESC
        LIMIT 10
        """,
        bias_params,
    ).fetchall()

    conn.close()
    return {
        "track_filter": track,
        "track_summary": [dict(r) for r in track_summary],
        "barrier_bias": [dict(r) for r in barrier_bias],
        "jockey_stats": [dict(r) for r in jockey_stats],
        "trainer_stats": [dict(r) for r in trainer_stats],
        "leaderboards": {
            "jockeys": [dict(r) for r in jockey_leaderboard],
            "trainers": [dict(r) for r in trainer_leaderboard],
        },
    }


@app.post("/api/user/bets/{bet_id}/result")
def update_bet_result(bet_id: int, payload: UpdateBetResultRequest):
    settled_at = datetime.utcnow().isoformat() if payload.result in {"won", "lost"} else None
    conn = get_conn()
    conn.execute(
        """
        UPDATE tracked_tips
        SET result = ?, settled_at = ?
        WHERE id = ? AND user_id = 'demo'
        """,
        (payload.result, settled_at, bet_id),
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


# ---------------------------------------------------------------------------
# Trainer / Jockey history helpers
# ---------------------------------------------------------------------------

DISTANCE_CATEGORIES = {
    "sprint": (0, 1200),
    "short": (1201, 1400),
    "mile": (1401, 1600),
    "middle": (1601, 2000),
    "long": (2001, 99999),
}


def annotate_runs_back(rows: list[dict]) -> list[dict]:
    """Group rows by horse_name, sort chronologically, mark each run with
    runs_back (1 = first-up, 2 = second-up …). A gap > 60 days = new prep."""
    by_horse: dict[str, list[dict]] = {}
    for r in rows:
        by_horse.setdefault(r["horse_name"], []).append(r)
    for horse_rows in by_horse.values():
        horse_rows.sort(key=lambda r: r["run_date"])
        prep_seq = 1
        for i, r in enumerate(horse_rows):
            if i > 0:
                prev = datetime.strptime(horse_rows[i - 1]["run_date"], "%Y-%m-%d")
                curr = datetime.strptime(r["run_date"], "%Y-%m-%d")
                if (curr - prev).days > 60:
                    prep_seq = 1
                else:
                    prep_seq += 1
            else:
                prep_seq = 1
            r["runs_back"] = prep_seq
    return rows


def compute_filtered_stats(rows: list[dict]) -> dict:
    total = len(rows)
    wins = sum(1 for r in rows if r.get("finish_pos") == 1)
    places = sum(1 for r in rows if (r.get("finish_pos") or 99) <= 3)
    returns = sum(float(r.get("starting_price") or 0) for r in rows if r.get("finish_pos") == 1)
    roi = round(((returns - total) / max(total, 1)) * 100.0, 1)
    strike = round((wins / max(total, 1)) * 100.0, 1)
    place_pct = round((places / max(total, 1)) * 100.0, 1)
    return {"runs": total, "wins": wins, "places": places, "strike_pct": strike, "place_pct": place_pct, "roi": roi}


def filter_runs(rows: list[dict], distance: Optional[str], track: Optional[str], runs_back: Optional[int]) -> list[dict]:
    filtered = rows
    if distance and distance in DISTANCE_CATEGORIES:
        lo, hi = DISTANCE_CATEGORIES[distance]
        filtered = [r for r in filtered if lo <= (r.get("distance_m") or 0) <= hi]
    if track:
        filtered = [r for r in filtered if r.get("track") == track]
    if runs_back:
        filtered = [r for r in filtered if r.get("runs_back") == runs_back]
    return filtered


@app.get("/api/trainers/history")
def trainer_history(
    name: str,
    distance: Optional[str] = None,
    track: Optional[str] = None,
    runs_back: Optional[int] = None,
):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT run_date, horse_name, track, distance_m, finish_pos, starting_price
        FROM trainer_history
        WHERE trainer = ?
        ORDER BY run_date DESC
        """,
        (name,),
    ).fetchall()
    conn.close()
    all_rows = [dict(r) for r in rows]
    available_tracks = sorted({r["track"] for r in all_rows if r.get("track")})
    annotate_runs_back(all_rows)
    filtered = filter_runs(all_rows, distance, track, runs_back)
    stats = compute_filtered_stats(filtered)
    filtered.sort(key=lambda r: r["run_date"], reverse=True)
    display_rows = filtered[:25]
    return {
        "trainer": name,
        "stats": stats,
        "runs": display_rows,
        "available_tracks": available_tracks,
    }


@app.get("/api/jockeys/history")
def jockey_history(
    name: str,
    distance: Optional[str] = None,
    track: Optional[str] = None,
    runs_back: Optional[int] = None,
):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT run_date, horse_name, track, distance_m, finish_pos, starting_price
        FROM jockey_history
        WHERE jockey = ?
        ORDER BY run_date DESC
        """,
        (name,),
    ).fetchall()
    conn.close()
    all_rows = [dict(r) for r in rows]
    available_tracks = sorted({r["track"] for r in all_rows if r.get("track")})
    annotate_runs_back(all_rows)
    filtered = filter_runs(all_rows, distance, track, runs_back)
    stats = compute_filtered_stats(filtered)
    filtered.sort(key=lambda r: r["run_date"], reverse=True)
    display_rows = filtered[:25]
    return {
        "jockey": name,
        "stats": stats,
        "runs": display_rows,
        "available_tracks": available_tracks,
    }
