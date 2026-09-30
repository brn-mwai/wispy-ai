// Drives the demo in a real browser over CDP: opens Wispy, starts talking (the browser's fake
// microphone plays a recorded question), and saves a screenshot and the panel's text every few
// seconds. Usage: node scripts/e2e.mjs <cdp-port> <out-dir> <seconds>
import { writeFileSync } from "node:fs";

const [port, outDir, seconds] = process.argv.slice(2);
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?http://localhost:5210/`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
socket.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (event.id) pending.get(event.id)?.(event);
  if (event.method === "Runtime.consoleAPICalled") logs.push(event.params.args.map((arg) => arg.value ?? arg.description).join(" "));
  if (event.method === "Runtime.exceptionThrown") logs.push(`EXCEPTION ${event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text}`);
};
await new Promise((resolve) => (socket.onopen = resolve));
const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); socket.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await new Promise((resolve) => setTimeout(resolve, 1500));
await evaluate("WispyAI.open(); WispyAI.start(); 'started'");
const panelText = `(() => { const root = document.getElementById('wispy-ai').shadowRoot; return [...root.querySelectorAll('.log > *')].map(n => n.className + ': ' + n.textContent).join('\\n') + '\\nSTATE ' + root.querySelector('.state').textContent + '\\nASK ' + root.querySelector('.ask').className; })()`;
const until = Date.now() + Number(seconds) * 1000;
let shot = 0;
while (Date.now() < until) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const picture = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${outDir}/e2e-${String(++shot).padStart(2, "0")}.png`, Buffer.from(picture.result.data, "base64"));
  const ask = await evaluate(`document.getElementById('wispy-ai').shadowRoot.querySelector('.ask').classList.contains('show')`);
  if (ask) await evaluate(`document.getElementById('wispy-ai').shadowRoot.querySelector('.chip.yes').click(); 'yes'`);
}
console.log(await evaluate(panelText));
console.log("--- page", await evaluate("JSON.stringify({total: document.getElementById('total').textContent, lines: document.querySelectorAll('#lines tr').length, view: document.querySelector('.view.on').dataset.view})"));
console.log("--- console\n" + logs.join("\n"));
await evaluate("WispyAI.stop(); 'stopped'");
socket.close();
