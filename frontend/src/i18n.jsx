// Multi-language support: English / हिन्दी / ગુજરાતી (Module: India-level localisation)
import React, { createContext, useContext, useState } from "react";

const DICT = {
  en: {
    dashboard: "Dashboard", expenses: "Expenses", income: "Income", budget: "Budget & Forecast",
    fraud: "Fraud Shield", investments: "Investments", market: "Market", reports: "Reports", chat: "AI Assistant",
    ocr: "Receipt Scanner", settings: "Settings", logout: "Logout",
    balance: "Cash Left", income_m: "Income (Month)", expense_m: "Expenses (Month)",
    savings: "Savings", health: "Health Score", add_expense: "Add Expense",
    total_spend: "Total spend", categories: "Categories", monthly_trend: "Monthly Trend",
    income_expense: "Income vs Expense", savings_trend: "Savings Trend", budget_status: "Budget Status",
    ai_insights: "AI Insights", fraud_alerts: "Fraud Alerts", recent: "Recent Transactions",
    upcoming: "Upcoming Bills", investment_growth: "Portfolio Growth (10Y)", prediction: "AI Prediction",
  },
  hi: {
    dashboard: "डैशबोर्ड", expenses: "खर्च", income: "आय", budget: "बजट और पूर्वानुमान",
    fraud: "धोखाधड़ी ढाल", investments: "निवेश", market: "बाज़ार", reports: "रिपोर्ट", chat: "AI सहायक",
    ocr: "रसीद स्कैनर", settings: "सेटिंग्स", logout: "लॉग आउट",
    balance: "बची नकदी", income_m: "आय (महीना)", expense_m: "खर्च (महीना)",
    savings: "बचत", health: "स्वास्थ्य स्कोर", add_expense: "खर्च जोड़ें",
    total_spend: "कुल खर्च", categories: "श्रेणियाँ", monthly_trend: "मासिक रुझान",
    income_expense: "आय बनाम खर्च", savings_trend: "बचत रुझान", budget_status: "बजट स्थिति",
    ai_insights: "AI जानकारी", fraud_alerts: "धोखाधड़ी अलर्ट", recent: "हाल के लेन-देन",
    upcoming: "आने वाले बिल", investment_growth: "पोर्टफोलियो वृद्धि (10 वर्ष)", prediction: "AI पूर्वानुमान",
  },
  gu: {
    dashboard: "ડેશબોર્ડ", expenses: "ખર્ચ", income: "આમદાની", budget: "બજેટ અને આગામી ગણાણા",
    fraud: "ફ્રોડ શીલ્ડ", investments: "નિવેશ", market: "બજાર", reports: "રિપોર્ટ", chat: "AI સહાયક",
    ocr: "રસીદ સ્કેનર", settings: "સેટિંગ્સ", logout: "લૉગ આઉટ",
    balance: "બાકી રોકડ", income_m: "આમદાની (મહિનો)", expense_m: "ખર્ચ (મહિનો)",
    savings: "બચત", health: "સ્વાસ્થ્ય સ્કોર", add_expense: "ખર્ચ ઉમેરો",
    total_spend: "કુલ ખર્ચ", categories: "શ્રેણીઓ", monthly_trend: "માસિક પ્રવૃત્તિ",
    income_expense: "આમદાની વિ. ખર્ચ", savings_trend: "બચત પ્રવૃત્તિ", budget_status: "બજેટ સ્થિતિ",
    ai_insights: "AI જાણકારી", fraud_alerts: "ફ્રોડ ચેતવણી", recent: "તાજેતરની લેંડેન",
    upcoming: "આવતા બિલ", investment_growth: "પોર્ટફોલિયો વૃદ્ધિ (10 વર્ષ)", prediction: "AI આગામી ગણાણા",
  },
};

const Ctx = createContext({ lang: "en", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("finmate_lang") || "en");
  const t = (k) => DICT[lang]?.[k] ?? DICT.en[k] ?? k;
  const update = (l) => { setLang(l); localStorage.setItem("finmate_lang", l); };
  return <Ctx.Provider value={{ lang, setLang: update, t }}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
