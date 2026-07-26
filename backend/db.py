"""
db.py — SQLite data layer for Khorshid.

Replaces the old per-entity JSON files (data/users.json, orders.json,
invoices.json) with a single SQLite database (data/khorshid.db). SQLite
ships with Python — no new dependency, no separate server to run — but
gives us real transactions, indexes, and a schema, which the flat JSON
files didn't.

Note: products.xlsx is intentionally NOT part of this database. Product
data is still read live from Excel (see app.py) — that's a deliberate
feature (warehouse staff edit stock/prices in Excel and the site picks it
up automatically), not something this migration should touch.

If data/users.json, orders.json, or invoices.json already have entries the
first time this runs, they're imported into the new tables once and then
left alone on disk (harmless, no longer read).
"""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "khorshid.db"

# the old JSON files, kept only so we can import them once on first run
LEGACY_USERS_JSON = DATA_DIR / "users.json"
LEGACY_ORDERS_JSON = DATA_DIR / "orders.json"
LEGACY_INVOICES_JSON = DATA_DIR / "invoices.json"

DEFAULT_ADMIN_EMAIL = "admin@khorshid.local"
DEFAULT_ADMIN_PASSWORD = "ali123654"  # change this from Account > Change Password after first login!


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    reset_token TEXT,
    reset_token_expires TEXT,
    phone TEXT,
    avatar_path TEXT,
    address_text TEXT,
    address_lat REAL,
    address_lng REAL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    customer_json TEXT NOT NULL,
    items_json TEXT NOT NULL,
    delivery_json TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    shipping_fee INTEGER NOT NULL,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    coupon_code TEXT,
    free_shipping_applied INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    stock_sync_error TEXT,
    created_at TEXT NOT NULL,
    paid_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    customer_json TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    shipping_fee INTEGER NOT NULL,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    issued_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    discount_percent INTEGER NOT NULL,
    usage_limit INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coupon_usages (
    id TEXT PRIMARY KEY,
    coupon_code TEXT NOT NULL,
    user_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    used_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repairs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    device_type TEXT NOT NULL,
    issue TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    product_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(product_id, user_id)
);

