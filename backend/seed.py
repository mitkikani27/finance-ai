"""Seed a rich demo account so the app is alive on first run.

Demo login:  demo@finmate.in  /  Demo@123
Six months of realistic Indian salary-professional data (Apr–Sep 2026),
including one suspicious late-night UPI transaction for the fraud demo.
"""
import random
from datetime import date, datetime

import auth as authlib
import models

DEMO_EMAIL = "demo@finmate.in"
DEMO_PASSWORD = "Demo@123"


def _add(db, **kw):
    db.add(**kw)


def _mk_expense(db, uid, d, cat, desc, amt, mode="UPI"):
    db.add(models.Expense(user_id=uid, category=cat, description=desc,
                          amount=round(amt, 2), date=d, payment_mode=mode))


def seed_demo(db):
    user = db.query(models.User).filter(models.User.email == DEMO_EMAIL).first()
    if user:
        return user
    random.seed(42)
    user = models.User(
        email=DEMO_EMAIL, full_name="Aarav Sharma", phone="9876543210",
        password_hash=authlib.hash_password(DEMO_PASSWORD),
        profile='{"age": 26, "occupation": "employee", "city": "Ahmedabad", '
                '"risk_profile": "balanced", "income_type": "salary", "language": "en"}',
    )
    db.add(user)
    db.flush()
    uid = user.id

    months = [(2026, 4), (2026, 5), (2026, 6), (2026, 7), (2026, 8), (2026, 9)]
    today = date.today()

    # income: salary 48,000 on the 1st + occasional freelance
    for (y, m) in months:
        db.add(models.Income(user_id=uid, source="Salary", amount=48000,
                             date=date(y, m, 1), note="TechSoft Solutions Pvt Ltd"))
        if m in (5, 8):
            db.add(models.Income(user_id=uid, source="Freelance", amount=6500,
                                 date=date(y, m, 18), note="App UI gig"))

    # expenses with mild upward trend (Sep partial up to 23rd)
    for idx, (y, m) in enumerate(months):
        partial = (y, m) == (today.year, today.month)
        trend = 1 + 0.03 * idx
        last_day = 23 if partial else 28

        def d(day):
            day = min(day, last_day)
            if partial and day > today.day:
                return None
            return date(y, m, day)

        def spend(descs_amounts, days):
            for (cat, desc, base) in descs_amounts:
                for day in days:
                    dd = d(day)
                    if dd is None:
                        continue
                    _mk_expense(db, uid, dd, cat, desc, base * trend * random.uniform(0.85, 1.2))

        # Rent on the 1st
        dd = d(1)
        if dd:
            _mk_expense(db, uid, dd, "Rent", "Apartment rent (Pallam)", 12000, "NetBanking")
        # EMI on the 5th
        dd = d(5)
        if dd:
            _mk_expense(db, uid, dd, "EMI", "HDFC car loan EMI", 6500, "Auto Debit")

        spend([
            ("Fuel", "Indian Oil petrol", 950), [6, 15, 24],
            ("Food", "Swiggy dinner order", 420), [3, 9, 16, 22],
            ("Food", "Zomato lunch", 380), [8, 13, 20],
            ("Food", "Dominos weekend", 780), [12, 26],
            ("Groceries", "BigBasket weekly order", 1650), [4, 18],
            ("Groceries", "DMart monthly", 2400), [11],
            ("Utilities", "Jio postpaid bill", 699), [14],
            ("Utilities", "GJEC electricity bill", 950), [10],
            ("Transport", "Uber to airport", 620), [19],
            ("Transport", "Metro card top-up", 300), [7],
            ("Entertainment", "Netflix subscription", 649), [2],
            ("Entertainment", "PVR movie tickets", 560), [21],
            ("Shopping", "Amazon order (gadget)", 1450), [17],
            ("Shopping", "Myntra t-shirt", 1199), [25],
            ("Medical", "Apollo Pharmacy", 480), [13],
            ("Travel", "IRCTC train tickets (diwali plan)", 2350), [27],
        ], days=None) if False else None

        # simpler: iterate day lists per item
        for (cat, desc, base), days in [
            (("Fuel", "Indian Oil petrol", 950), [6, 15, 24]),
            (("Food", "Swiggy dinner order", 420), [3, 9, 16, 22]),
            (("Food", "Zomato lunch", 380), [8, 13, 20]),
            (("Food", "Dominos weekend", 780), [12, 26]),
            (("Groceries", "BigBasket weekly order", 1650), [4, 18]),
            (("Groceries", "DMart monthly", 2400), [11]),
            (("Utilities", "Jio postpaid bill", 699), [14]),
            (("Utilities", "GJEC electricity bill", 950), [10]),
            (("Transport", "Uber to airport", 620), [19]),
            (("Transport", "Metro card top-up", 300), [7]),
            (("Entertainment", "Netflix subscription", 649), [2]),
            (("Entertainment", "PVR movie tickets", 560), [21]),
            (("Shopping", "Amazon order (gadget)", 1450), [17]),
            (("Shopping", "Myntra t-shirt", 1199), [25]),
            (("Medical", "Apollo Pharmacy", 480), [13]),
            (("Travel", "IRCTC train tickets (diwali plan)", 2350), [27]),
        ]:
            for day in days:
                dd = d(day)
                if dd is None:
                    continue
                _mk_expense(db, uid, dd, cat, desc, base * trend * random.uniform(0.85, 1.2))

    # THE suspicious transaction (fraud demo) — late-night huge UPI
    sus_day = d(18) if (today.month, today.day) >= (9, 18) or (today.year, today.month) != (2026, 9) else None
    if sus_day and sus_day > today - __import__("datetime").timedelta(days=30):
        _mk_expense(db, uid, sus_day, "Other", "UPI transfer to UNKNOWN MERCH", 49999, "UPI")
        db.add(models.FraudAlert(
            user_id=uid, description="UPI transfer to UNKNOWN MERCH", amount=49999,
            risk_score=0.92,
            reason="Amount is 58× your typical transaction (median 850 INR).; "
                   "Transaction at 01:37 AM — unusual time for your profile.",
            status="new"))
    db.add(models.Notification(user_id=uid, title="Suspicious transaction detected",
                               body="UPI transfer to UNKNOWN MERCH — ₹49,999.00 (risk 92%). Review on the Fraud page.",
                               ntype="fraud"))

    # budgets
    for cat, limit in [("Food", 9000), ("Groceries", 5000), ("Shopping", 3000),
                       ("Entertainment", 1500), ("Fuel", 3000)]:
        db.add(models.Budget(user_id=uid, category=cat, monthly_limit=limit))

    # investments
    db.add(models.Investment(user_id=uid, name="HDFC Liquid Fund", inv_type="Emergency Fund",
                             amount=120000, expected_return=7.0, start_date=date(2025, 3, 1),
                             note="6-month safety net"))
    db.add(models.Investment(user_id=uid, name="Nifty 50 Index Fund SIP", inv_type="SIP",
                             amount=30000, monthly_inflow=5000, expected_return=12.0,
                             start_date=date(2025, 4, 2)))
    db.add(models.Investment(user_id=uid, name="Tax Saver FD", inv_type="FD",
                             amount=50000, expected_return=7.5, start_date=date(2025, 6, 1)))
    db.add(models.Investment(user_id=uid, name="SGB Gold (2024 series)", inv_type="Gold",
                             amount=25000, expected_return=9.0, start_date=date(2025, 1, 10)))

    # goals
    db.add(models.Goal(user_id=uid, name="Goa holiday fund", target_amount=40000,
                       saved_amount=15500, deadline=date(2026, 11, 20)))
    db.add(models.Goal(user_id=uid, name="New laptop", target_amount=80000,
                       saved_amount=32000, deadline=date(2027, 3, 1)))

    db.commit()
    db.refresh(user)
    return user
