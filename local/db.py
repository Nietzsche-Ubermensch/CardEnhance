"""SQLite store — same shape as the cloud app's cards + audit_logs tables."""
from __future__ import annotations

import os
import sqlite3
import threading
import time

_DATA = os.environ.get("CE_DATA_DIR") or os.path.join(os.path.dirname(__file__), "data")
_DB = os.path.join(_DATA, "cardenhance.db")
_lock = threading.Lock()

SCHEMA = """
create table if not exists cards (
  id text primary key,
  source_id text not null,
  filename text not null,
  player text, set_name text, manufacturer text,
  year integer, number text, parallel text, side text,
  engine text, detector text, status text not null,
  original_path text, rectified_path text, enhanced_path text,
  ocr_text text,
  created_at text not null default (datetime('now'))
);
create table if not exists audit_logs (
  id integer primary key autoincrement,
  action text not null, entity_type text, entity_id text, metadata text,
  created_at text not null default (datetime('now'))
);
"""


def _conn():
    os.makedirs(os.path.dirname(_DB), exist_ok=True)
    conn = sqlite3.connect(_DB, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


with _lock, _conn() as c:
    c.executescript(SCHEMA)


def audit(action: str, entity_type=None, entity_id=None, metadata: dict | None = None):
    import json
    with _lock, _conn() as c:
        c.execute(
            "insert into audit_logs (action, entity_type, entity_id, metadata) values (?,?,?,?)",
            (action, entity_type, entity_id, json.dumps(metadata or {})),
        )


def save_card(card: dict):
    with _lock, _conn() as c:
        c.execute(
            """insert into cards (id, source_id, filename, player, set_name, manufacturer,
               year, number, parallel, side, engine, detector, status, original_path,
               rectified_path, ocr_text)
               values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               on conflict(id) do update set player=excluded.player, set_name=excluded.set_name,
               manufacturer=excluded.manufacturer, year=excluded.year, number=excluded.number,
               parallel=excluded.parallel, side=excluded.side, engine=excluded.engine,
               detector=excluded.detector, status=excluded.status,
               rectified_path=excluded.rectified_path, ocr_text=excluded.ocr_text""",
            (
                card["id"], card["source_id"], card["filename"], card.get("player"),
                card.get("set_name"), card.get("manufacturer"), card.get("year"),
                card.get("number"), card.get("parallel"), card.get("side"),
                card.get("engine"), card.get("detector"), card.get("status", "completed"),
                card.get("original_path"), card.get("rectified_path"), card.get("ocr_text"),
            ),
        )
    audit("card.processed", "card", card["id"],
          {"filename": card["filename"], "player": card.get("player"), "engine": card.get("engine")})


def list_cards(limit: int = 200):
    with _lock, _conn() as c:
        return [dict(r) for r in c.execute(
            "select * from cards order by created_at desc limit ?", (limit,)).fetchall()]


def get_card(card_id: str):
    with _lock, _conn() as c:
        row = c.execute("select * from cards where id = ?", (card_id,)).fetchone()
        return dict(row) if row else None


def update_card(card_id: str, patch: dict):
    fields = {k: v for k, v in patch.items()
              if k in ("player", "set_name", "manufacturer", "year", "number", "parallel", "side")}
    if not fields:
        return get_card(card_id)
    sql = "update cards set " + ", ".join(f"{k} = ?" for k in fields) + " where id = ?"
    with _lock, _conn() as c:
        c.execute(sql, (*fields.values(), card_id))
    audit("card.updated", "card", card_id, fields)
    return get_card(card_id)


def set_enhanced(card_id: str, path: str):
    with _lock, _conn() as c:
        c.execute("update cards set enhanced_path = ? where id = ?", (path, card_id))


def list_audit(limit: int = 100):
    with _lock, _conn() as c:
        return [dict(r) for r in c.execute(
            "select * from audit_logs order by created_at desc limit ?", (limit,)).fetchall()]


def stats():
    with _lock, _conn() as c:
        n = c.execute("select count(*) from cards").fetchone()[0]
        a = c.execute("select count(*) from audit_logs").fetchone()[0]
    return {"cards": n, "audit": a, "db": os.path.basename(_DB),
            "time": time.strftime("%Y-%m-%d %H:%M:%S")}