CREATE TABLE IF NOT EXISTS blocked_delivery_dates (
    date TEXT PRIMARY KEY,
    reason TEXT,
    created_at TEXT NOT NULL
);
"""


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
    _migrate_new_columns()
    _migrate_legacy_json()
    _seed_admin()


def _migrate_new_columns():
    """Add profile columns (phone/avatar/address) to a users table created
    before these fields existed. CREATE TABLE IF NOT EXISTS above only
    covers brand-new databases, so existing ones need ALTER TABLE here."""
    with get_conn() as conn:
        existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        new_cols = {
            "phone": "TEXT",
            "avatar_path": "TEXT",
            "address_text": "TEXT",
            "address_lat": "REAL",
            "address_lng": "REAL",
        }
        for col, col_type in new_cols.items():
            if col not in existing_cols:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {col_type}")

        coupon_cols = {row["name"] for row in conn.execute("PRAGMA table_info(coupons)").fetchall()}
        if "usage_limit" not in coupon_cols:
            conn.execute("ALTER TABLE coupons ADD COLUMN usage_limit INTEGER")


def _migrate_legacy_json():
    """One-time import of any data left in the old JSON files."""
    with get_conn() as conn:
        existing_users = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
        existing_orders = conn.execute("SELECT COUNT(*) c FROM orders").fetchone()["c"]

    if existing_users == 0 and LEGACY_USERS_JSON.exists():
        try:
            legacy = json.loads(LEGACY_USERS_JSON.read_text(encoding="utf-8"))
        except Exception:
            legacy = []
        with get_conn() as conn:
            for u in legacy:
                conn.execute(
                    "INSERT OR IGNORE INTO users "
                    "(id, first_name, last_name, name, email, password_hash, is_admin, created_at) "
                    "VALUES (?,?,?,?,?,?,0,?)",
                    (
                        u.get("id") or str(uuid.uuid4()),
                        u.get("first_name", ""),
                        u.get("last_name", ""),
                        u.get("name", ""),
                        u["email"],
                        u["password_hash"],
                        u.get("created_at", datetime.utcnow().isoformat()),
                    ),
                )

    if existing_orders == 0 and LEGACY_ORDERS_JSON.exists():
        try:
            legacy = json.loads(LEGACY_ORDERS_JSON.read_text(encoding="utf-8"))
        except Exception:
            legacy = []
        with get_conn() as conn:
            for o in legacy:
                conn.execute(
                    "INSERT OR IGNORE INTO orders "
                    "(id, user_id, customer_json, items_json, delivery_json, subtotal, shipping_fee, "
                    "free_shipping_applied, total, status, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        o["id"], o.get("user_id"), json.dumps(o.get("customer", {})),
                        json.dumps(o.get("items", [])), json.dumps(o.get("delivery", {})),
                        o.get("subtotal", 0), o.get("shipping_fee", 0),
                        1 if o.get("free_shipping_applied") else 0, o.get("total", 0),
                        o.get("status", "pending_payment"), o.get("created_at", datetime.utcnow().isoformat()),
                        o.get("paid_at"),
                    ),
                )

    if LEGACY_INVOICES_JSON.exists():
        try:
            legacy = json.loads(LEGACY_INVOICES_JSON.read_text(encoding="utf-8"))
        except Exception:
            legacy = []
        with get_conn() as conn:
            for inv in legacy:
                conn.execute(
                    "INSERT OR IGNORE INTO invoices "
                    "(id, order_id, customer_json, subtotal, shipping_fee, total, issued_at) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (
                        inv["id"], inv.get("order_id", ""), json.dumps(inv.get("customer", {})),
                        inv.get("subtotal", 0), inv.get("shipping_fee", 0), inv.get("total", 0),
                        inv.get("issued_at", datetime.utcnow().isoformat()),
                    ),
                )


def _seed_admin():
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) c FROM users WHERE is_admin = 1").fetchone()
        if row["c"] > 0:
            return
        conn.execute(
            "INSERT OR IGNORE INTO users "
            "(id, first_name, last_name, name, email, password_hash, is_admin, created_at) "
            "VALUES (?,?,?,?,?,?,1,?)",
            (
                str(uuid.uuid4()), "Admin", "Khorshid", "Admin Khorshid",
                DEFAULT_ADMIN_EMAIL, generate_password_hash(DEFAULT_ADMIN_PASSWORD),
                datetime.utcnow().isoformat(),
            ),
        )


# --------------------------------------------------------------------------- #
# users
# --------------------------------------------------------------------------- #
def user_to_dict(row):
    if row is None:
        return None
    address = None
    if row["address_lat"] is not None and row["address_lng"] is not None:
        address = {
            "text": row["address_text"] or "",
            "lat": row["address_lat"],
            "lng": row["address_lng"],
        }
    return {
        "id": row["id"], "first_name": row["first_name"], "last_name": row["last_name"],
        "name": row["name"], "email": row["email"], "is_admin": bool(row["is_admin"]),
        "phone": row["phone"] or "",
        "avatar_url": f"/api/avatars/{row['avatar_path']}" if row["avatar_path"] else None,
        "address": address,
    }


def admin_user_summary(row):
    locked = False
    if row["locked_until"]:
        locked = datetime.fromisoformat(row["locked_until"]) > datetime.utcnow()
    return {
        "id": row["id"], "name": row["name"], "email": row["email"],
        "phone": row["phone"] or "", "is_admin": bool(row["is_admin"]),
        "created_at": row["created_at"], "locked": locked,
    }


def get_user_by_email(email):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def get_user_by_id(user_id):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def list_users():
    """All accounts for the admin panel. Never selects password_hash — admins
    can trigger a reset, but the actual password (hashed or otherwise) is
    never returned to the client."""
    with get_conn() as conn:
        return conn.execute(
            "SELECT id, first_name, last_name, name, email, phone, is_admin, "
            "created_at, locked_until FROM users ORDER BY created_at DESC"
        ).fetchall()


def admin_reset_password(user_id, password_hash):
    """Admin-triggered password reset from inside the admin panel. Also clears
    any lockout state and pending self-service reset token for that user."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, "
            "failed_attempts = 0, locked_until = NULL WHERE id = ?",
            (password_hash, user_id),
        )


def create_user(first_name, last_name, email, password_hash):
    uid = str(uuid.uuid4())
    name = f"{first_name} {last_name}".strip()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO users (id, first_name, last_name, name, email, password_hash, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (uid, first_name, last_name, name, email, password_hash, datetime.utcnow().isoformat()),
        )
    return get_user_by_id(uid)


def record_login_attempt(email, success):
    """Very small brute-force guard: lock the account for 15 minutes after 5 bad attempts."""
    with get_conn() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user:
            return
        if success:
            conn.execute("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", (user["id"],))
        else:
            attempts = user["failed_attempts"] + 1
            locked_until = None
            if attempts >= 5:
                from datetime import timedelta
                locked_until = (datetime.utcnow() + timedelta(minutes=15)).isoformat()
            conn.execute(
                "UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?",
                (attempts, locked_until, user["id"]),
            )


