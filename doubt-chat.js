/**
 * StudyHub — Doubt Support Chat Bubble (Groq/Claude proxy)
 * <script src="doubt-chat.js" defer></script>
 */
(function () {
  "use strict";

  const MAX_TOKENS = 1024;
  const API_URL = "/api/claude";

  function buildSystemPrompt(pdfTitle) {
    return (
      "You are a helpful study assistant for StudyHub, an educational platform for students. " +
      "You help learners understand concepts, solve doubts, and explain topics clearly and concisely. " +
      "Keep answers focused, use simple language, and give examples where helpful. " +
      (pdfTitle ? 'The student is currently viewing: "' + pdfTitle + '". Relate answers to this when relevant. ' : "") +
      "If a question is unrelated to studying, politely redirect the student."
    );
  }

  let isOpen = false;
  let isLoading = false;
  let messages = [];

  function getCurrentPdfTitle() {
    const h1 = document.querySelector(".doc-title-block h1, .viewer-title, h1.pdf-title");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    const title = document.title.replace(/–.*|—.*|\|.*/g, "").trim();
    if (title && title.toLowerCase() !== "studyhub") return title;
    return null;
  }

  function buildUI() {
    if (document.getElementById("sh-doubt-root")) return;

    const style = document.createElement("style");
    style.textContent = `
      /* ── FAB ── */
      #sh-doubt-fab {
        position: fixed;
        bottom: 24px;
        right: 20px;
        width: 54px;
        height: 54px;
        border-radius: 16px;
        background: linear-gradient(145deg, #7C6FFF, #5B50E8);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(108,99,255,0.5), 0 1px 4px rgba(0,0,0,0.3);
        z-index: 9998;
        transition: transform .2s ease, box-shadow .2s ease;
        outline: none;
      }
      #sh-doubt-fab:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 28px rgba(108,99,255,0.6), 0 2px 8px rgba(0,0,0,0.3);
      }
      #sh-doubt-fab:active { transform: scale(.94); }

      #sh-doubt-fab svg {
        width: 24px; height: 24px;
        fill: none; stroke: #fff;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .sh-doubt-fab-badge {
        position: absolute;
        top: -5px; right: -5px;
        background: #34D399;
        color: #0a0a14;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: .4px;
        padding: 2px 5px;
        border-radius: 6px;
        border: 2px solid #0F0F1C;
        line-height: 1.4;
      }

      /* ── PANEL ── */
      #sh-doubt-panel {
        position: fixed;
        bottom: 88px;
        right: 20px;
        width: min(370px, calc(100vw - 24px));
        height: min(580px, calc(100vh - 110px));
        background: #0D0B1A;
        border-radius: 20px;
        border: 1px solid rgba(124,111,255,0.2);
        box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9997;
        transform: scale(.93) translateY(12px);
        opacity: 0;
        pointer-events: none;
        transition: transform .28s cubic-bezier(.34,1.4,.64,1), opacity .2s ease;
      }
      #sh-doubt-panel.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }

      /* ── HEADER ── */
      .sh-dc-header {
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 11px;
        flex-shrink: 0;
        background: #110F20;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .sh-dc-header-icon {
        width: 36px; height: 36px;
        border-radius: 10px;
        background: linear-gradient(145deg, #7C6FFF, #5B50E8);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 2px 10px rgba(108,99,255,0.35);
      }
      .sh-dc-header-icon svg {
        width: 18px; height: 18px;
        fill: none; stroke: #fff;
        stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
      }
      .sh-dc-header-text { flex: 1; min-width: 0; }
      .sh-dc-header-name {
        font-size: 13.5px; font-weight: 700;
        color: #F0EFF8; line-height: 1.2;
        letter-spacing: .1px;
      }
      .sh-dc-header-status {
        font-size: 11px; color: #34D399;
        margin-top: 2px; display: flex; align-items: center; gap: 4px;
      }
      .sh-dc-header-status::before {
        content: '';
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #34D399;
        display: inline-block;
        box-shadow: 0 0 6px #34D399;
      }
      .sh-dc-header-status.has-pdf { color: #A78BFA; }
      .sh-dc-header-status.has-pdf::before { background: #A78BFA; box-shadow: 0 0 6px #A78BFA; }
      .sh-dc-close {
        width: 28px; height: 28px; border-radius: 8px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        color: #6B6880; font-size: 13px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all .18s; flex-shrink: 0;
      }
      .sh-dc-close:hover { background: rgba(255,255,255,0.12); color: #F0EFF8; }

      /* ── MESSAGES ── */
      .sh-dc-messages {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scroll-behavior: smooth;
      }
      .sh-dc-messages::-webkit-scrollbar { width: 3px; }
      .sh-dc-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

      .sh-msg {
        max-width: 86%;
        font-size: 13px;
        line-height: 1.6;
        padding: 9px 13px;
        border-radius: 14px;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .sh-msg.user {
        align-self: flex-end;
        background: linear-gradient(135deg, #6C63FF, #8B5CF6);
        color: #fff;
        border-bottom-right-radius: 3px;
        box-shadow: 0 2px 12px rgba(108,99,255,0.3);
      }
      .sh-msg.assistant {
        align-self: flex-start;
        background: #1A1730;
        border: 1px solid rgba(255,255,255,0.07);
        color: #C8C5E0;
        border-bottom-left-radius: 3px;
      }
      .sh-msg.typing {
        display: flex; gap: 4px; align-items: center;
        padding: 12px 14px; background: #1A1730;
        border: 1px solid rgba(255,255,255,0.07);
        align-self: flex-start; border-radius: 14px;
        border-bottom-left-radius: 3px;
      }
      .sh-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #7C6FFF;
        animation: shBounce 1.2s infinite ease-in-out;
      }
      .sh-dot:nth-child(2) { animation-delay: .18s; }
      .sh-dot:nth-child(3) { animation-delay: .36s; }
      @keyframes shBounce {
        0%,80%,100% { transform: translateY(0); opacity: .35; }
        40% { transform: translateY(-5px); opacity: 1; }
      }

      /* ── EMPTY STATE ── */
      .sh-dc-empty {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 8px; padding: 20px 16px; text-align: center;
      }
      .sh-dc-empty-icon {
        width: 48px; height: 48px; border-radius: 14px;
        background: linear-gradient(145deg, #7C6FFF22, #5B50E811);
        border: 1px solid rgba(124,111,255,0.2);
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 4px;
      }
      .sh-dc-empty-icon svg {
        width: 22px; height: 22px;
        fill: none; stroke: #7C6FFF;
        stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
      }
      .sh-dc-empty-title {
        font-size: 15px; font-weight: 700;
        color: #F0EFF8; letter-spacing: .1px;
      }
      .sh-dc-empty-sub {
        font-size: 12px; color: #4A4760;
        line-height: 1.6; max-width: 240px;
      }
      .sh-dc-suggestions {
        display: flex; flex-direction: column;
        gap: 6px; width: 100%; margin-top: 10px;
      }
      .sh-dc-suggestion {
        padding: 9px 13px; border-radius: 10px;
        background: rgba(124,111,255,0.07);
        border: 1px solid rgba(124,111,255,0.15);
        color: #9B8FFF; font-size: 12px; font-weight: 600;
        cursor: pointer; text-align: left;
        transition: all .18s; display: flex; align-items: center; gap: 8px;
      }
      .sh-dc-suggestion:hover {
        background: rgba(124,111,255,0.14);
        border-color: rgba(124,111,255,0.3);
        color: #C4BAFF;
      }
      .sh-dc-suggestion-icon {
        width: 22px; height: 22px; border-radius: 6px;
        background: rgba(124,111,255,0.15);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; flex-shrink: 0;
      }

      /* ── INPUT ── */
      .sh-dc-input-row {
        padding: 10px 12px;
        border-top: 1px solid rgba(255,255,255,0.05);
        display: flex; gap: 8px; align-items: flex-end;
        flex-shrink: 0; background: #0D0B1A;
      }
      .sh-dc-input {
        flex: 1;
        background: #1A1730;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 9px 12px;
        color: #F0EFF8;
        font-size: 13px;
        font-family: inherit;
        resize: none;
        outline: none;
        max-height: 90px;
        line-height: 1.5;
        transition: border-color .2s;
        -webkit-appearance: none;
      }
      .sh-dc-input::placeholder { color: #3A3752; }
      .sh-dc-input:focus { border-color: rgba(124,111,255,0.45); }
      .sh-dc-send {
        width: 36px; height: 36px; border-radius: 10px;
        background: linear-gradient(145deg, #7C6FFF, #5B50E8);
        border: none; cursor: pointer; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 10px rgba(108,99,255,0.35);
        transition: transform .18s, opacity .2s;
      }
      .sh-dc-send svg {
        width: 15px; height: 15px;
        fill: none; stroke: #fff;
        stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;
      }
      .sh-dc-send:hover { transform: scale(1.06); }
      .sh-dc-send:active { transform: scale(.92); }
      .sh-dc-send:disabled { opacity: .4; cursor: not-allowed; transform: none; }

      .sh-dc-footer {
        text-align: center; font-size: 9.5px;
        color: #252340; padding: 0 12px 8px;
        flex-shrink: 0; letter-spacing: .3px;
      }

      /* ── MOBILE ── */
      @media (max-width: 480px) {
        #sh-doubt-panel {
          bottom: 0; right: 0; left: 0;
          width: 100%;
          border-radius: 20px 20px 0 0;
          height: 72vh;
          border-left: none; border-right: none; border-bottom: none;
        }
        #sh-doubt-fab {
          bottom: 20px; right: 16px;
          border-radius: 14px;
        }
      }
    `;
    document.head.appendChild(style);

    /* SVG icons */
    const sparkSVG = `<svg viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>`;
    const sendSVG = `<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    const brainSVG = `<svg viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.14"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.14"/></svg>`;
    const lightSVG = `<svg viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;

    /* FAB */
    const fab = document.createElement("button");
    fab.id = "sh-doubt-fab";
    fab.setAttribute("aria-label", "Ask a study doubt");
    fab.innerHTML = sparkSVG + `<span class="sh-doubt-fab-badge">AI</span>`;
    fab.addEventListener("click", togglePanel);

    /* Panel */
    const panel = document.createElement("div");
    panel.id = "sh-doubt-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Doubt Support");

    const pdfTitle = getCurrentPdfTitle();

    panel.innerHTML = `
      <div class="sh-dc-header">
        <div class="sh-dc-header-icon">${brainSVG}</div>
        <div class="sh-dc-header-text">
          <div class="sh-dc-header-name">Study Assistant</div>
          <div class="sh-dc-header-status ${pdfTitle ? 'has-pdf' : ''}">
            ${pdfTitle ? truncate(pdfTitle, 28) : 'Online · Ask anything'}
          </div>
        </div>
        <button class="sh-dc-close" id="sh-dc-close" aria-label="Close">✕</button>
      </div>

      <div class="sh-dc-messages" id="sh-dc-messages">
        <div class="sh-dc-empty" id="sh-dc-empty">
          <div class="sh-dc-empty-icon">${lightSVG}</div>
          <div class="sh-dc-empty-title">Got a doubt?</div>
          <div class="sh-dc-empty-sub">Ask anything about your studies and I'll explain it clearly.</div>
          <div class="sh-dc-suggestions">
            <button class="sh-dc-suggestion" data-q="Explain this topic in simple terms">
              <span class="sh-dc-suggestion-icon">💬</span> Explain simply
            </button>
            <button class="sh-dc-suggestion" data-q="Give me a quick summary of the key points">
              <span class="sh-dc-suggestion-icon">📝</span> Summarize key points
            </button>
            <button class="sh-dc-suggestion" data-q="What are common exam questions on this topic?">
              <span class="sh-dc-suggestion-icon">🎯</span> Common exam questions
            </button>
          </div>
        </div>
      </div>

      <div class="sh-dc-input-row">
        <textarea class="sh-dc-input" id="sh-dc-input" placeholder="Type your doubt…" rows="1" autocomplete="off" spellcheck="false"></textarea>
        <button class="sh-dc-send" id="sh-dc-send" aria-label="Send">${sendSVG}</button>
      </div>
      <div class="sh-dc-footer">Powered by AI · StudyHub</div>
    `;

    const root = document.createElement("div");
    root.id = "sh-doubt-root";
    root.append(fab, panel);
    document.body.appendChild(root);

    document.getElementById("sh-dc-close").addEventListener("click", closePanel);
    document.getElementById("sh-dc-send").addEventListener("click", sendMessage);

    const input = document.getElementById("sh-dc-input");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 90) + "px";
    });

    panel.querySelectorAll(".sh-dc-suggestion").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = this.getAttribute("data-q");
        sendMessage();
      });
    });
  }

  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  function openPanel() {
    isOpen = true;
    document.getElementById("sh-doubt-panel").classList.add("open");
    document.getElementById("sh-doubt-fab").style.display = "none";
    setTimeout(function () { document.getElementById("sh-dc-input").focus(); }, 280);
  }

  function closePanel() {
    isOpen = false;
    document.getElementById("sh-doubt-panel").classList.remove("open");
    document.getElementById("sh-doubt-fab").style.display = "flex";
  }

  function sendMessage() {
    if (isLoading) return;
    const input = document.getElementById("sh-dc-input");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";

    hideEmpty();
    appendMessage("user", text);
    messages.push({ role: "user", content: text });

    const typingEl = showTyping();
    isLoading = true;
    document.getElementById("sh-dc-send").disabled = true;

    const pdfTitle = getCurrentPdfTitle();

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(pdfTitle),
        messages: messages
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      removeTyping(typingEl);
      const reply = data.content && data.content[0] && data.content[0].text;
      if (reply) {
        messages.push({ role: "assistant", content: reply });
        appendMessage("assistant", reply);
      } else {
        appendMessage("assistant", "Sorry, I couldn't get a response. Please try again.");
      }
    })
    .catch(function () {
      removeTyping(typingEl);
      appendMessage("assistant", "⚠️ Something went wrong. Check your connection and try again.");
    })
    .finally(function () {
      isLoading = false;
      document.getElementById("sh-dc-send").disabled = false;
    });
  }

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = "sh-msg " + role;
    el.textContent = text;
    document.getElementById("sh-dc-messages").appendChild(el);
    scrollToBottom();
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "sh-msg typing";
    el.innerHTML = '<div class="sh-dot"></div><div class="sh-dot"></div><div class="sh-dot"></div>';
    document.getElementById("sh-dc-messages").appendChild(el);
    scrollToBottom();
    return el;
  }

  function removeTyping(el) { el && el.remove(); }

  function hideEmpty() {
    const e = document.getElementById("sh-dc-empty");
    if (e) e.remove();
  }

  function scrollToBottom() {
    const m = document.getElementById("sh-dc-messages");
    if (m) m.scrollTop = m.scrollHeight;
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }
})();