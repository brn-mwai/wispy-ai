import { readFileSync } from "node:fs";

const [token, wavPath] = process.argv.slice(2);
const pcm = readFileSync(wavPath).subarray(44);
const began = Date.now();
const at = () => `${String(Date.now() - began).padStart(6)} ms`;

const socket = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
let audioBytes = 0;

socket.onopen = () => {
  console.log(at(), "open");
  socket.send(JSON.stringify({
    type: "session.update",
    session: {
      system_prompt: "You are Wispy, a guide inside an invoicing app. Controls on screen: send-invoice (button 'Send invoice'), save-draft (button 'Save draft'). When the person asks where something is, call point_at with its id, then say one short sentence.",
      greeting: "",
      tools: [{
        type: "function",
        name: "point_at",
        description: "Fly the Wispy mascot to a control on the screen and ring it.",
        parameters: { type: "object", properties: { target: { type: "string", enum: ["send-invoice", "save-draft"] } }, required: ["target"] },
      }],
    },
  }));
};

socket.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (event.type === "reply.audio") {
    audioBytes += Buffer.from(event.data, "base64").length;
    return;
  }
  if (event.type === "transcript.agent.delta" || event.type === "transcript.user.delta") {
    console.log(at(), event.type, JSON.stringify(event.delta ?? event.text));
    return;
  }
  console.log(at(), event.type, JSON.stringify(event).slice(0, 300));
  if (event.type === "session.ready") streamSpeech();
  if (event.type === "tool.call") {
    socket.send(JSON.stringify({ type: "tool.result", call_id: event.call_id, result: JSON.stringify({ pointing_at: event.arguments.target }), is_error: false }));
  }
  if (event.type === "reply.done") {
    console.log(at(), "agent audio seconds", (audioBytes / 48000).toFixed(2));
  }
};

socket.onerror = (error) => console.log(at(), "error", error.message ?? error);
socket.onclose = (event) => console.log(at(), "closed", event.code, event.reason);

async function streamSpeech() {
  const chunk = 4800;
  for (let offset = 0; offset < pcm.length; offset += chunk) {
    socket.send(JSON.stringify({ type: "input.audio", audio: pcm.subarray(offset, offset + chunk).toString("base64") }));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(at(), "speech sent");
  const silence = Buffer.alloc(chunk);
  for (let i = 0; i < 60; i++) {
    socket.send(JSON.stringify({ type: "input.audio", audio: silence.toString("base64") }));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  socket.send(JSON.stringify({ type: "session.end" }));
}
