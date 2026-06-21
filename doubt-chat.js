/**
 * StudyHub — Claude Doubt Support Chat Bubble
 * Drop this script on any page AFTER your existing scripts:
 *   <script src="doubt-chat.js" defer></script>
 *
 * On viewer.html it auto-detects the current PDF title and injects it as context.
 * Requires: your Anthropic API key set as window.CLAUDE_API_KEY = "sk-ant-..."
 * (set this in a <script> before loading this file, or via your backend proxy)
 */

(function () {
  "use strict";

  /* ─── CONFIG ───────────────────────────────────────────────── */
  const MODEL = "claude-sonnet-4-6";
  const MAX_TOKENS = 1024;
  const API_URL = "/api/claude";

  /* System prompt — scoped to study assistant */
  function buildSystemPrompt(pdfTitle) {
    return (
      "You are a helpful study assistant for StudyHub, an educational platform for students. " +
      "You help learners understand concepts, solve doubts, and explain topics clearly and concisely. " +
      "Keep answers focused, use simple language, and give examples where helpful. " +
      (pdfTitle
        ? 'The student is currently viewing a study material titled: "' + pdfTitle + '". ' +
          "Try to relate your answers to this topic when relevant. "
        : "") +
      "If a question is completely unrelated to studying or academics, politely redirect the student."
    );
  }

  /* ─── STATE ────────────────────────────────────────────────── */
  let isOpen = false;
  let isLoading = false;
  let messages = []; // { role: "user"|"assistant", content: string }

  /* ─── GET CURRENT PDF TITLE ────────────────────────────────── */
  function getCurrentPdfTitle() {
    // viewer.html typically sets a heading or document title
    const h1 = document.querySelector(".doc-title-block h1, .viewer-title, h1.pdf-title");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    // fallback: page <title> minus site name
    const title = document.title.replace(/–.*|—.*|\|.*/g, "").trim();
    if (title && title.toLowerCase() !== "studyhub") return title;
    return null;
  }

  /* ─── BUILD UI ─────────────────────────────────────────────── */
  function buildUI() {
    if (document.getElementById("sh-doubt-root")) return;

    const style = document.createElement("style");
    style.textContent = `
      #sh-doubt-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6C63FF, #8B5CF6);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        box-shadow: 0 8px 32px rgba(108,99,255,0.45);
        z-index: 9998;
        transition: transform .2s, box-shadow .2s;
      }
      #sh-doubt-fab:hover { transform: scale(1.08); box-shadow: 0 12px 40px rgba(108,99,255,0.55); }
      #sh-doubt-fab:active { transform: scale(.95); }
      #sh-doubt-fab .sh-doubt-badge {
        position: absolute;
        top: -3px; right: -3px;
        width: 18px; height: 18px;
        border-radius: 50%;
        background: #34D399;
        border: 2px solid #0F0F1C;
        font-size: 9px;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-weight: 700;
      }

      #sh-doubt-panel {
        position: fixed;
        bottom: 90px;
        right: 24px;
        width: min(380px, calc(100vw - 32px));
        height: min(560px, calc(100vh - 120px));
        background: #100E1C;
        border-radius: 24px;
        border: 1px solid rgba(108,99,255,0.25);
        box-shadow: 0 24px 80px rgba(0,0,0,0.6);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 9997;
        transform: scale(.92) translateY(16px);
        opacity: 0;
        pointer-events: none;
        transition: transform .25s cubic-bezier(.25,.85,.35,1.1), opacity .2s;
      }
      #sh-doubt-panel.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }

      /* Header */
      .sh-doubt-header {
        padding: 16px 18px;
        background: linear-gradient(135deg, #181530, #100E1C);
        border-bottom: 1px solid rgba(255,255,255,0.07);
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .sh-doubt-header-av {
        width: 38px; height: 38px;
        border-radius: 12px;
        background: linear-gradient(135deg, #6C63FF, #A78BFA);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; flex-shrink: 0;
      }
      .sh-doubt-header-info { flex: 1; min-width: 0; }
      .sh-doubt-header-name {
        font-family: 'Syne', sans-serif;
        font-size: 14px; font-weight: 800;
        color: #F0EFF8; line-height: 1.2;
      }
      .sh-doubt-header-sub {
        font-size: 11px; color: #6C63FF;
        margin-top: 2px; font-weight: 600;
      }
      .sh-doubt-header-sub.has-pdf { color: #34D399; }
      .sh-doubt-close {
        width: 30px; height: 30px; border-radius: 50%;
        background: rgba(255,255,255,0.07);
        border: none; color: #A09DC0;
        font-size: 14px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background .2s;
      }
      .sh-doubt-close:hover { background: rgba(255,255,255,0.14); color: #F0EFF8; }

      /* Messages */
      .sh-doubt-messages {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 16px 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scroll-behavior: smooth;
      }
      .sh-doubt-messages::-webkit-scrollbar { width: 4px; }
      .sh-doubt-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

      .sh-msg {
        max-width: 88%;
        font-size: 13.5px;
        line-height: 1.55;
        padding: 10px 14px;
        border-radius: 16px;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .sh-msg.user {
        align-self: flex-end;
        background: linear-gradient(135deg, #6C63FF, #8B5CF6);
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .sh-msg.assistant {
        align-self: flex-start;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        color: #D4D2E8;
        border-bottom-left-radius: 4px;
      }
      .sh-msg.typing {
        display: flex; gap: 5px; align-items: center;
        padding: 14px 16px;
      }
      .sh-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #6C63FF;
        animation: shDotBounce 1.2s infinite ease-in-out;
      }
      .sh-dot:nth-child(2) { animation-delay: .2s; }
      .sh-dot:nth-child(3) { animation-delay: .4s; }
      @keyframes shDotBounce {
        0%,80%,100% { transform: translateY(0); opacity: .4; }
        40% { transform: translateY(-6px); opacity: 1; }
      }

      /* Empty state */
      .sh-doubt-empty {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 10px; padding: 24px; text-align: center;
      }
      .sh-doubt-empty-icon { font-size: 36px; }
      .sh-doubt-empty-title {
        font-family: 'Syne', sans-serif;
        font-size: 15px; font-weight: 800; color: #F0EFF8;
      }
      .sh-doubt-empty-sub { font-size: 12px; color: #565374; line-height: 1.5; }
      .sh-doubt-suggestions { display: flex; flex-direction: column; gap: 7px; width: 100%; margin-top: 6px; }
      .sh-doubt-suggestion {
        padding: 9px 14px; border-radius: 12px;
        background: rgba(108,99,255,0.1);
        border: 1px solid rgba(108,99,255,0.2);
        color: #A78BFA; font-size: 12px; font-weight: 600;
        cursor: pointer; text-align: left;
        transition: background .2s;
      }
      .sh-doubt-suggestion:hover { background: rgba(108,99,255,0.18); }

      /* Input */
      .sh-doubt-input-row {
        padding: 12px 14px;
        border-top: 1px solid rgba(255,255,255,0.07);
        display: flex; gap: 8px; align-items: flex-end;
        flex-shrink: 0;
        background: #100E1C;
      }
      .sh-doubt-input {
        flex: 1;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        padding: 10px 14px;
        color: #F0EFF8;
        font-size: 13.5px;
        font-family: inherit;
        resize: none;
        outline: none;
        max-height: 100px;
        line-height: 1.5;
        transition: border-color .2s;
      }
      .sh-doubt-input::placeholder { color: #43405C; }
      .sh-doubt-input:focus { border-color: rgba(108,99,255,0.5); }
      .sh-doubt-send {
        width: 38px; height: 38px; border-radius: 12px;
        background: linear-gradient(135deg, #6C63FF, #8B5CF6);
        border: none; cursor: pointer; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; transition: transform .2s, opacity .2s;
      }
      .sh-doubt-send:hover { transform: scale(1.07); }
      .sh-doubt-send:active { transform: scale(.93); }
      .sh-doubt-send:disabled { opacity: .45; cursor: not-allowed; transform: none; }

      .sh-doubt-footer-note {
        text-align: center; font-size: 10px;
        color: #2D2B40; padding: 0 14px 10px;
        flex-shrink: 0;
      }

      @media (max-width: 480px) {
        #sh-doubt-panel {
          bottom: 0; right: 0; left: 0;
          width: 100%; border-radius: 24px 24px 0 0;
          height: 70vh;
        }
        #sh-doubt-fab { bottom: 16px; right: 16px; }
      }
    `;
    document.head.appendChild(style);

    /* FAB */
    const fab = document.createElement("button");
    fab.id = "sh-doubt-fab";
    fab.setAttribute("aria-label", "Ask a doubt");
    fab.innerHTML = `🤖<span class="sh-doubt-badge">AI</span>`;
    fab.addEventListener("click", togglePanel);

    /* Panel */
    const panel = document.createElement("div");
    panel.id = "sh-doubt-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Doubt Support Chat");

    const pdfTitle = getCurrentPdfTitle();

    panel.innerHTML = `
      <div class="sh-doubt-header">
        <div class="sh-doubt-header-av">🤖</div>
        <div class="sh-doubt-header-info">
          <div class="sh-doubt-header-name">Doubt Assistant</div>
          <div class="sh-doubt-header-sub ${pdfTitle ? 'has-pdf' : ''}">
            ${pdfTitle ? '📄 ' + truncate(pdfTitle, 32) : '● Online · Ask anything'}
          </div>
        </div>
        <button class="sh-doubt-close" aria-label="Close" id="sh-doubt-close">✕</button>
      </div>
      <div class="sh-doubt-messages" id="sh-doubt-messages">
        <div class="sh-doubt-empty" id="sh-doubt-empty">
          <div class="sh-doubt-empty-icon">💡</div>
          <div class="sh-doubt-empty-title">Got a doubt?</div>
          <div class="sh-doubt-empty-sub">Ask me anything about your studies.<br/>I'll explain it clearly.</div>
          <div class="sh-doubt-suggestions">
            <button class="sh-doubt-suggestion" data-q="Explain this topic in simple terms">💬 Explain this topic simply</button>
            <button class="sh-doubt-suggestion" data-q="Give me a quick summary of the key points">📝 Summarize key points</button>
            <button class="sh-doubt-suggestion" data-q="What are common exam questions on this topic?">🎯 Common exam questions</button>
          </div>
        </div>
      </div>
      <div class="sh-doubt-input-row">
        <textarea class="sh-doubt-input" id="sh-doubt-input" placeholder="Type your doubt…" rows="1"></textarea>
        <button class="sh-doubt-send" id="sh-doubt-send" aria-label="Send">➤</button>
      </div>
      <div class="sh-doubt-footer-note">Powered by Claude AI · StudyHub</div>
    `;

    const root = document.createElement("div");
    root.id = "sh-doubt-root";
    root.append(fab, panel);
    document.body.appendChild(root);

    /* Events */
    document.getElementById("sh-doubt-close").addEventListener("click", closePanel);
    document.getElementById("sh-doubt-send").addEventListener("click", sendMessage);
    const input = document.getElementById("sh-doubt-input");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 100) + "px";
    });
    panel.querySelectorAll(".sh-doubt-suggestion").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = this.getAttribute("data-q");
        sendMessage();
      });
    });
  }

  /* ─── PANEL TOGGLE ─────────────────────────────────────────── */
  function togglePanel() { isOpen ? closePanel() : openPanel(); }
  function openPanel() {
    isOpen = true;
    document.getElementById("sh-doubt-panel").classList.add("open");
    setTimeout(function () { document.getElementById("sh-doubt-input").focus(); }, 250);
  }
  function closePanel() {
    isOpen = false;
    document.getElementById("sh-doubt-panel").classList.remove("open");
  }

  /* ─── SEND MESSAGE ─────────────────────────────────────────── */
  function sendMessage() {
    if (isLoading) return;
    const input = document.getElementById("sh-doubt-input");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";

    hideEmpty();
    appendMessage("user", text);
    messages.push({ role: "user", content: text });

    const typingEl = showTyping();
    isLoading = true;
    document.getElementById("sh-doubt-send").disabled = true;

    const pdfTitle = getCurrentPdfTitle();
    const apiKey = window.CLAUDE_API_KEY;

    if (!apiKey) {
      removeTyping(typingEl);
      appendMessage("assistant", "⚠️ API key not configured. Please set window.CLAUDE_API_KEY before using the doubt assistant.");
      isLoading = false;
      document.getElementById("sh-doubt-send").disabled = false;
      return;
    }

    fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // "x-api-key": apiKey,
        // "anthropic-version": "2023-06-01",
        // "anthropic-dangerous-direct-browser-calls": "true"
      },
      body: JSON.stringify({
        model: MODEL,
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
      document.getElementById("sh-doubt-send").disabled = false;
    });
  }

  /* ─── DOM HELPERS ──────────────────────────────────────────── */
  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = "sh-msg " + role;
    el.textContent = text;
    document.getElementById("sh-doubt-messages").appendChild(el);
    scrollToBottom();
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "sh-msg assistant typing";
    el.innerHTML = '<div class="sh-dot"></div><div class="sh-dot"></div><div class="sh-dot"></div>';
    document.getElementById("sh-doubt-messages").appendChild(el);
    scrollToBottom();
    return el;
  }

  function removeTyping(el) { el && el.remove(); }

  function hideEmpty() {
    const e = document.getElementById("sh-doubt-empty");
    if (e) e.remove();
  }

  function scrollToBottom() {
    const m = document.getElementById("sh-doubt-messages");
    if (m) m.scrollTop = m.scrollHeight;
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  /* ─── BOOT ─────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }

})();