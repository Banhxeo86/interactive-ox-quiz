const createRoomBtn = document.getElementById("createRoomBtn");
const teacherRoomCode = document.getElementById("teacherRoomCode");
const questionInput = document.getElementById("questionInput");
const updateQuestionBtn = document.getElementById("updateQuestionBtn");
const currentQuestion = document.getElementById("currentQuestion");
const countO = document.getElementById("countO");
const countX = document.getElementById("countX");
const animLayer = document.getElementById("animLayer");
const startQuizBtn = document.getElementById("startQuizBtn");
const stopQuizBtn = document.getElementById("stopQuizBtn");
const sessionStatus = document.getElementById("sessionStatus");
const actorMap = new Map();
const AVATARS = [
  { emoji: "🐰", c1: "#ffd6e8", c2: "#ff7fb2" }, { emoji: "🐻", c1: "#ffe1c5", c2: "#d29a62" },
  { emoji: "🐼", c1: "#e5ebf5", c2: "#95a3be" }, { emoji: "🐹", c1: "#ffe7ba", c2: "#f0a34d" },
  { emoji: "🦊", c1: "#ffd7b1", c2: "#f08b4e" }, { emoji: "🐶", c1: "#ffe2cf", c2: "#c98f68" },
  { emoji: "🐱", c1: "#ffe9bf", c2: "#f6b653" }, { emoji: "🐯", c1: "#ffe2ad", c2: "#f09139" },
  { emoji: "🐨", c1: "#e3e9f4", c2: "#97a4ba" }, { emoji: "🐸", c1: "#d8f7c9", c2: "#64bd59" },
  { emoji: "🐵", c1: "#f8dfc0", c2: "#b98552" }, { emoji: "🐧", c1: "#dde6f4", c2: "#7085a8" },
  { emoji: "🐤", c1: "#fff0a6", c2: "#efb93f" }, { emoji: "🦁", c1: "#ffe3b7", c2: "#d28d3f" },
  { emoji: "🐮", c1: "#f6eff3", c2: "#c793aa" }, { emoji: "🐷", c1: "#ffd9e5", c2: "#ec82ac" },
  { emoji: "🐙", c1: "#ffd4f1", c2: "#dd7ec7" }, { emoji: "🦄", c1: "#f4ddff", c2: "#b983f1" },
  { emoji: "🐳", c1: "#d9efff", c2: "#6aaee7" }, { emoji: "🐬", c1: "#d7f0ff", c2: "#5ca9e1" },
  { emoji: "🦭", c1: "#dfe8ef", c2: "#8193a8" }, { emoji: "🦉", c1: "#f4e4c7", c2: "#ad8657" },
  { emoji: "🦝", c1: "#e3e8f0", c2: "#8c98a8" }, { emoji: "🦘", c1: "#ffe1c7", c2: "#d7895f" },
  { emoji: "🦔", c1: "#f7e6d2", c2: "#b3865e" }, { emoji: "🐢", c1: "#d5f1cc", c2: "#66ad5b" },
  { emoji: "🐥", c1: "#fff1b4", c2: "#e9b548" }, { emoji: "🐣", c1: "#fff4c2", c2: "#e5bc5a" },
  { emoji: "🦖", c1: "#d4f2de", c2: "#55ae7b" }, { emoji: "🦕", c1: "#d0eef4", c2: "#53a5b7" }
];

let roomCode = "";
let events = null;

createRoomBtn.addEventListener("click", createRoom);
updateQuestionBtn.addEventListener("click", submitQuestion);
questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitQuestion();
});

startQuizBtn.addEventListener("click", async () => {
  await postJson("/teacher/status", { roomCode, isAcceptingAnswers: true });
});

stopQuizBtn.addEventListener("click", async () => {
  await postJson("/teacher/status", { roomCode, isAcceptingAnswers: false });
});

async function createRoom() {
  const response = await postJson("/teacher/create-room", {});
  roomCode = response.roomCode;
  teacherRoomCode.textContent = `방 코드: ${roomCode}`;
  connectEvents();
  setControlsEnabled(true);
}

async function submitQuestion() {
  if (!roomCode) return;
  await postJson("/teacher/question", { roomCode, question: questionInput.value });
}

function connectEvents() {
  if (events) events.close();
  events = new EventSource(`/events?roomCode=${encodeURIComponent(roomCode)}`);

  events.addEventListener("question", (e) => {
    const { question } = JSON.parse(e.data);
    currentQuestion.textContent = `현재 문제: ${question}`;
    questionInput.value = question;
  });

  events.addEventListener("counts", (e) => {
    const counts = JSON.parse(e.data);
    countO.textContent = counts.O;
    countX.textContent = counts.X;
  });

  events.addEventListener("status", (e) => {
    const { isAcceptingAnswers } = JSON.parse(e.data);
    sessionStatus.textContent = isAcceptingAnswers ? "진행 중" : "마감됨";
    sessionStatus.classList.toggle("open", isAcceptingAnswers);
    sessionStatus.classList.toggle("closed", !isAcceptingAnswers);
    startQuizBtn.disabled = isAcceptingAnswers;
    stopQuizBtn.disabled = !isAcceptingAnswers;
  });

  events.addEventListener("reset", () => {
    animLayer.innerHTML = "";
    actorMap.clear();
  });

  events.addEventListener("animate", (e) => {
    spawnCharacter(JSON.parse(e.data));
  });
}

function setControlsEnabled(enabled) {
  questionInput.disabled = !enabled;
  updateQuestionBtn.disabled = !enabled;
  startQuizBtn.disabled = !enabled;
  stopQuizBtn.disabled = !enabled;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.reason || "request_failed");
  return json;
}

function spawnCharacter(event) {
  const actor = getOrCreateActor(event);
  moveActor(actor, event);
}

function getOrCreateActor(event) {
  const existing = actorMap.get(event.participantId);
  if (existing) return existing;

  const node = document.createElement("div");
  node.className = "character";
  const avatar = AVATARS[(event.avatarIndex || 0) % AVATARS.length];
  node.style.setProperty("--avatar-c1", avatar.c1);
  node.style.setProperty("--avatar-c2", avatar.c2);
  node.innerHTML = `<span class="animal">${avatar.emoji}</span>`;
  node.style.left = `${event.startX}%`;
  node.style.top = `${event.startY}%`;
  animLayer.appendChild(node);

  const actor = { node, x: event.startX, y: event.startY, rafId: null };
  actorMap.set(event.participantId, actor);
  return actor;
}

function moveActor(actor, event) {
  if (actor.rafId) cancelAnimationFrame(actor.rafId);

  actor.node.classList.remove("turn", "bounce", "idle");
  if (event.previousAnswer && event.previousAnswer !== event.answer) {
    actor.node.classList.add("turn");
  }

  const startX = actor.x;
  const startY = actor.y;
  const duration = 2800;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const p0 = { x: startX, y: startY };
    const p1 = { x: event.controlX, y: event.controlY };
    const p2 = { x: event.targetX, y: event.targetY };

    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
    const baseY = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
    const hop = Math.sin(t * Math.PI * 5) * (1 - t) * 3.1;
    const y = baseY - hop;

    actor.x = x;
    actor.y = y;
    actor.node.style.left = `${x}%`;
    actor.node.style.top = `${y}%`;

    if (t < 1) {
      actor.rafId = requestAnimationFrame(tick);
    } else {
      actor.node.classList.remove("turn");
      actor.node.classList.add("bounce");
      setTimeout(() => {
        actor.node.classList.add("idle");
      }, 220);
    }
  }

  actor.rafId = requestAnimationFrame(tick);
}
