// Captures the "how it works" pictures: the real widget on the demo page, driven through its own
// tools (point, fill, press) with the panel showing the words of each step. Usage:
// node scripts/capture-steps.mjs <cdp-port> <out-dir>
import { writeFileSync } from "node:fs";

const [port, outDir] = process.argv.slice(2);
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?http://localhost:5210/`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
socket.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (event.id) pending.get(event.id)?.(event);
};
await new Promise((resolve) => (socket.onopen = resolve));
const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); socket.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (name) => {
  const picture = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(picture.result.data, "base64"));
};

await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await wait(1500);

const panel = `document.getElementById('wispy-ai').shadowRoot`;
const say = (className, text) => evaluate(`(() => { const root = ${panel}; root.querySelector('.empty')?.remove(); const line = document.createElement('div'); line.className = ${JSON.stringify(className)}; line.textContent = ${JSON.stringify(text)}; root.querySelector('.log').appendChild(line); return 1; })()`);
const state = (kind, text) => evaluate(`(() => { const s = ${panel}.querySelector('.state'); s.className = 'state ${kind}'; s.querySelector('span').textContent = ${JSON.stringify(text)}; return 1; })()`);
const bubble = (text) => evaluate(`(() => { const b = ${panel}.querySelector('.bubble'); b.textContent = ${JSON.stringify(text)}; b.classList.add('shown'); return 1; })()`);
const micOn = () => evaluate(`(() => { const m = ${panel}.querySelector('.mic'); m.classList.add('on'); m.style.setProperty('--level', '0.6'); ${panel}.querySelector('.hint').innerHTML = '<b>Listening.</b> Talk naturally; interrupt any time.'; return 1; })()`);

await evaluate("WispyAI.open(); 1");
await micOn();
await state("listening", "Listening");
await say("you live", "How do I send this invoice to Mama Njeri?");
await wait(400);
await shot("step-1-ask");

await evaluate(`${panel}.querySelector('.you.live').classList.remove('live'); 1`);
await state("thinking", "Thinking");
await say("step", "Looking at the page: 26 controls");
await wait(300);
await shot("step-2-look");

await evaluate("WispyAI.tools.point_at({ target: 'send-invoice' }).then(() => 1)");
await state("speaking", "Speaking");
await say("wispy", "Tap Send invoice, bottom right. I have circled it for you. Want me to send it?");
await bubble("Tap Send invoice. I have circled it for you.");
await wait(900);
await shot("step-3-point");

await state("listening", "Listening");
await say("you", "Add ten packets of tea at 250 each first.");
await evaluate(`${panel}.querySelector('.bubble').classList.remove('shown'); 1`);
await evaluate("WispyAI.tools.fill_field({ target: 'field-item', value: 'Tea leaves, 500 g' }).then(() => WispyAI.tools.fill_field({ target: 'field-quantity', value: '10' })).then(() => WispyAI.tools.fill_field({ target: 'field-price', value: '250' })).then(() => 1)");
await state("speaking", "Speaking");
await bubble("Filling it in for you now.");
await wait(700);
await shot("step-4-fill");

await evaluate("WispyAI.tools.press({ target: 'add-line' }).then(() => 1)");
await say("wispy", "Added. Your total is now KES 12,340.");
await say("you", "Great, send it.");
await evaluate(`${panel}.querySelector('.bubble').classList.remove('shown'); 1`);
await evaluate("window.__asked = WispyAI.tools.press({ target: 'send-invoice' }); 1");
await wait(1600);
await state("thinking", "Waiting for you");
await shot("step-5-ask-first");

await evaluate(`${panel}.querySelector('.chip.yes').click(); window.__asked.then(() => 1)`);
await say("wispy", "Sent to Mama Njeri Groceries.");
await state("listening", "Listening");
await wait(400);
await shot("step-6-done");
console.log("captured", await evaluate("document.getElementById('total').textContent"));
socket.close();