def is_locked(user_row):
    if not user_row["locked_until"]:
        return False
    return datetime.fromisoformat(user_row["locked_until"]) > datetime.utcnow()


def set_reset_token(email, token, expires_iso):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?",
            (token, expires_iso, email),
        )


def get_user_by_reset_token(token):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM users WHERE reset_token = ?", (token,)).fetchone()


def reset_password(user_id, password_hash):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, "
            "failed_attempts = 0, locked_until = NULL WHERE id = ?",
            (password_hash, user_id),
        )


def set_password(user_id, password_hash):
    """Change password from the account page (person already knows their
    current password — unlike reset_password, which is for the forgot-
    password flow and also clears the lockout counters)."""
    with get_conn() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


def update_profile(user_id, first_name, last_name, phone):
    name = f"{first_name} {last_name}".strip()
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET first_name = ?, last_name = ?, name = ?, phone = ? WHERE id = ?",
            (first_name, last_name, name, phone, user_id),
        )


def update_address(user_id, address_text, lat, lng):
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET address_text = ?, address_lat = ?, address_lng = ? WHERE id = ?",
            (address_text, lat, lng, user_id),
        )


def update_avatar(user_id, avatar_path):
    with get_conn() as conn:
        conn.execute("UPDATE users SET avatar_path = ? WHERE id = ?", (avatar_path, user_id))


# --------------------------------------------------------------------------- #
# orders / invoices
# --------------------------------------------------------------------------- #
def order_to_dict(row):
    if row is None:
        return None
    d = {
        "id": row["id"], "user_id": row["user_id"],
        "customer": json.loads(row["customer_json"]), "items": json.loads(row["items_json"]),
        "delivery": json.loads(row["delivery_json"]), "subtotal": row["subtotal"],
        "shipping_fee": row["shipping_fee"], "discount_amount": row["discount_amount"],
        "coupon_code": row["coupon_code"], "free_shipping_applied": bool(row["free_shipping_applied"]),
        "total": row["total"], "status": row["status"], "stock_sync_error": row["stock_sync_error"],
        "created_at": row["created_at"], "paid_at": row["paid_at"],
    }
    # present only on rows fetched via get_all_orders()'s join with users
    if "user_email" in row.keys():
        d["user_email"] = row["user_email"]
    return d


def count_orders_for_user(user_id):
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) c FROM orders WHERE user_id = ?", (user_id,)).fetchone()["c"]


def create_order(order):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO orders (id, user_id, customer_json, items_json, delivery_json, subtotal, "
            "shipping_fee, discount_amount, coupon_code, free_shipping_applied, total, status, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                order["id"], order["user_id"], json.dumps(order["customer"], ensure_ascii=False),
                json.dumps(order["items"], ensure_ascii=False), json.dumps(order["delivery"], ensure_ascii=False),
                order["subtotal"], order["shipping_fee"], order.get("discount_amount", 0),
                order.get("coupon_code"), 1 if order["free_shipping_applied"] else 0,
                order["total"], order["status"], order["created_at"],
            ),
        )


def get_order(order_id):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()


def mark_order_paid(order_id, stock_sync_error=None):
    with get_conn() as conn:
        conn.execute(
            "UPDATE orders SET status = 'paid', paid_at = ?, stock_sync_error = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), stock_sync_error, order_id),
        )


def set_order_status(order_id, status):
    with get_conn() as conn:
        conn.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))


def get_orders_for_user(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
    return [order_to_dict(r) for r in rows]


def get_all_orders():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT orders.*, users.email AS user_email FROM orders "
            "LEFT JOIN users ON users.id = orders.user_id "
            "ORDER BY orders.created_at DESC"
        ).fetchall()
    return [order_to_dict(r) for r in rows]


def create_invoice(invoice):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO invoices (id, order_id, customer_json, subtotal, shipping_fee, discount_amount, "
            "total, issued_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                invoice["id"], invoice["order_id"], json.dumps(invoice["customer"], ensure_ascii=False),
                invoice["subtotal"], invoice["shipping_fee"], invoice.get("discount_amount", 0),
                invoice["total"], invoice["issued_at"],
            ),
        )


def count_invoices():
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) c FROM invoices").fetchone()["c"]


def get_all_invoices():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM invoices ORDER BY issued_at DESC").fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# coupons
# --------------------------------------------------------------------------- #
def get_coupon(code):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM coupons WHERE code = ?", (code.upper(),)).fetchone()


