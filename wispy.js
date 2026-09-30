// Wispy AI web widget. One script tag adds a voice guide to a page: the person talks, AssemblyAI's
// Voice Agent API hears them, thinks and answers out loud, and calls Wispy's tools to point at,
// draw on, fill in and press the page's own controls. Controls opt in with data-wispy="an-id";
// ones that send, pay or delete add data-wispy-risky="what it does" and always ask first.
// MIT licence. The Wispy name and mascot belong to Hausor Labs.
(() => {
  const script = document.currentScript;
  const CONFIG = {
    tokenUrl: script?.dataset.tokenUrl || "/api/token",
    appName: script?.dataset.appName || document.title.split(",")[0] || "this app",
    // Spoken greetings are off by default: the first question, asked while the greeting still echoed,
    // came back cut short in testing. The panel greets in text instead.
    greeting: script?.dataset.greeting ?? "",
  };
  const RATE = 24000;
  const SEND_EVERY = 2400;
  const CONFIRM_WAIT_MS = 45000;
  const CLOUD =
    "M61.9021 1.29346C101.362 -6.91114 115.094 26.5951 115.155 26.7446C115.22 26.721 148.45 14.6363 159.403 45.1489C170.342 75.6227 148.537 84.6574 148.439 84.6978C148.451 84.8233 150.743 109.384 133.168 116.415C115.588 123.446 101.515 118.396 101.45 118.373C101.393 118.445 87.306 136.384 63.8591 135.994C40.4202 135.603 32.1809 109.489 32.1423 109.367C32.1074 109.363 1.20822 106.216 0.0339355 76.8657C-1.13845 47.5523 28.5092 42.8166 28.6179 42.7993C28.5995 42.7008 22.4122 9.50448 61.9021 1.29346ZM68.1667 44.3657C62.1117 44.3659 57.2029 49.2745 57.2029 55.3296V80.3901C57.203 86.4452 62.1117 91.3538 68.1667 91.354C74.2218 91.3539 79.1305 86.4452 79.1306 80.3901V55.3296C79.1306 49.2745 74.2219 44.3658 68.1667 44.3657ZM95.5769 44.3647C89.5218 44.365 84.6121 49.2745 84.6121 55.3296V80.3901C84.6123 86.445 89.522 91.3538 95.5769 91.354C101.632 91.3538 106.541 86.445 106.541 80.3901V55.3296C106.541 49.2745 101.632 44.365 95.5769 44.3647Z";

  const WORKLET = `class WispyCapture extends AudioWorkletProcessor {
    process(inputs) { const channel = inputs[0] && inputs[0][0]; if (channel) this.port.postMessage(channel.slice(0)); return true; }
  }
  registerProcessor("wispy-capture", WispyCapture);`;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Inter, "Segoe UI", system-ui, -apple-system, Arial, sans-serif; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
    svg.ink { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: visible; pointer-events: none; }
    .ink path { fill: none; stroke: #a371f7; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 2px 6px rgba(163,113,247,.45)); }
    .ink path.drawing { animation: draw 620ms cubic-bezier(.3,.7,.3,1) forwards; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    .ink path.fading { transition: opacity 400ms; opacity: 0; }

    .launch { position: fixed; right: 24px; bottom: 24px; width: 64px; height: 64px; border-radius: 50%; border: 0; cursor: pointer; pointer-events: auto; display: grid; place-items: center;
      background: radial-gradient(120% 120% at 30% 20%, #cfb4ff, #a371f7 45%, #6a3fc0); box-shadow: inset 0 1px 1px rgba(255,255,255,.55), inset 0 -2px 3px rgba(0,0,0,.3), 0 10px 30px -6px rgba(163,113,247,.7); transition: transform 200ms cubic-bezier(.22,1.2,.36,1); }
    .launch:hover { transform: scale(1.06); }
    .launch svg { width: 36px; height: 30px; }

    .panel { position: fixed; right: 24px; bottom: 100px; width: 360px; max-width: calc(100vw - 32px); max-height: min(560px, calc(100vh - 140px)); display: none; flex-direction: column; pointer-events: auto; color: #e9f0fa;
      background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,0) 60%), rgba(17,21,31,.94); border: 1px solid rgba(255,255,255,.13); border-bottom-color: rgba(0,0,0,.45); border-radius: 22px;
      box-shadow: 0 18px 44px -14px rgba(0,0,0,.5), 0 4px 12px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.09); backdrop-filter: blur(24px) saturate(160%); overflow: hidden; animation: pop 420ms cubic-bezier(.22,1.2,.36,1); }
    .panel.open { display: flex; }
    @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.95); } to { opacity: 1; transform: none; } }
    .panel::before { content: ""; position: absolute; inset: 0; background: radial-gradient(70% 45% at 30% 0%, rgba(163,113,247,.18), transparent 72%); pointer-events: none; }
    .head { position: relative; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 10px 0 16px; border-bottom: 1px solid rgba(255,255,255,.09); }
    .head b { font-size: 15px; font-weight: 600; }
    .head svg.cloud { width: 26px; height: 22px; color: #fff; }
    .state { margin-left: auto; font-size: 12px; color: #93a4bd; display: inline-flex; align-items: center; gap: 6px; }
    .state i { width: 7px; height: 7px; border-radius: 50%; background: #5f6f86; }
    .state.listening i { background: #35c759; box-shadow: 0 0 0 4px rgba(53,199,89,.2); }
    .state.speaking i { background: #a371f7; box-shadow: 0 0 0 4px rgba(163,113,247,.25); }
    .state.thinking i { background: #f0a04b; }
    .x { width: 30px; height: 30px; border: 0; border-radius: 9px; background: transparent; color: #93a4bd; cursor: pointer; font-size: 18px; line-height: 1; }
    .x:hover { background: rgba(255,255,255,.08); color: #fff; }
    .log { position: relative; flex: 1; overflow-y: auto; padding: 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-content: start; scrollbar-width: none; min-height: 120px; }
    .log > * { min-width: 0; overflow-wrap: anywhere; }
    .panel.tucked .log, .panel.tucked .ask:not(.show) { display: none; }
    .panel.tucked .head { border-bottom: 0; }
    .log::-webkit-scrollbar { display: none; }
    .you { justify-self: end; max-width: 86%; padding: 9px 14px; border-radius: 16px 16px 5px 16px; font-size: 14px; line-height: 1.45; background: linear-gradient(180deg, rgba(163,113,247,.36), rgba(163,113,247,.2)); box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
    .you.live { font-style: italic; opacity: .8; }
    .wispy { font-size: 14.5px; line-height: 1.6; color: #e9f0fa; }
    .wispy span { transition: color 200ms; }
    .wispy span.later { color: rgba(233,240,250,.3); }
    .step { font-size: 12.5px; color: #93a4bd; display: flex; align-items: center; gap: 8px; }
    .step::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #a371f7; flex: none; }
    .empty { text-align: center; color: #93a4bd; font-size: 13.5px; line-height: 1.5; padding: 18px 8px 6px; }
    .empty svg { width: 54px; height: 46px; color: #fff; margin-bottom: 8px; }
    .empty b { display: block; color: #e9f0fa; font-size: 15px; margin-bottom: 4px; }
    .ask { margin: 0 12px 10px; padding: 14px; border-radius: 16px; background: rgba(6,8,12,.55); box-shadow: inset 0 0 0 1px rgba(240,160,75,.5); display: none; }
    .ask.show { display: block; }
    .ask p { font-size: 13.5px; line-height: 1.5; margin-bottom: 12px; }
    .ask p b { color: #f0a04b; }
    .ask .row { display: flex; gap: 8px; }
    .chip { flex: 1; padding: 9px 12px; border: 0; border-radius: 999px; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #e9f0fa; background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.025)); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 1px 1px rgba(0,0,0,.22); }
    .chip.yes { background: #a371f7; color: #fff; }
    .foot { display: flex; align-items: center; gap: 12px; padding: 12px 14px 14px; border-top: 1px solid rgba(255,255,255,.07); }
    .mic { position: relative; width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer; color: #fff; display: grid; place-items: center; flex: none;
      background: radial-gradient(120% 120% at 30% 20%, #cfb4ff, #a371f7 45%, #6a3fc0); box-shadow: inset 0 1px 1px rgba(255,255,255,.55), inset 0 -2px 3px rgba(0,0,0,.3), 0 6px 16px -4px rgba(163,113,247,.7); }
    .mic.on { background: radial-gradient(circle at 30% 25%, #ff8fb1, #e5486f 60%, #b02750); box-shadow: 0 0 0 calc(4px + var(--level, 0) * 14px) rgba(229,72,111,.22); }
    .mic svg { width: 22px; height: 22px; }
    .hint { font-size: 13px; color: #93a4bd; line-height: 1.4; }
    .hint b { color: #e9f0fa; font-weight: 600; }
    .by { margin-left: auto; font-size: 11px; color: #5f6f86; text-align: right; }

    .mascot { position: fixed; left: 0; top: 0; width: 70px; height: 60px; pointer-events: none; opacity: 0; transition: transform 760ms cubic-bezier(.34,1.3,.64,1), opacity 300ms; filter: drop-shadow(0 6px 12px rgba(0,0,0,.35)); }
    .mascot.shown { opacity: 1; }
    .mascot svg.body { width: 70px; height: 60px; color: #fff; }
    .mascot svg.body path { stroke: #0b0d10; stroke-width: 7; paint-order: stroke; }
    .mascot .hand { position: absolute; left: -20px; top: -18px; width: 26px; height: 26px; }
    .mascot.blink svg.body { animation: blink 160ms; }
    @keyframes blink { 50% { transform: scaleY(.9); } }
    .bubble { position: fixed; left: 0; top: 0; max-width: 300px; padding: 10px 14px; border-radius: 14px; background: #111317; border: 1px solid rgba(255,255,255,.12); color: #f4f6fa; font-size: 14px; line-height: 1.4; box-shadow: 0 12px 30px -8px rgba(0,0,0,.5); opacity: 0; transition: opacity 250ms, transform 760ms cubic-bezier(.34,1.3,.64,1); pointer-events: none; }
    .bubble.shown { opacity: 1; }
    .name { position: absolute; left: 12px; top: 58px; padding: 1px 7px; border-radius: 5px; background: #a371f7; color: #0b0d10; font-size: 11px; font-weight: 700; }
  `;

  const cloudSvg = (className) => `<svg class="${className}" viewBox="0 0 163 136" aria-hidden="true"><path d="${CLOUD}" fill="currentColor"/></svg>`;
  const micSvg = `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.6V240a8,8,0,0,1-16,0V207.6A80.11,80.11,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.11,80.11,0,0,1,136,207.6Z"/></svg>`;
  const stopSvg = `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Z"/></svg>`;
  const handSvg = `<svg class="hand" viewBox="0 0 26 26" aria-hidden="true"><path d="M2 2 L24 12 L14 14 L11 24 Z" fill="#fff" stroke="#0b0d10" stroke-width="2.4" stroke-linejoin="round"/></svg>`;

  const host = document.createElement("div");
  host.id = "wispy-ai";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="layer">
      <svg class="ink"></svg>
      <div class="bubble"></div>
      <div class="mascot">${handSvg}${cloudSvg("body")}<span class="name">Wispy</span></div>
      <section class="panel" role="dialog" aria-label="Wispy AI">
        <header class="head">${cloudSvg("cloud")}<b>Wispy</b><span class="state"><i></i><span>Ready</span></span><button class="x" title="Close" aria-label="Close">×</button></header>
        <div class="log"><div class="empty">${cloudSvg("")}<b>Ask out loud, Wispy shows you.</b>Tap the mic and ask something like "How do I send this invoice?"</div></div>
        <div class="ask"><p></p><div class="row"><button class="chip yes">Yes, do it</button><button class="chip no">No</button></div></div>
        <footer class="foot"><button class="mic" aria-label="Talk to Wispy">${micSvg}</button><span class="hint"><b>Tap to talk.</b> Wispy listens until you stop.</span><span class="by">Voice by<br>AssemblyAI</span></footer>
      </section>
      <button class="launch" aria-label="Open Wispy">${cloudSvg("")}</button>
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (selector) => root.querySelector(selector);
  const ui = {
    panel: $(".panel"), launch: $(".launch"), close: $(".x"), log: $(".log"), mic: $(".mic"), hint: $(".hint"), state: $(".state"),
    ask: $(".ask"), askText: $(".ask p"), yes: $(".chip.yes"), no: $(".chip.no"), ink: $("svg.ink"), mascot: $(".mascot"), bubble: $(".bubble"),
  };

  const session = { socket: null, context: null, stream: null, node: null, pending: [], ready: false, playHead: 0, sources: [], reply: null, youLive: null };
  const drawings = [];

  function setState(kind, text) {
    ui.state.className = `state ${kind}`;
    ui.state.querySelector("span").textContent = text;
  }

  function addLine(className, text) {
    ui.log.querySelector(".empty")?.remove();
    const line = document.createElement("div");
    line.className = className;
    line.textContent = text;
    ui.log.appendChild(line);
    ui.log.scrollTop = ui.log.scrollHeight;
    return line;
  }

  // ---------- the page, as Wispy sees it ----------
  const controlsOnPage = () => [...document.querySelectorAll("[data-wispy]")];
  const find = (id) => document.querySelector(`[data-wispy="${CSS.escape(id)}"]`);
  const isShown = (element) => !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  const labelOf = (element) => (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || element.dataset.wispy).replace(/\s+/g, " ").trim().slice(0, 60);
  const kindOf = (element) => (element.tagName === "SELECT" ? "dropdown" : element.tagName === "INPUT" || element.tagName === "TEXTAREA" ? "field" : element.closest("nav") ? "menu item" : "button");
  const whereIs = (element) => element.closest("[data-view]:not(button)")?.dataset.view;

  function look() {
    return {
      page: document.querySelector(".view.on")?.dataset.view || location.pathname,
      controls: controlsOnPage().map((element) => ({
        id: element.dataset.wispy,
        label: labelOf(element),
        kind: kindOf(element),
        visible: isShown(element),
        ...(element.value !== undefined && kindOf(element) !== "button" && kindOf(element) !== "menu item" ? { value: element.value } : {}),
        ...(isShown(element) ? {} : { on_page: whereIs(element) }),
        ...(element.dataset.wispyRisky ? { needs_permission: element.dataset.wispyRisky } : {}),
      })),
    };
  }

  function systemPrompt() {
    const listed = look().controls.map((control) => `- ${control.id}: "${control.label}" (${control.kind}${control.visible ? "" : `, on the ${control.on_page} page`}${control.needs_permission ? `, ${control.needs_permission}, needs permission` : ""})`).join("\n");
    return `You are Wispy, a friendly guide that lives inside ${CONFIG.appName}. The person is looking at the app right now and talking to you out loud. You can point at the screen, draw on it, fill in fields and press buttons through your tools.

How to help:
- When they ask where something is or how to do something, first call point_at on the right control, then explain in one or two short sentences. Never describe a place in words alone when you can point.
- For a task with several steps, go one step at a time: point, explain, and let them try or offer to do it for them.
- When they ask you to add, fill in, change or open something, do it straight away with your tools: fill_field for each field, then press the button. Do not ask "shall I?" first. Only things that send, pay or delete need permission, and the press tool asks for it.
- When they only ask how or where, point and explain, and let them do it.
- Anything that sends, pays or deletes needs permission, and the press tool gets it: the person sees a Yes or No card. So when they ask you to send, pay or delete, call press right away and do not ask in words first. If the result says no, accept it.
- After filling the fields for a new line, press the add-line button so it actually appears.
- After pressing a menu item, call look to see the new page before pointing again.
- If a control is on another page, point at the menu item that opens that page first.
- You are speaking, not writing: one or two short, warm sentences, no lists, no symbols, no markdown. Say numbers as words a person would say.
- If they ask about something this app cannot do, say so plainly. Never invent buttons or numbers.

Controls in the app (id: label):
${listed}`;
  }

  function tools() {
    const ids = controlsOnPage().map((element) => element.dataset.wispy);
    const fields = controlsOnPage().filter((element) => kindOf(element) === "field" || kindOf(element) === "dropdown").map((element) => element.dataset.wispy);
    const target = (among, what) => ({ type: "string", enum: among, description: what });
    return [
      { type: "function", name: "point_at", description: "Fly the Wispy mascot to a control on the screen and circle it. Use this whenever you tell the person where something is.", parameters: { type: "object", properties: { target: target(ids, "The control to point at.") }, required: ["target"] } },
      { type: "function", name: "draw", description: "Draw on the screen around a control to highlight it: a ring, an underline or an arrow.", parameters: { type: "object", properties: { target: target(ids, "The control to draw on."), shape: { type: "string", enum: ["ring", "underline", "arrow"] } }, required: ["target", "shape"] } },
      { type: "function", name: "fill_field", description: "Type a value into a field or choose an option in a dropdown, visibly, when the person asks you to fill it in.", parameters: { type: "object", properties: { target: target(fields, "The field to fill."), value: { type: "string", description: "What to type or choose.", examples: ["Tea leaves, 500 g", "10", "250", "Friday 2 Oct 2026"] } }, required: ["target", "value"] } },
      { type: "function", name: "press", description: "Press a button or menu item for the person. Buttons that send, pay or delete show the person a Yes or No card first and only their Yes presses it, so call this directly instead of asking for permission in words.", parameters: { type: "object", properties: { target: target(ids, "The button or menu item to press.") }, required: ["target"] } },
      { type: "function", name: "look", description: "See which page is open and every control on it with its current value. Use after the page changes.", parameters: { type: "object", properties: {} } },
    ];
  }

  // ---------- the mascot and its ink ----------
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function placeMascot(x, y) {
    ui.mascot.style.transform = `translate(${x}px, ${y}px)`;
    ui.bubble.style.transform = `translate(${Math.max(12, x - 250)}px, ${y + 66}px)`;
  }

  function restMascot() {
    const x = window.innerWidth - 110;
    const y = window.innerHeight - 200;
    placeMascot(x, y);
  }

  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  async function flyTo(element) {
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    await wait(320);
    const box = element.getBoundingClientRect();
    if (overlaps(box, ui.panel.getBoundingClientRect())) ui.panel.classList.add("tucked");
    ui.mascot.classList.add("shown");
    placeMascot(box.right + 6, box.bottom + 4);
    await wait(700);
    return box;
  }

  function wobble(x, y, rx, ry, turns = 1.12) {
    const points = [];
    const steps = 40;
    const start = -Math.PI * 0.62;
    for (let i = 0; i <= steps * turns; i++) {
      const angle = start + (i / steps) * Math.PI * 2;
      const shake = 1 + Math.sin(i * 1.7) * 0.025;
      points.push(`${(x + Math.cos(angle) * rx * shake).toFixed(1)},${(y + Math.sin(angle) * ry * shake).toFixed(1)}`);
    }
    return `M${points.join(" L")}`;
  }

  function shapeFor(box, shape) {
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    if (shape === "underline") return `M${box.left - 4},${box.bottom + 7} Q${cx},${box.bottom + 13} ${box.right + 6},${box.bottom + 5}`;
    if (shape === "arrow") {
      const tipX = box.left - 10;
      const tipY = cy;
      return `M${tipX - 90},${tipY - 60} Q${tipX - 60},${tipY - 10} ${tipX},${tipY} M${tipX - 16},${tipY - 3} L${tipX},${tipY} L${tipX - 8},${tipY - 15}`;
    }
    return wobble(cx, cy, box.width / 2 + 16, box.height / 2 + 12);
  }

  function ink(element, shape) {
    drawings.splice(0).forEach((drawing) => {
      drawing.path.classList.add("fading");
      setTimeout(() => drawing.path.remove(), 450);
    });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", shapeFor(element.getBoundingClientRect(), shape));
    ui.ink.appendChild(path);
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    path.classList.add("drawing");
    drawings.push({ element, shape, path });
  }

  function keepInkOnTargets() {
    drawings.forEach((drawing) => {
      drawing.path.setAttribute("d", shapeFor(drawing.element.getBoundingClientRect(), drawing.shape));
      drawing.path.style.strokeDasharray = "none";
      drawing.path.style.strokeDashoffset = "0";
    });
  }
  window.addEventListener("scroll", () => requestAnimationFrame(keepInkOnTargets), { passive: true });
  window.addEventListener("resize", () => requestAnimationFrame(keepInkOnTargets));

  function clearInk() {
    drawings.splice(0).forEach((drawing) => drawing.path.remove());
  }

  // ---------- Wispy's tools ----------
  const need = (id) => {
    const element = find(id);
    if (!element) throw new Error(`There is no control called ${id}.`);
    return element;
  };

  function offPage(element) {
    return { visible: false, on_page: whereIs(element), advice: `It is on the ${whereIs(element)} page. Point at or press that menu item first.` };
  }

  const TOOLS = {
    async point_at({ target }) {
      const element = need(target);
      if (!isShown(element)) return offPage(element);
      addLine("step", `Pointing at ${labelOf(element)}`);
      await flyTo(element);
      ink(element, "ring");
      return { pointing_at: labelOf(element) };
    },
    async draw({ target, shape }) {
      const element = need(target);
      if (!isShown(element)) return offPage(element);
      await flyTo(element);
      ink(element, shape || "ring");
      return { drew: shape, on: labelOf(element) };
    },
    async fill_field({ target, value }) {
      const element = need(target);
      if (!isShown(element)) return offPage(element);
      addLine("step", `Filling ${labelOf(element)}`);
      await flyTo(element);
      ink(element, "underline");
      element.focus();
      if (element.tagName === "SELECT") {
        const wanted = String(value).toLowerCase();
        const option = [...element.options].find((choice) => choice.text.toLowerCase().includes(wanted) || wanted.includes(choice.text.toLowerCase()));
        if (!option) return { filled: false, options: [...element.options].map((choice) => choice.text) };
        element.value = option.value;
      } else {
        element.value = "";
        for (const char of String(value)) {
          element.value += char;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          await wait(28);
        }
      }
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { filled: labelOf(element), value: element.value };
    },
    async press({ target }) {
      const element = need(target);
      if (!isShown(element)) return offPage(element);
      await flyTo(element);
      ink(element, "ring");
      if (element.dataset.wispyRisky) {
        addLine("step", `Asking before: ${labelOf(element)}`);
        const allowed = await askFirst(`Wispy wants to press <b>${labelOf(element)}</b>. This ${element.dataset.wispyRisky}.`);
        if (!allowed) return { pressed: false, reason: "The person said no. Do not press it." };
      }
      addLine("step", `Pressed ${labelOf(element)}`);
      element.click();
      await wait(250);
      return { pressed: labelOf(element), page_now: look().page };
    },
    async look() {
      return look();
    },
  };

  function askFirst(html) {
    return new Promise((resolve) => {
      ui.askText.innerHTML = html;
      ui.ask.classList.add("show");
      setState("thinking", "Waiting for you");
      const done = (answer) => {
        ui.ask.classList.remove("show");
        ui.yes.onclick = ui.no.onclick = null;
        clearTimeout(timer);
        resolve(answer);
      };
      const timer = setTimeout(() => done(false), CONFIRM_WAIT_MS);
      ui.yes.onclick = () => done(true);
      ui.no.onclick = () => done(false);
    });
  }

  async function runTool(event) {
    let result;
    let failed = false;
    try {
      const tool = TOOLS[event.name];
      if (!tool) throw new Error(`Unknown tool ${event.name}.`);
      result = await tool(event.arguments || {});
    } catch (error) {
      result = { error: error.message };
      failed = true;
    }
    send({ type: "tool.result", call_id: event.call_id, result: JSON.stringify(result), is_error: failed });
  }

  // ---------- audio ----------
  function toBase64(int16) {
    const bytes = new Uint8Array(int16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  // Each output sample is the average of the input samples it covers, which filters out what a
  // 24 kHz stream cannot carry instead of folding it back in as noise.
  function resample(input, fromRate) {
    if (fromRate === RATE) return input;
    const ratio = fromRate / RATE;
    const output = new Float32Array(Math.floor(input.length / ratio));
    for (let i = 0; i < output.length; i++) {
      const from = Math.floor(i * ratio);
      const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = from; j < to && j < input.length; j++) sum += input[j];
      output[i] = sum / (to - from);
    }
    return output;
  }

  function onMicFrames(frames) {
    let peak = 0;
    for (let i = 0; i < frames.length; i += 16) peak = Math.max(peak, Math.abs(frames[i]));
    ui.mic.style.setProperty("--level", Math.min(1, peak * 3).toFixed(2));
    session.pending.push(...resample(frames, session.context.sampleRate));
    while (session.ready && session.pending.length >= SEND_EVERY) {
      const chunk = session.pending.splice(0, SEND_EVERY);
      const pcm = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) pcm[i] = Math.max(-1, Math.min(1, chunk[i])) * 0x7fff;
      send({ type: "input.audio", audio: toBase64(pcm) });
    }
  }

  async function startMic() {
    session.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    session.context = new AudioContext();
    await session.context.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
    const source = session.context.createMediaStreamSource(session.stream);
    session.node = new AudioWorkletNode(session.context, "wispy-capture");
    session.node.port.onmessage = (message) => onMicFrames(message.data);
    const silent = session.context.createGain();
    silent.gain.value = 0;
    source.connect(session.node).connect(silent).connect(session.context.destination);
  }

  function play(base64) {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    const buffer = session.context.createBuffer(1, pcm.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const source = session.context.createBufferSource();
    source.buffer = buffer;
    source.connect(session.context.destination);
    const startAt = Math.max(session.context.currentTime + 0.04, session.playHead);
    source.start(startAt);
    session.playHead = startAt + buffer.duration;
    session.sources.push(source);
    source.onended = () => {
      session.sources = session.sources.filter((playing) => playing !== source);
      if (!session.sources.length && session.ready) setState("listening", "Listening");
    };
    if (session.reply && session.reply.audioStart === null) {
      session.reply.audioStart = startAt;
      session.reply.words.forEach(revealLater);
    }
    setState("speaking", "Speaking");
  }

  function stopPlayback() {
    session.sources.forEach((source) => {
      try {
        source.stop();
      } catch {}
    });
    session.sources = [];
    session.playHead = 0;
  }

  // ---------- captions, word by word with the voice ----------
  function revealLater(word) {
    const reply = session.reply;
    const delay = (reply.audioStart + word.start / 1000 - session.context.currentTime) * 1000;
    setTimeout(() => {
      word.span.classList.remove("later");
      ui.bubble.textContent = [...reply.line.children].filter((span) => !span.classList.contains("later")).map((span) => span.textContent).join("").trim().split(/(?<=[.?!])\s/).pop();
      ui.bubble.classList.toggle("shown", ui.mascot.classList.contains("shown"));
    }, Math.max(0, delay));
  }

  function onAgentDelta(event) {
    if (!session.reply) startReply();
    const span = document.createElement("span");
    span.className = "later";
    const before = session.reply.line.textContent;
    const joined = before && !/\s$/.test(before) && !/^[\s.,!?;:'’)]/.test(event.delta);
    span.textContent = (joined ? " " : "") + event.delta;
    session.reply.line.appendChild(span);
    const word = { span, start: event.start_ms ?? 0 };
    session.reply.words.push(word);
    if (session.reply.audioStart !== null) revealLater(word);
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function startReply() {
    ui.log.querySelector(".empty")?.remove();
    const line = document.createElement("div");
    line.className = "wispy";
    ui.log.appendChild(line);
    session.reply = { line, words: [], audioStart: null };
  }

  function finishReply(event) {
    if (!session.reply) startReply();
    if (event.interrupted || !session.reply.words.length) session.reply.line.textContent = event.text + (event.interrupted ? " …" : "");
    else setTimeout(() => session.reply?.words.forEach((word) => word.span.classList.remove("later")), 4000);
  }

  // ---------- the session ----------
  function send(message) {
    if (session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify(message));
  }

  function onEvent(event) {
    switch (event.type) {
      case "session.ready":
        session.ready = true;
        setState("listening", "Listening");
        break;
      case "input.speech.started":
        stopPlayback();
        ui.panel.classList.remove("tucked");
        setState("listening", "Listening");
        if (!session.youLive) session.youLive = addLine("you live", "…");
        break;
      case "transcript.user.delta":
        if (!session.youLive) session.youLive = addLine("you live", "");
        session.youLive.textContent = event.text || event.delta || "";
        break;
      case "transcript.user":
        (session.youLive || addLine("you", "")).textContent = event.text;
        session.youLive?.classList.remove("live");
        session.youLive = null;
        setState("thinking", "Thinking");
        break;
      case "reply.started":
        session.reply = null;
        break;
      case "transcript.agent.delta":
        onAgentDelta(event);
        break;
      case "transcript.agent":
        finishReply(event);
        break;
      case "reply.audio":
        play(event.data);
        break;
      case "reply.done":
        session.reply = null;
        break;
      case "tool.call":
        setState("thinking", "Working");
        runTool(event);
        break;
      case "session.error":
      case "error":
        addLine("step", `Voice error: ${event.message || event.error || "something went wrong"}`);
        break;
      case "session.ended":
        stop();
        break;
    }
  }

  async function start() {
    ui.mic.classList.add("on");
    ui.mic.innerHTML = stopSvg;
    ui.hint.innerHTML = "<b>Listening.</b> Talk naturally; interrupt any time.";
    setState("thinking", "Connecting");
    try {
      const [token] = await Promise.all([
        fetch(CONFIG.tokenUrl).then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok || !body.token) throw new Error(body.error || "Wispy could not get a voice session.");
          return body.token;
        }),
        startMic(),
      ]);
      restMascot();
      session.socket = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`);
      session.socket.onopen = () => send({ type: "session.update", session: { system_prompt: systemPrompt(), greeting: CONFIG.greeting, tools: tools() } });
      session.socket.onmessage = (message) => onEvent(JSON.parse(message.data));
      session.socket.onclose = () => stop();
      session.socket.onerror = () => addLine("step", "The voice connection dropped.");
    } catch (error) {
      addLine("step", error.name === "NotAllowedError" ? "Wispy needs the microphone. Allow it in the address bar and tap again." : error.message);
      stop();
    }
  }

  function stop() {
    if (session.socket?.readyState === WebSocket.OPEN) send({ type: "session.end" });
    session.socket?.close();
    session.stream?.getTracks().forEach((track) => track.stop());
    stopPlayback();
    session.context?.close();
    Object.assign(session, { socket: null, context: null, stream: null, node: null, pending: [], ready: false, reply: null, youLive: null });
    ui.mic.classList.remove("on");
    ui.mic.innerHTML = micSvg;
    ui.hint.innerHTML = "<b>Tap to talk.</b> Wispy listens until you stop.";
    ui.mascot.classList.remove("shown");
    ui.bubble.classList.remove("shown");
    setState("", "Ready");
    setTimeout(clearInk, 1500);
  }

  ui.launch.addEventListener("click", () => {
    const open = ui.panel.classList.toggle("open");
    if (!open) stop();
  });
  ui.close.addEventListener("click", () => {
    ui.panel.classList.remove("open");
    stop();
  });
  ui.mic.addEventListener("click", () => (session.socket ? stop() : start()));
  setInterval(() => {
    ui.mascot.classList.add("blink");
    setTimeout(() => ui.mascot.classList.remove("blink"), 180);
  }, 4200);

  window.WispyAI = { look, tools: TOOLS, open: () => ui.panel.classList.add("open"), start, stop };
})();
