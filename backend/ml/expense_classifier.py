"""Module 4 — AI Expense Categorization.

Trains a scikit-learn pipeline (CountVectorizer + Logistic Regression) on a
curated corpus of Indian merchant names at application start-up, then serves
real-time predictions such as "Swiggy ₹450 → Food".

Production note: swap the pipeline with a fine-tuned DistilBERT for
free-text descriptions — the predict() interface stays identical.
"""
import re
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

# merchant/description text -> category  (curated Indian-commerce corpus)
TRAINING_DATA = [
    # Food & restaurants
    ("Swiggy order from local restaurant", "Food"), ("Zomato delivery dinner", "Food"),
    ("Domino's pizza", "Food"), ("McDonalds lunch", "Food"), ("KFC family bucket", "Food"),
    ("Burger King", "Food"), ("Starbucks coffee", "Food"), ("Cafe Coffee Day", "Food"),
    ("Barbeque Nation", "Food"), ("Pizza Hut", "Food"), ("Subway sandwich", "Food"),
    ("Indian Cafe thali", "Food"), ("Biryani house dinner", "Food"), ("Momo point", "Food"),
    ("Hyperpure weekly dairy", "Food"), ("Haldiram's snacks", "Food"), ("Dosa king breakfast", "Food"),
    ("tandoori restaurant", "Food"), ("cafe billing", "Food"), ("momo and spring roll", "Food"),
    ("swiggy instamart meal", "Food"), ("zomato gold delivery", "Food"), ("restaurant bill", "Food"),
    ("dominos party pack", "Food"), ("kfc drive through", "Food"), ("ice cream parlor", "Food"),
    ("milk and bread local shop", "Groceries"),
    # Groceries
    ("BigBasket weekly groceries", "Groceries"), ("DMart shopping cart", "Groceries"),
    ("Vijay Sales essentials", "Groceries"), ("Reliance Fresh groceries", "Groceries"),
    ("More Supermarket billing", "Groceries"), ("Instamart groceries", "Groceries"),
    ("Zepto quick grocery", "Groceries"), ("Blinkit grocery order", "Groceries"),
    ("Grofers weekly order", "Groceries"), ("sharma general store", "Groceries"),
    ("local kirana store", "Groceries"), ("grocery bill", "Groceries"),
    ("vegetables and fruits mandi", "Groceries"), ("Aashirvaad atta and dal", "Groceries"),
    ("Tata Sampann groceries", "Groceries"), ("Natures basket monthly", "Groceries"),
    ("kirana payment", "Groceries"), ("supermarket essentials", "Groceries"),
    # Fuel
    ("Indian Oil petrol", "Fuel"), ("BPCL diesel", "Fuel"), ("HPCL fuel station", "Fuel"),
    ("Shell petrol top up", "Fuel"), ("Total Energies fuel", "Fuel"), ("petrol pump", "Fuel"),
    ("diesel filling", "Fuel"), ("fuel station payment", "Fuel"), ("oil bharat", "Fuel"),
    ("hp petrol cashless", "Fuel"),
    # Rent
    ("house rent for the month", "Rent"), ("monthly rent landlord", "Rent"),
    ("housing society maintenance", "Rent"), ("flat rent payment", "Rent"),
    ("society security deposit", "Rent"), ("apartment rent", "Rent"),
    # EMI / loans
    ("HDFC bank EMI", "EMI"), ("Bajaj Finserv EMI", "EMI"), ("car loan EMI", "EMI"),
    ("ICICI home loan EMI", "EMI"), ("SBI personal loan EMI", "EMI"),
    ("loan emi debit", "EMI"), ("two wheeler EMI", "EMI"),
    # Medical
    ("Apollo Hospital billing", "Medical"), ("Fortis clinic visit", "Medical"),
    ("Metro hospital", "Medical"), ("Apollo Pharmacy", "Medical"), ("1mg medicines", "Medical"),
    ("Netmeds online pharmacy", "Medical"), ("doctor consultation fee", "Medical"),
    ("dental clinic treatment", "Medical"), ("diagnostic lab tests", "Medical"),
    ("pharmacy bill", "Medical"), ("medical store purchase", "Medical"),
    # Transport
    ("Uber ride to office", "Transport"), ("Ola cab", "Transport"), ("Rapido bike taxi", "Transport"),
    ("Iris cab", "Transport"), ("auto rickshaw fare", "Transport"), ("metro card recharge", "Transport"),
    ("local train season ticket", "Transport"), ("city bus pass", "Transport"),
    # Entertainment
    ("Netflix subscription", "Entertainment"), ("Spotify premium", "Entertainment"),
    ("Prime Video", "Entertainment"), ("Disney+ Hotstar", "Entertainment"),
    ("JioCinema premium", "Entertainment"), ("PVR cinema tickets", "Entertainment"),
    ("Cinépolis movie", "Entertainment"), ("BookMyShow movie tickets", "Entertainment"),
    ("IMAX show", "Entertainment"), ("Steam games", "Entertainment"),
    ("PlayStation store", "Entertainment"), ("movie night tickets", "Entertainment"),
    ("cinema ticket", "Entertainment"), ("gaming top up", "Entertainment"),
    # Shopping
    ("Amazon order electronics", "Shopping"), ("Flipkart shopping", "Shopping"),
    ("Myntra clothes", "Shopping"), ("AJIO fashion", "Shopping"), ("Nykaa cosmetics", "Shopping"),
    ("Croma electronics", "Shopping"), ("Jio Store phone", "Shopping"), ("Reebok shoes", "Shopping"),
    ("Puma official store", "Shopping"), ("Nike sneakers", "Shopping"), ("Adidas jacket", "Shopping"),
    ("Westside shirt", "Shopping"), ("H&M clothing", "Shopping"), ("Zara outfit", "Shopping"),
    ("Urban Trendy outfit", "Shopping"), ("Dems smartwatch", "Shopping"),
    ("online shopping cart", "Shopping"), ("clothing store bill", "Shopping"),
    # Utilities
    ("Jio recharge", "Utilities"), ("Airtel postpaid bill", "Utilities"),
    ("Vi recharge plan", "Utilities"), ("GJEC electricity bill", "Utilities"),
    ("electricity bill", "Utilities"), ("water supply bill", "Utilities"),
    ("LPG cylinder refill", "Utilities"), ("Indane gas bill", "Utilities"),
    ("broadband fiber bill", "Utilities"), ("Tata Play DTH", "Utilities"),
    ("Dish TV subscription", "Utilities"), ("mobile recharge", "Utilities"),
    # Education
    ("Byju's subscription", "Education"), ("Unacademy plus", "Education"),
    ("Physics Wallah crash course", "Education"), ("Vedantu classes", "Education"),
    ("coaching fee", "Education"), ("college fees semester", "Education"),
    ("school fees", "Education"), ("Udemy course", "Education"),
    ("Coursera certificate", "Education"), ("book store notebooks", "Education"),
    # Travel
    ("MakeMyTrip flight booking", "Travel"), ("Cleartrip train ticket", "Travel"),
    ("Goibibo holiday package", "Travel"), ("IndiGo flight", "Travel"),
    ("SpiceJet airfare", "Travel"), ("Vistara ticket", "Travel"),
    ("IRCTC train booking", "Travel"), ("Oyo hotel booking", "Travel"),
    ("flight ticket payment", "Travel"), ("hotel stay", "Travel"),
    # Investment
    ("SIP investment mutual fund", "Investment"), ("HDFC Fund SIP", "Investment"),
    ("ICICI Prudential SIP", "Investment"), ("Axis Capital fund", "Investment"),
    ("gold purchase coinbazaar", "Investment"), ("PPF yearly deposit", "Investment"),
    ("NPS contribution", "Investment"), ("fixed deposit opening", "Investment"),
    ("mutual fund lumpsum", "Investment"),
    # Insurance
    ("ICICI Lombard policy", "Insurance"), ("Bupa health premium", "Insurance"),
    ("HDFC Ergo premium", "Insurance"), ("Star Health mediclaim", "Insurance"),
    ("term insurance premium", "Insurance"), ("car insurance renewal", "Insurance"),
    # Other
    ("cash withdrawal ATM", "Other"), ("bank transfer unknown", "Other"),
    ("misc payment", "Other"), ("other expense", "Other"), ("payment received", "Other"),
]

