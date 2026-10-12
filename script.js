/* =========================================================
   CalcPro: calculator logic
   1) ENGINE: pure functions (parse, calculate, format)
   2) UI: buttons, keyboard, history, theme
   ========================================================= */

// ===== ENGINE START =====
const DIV_ZERO = "Cannot divide by zero";

/**
 * Safely evaluates an expression like "2+3*(4-1)" without using eval().
 * Supports + - * /, parentheses, unary minus and postfix %.
 * "200+10%" behaves like a real calculator: 200 + 10% of 200 = 220.
 */
function evaluate(src) {
  let i = 0;
  const peek = () => src[i];

  function parseExpr() {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const right = parseTerm();
      const rv = right.pct ? left.v * right.v : right.v; // 200 + 10% -> 200 + 20
      left = { v: op === "+" ? left.v + rv : left.v - rv, pct: false };
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const right = parseUnary();
      if (op === "/" && right.v === 0) throw new Error(DIV_ZERO);
      left = { v: op === "*" ? left.v * right.v : left.v / right.v, pct: false };
    }
    return left;
  }

  function parseUnary() {
    if (peek() === "-") {
      i++;
      const u = parseUnary();
      return { v: -u.v, pct: u.pct };
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let v = parsePrimary();
    let pct = false;
    while (peek() === "%") {
      i++;
      v = v / 100;
      pct = true;
    }
    return { v, pct };
  }

  function parsePrimary() {
    if (peek() === "(") {
      i++;
      const inner = parseExpr();
      if (peek() !== ")") throw new Error("Invalid expression");
      i++;
      return inner.v;
    }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (!m) throw new Error("Invalid expression");
    i += m[0].length;
    return parseFloat(m[0]);
  }

  const out = parseExpr();
  if (i !== src.length) throw new Error("Invalid expression");
  return out.v;
}

/** Rounds floating point noise (0.1 + 0.2 -> 0.3) and returns a plain string. */
function resultToString(n) {
  if (!isFinite(n)) throw new Error("Invalid result");
  if (Math.abs(n) >= 1e15) throw new Error("Result too large");
  let r = parseFloat(n.toPrecision(12));
  if (r === 0) r = 0; // avoids "-0"
  if (r !== 0 && Math.abs(r) < 1e-6) {
    return r.toFixed(12).replace(/\.?0+$/, "") || "0";
  }
  return String(r);
}

/** 1234567.5 -> "12,34,567.5" (Indian grouping) */
const groupFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function fmtNum(s) {
  const parts = s.split(".");
  const grouped = groupFormatter.format(Number(parts[0] || 0));
  return parts.length > 1 ? grouped + "." + parts[1] : grouped;
}

/** Raw expression -> pretty text: "1234*2" -> "1,234 × 2" */
function fmtExpr(raw) {
  return raw
    .replace(/\d+\.?\d*/g, (m) => fmtNum(m))
    .replace(/([\d)%.])([+\-*/])/g, "$1 $2 ")
    .replace(/\*/g, "×")
    .replace(/\//g, "÷")
    .replace(/-/g, "−");
}

/** Plain result string -> pretty text with proper minus sign */
function fmtResult(str) {
  return str.startsWith("-") ? "−" + fmtNum(str.slice(1)) : fmtNum(str);
}
// ===== ENGINE END =====


