import importlib
import os
import unittest
from datetime import datetime

from fastapi import HTTPException


class Phase1ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["HORSE_DB_PATH"] = "horse.db"

        import app.main as main_module

        cls.main = importlib.reload(main_module)
        cls.main.startup()
        cls.created_bet_ids = []

    @classmethod
    def tearDownClass(cls):
        if cls.created_bet_ids:
            conn = cls.main.get_conn()
            for bet_id in cls.created_bet_ids:
                conn.execute("DELETE FROM tracked_tips WHERE id = ?", (bet_id,))
            conn.commit()
            conn.close()

    def _first_race_and_runner(self):
        conn = self.main.get_conn()
        day = datetime.now().date().isoformat()
        row = conn.execute(
            """
            SELECT
              ra.id AS race_id,
              r.id AS runner_id,
              r.model_prob,
              o.bookmaker AS best_bookmaker,
              o.current_odds AS market_odds
            FROM races ra
            JOIN runners r ON r.race_id = ra.id
            JOIN odds o ON o.runner_id = r.id
            WHERE ra.race_date = ?
            ORDER BY ra.track, ra.race_number, r.horse_number
            LIMIT 1
            """,
            (day,),
        ).fetchone()
        conn.close()
        self.assertIsNotNone(row)
        return row["race_id"], {
            "runner_id": row["runner_id"],
            "best_bookmaker": row["best_bookmaker"],
            "market_odds": float(row["market_odds"]),
            "edge_pct": round(self.main.calc_edge_pct(float(row["model_prob"]), float(row["market_odds"])), 2),
        }

    def test_calc_edge_pct(self):
        edge = self.main.calc_edge_pct(model_prob=0.25, market_odds=5.0)
        self.assertAlmostEqual(edge, 25.0)

    def test_track_tip_update_and_result_with_json_payloads(self):
        race_id, runner = self._first_race_and_runner()

        track_resp = self.main.track_tip(
            self.main.TrackTipRequest(
                race_id=race_id,
                runner_id=runner["runner_id"],
                bookmaker=runner["best_bookmaker"],
                edge_pct=runner["edge_pct"],
                odds_at_tip=runner["market_odds"],
                stake=1.5,
            )
        )
        self.assertEqual(track_resp["status"], "tracked")

        tips = self.main.tracked_tips().get("tips", [])
        self.assertTrue(tips)
        bet_id = tips[0]["id"]
        self.__class__.created_bet_ids.append(bet_id)

        update_resp = self.main.update_tracked_tip(
            bet_id,
            self.main.UpdateTrackedTipRequest(odds_at_tip=4.2, stake=2.0),
        )
        self.assertEqual(update_resp["status"], "ok")

        result_resp = self.main.update_bet_result(
            bet_id,
            self.main.UpdateBetResultRequest(result="won"),
        )
        self.assertEqual(result_resp["status"], "ok")

        updated = self.main.tracked_tips()["tips"][0]
        self.assertEqual(updated["result"], "won")
        self.assertEqual(float(updated["stake"]), 2.0)
        self.assertEqual(float(updated["odds_at_tip"]), 4.2)

    def test_profile_and_settings_json_payloads(self):
        profile_resp = self.main.update_user_profile(
            self.main.UpdateUserProfileRequest(display_name="Test User", email="test@example.com")
        )
        self.assertEqual(profile_resp["status"], "ok")

        settings_resp = self.main.update_user_settings(
            self.main.UpdateUserSettingsRequest(
                timezone="Australia/Sydney",
                default_min_edge=2.5,
                notifications_enabled=1,
                notify_min_edge=3.0,
            )
        )
        self.assertEqual(settings_resp["status"], "ok")

        profile = self.main.get_user_profile()["profile"]
        settings = self.main.get_user_settings()["settings"]

        self.assertEqual(profile["display_name"], "Test User")
        self.assertEqual(profile["email"], "test@example.com")
        self.assertEqual(float(settings["default_min_edge"]), 2.5)
        self.assertEqual(int(settings["notifications_enabled"]), 1)

    def test_track_tip_rejects_unknown_bookmaker(self):
        race_id, runner = self._first_race_and_runner()
        with self.assertRaises(HTTPException) as ctx:
            self.main.track_tip(
                self.main.TrackTipRequest(
                    race_id=race_id,
                    runner_id=runner["runner_id"],
                    bookmaker="not-a-book",
                    edge_pct=1.1,
                    odds_at_tip=2.2,
                    stake=1.0,
                )
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unknown bookmaker", str(ctx.exception.detail))


if __name__ == "__main__":
    unittest.main()
