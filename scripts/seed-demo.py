#!/usr/bin/env python3
"""Add synthetic demo data through the local Docker app's authenticated API.

Uses initial-owner credentials from Compose configuration without printing them.
Existing data is preserved. Reruns skip matching demo names/descriptions.
"""
import datetime as dt
import http.cookiejar
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://localhost:8088/api/v1"


def main():
    config = json.loads(subprocess.check_output(
        ["docker", "compose", "config", "--format", "json"], cwd=ROOT))
    env = config["services"]["backend"]["environment"]
    if env.get("SPRING_PROFILES_ACTIVE") != "dev":
        raise RuntimeError("Demo seeding requires the explicit dev profile.")
    email, password = env.get("INITIAL_OWNER_EMAIL"), env.get("INITIAL_OWNER_PASSWORD")
    if not email or not password:
        raise RuntimeError("Initial-owner credentials must be configured locally to sign in.")
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    csrf = {}

    def request(path, data=None, form=False):
        headers = {}
        body = None
        if data is not None:
            headers[csrf["headerName"]] = csrf["token"]
            headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
            body = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
        try:
            with client.open(urllib.request.Request(BASE + path, body, headers), timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Do not print request bodies, credentials, or server responses.
            raise RuntimeError(f"API {path}: HTTP {error.code}") from None

    csrf = request("/auth/csrf")
    session = request("/auth/login", {"email": email, "password": password}, form=True)
    if session["status"] != "AUTHENTICATED":
        raise RuntimeError("Login requires MFA; complete authentication before seeding via another method.")
    csrf = request("/auth/csrf")
    today = dt.datetime.now(ZoneInfo(env.get("APP_BUSINESS_TIME_ZONE", "Europe/Zurich"))).date()
    first = today.replace(day=1)
    months = [first]
    for _ in range(2):
        months.insert(0, (months[0] - dt.timedelta(days=1)).replace(day=1))
    opening = months[0] - dt.timedelta(days=1)
    counts = {"accounts": 0, "categories": 0, "operations": 0}
    accounts = {a["name"]: a for a in request("/accounts")}
    account_ids = {}
    for name, kind, currency, amount, meaning in [
        ("Checking", "CHECKING", "CHF", "8500", "BALANCE"),
        ("Savings", "SAVINGS", "CHF", "25000", "BALANCE"),
        ("Credit card", "CREDIT_CARD", "CHF", "320", "AMOUNT_OWED"),
        ("Wallet", "CASH", "CHF", "180", "BALANCE"),
        ("Investment cash", "INVESTMENT", "CHF", "4500", "BALANCE"),
        ("Euro travel", "CHECKING", "EUR", "1250", "BALANCE"),
    ]:
        label = "Demo · " + name
        if label not in accounts:
            accounts[label] = request("/accounts", dict(name=label, type=kind,
                institution="Synthetic Demo Bank", currency=currency, openingAmount=amount,
                balanceMeaning=meaning, openingDate=opening.isoformat()))
            counts["accounts"] += 1
        account = accounts[label]
        if account["type"] != kind or account["currency"] != currency or not account["active"]:
            raise RuntimeError(f"Existing demo account is incompatible: {label}")
        account_ids[name] = account["id"]

    existing_categories = request("/categories")["items"]
    category_ids = {}
    for name, kind, parent in [
        ("Income", "INCOME", None), ("Salary", "INCOME", "Income"),
        ("Interest", "INCOME", "Income"), ("Home", "SPENDING", None),
        ("Rent", "SPENDING", "Home"), ("Utilities", "SPENDING", "Home"),
        ("Food", "SPENDING", None), ("Groceries", "SPENDING", "Food"),
        ("Dining", "SPENDING", "Food"), ("Transport", "SPENDING", None),
        ("Leisure", "SPENDING", None), ("Health", "SPENDING", None),
        ("Shopping", "SPENDING", None), ("Travel", "SPENDING", None),
    ]:
        label = "Demo · " + name
        parent_id = category_ids.get(parent)
        category = next((c for c in existing_categories if c["name"] == label
                         and c["type"] == kind and c["parentId"] == parent_id), None)
        if category is None:
            category = request("/categories", dict(name=label, type=kind, parentId=parent_id))
            counts["categories"] += 1
        if not category["available"]:
            raise RuntimeError(f"Existing demo category is unavailable: {label}")
        category_ids[name] = category["id"]

    descriptions = set()
    page = 0
    while True:
        activity = request(f"/transactions?page={page}")
        descriptions.update(o["description"] for o in activity["items"])
        if not activity["hasMore"]:
            break
        page += 1

    def add(month, day, name, kind, account, amount, category=None, destination=None):
        date = month.replace(day=day)
        if date > today:
            return
        description = f"Synthetic demo · {month:%Y-%m} · {name}"
        if description in descriptions:
            return
        payload = dict(amount=amount, transactionDate=date.isoformat(), description=description,
                       notes="Fully synthetic sample data; not a real financial transaction.")
        if destination:
            payload.update(sourceAccountId=account_ids[account], destinationAccountId=account_ids[destination])
            request("/transfers", payload)
        else:
            payload.update(accountId=account_ids[account], kind=kind, payee="Synthetic " + name,
                           categoryId=category_ids.get(category))
            request("/transactions", payload)
        counts["operations"] += 1

    for month in months:
        for day, name, kind, account, amount, category, destination in [
            (1, "Salary", "INCOME", "Checking", "6800", "Salary", None),
            (2, "Rent", "EXPENSE", "Checking", "1850", "Rent", None),
            (3, "Savings deposit", "TRANSFER", "Checking", "1000", None, "Savings"),
            (3, "Groceries week 1", "EXPENSE", "Credit card", "126.45", "Groceries", None),
            (4, "Transit pass", "EXPENSE", "Checking", "85", "Transport", None),
            (5, "Coffee", "EXPENSE", "Wallet", "8.50", "Dining", None),
            (6, "Electricity", "EXPENSE", "Checking", "92.30", "Utilities", None),
            (7, "Dinner", "EXPENSE", "Credit card", "74.60", "Dining", None),
            (8, "Internet", "EXPENSE", "Checking", "59.90", "Utilities", None),
            (9, "Clothing", "EXPENSE", "Credit card", "149.90", "Shopping", None),
            (10, "Clothing refund", "REFUND", "Credit card", "49.90", "Shopping", None),
            (11, "Groceries week 2", "EXPENSE", "Checking", "98.75", "Groceries", None),
            (12, "Cinema", "EXPENSE", "Credit card", "36", "Leisure", None),
            (13, "Cash withdrawal", "TRANSFER", "Checking", "100", None, "Wallet"),
            (14, "Pharmacy", "EXPENSE", "Checking", "28.40", "Health", None),
            (15, "Card bill payment", "TRANSFER", "Checking", "500", None, "Credit card"),
            (16, "Travel lunch", "EXPENSE", "Euro travel", "32.50", "Travel", None),
            (17, "Uncategorized purchase", "EXPENSE", "Wallet", "12", None, None),
            (18, "Groceries week 3", "EXPENSE", "Credit card", "112.80", "Groceries", None),
            (20, "Brokerage cash deposit", "TRANSFER", "Checking", "400", None, "Investment cash"),
            (22, "Museum", "EXPENSE", "Euro travel", "24", "Travel", None),
            (24, "Lunch", "EXPENSE", "Wallet", "18.50", "Dining", None),
            (25, "Groceries week 4", "EXPENSE", "Checking", "104.20", "Groceries", None),
            (28, "Savings interest", "INCOME", "Savings", "8.25", "Interest", None),
        ]:
            add(month, day, name, kind, account, amount, category, destination)
    print("Created " + ", ".join(f"{value} {key}" for key, value in counts.items()) + ".")
    print(f"Sample period: {months[0]} through {today}. Existing data preserved.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, urllib.error.URLError, subprocess.CalledProcessError) as error:
        print(f"Seeding stopped: {error}", file=sys.stderr)
        sys.exit(1)
