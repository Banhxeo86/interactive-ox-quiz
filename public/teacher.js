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
  node.textContent = "🐻";
  node.style.left = `${event.startX}%`;
  node.style.top = `${event.startY}%`;
  animLayer.appendChild(node);

  const actor = { node, x: event.startX, y: event.startY, rafId: null };
  actorMap.set(event.participantId, actor);
  return actor;
}

function moveActor(actor, event) {
  if (actor.rafId) cancelAnimationFrame(actor.rafId);

  actor.node.classList.remove("to-o", "to-x", "turn", "bounce");
  actor.node.classList.add(event.answer === "O" ? "to-o" : "to-x");
  if (event.previousAnswer && event.previousAnswer !== event.answer) {
    actor.node.classList.add("turn");
  }

  const startX = actor.x;
  const startY = actor.y;
  const duration = 650;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const p0 = { x: startX, y: startY };
    const p1 = { x: event.controlX, y: event.controlY };
    const p2 = { x: event.targetX, y: event.targetY };

    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
    const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;

    actor.x = x;
    actor.y = y;
    actor.node.style.left = `${x}%`;
    actor.node.style.top = `${y}%`;

    if (t < 1) {
      actor.rafId = requestAnimationFrame(tick);
    } else {
      actor.node.classList.remove("turn");
      actor.node.classList.add("bounce");
    }
  }

  actor.rafId = requestAnimationFrame(tick);
}