def create_coupon(code, discount_percent, usage_limit=None):
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO coupons (code, discount_percent, usage_limit, active, created_at) "
            "VALUES (?,?,?,1,?)",
            (code.upper(), discount_percent, usage_limit, datetime.utcnow().isoformat()),
        )


def set_coupon_active(code, active):
    with get_conn() as conn:
        conn.execute("UPDATE coupons SET active = ? WHERE code = ?", (1 if active else 0, code.upper()))


def get_all_coupons():
    """Coupons for the admin panel, each with how many times it's been used
    so far (usage_limit is NULL for coupons with no cap)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT c.*, "
            "(SELECT COUNT(*) FROM coupon_usages u WHERE u.coupon_code = c.code) AS usage_count "
            "FROM coupons c ORDER BY c.created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def coupon_usage_count(code):
    with get_conn() as conn:
        return conn.execute(
            "SELECT COUNT(*) c FROM coupon_usages WHERE coupon_code = ?", (code.upper(),)
        ).fetchone()["c"]


def user_has_used_coupon(code, user_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM coupon_usages WHERE coupon_code = ? AND user_id = ? LIMIT 1",
            (code.upper(), user_id),
        ).fetchone()
    return row is not None


def record_coupon_usage(code, user_id, order_id):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO coupon_usages (id, coupon_code, user_id, order_id, used_at) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), code.upper(), user_id, order_id, datetime.utcnow().isoformat()),
        )


def get_coupon_usages(code):
    """Who has used a coupon and when, for the admin 'used by' view."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT u.used_at, u.order_id, usr.name, usr.email, usr.phone "
            "FROM coupon_usages u JOIN users usr ON usr.id = u.user_id "
            "WHERE u.coupon_code = ? ORDER BY u.used_at DESC",
            (code.upper(),),
        ).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# blocked delivery dates
# --------------------------------------------------------------------------- #
def get_blocked_dates():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM blocked_delivery_dates ORDER BY date ASC").fetchall()
    return [dict(r) for r in rows]


def is_date_blocked(date_str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM blocked_delivery_dates WHERE date = ?", (date_str,)
        ).fetchone()
    return row is not None


def block_delivery_date(date_str, reason=None):
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO blocked_delivery_dates (date, reason, created_at) VALUES (?,?,?)",
            (date_str, reason, datetime.utcnow().isoformat()),
        )


def unblock_delivery_date(date_str):
    with get_conn() as conn:
        conn.execute("DELETE FROM blocked_delivery_dates WHERE date = ?", (date_str,))


# --------------------------------------------------------------------------- #
# repairs
# --------------------------------------------------------------------------- #
def create_repair(repair):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO repairs (id, user_id, name, phone, device_type, issue, status, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                repair["id"], repair.get("user_id"), repair["name"], repair["phone"],
                repair["device_type"], repair["issue"], "new", repair["created_at"],
            ),
        )


def get_all_repairs():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM repairs ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_repairs_for_user(user_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM repairs WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def set_repair_status(repair_id, status):
    with get_conn() as conn:
        conn.execute("UPDATE repairs SET status = ? WHERE id = ?", (status, repair_id))


# --------------------------------------------------------------------------- #
# product reviews
# --------------------------------------------------------------------------- #
def upsert_review(product_id, user_id, user_name, rating, comment):
    """One review per (product, user). Submitting again updates it in place
    — same behavior as most storefronts, and avoids a user's opinion being
    counted twice in the average rating."""
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM reviews WHERE product_id = ? AND user_id = ?",
            (product_id, user_id),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE reviews SET user_name = ?, rating = ?, comment = ?, created_at = ? WHERE id = ?",
                (user_name, rating, comment, datetime.utcnow().isoformat(), existing["id"]),
            )
            return existing["id"]
        review_id = str(uuid.uuid4())[:8]
        conn.execute(
            "INSERT INTO reviews (id, product_id, user_id, user_name, rating, comment, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (review_id, product_id, user_id, user_name, rating, comment, datetime.utcnow().isoformat()),
        )
        return review_id


def get_reviews_for_product(product_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC", (product_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_review_summary(product_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) c, AVG(rating) a FROM reviews WHERE product_id = ?", (product_id,)
        ).fetchone()
    count = row["c"] or 0
    avg = round(row["a"], 1) if row["a"] else 0
    return {"count": count, "average": avg}


def get_user_review_for_product(product_id, user_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM reviews WHERE product_id = ? AND user_id = ?", (product_id, user_id)
        ).fetchone()
    return dict(row) if row else None