/* ======================= UI ======================= */
if (typeof document !== "undefined") {
  const expressionEl = document.getElementById("expression");
  const resultEl = document.getElementById("result");
  const displayEl = document.getElementById("display");
  const keysEl = document.getElementById("keys");

  let expr = "";              // raw expression, e.g. "12*(-3)+4"
  let justEvaluated = false;  // true right after pressing =
  let lastExpr = "";          // expression that produced the current result

  const isOp = (c) => "+-*/".includes(c);

  /* ---------- rendering ---------- */
  function setResultText(text, isMessage = false) {
    resultEl.textContent = text;
    resultEl.classList.toggle("message", isMessage);
    resultEl.classList.toggle("small", !isMessage && text.length > 11 && text.length <= 16);
    resultEl.classList.toggle("xsmall", !isMessage && text.length > 16);
  }

  function preview() {
    if (!expr) return { text: "0" };
    // Just a number? Show it exactly as typed (keeps "0." and "0.0").
    if (/^-?\d*\.?\d*$/.test(expr)) {
      return { text: expr === "-" ? "0" : fmtExpr(expr) };
    }
    const clean = expr.replace(/[+\-*/.]+$/, "");
    if (!clean) return { text: "0" };
    try {
      return { text: fmtResult(resultToString(evaluate(clean))) };
    } catch (err) {
      return err.message === DIV_ZERO ? { text: DIV_ZERO, message: true } : { text: "0" };
    }
  }

  function render() {
    if (justEvaluated) {
      expressionEl.textContent = fmtExpr(lastExpr) + " =";
      setResultText(fmtResult(expr));
    } else {
      expressionEl.textContent = expr ? fmtExpr(expr) : " ";
      const p = preview();
      setResultText(p.text, p.message);
    }
    expressionEl.scrollLeft = expressionEl.scrollWidth;
  }

  function shake() {
    displayEl.classList.remove("shake");
    void displayEl.offsetWidth; // restart animation
    displayEl.classList.add("shake");
  }

  /* ---------- input actions ---------- */
  function startFresh() {
    if (justEvaluated) { expr = ""; justEvaluated = false; }
  }
  function continueFromResult() {
    justEvaluated = false; // keep result as the start of a new expression
  }

  function inputDigit(d) {
    startFresh();
    if (/[)%]$/.test(expr)) return;
    const tail = /(\d*\.?\d*)$/.exec(expr)[1];
    if (tail.replace(".", "").length >= 15) return;
    if (tail === "0") {
      if (d === "0") return;
      expr = expr.slice(0, -1) + d;
    } else {
      expr += d;
    }
    render();
  }

  function inputDecimal() {
    if (justEvaluated) { expr = "0."; justEvaluated = false; render(); return; }
    if (/[)%]$/.test(expr)) return;
    const tail = /(\d*\.?\d*)$/.exec(expr)[1];
    if (tail.includes(".")) return;
    expr += tail === "" ? "0." : ".";
    render();
  }

  function inputOperator(op) {
    if (justEvaluated) continueFromResult();
    if (expr === "") {
      if (op === "-") { expr = "-"; render(); }
      return;
    }
    if (expr === "-") return;
    if (expr.endsWith(".")) expr = expr.slice(0, -1);
    if (isOp(expr.slice(-1))) expr = expr.slice(0, -1);
    expr += op;
    render();
  }

  function inputPercent() {
    if (justEvaluated) continueFromResult();
    if (/[\d)]$/.test(expr)) { expr += "%"; render(); }
  }

  function toggleSign() {
    if (justEvaluated) continueFromResult();
    let m = /^-(\d+\.?\d*)$/.exec(expr);          // "-5"  -> "5"
    if (m) { expr = m[1]; render(); return; }
    m = /\(-(\d+\.?\d*)\)$/.exec(expr);           // "(-5)" -> "5"
    if (m) { expr = expr.slice(0, m.index) + m[1]; render(); return; }
    m = /(\d+\.?\d*)$/.exec(expr);                // "5"   -> "(-5)"
    if (m) {
      expr = expr.slice(0, m.index) + (m.index === 0 ? "-" : "(-") + m[1] + (m.index === 0 ? "" : ")");
      render();
    }
  }

  function backspace() {
    if (justEvaluated) continueFromResult();
    const m = /\(-(\d+\.?\d*)\)$/.exec(expr);
    expr = m ? expr.slice(0, m.index) + m[1] : expr.slice(0, -1);
    render();
  }

  function clearAll() {
    expr = "";
    lastExpr = "";
    justEvaluated = false;
    render();
  }

  function equals() {
    if (!expr || justEvaluated) return;
    const clean = expr.replace(/[+\-*/.]+$/, "");
    if (!clean || clean === "-") return;
    try {
      const value = resultToString(evaluate(clean));
      addHistory(clean, value);
      lastExpr = clean;
      expr = value;
      justEvaluated = true;
      render();
    } catch (err) {
      setResultText(err.message === DIV_ZERO ? DIV_ZERO : "Error", true);
      shake();
    }
  }

  /* ---------- buttons ---------- */
  keysEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const { action, value } = btn.dataset;
    switch (action) {
      case "digit":   inputDigit(value); break;
      case "decimal": inputDecimal(); break;
      case "op":      inputOperator(value); break;
      case "percent": inputPercent(); break;
      case "sign":    toggleSign(); break;
      case "back":    backspace(); break;
      case "clear":   clearAll(); break;
      case "equals":  equals(); break;
    }
  });

  /* ---------- keyboard ---------- */
  const keyButtons = Array.from(keysEl.querySelectorAll("button"));
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (historyPanel.classList.contains("open")) {
      if (e.key === "Escape") closeHistory();
      return;
    }
    const btn = keyButtons.find((b) => (b.dataset.keys || "").split(" ").includes(e.key));
    if (!btn) return;
    e.preventDefault();
    btn.click();
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 110);
  });

  /* ---------- history ---------- */
  const historyPanel = document.getElementById("history-panel");
  const historyBtn = document.getElementById("history-btn");
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  let history = [];
  try { history = JSON.parse(localStorage.getItem("calc-history") || "[]"); } catch (e) { history = []; }

  function saveHistory() {
    try { localStorage.setItem("calc-history", JSON.stringify(history)); } catch (e) {}
  }

  function addHistory(rawExpr, result) {
    history.unshift({ expr: rawExpr, result });
    history = history.slice(0, 30);
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = "";
    historyEmpty.style.display = history.length ? "none" : "block";
    history.forEach((item) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.innerHTML = '<span class="h-expr"></span><span class="h-res"></span>';
      b.querySelector(".h-expr").textContent = fmtExpr(item.expr) + " =";
      b.querySelector(".h-res").textContent = fmtResult(item.result);
      b.addEventListener("click", () => {
        expr = item.result;
        lastExpr = item.expr;
        justEvaluated = true;
        render();
        closeHistory();
      });
      li.appendChild(b);
      historyList.appendChild(li);
    });
  }

  function openHistory() {
    historyPanel.classList.add("open");
    historyPanel.setAttribute("aria-hidden", "false");
    historyBtn.setAttribute("aria-expanded", "true");
    document.getElementById("history-close").focus();
  }
  function closeHistory() {
    historyPanel.classList.remove("open");
    historyPanel.setAttribute("aria-hidden", "true");
    historyBtn.setAttribute("aria-expanded", "false");
    historyBtn.focus();
  }

  historyBtn.addEventListener("click", () =>
    historyPanel.classList.contains("open") ? closeHistory() : openHistory()
  );
  document.getElementById("history-close").addEventListener("click", closeHistory);
  document.getElementById("history-clear").addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const themeBtn = document.getElementById("theme-btn");
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("calc-theme"); } catch (e) {}
  applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  themeBtn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("calc-theme", next); } catch (e) {}
  });

  /* ---------- start ---------- */
  renderHistory();
  render();
}