CATEGORIES = [
    "Food", "Groceries", "Fuel", "Rent", "EMI", "Medical", "Transport",
    "Entertainment", "Shopping", "Utilities", "Education", "Travel",
    "Investment", "Insurance", "Other",
]

pipeline = None

# Layer 1 — high-confidence known-brand rules (merchant → category).
# Production pattern: cheap deterministic rules first, ML fallback for unknowns.
KNOWN_MERCHANTS = {
    "swiggy": "Food", "zomato": "Food", "domino": "Food", "mcdonald": "Food",
    "kfc": "Food", "starbucks": "Food", "cafe coffee": "Food", "pizza hut": "Food",
    "barbeque nation": "Food", "subway": "Food", "haldiram": "Food", "momo": "Food",
    "foodpanda": "Food", "hyperpure": "Food", "biryani": "Food", "restaurant": "Food",
    "bigbasket": "Groceries", "dmart": "Groceries", "vijay sales": "Groceries",
    "reliance fresh": "Groceries", "more super": "Groceries", "instamart": "Groceries",
    "zepto": "Groceries", "blinkit": "Groceries", "grofers": "Groceries",
    "kirana": "Groceries", "grocery": "Groceries", "supermarket": "Groceries",
    "indian oil": "Fuel", "bpcl": "Fuel", "hpcl": "Fuel", "shell": "Fuel",
    "petrol": "Fuel", "diesel": "Fuel", "fuel station": "Fuel",
    "hdfc emi": "EMI", "hdfc bank emi": "EMI", "bajaj finserv": "EMI", "emi": "EMI",
    "loan emi": "EMI", "car loan": "EMI",
    "apollo": "Medical", "fortis": "Medical", "metro hospital": "Medical",
    "pharmacy": "Medical", "1mg": "Medical", "netmeds": "Medical", "medico": "Medical",
    "uber": "Transport", "ola ": "Transport", "rapido": "Transport", "iris cab": "Transport",
    "auto": "Transport", "metro card": "Transport", "bus pass": "Transport",
    "netflix": "Entertainment", "spotify": "Entertainment", "prime video": "Entertainment",
    "hotstar": "Entertainment", "jio cinema": "Entertainment", "pvr": "Entertainment",
    "cinepolis": "Entertainment", "bookmyshow": "Entertainment", "movie": "Entertainment",
    "cinema": "Entertainment",
    "amazon": "Shopping", "flipkart": "Shopping", "myntra": "Shopping", "ajio": "Shopping",
    "nykaa": "Shopping", "croma": "Shopping", "jio store": "Shopping", "zara": "Shopping",
    "h&m": "Shopping", "nike": "Shopping", "adidas": "Shopping", "puma": "Shopping",
    "reebok": "Shopping", "shopping": "Shopping",
    "jio recharge": "Utilities", "airtel": "Utilities", "vi recharge": "Utilities",
    "electricity": "Utilities", "gjec": "Utilities", "esec": "Utilities",
    "broadband": "Utilities", "lpg": "Utilities", "cylinder": "Utilities",
    "recharge": "Utilities", "dth": "Utilities",
    "byju": "Education", "unacademy": "Education", "physics wallah": "Education",
    "vedantu": "Education", "coaching": "Education", "fees": "Education",
    "coursera": "Education", "udemy": "Education",
    "makemytrip": "Travel", "cleartrip": "Travel", "goibibo": "Travel",
    "irctc": "Travel", "indigo": "Travel", "spicejet": "Travel", "vistara": "Travel",
    "oyo": "Travel", "flight": "Travel", "train": "Travel", "hotel": "Travel",
    "sip": "Investment", "mutual fund": "Investment", "fixed deposit": "Investment",
    "gold": "Investment", "ppf": "Investment", "nps": "Investment",
    "insurance": "Insurance", "premium": "Insurance", "lombard": "Insurance",
    "mediclaim": "Insurance",
    "rent": "Rent", "landlord": "Rent", "society": "Rent",
}


