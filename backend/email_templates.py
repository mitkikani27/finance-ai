"""HTML emails matching the FinMate monthly-report + budget-alert layout.

Styled like the React Email template (inline CSS — Gmail-safe tables).
"""
from html import escape


def _inr(amount) -> str:
    try:
        n = float(amount or 0)
    except (TypeError, ValueError):
        n = 0.0
    sign = "-" if n < 0 else ""
    return f"{sign}₹{abs(n):,.0f}"


def monthly_report_html(user_name: str, month: str, stats: dict, insights: list[str]) -> str:
    name = escape(user_name or "there")
    month_l = escape(month or "")
    income = stats.get("totalIncome") or 0
    expenses = stats.get("totalExpenses") or 0
    net = (income or 0) - (expenses or 0)
    cats = stats.get("byCategory") or {}

    cat_rows = ""
    for category, amount in cats.items():
        cat_rows += f"""
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#4b5563;font-size:16px;text-transform:capitalize;">{escape(str(category))}</td>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#4b5563;font-size:16px;text-align:right;">{_inr(amount)}</td>
        </tr>"""

    insight_rows = ""
    for insight in insights or []:
        insight_rows += f'<p style="color:#4b5563;font-size:16px;margin:0 0 16px;">• {escape(str(insight))}</p>'

    category_section = ""
    if cat_rows:
        category_section = f"""
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;padding:20px;background-color:#f9fafb;border-radius:5px;border:1px solid #e5e7eb;">
          <tr><td style="padding:20px;">
            <h2 style="color:#1f2937;font-size:20px;font-weight:600;margin:0 0 16px;">Expenses by Category</h2>
            <table width="100%" cellpadding="0" cellspacing="0">{cat_rows}</table>
          </td></tr>
        </table>"""

    insights_section = ""
    if insight_rows:
        insights_section = f"""
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;background-color:#f9fafb;border-radius:5px;border:1px solid #e5e7eb;">
          <tr><td style="padding:20px;">
            <h2 style="color:#1f2937;font-size:20px;font-weight:600;margin:0 0 16px;">FinMate Insights</h2>
            {insight_rows}
          </td></tr>
        </table>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your Monthly Financial Report</title></head>
<body style="background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;margin:0 auto;padding:20px;border-radius:5px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="padding:20px;">
          <h1 style="color:#1f2937;font-size:32px;font-weight:bold;text-align:center;margin:0 0 20px;">Monthly Financial Report</h1>
          <p style="color:#4b5563;font-size:16px;margin:0 0 16px;">Hello {name},</p>
          <p style="color:#4b5563;font-size:16px;margin:0 0 16px;">Here&rsquo;s your financial summary for {month_l}:</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;background-color:#f9fafb;border-radius:5px;">
            <tr><td style="padding:20px;">
              <div style="margin-bottom:16px;padding:12px;background-color:#fff;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <p style="color:#4b5563;font-size:16px;margin:0 0 8px;">Total Income</p>
                <p style="color:#1f2937;font-size:20px;font-weight:600;margin:0;">{_inr(income)}</p>
              </div>
              <div style="margin-bottom:16px;padding:12px;background-color:#fff;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <p style="color:#4b5563;font-size:16px;margin:0 0 8px;">Total Expenses</p>
                <p style="color:#1f2937;font-size:20px;font-weight:600;margin:0;">{_inr(expenses)}</p>
              </div>
              <div style="margin-bottom:0;padding:12px;background-color:#fff;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <p style="color:#4b5563;font-size:16px;margin:0 0 8px;">Net</p>
                <p style="color:#1f2937;font-size:20px;font-weight:600;margin:0;">{_inr(net)}</p>
              </div>
            </td></tr>
          </table>

          {category_section}
          {insights_section}

          <p style="color:#6b7280;font-size:14px;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
            Thank you for using FinMate AI. Keep tracking your finances for better financial health!
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def budget_alert_html(user_name: str, percentage_used: float, budget_amount: float, total_expenses: float) -> str:
    name = escape(user_name or "there")
    pct = float(percentage_used or 0)
    remaining = (budget_amount or 0) - (total_expenses or 0)
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Budget Alert</title></head>
<body style="background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;margin:0 auto;padding:20px;border-radius:5px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="padding:20px;">
          <h1 style="color:#1f2937;font-size:32px;font-weight:bold;text-align:center;margin:0 0 20px;">Budget Alert</h1>
          <p style="color:#4b5563;font-size:16px;margin:0 0 16px;">Hello {name},</p>
          <p style="color:#4b5563;font-size:16px;margin:0 0 16px;">
            You&rsquo;ve used {pct:.1f}% of your monthly budget.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;background-color:#f9fafb;border-radius:5px;">
            <tr><td style="padding:20px;">
              <div style="margin-bottom:16px;padding:12px;background-color:#fff;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <p style="color:#4b5563;font-size:16px;margin:0 0 8px;">Budget Amount</p>
                <p style="color:#1f2937;font-size:20px;font-weight:600;margin:0;">{_inr(budget_amount)}</p>
              </div>
              <div style="margin-bottom:16px;padding:12px;background-color:#fff;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <p style="color:#4b5563;font-size:16px;margin:0 0 8px;">Spent So Far</p>
                <p style="color:#1f2937;font-size:20px;font-weight:600;margin:0;">{_inr(total_expenses)}</p>
              </div>
              <div style="margin-bottom:0;padding:12px;background-color:#fff;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <p style="color:#4b5563;font-size:16px;margin:0 0 8px;">Remaining</p>
                <p style="color:#1f2937;font-size:20px;font-weight:600;margin:0;">{_inr(remaining)}</p>
              </div>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:14px;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
            Thank you for using FinMate AI. Keep tracking your finances for better financial health!
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
