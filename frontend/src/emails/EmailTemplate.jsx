import React from "react";
import { inr } from "../format.js";

// Dummy data for preview (same shape as the original React Email template)
export const PREVIEW_DATA = {
  monthlyReport: {
    userName: "John Doe",
    type: "monthly-report",
    data: {
      month: "December",
      stats: {
        totalIncome: 5000,
        totalExpenses: 3500,
        byCategory: {
          housing: 1500,
          groceries: 600,
          transportation: 400,
          entertainment: 300,
          utilities: 700,
        },
      },
      insights: [
        "Your housing expenses are 43% of your total spending - consider reviewing your housing costs.",
        "Great job keeping entertainment expenses under control this month!",
        "Setting up automatic savings could help you save 20% more of your income.",
      ],
    },
  },
  budgetAlert: {
    userName: "John Doe",
    type: "budget-alert",
    data: {
      percentageUsed: 85,
      budgetAmount: 4000,
      totalExpenses: 3400,
    },
  },
};

const styles = {
  body: { backgroundColor: "#f6f9fc", fontFamily: "-apple-system, sans-serif", padding: 24 },
  container: {
    backgroundColor: "#ffffff", margin: "0 auto", padding: 20, borderRadius: 5,
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)", maxWidth: 560,
  },
  title: { color: "#1f2937", fontSize: 32, fontWeight: "bold", textAlign: "center", margin: "0 0 20px" },
  heading: { color: "#1f2937", fontSize: 20, fontWeight: 600, margin: "0 0 16px" },
  text: { color: "#4b5563", fontSize: 16, margin: "0 0 16px" },
  section: {
    marginTop: 32, padding: 20, backgroundColor: "#f9fafb", borderRadius: 5, border: "1px solid #e5e7eb",
  },
  statsContainer: { margin: "32px 0", padding: 20, backgroundColor: "#f9fafb", borderRadius: 5 },
  stat: {
    marginBottom: 16, padding: 12, backgroundColor: "#fff", borderRadius: 4,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
  },
  row: {
    display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #e5e7eb",
  },
  footer: {
    color: "#6b7280", fontSize: 14, textAlign: "center", marginTop: 32, paddingTop: 16, borderTop: "1px solid #e5e7eb",
  },
};

export default function EmailTemplate({
  userName = "",
  type = "monthly-report",
  data = {},
  currency = "INR",
}) {
  const money = (n) => (currency === "INR" ? inr(n) : `$${n}`);

  if (type === "monthly-report") {
    return (
      <div style={styles.body}>
        <div style={styles.container}>
          <h1 style={styles.title}>Monthly Financial Report</h1>
          <p style={styles.text}>Hello {userName},</p>
          <p style={styles.text}>Here&rsquo;s your financial summary for {data?.month}:</p>

          <div style={styles.statsContainer}>
            <div style={styles.stat}>
              <p style={styles.text}>Total Income</p>
              <p style={styles.heading}>{money(data?.stats?.totalIncome)}</p>
            </div>
            <div style={styles.stat}>
              <p style={styles.text}>Total Expenses</p>
              <p style={styles.heading}>{money(data?.stats?.totalExpenses)}</p>
            </div>
            <div style={styles.stat}>
              <p style={styles.text}>Net</p>
              <p style={styles.heading}>
                {money((data?.stats?.totalIncome || 0) - (data?.stats?.totalExpenses || 0))}
              </p>
            </div>
          </div>

          {data?.stats?.byCategory && (
            <div style={styles.section}>
              <h2 style={styles.heading}>Expenses by Category</h2>
              {Object.entries(data.stats.byCategory).map(([category, amount]) => (
                <div key={category} style={styles.row}>
                  <span style={styles.text}>{category}</span>
                  <span style={styles.text}>{money(amount)}</span>
                </div>
              ))}
            </div>
          )}

          {data?.insights && (
            <div style={styles.section}>
              <h2 style={styles.heading}>FinMate Insights</h2>
              {data.insights.map((insight, index) => (
                <p key={index} style={styles.text}>• {insight}</p>
              ))}
            </div>
          )}

          <p style={styles.footer}>
            Thank you for using FinMate AI. Keep tracking your finances for better financial health!
          </p>
        </div>
      </div>
    );
  }

  if (type === "budget-alert") {
    const pct = Number(data?.percentageUsed || 0);
    return (
      <div style={styles.body}>
        <div style={styles.container}>
          <h1 style={styles.title}>Budget Alert</h1>
          <p style={styles.text}>Hello {userName},</p>
          <p style={styles.text}>
            You&rsquo;ve used {pct.toFixed(1)}% of your monthly budget.
          </p>
          <div style={styles.statsContainer}>
            <div style={styles.stat}>
              <p style={styles.text}>Budget Amount</p>
              <p style={styles.heading}>{money(data?.budgetAmount)}</p>
            </div>
            <div style={styles.stat}>
              <p style={styles.text}>Spent So Far</p>
              <p style={styles.heading}>{money(data?.totalExpenses)}</p>
            </div>
            <div style={styles.stat}>
              <p style={styles.text}>Remaining</p>
              <p style={styles.heading}>
                {money((data?.budgetAmount || 0) - (data?.totalExpenses || 0))}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