def _build():
    texts = [t for t, _ in TRAINING_DATA]
    labels = [c for _, c in TRAINING_DATA]
    pipe = Pipeline([
        ("tf", CountVectorizer(
            lowercase=True, token_pattern=r"(?u)\b[a-z0-9'+.-]{2,}\b", ngram_range=(1, 2),
            min_df=1, binary=True,
        )),
        ("clf", LogisticRegression(max_iter=2000, C=4.0, class_weight="balanced")),
    ])
    pipe.fit(texts, labels)
    return pipe


def get_model():
    global pipeline
    if pipeline is None:
        pipeline = _build()
    return pipeline


def normalize(text: str) -> str:
    return re.sub(r"[₹\s]+", " ", (text or "").lower()).strip()


def predict(description: str) -> dict:
    """Return predicted category + confidence + runner-ups for a description.

    Layer 1: known-merchant rules (≈96% confidence).
    Layer 2: Logistic Regression model for anything unknown.
    """
    text = normalize(description)
    # Layer 1 — rules
    for key, cat in KNOWN_MERCHANTS.items():
        if key in text:
            model = get_model()
            proba = model.predict_proba([text or "misc"])[0]
            order = sorted(range(len(model.classes_)), key=lambda i: -proba[i])
            alts = [(str(model.classes_[i]), round(float(proba[i]) * 100, 1))
                    for i in order if str(model.classes_[i]) != cat][:2]
            return {"category": cat, "confidence": 96.0, "alternatives": alts,
                    "method": "merchant-rule"}
    # Layer 2 — ML
    text = text or "misc payment"
    model = get_model()
    proba = model.predict_proba([text])[0]
    order = sorted(range(len(model.classes_)), key=lambda i: -proba[i])
    top = [(str(model.classes_[i]), round(float(proba[i]) * 100, 1)) for i in order[:3]]
    return {"category": top[0][0], "confidence": top[0][1],
            "alternatives": top[1:], "method": "logistic-regression"}
