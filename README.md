# خورشید (Khorshid) — Home Appliance Distribution & Repair Website

A bilingual (Persian default / English), dark+light mode, fully responsive
website with a working backend: live product data from an Excel file, auth,
cart, checkout with a Snapp-style delivery map, and a lightweight accounting
layer.

## What's actually inside (please read before deploying)

You asked for a first phase built in **HTML + Tailwind CSS**, plus an API that
feeds product data from Excel, live auth, a full accounting back-end, and a
payment page. Static HTML/Tailwind alone cannot read a file, run a live poll
against a spreadsheet, or keep a real user/order ledger — that needs a server.
So:

- **Frontend**: pure HTML + Tailwind CSS (via CDN), vanilla JS — exactly the
  stack you asked for, in `frontend/`.
- **Backend**: a small **Python/Flask** API in `backend/`, because it reads
  Excel directly with `openpyxl` and needed no extra tooling. If you'd rather
  standardize on Node.js/Express for a later phase, the API surface below is
  simple enough to port directly.
- **The Excel file** (`backend/data/products.xlsx`) is the live "database" for
  the product catalog — 8 real sample products, ready to edit.

## Running it

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Open **http://localhost:5000** — that's it, the Flask server serves both the
API and the frontend pages.

Edit `backend/data/products.xlsx` (name, price, or stock) while the server is
running, save it, and the product grid on the site updates within 10 seconds
— no restart needed. That's the "live update" you asked for: the frontend
polls `GET /api/products` every 10 seconds, and that endpoint re-reads the
Excel file on every request.

## Pages

| Page | File |
|---|---|
| Landing / trust page (video slot) | `frontend/index.html` |
| Product catalog (live from Excel) | `frontend/products.html` |
| Login | `frontend/login.html` |
| Sign up | `frontend/signup.html` |
| Checkout: cart, shipping, delivery map, payment | `frontend/payment.html` |

### Adding your real video
Open `frontend/index.html`, find the comment `VIDEO PLACEHOLDER`, and replace
the placeholder `<div id="hero-video-slot">` with a real `<video>` tag (an
example is left commented right below it) or an `<iframe>` if you'll host the
video on YouTube/Aparat.

## The backend, in plain terms

- `GET /api/products` — reads `products.xlsx` live, returns JSON. Used by the
  product grid, polled every 10s.
- `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/me` — session-
  based auth; passwords are hashed, never stored in plain text.
- `POST /api/orders` — creates an order from the cart; **first order for a
  logged-in customer ships free, every order after that is charged a flat
  fee** (change `STANDARD_SHIPPING_FEE` in `app.py`).
- `POST /api/orders/<id>/pay` — confirms payment and issues an invoice (see
  "Payment gateway" below for what's real vs. placeholder here).
- `GET /api/accounting/summary` — revenue, shipping collected, paid/pending
  order counts, current inventory value, out-of-stock list. This is the seed
  of the accounting module: enough to see the business's numbers today, and
  structured so you can extend it (see "Growing the accounting module").
- `POST /api/admin/upload-products` — lets you push a new Excel file to the
  server. This exists specifically for the scenario below.

## "The site is hosted, but my Excel file is on my own computer"

Be aware of the actual constraint here: a server sitting on the internet has
no way to reach into your laptop's filesystem on its own — nothing can watch
a file it can't see, no matter how the site is built. So there has to be a
bridge. Two practical options, both included:

1. **`backend/sync_watcher.py`** — run this small script on your own
   computer. It watches your local `products.xlsx` and, the instant you save
   a change in Excel, uploads it to your hosted site via
   `POST /api/admin/upload-products`. The site then reflects it on its next
   10-second poll, same as running everything locally.
   ```bash
   pip install requests
   python sync_watcher.py --file "C:\path\to\products.xlsx" --url https://your-site.com
   ```
   Leave it running in the background, or set it up as a scheduled task.

2. **A synced cloud folder** (Google Drive Desktop, OneDrive, Dropbox): point
   `PRODUCTS_XLSX` in `app.py` at a folder on the server that's synced to the
   same cloud folder you edit locally. No custom script needed, but it does
   mean trusting that sync service.

There's no third option where a plain hosted static site reads a file that
only exists on your PC — that's a hard networking constraint, not a
limitation of this build.

## Payment gateway — what's real, what's a placeholder

`POST /api/orders/<id>/pay` currently **simulates a successful payment** so
the rest of the flow (invoice, accounting) is fully wired and testable. Iran
doesn't have Stripe/PayPal-style access, so this needs a real Iranian PSP —
commonly Zarinpal, IDPay, or a bank's own gateway — which requires you to
register a merchant account and get real credentials first. Once you have
them, replace the body of `pay_order()` in `app.py` with: request a payment
from the gateway, redirect the browser to their page, verify their callback,
*then* mark the order paid. I didn't fabricate a gateway integration since it
would silently fail (or worse, look like it works) without real credentials.

## Growing the accounting module

What's here — an order ledger, invoices, and a revenue/inventory summary — is
a real starting point, not a mock. A "complete" accounting system (double-
entry bookkeeping, tax handling, supplier payables, multi-user permissions)
is its own project; the JSON-file storage here is meant to be swapped for a
proper database (PostgreSQL/MySQL) once you're past the prototype stage —
the API routes won't need to change shape, just their storage layer.

## Design notes

- Palette: deep engineering blue (`#1B4F8C` family) on white in light mode,
  the same blue family on near-black in dark mode, with a small warm gold
  accent (`#F2A83B`) used sparingly — a nod to *khorshid* (sun) — for the
  logo mark and the divider between the hero and trust sections.
- Type: **Vazirmatn** for Persian + Latin text (headings and body), **IBM
  Plex Mono** for prices, stats and SKUs — appliances live and die on their
  spec sheets, so numbers get a distinct, technical typeface.
- The four-step "how service works" section uses numbered markers because
  it's a genuine sequence a customer follows, not decoration.
- Dark/light mode defaults to the visitor's OS setting and remembers a manual
  override; language defaults to Persian (RTL) and remembers a manual switch
  to English (LTR).

## What you'd still want before a public launch

- A real payment gateway integration (see above).
- Moving the JSON "database" to a proper database once order volume matters.
- HTTPS + a production WSGI server (e.g. `gunicorn`) instead of Flask's dev
  server — the dev server is fine for building and testing, not for hosting.
- Real product photography (the product cards currently use a placeholder
  icon — swap in real images via the `image` column in the Excel file plus a
  small change in `frontend/assets/js/products.js`).
