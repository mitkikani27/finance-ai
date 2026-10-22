"""SMTP sender for FinMate emails.

Defaults match .env.example (Gmail, port 587, TLS). Real send needs
SMTP_USER + SMTP_PASSWORD in backend/.env (Gmail App Password).
Without a password, HTML is saved under backend/sent_emails/.
"""
import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# Same values as .env.example — used when env keys are missing
SMTP_DEFAULTS = {
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USER": "you@gmail.com",
    "SMTP_PASSWORD": "your-app-password",
    "SMTP_FROM": "you@gmail.com",
    "SMTP_TLS": "1",
}

PLACEHOLDER_USERS = {"", "you@gmail.com", "your-app-password"}

SENT_DIR = Path(__file__).resolve().parent / "sent_emails"
SENT_DIR.mkdir(exist_ok=True)


def _load_env_file() -> None:
    env = Path(__file__).resolve().parent / ".env"
    if not env.is_file():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_env_file()


def _smtp(key: str) -> str:
    return (os.getenv(key) or SMTP_DEFAULTS.get(key) or "").strip()


def smtp_ready() -> bool:
    user = _smtp("SMTP_USER")
    password = _smtp("SMTP_PASSWORD")
    from_addr = _smtp("SMTP_FROM")
    return bool(
        _smtp("SMTP_HOST")
        and from_addr
        and from_addr not in PLACEHOLDER_USERS
        and user not in PLACEHOLDER_USERS
        and password not in PLACEHOLDER_USERS
    )


def send_email(to_email: str, subject: str, html: str) -> dict:
    """Send HTML email. Returns {ok, mode, path?}."""
    if not to_email:
        raise ValueError("Recipient email is missing.")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_sub = "".join(c if c.isalnum() else "-" for c in subject)[:40]
    preview = SENT_DIR / f"{stamp}-{safe_sub}.html"
    preview.write_text(html, encoding="utf-8")

    host = _smtp("SMTP_HOST")
    port = int(_smtp("SMTP_PORT") or "587")
    user = _smtp("SMTP_USER")
    password = _smtp("SMTP_PASSWORD")
    from_addr = _smtp("SMTP_FROM")
    use_tls = _smtp("SMTP_TLS") not in ("0", "false", "False")

    if not smtp_ready():
        return {
            "ok": True,
            "mode": "preview",
            "path": str(preview),
            "to": to_email,
            "from": from_addr,
            "message": (
                f"Preview saved. Real inbox send ke liye backend/.env me "
                f"SMTP_USER / SMTP_PASSWORD / SMTP_FROM apna Gmail + App Password daalo "
                f"(host={host}:{port})."
            ),
        }

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"FinMate AI <{from_addr}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if use_tls:
            smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.sendmail(from_addr, [to_email], msg.as_string())

    return {"ok": True, "mode": "smtp", "to": to_email, "from": from_addr}
