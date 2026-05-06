const joinCard = document.getElementById("joinCard");
const roomCodeInput = document.getElementById("roomCodeInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const studentQuestion = document.getElementById("studentQuestion");
const sendStatus = document.getElementById("sendStatus");
const buttons = document.querySelectorAll(".answer-btn");
const answerWindowStatus = document.getElementById("answerWindowStatus");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const participantIdKey = "ox_participant_id";
const participantId = getOrCreateParticipantId();

let isAcceptingAnswers = false;
let roomCode = "";
let events = null;

setQuizVisible(false);
joinRoomBtn.addEventListener("click", joinRoom);
leaveRoomBtn.addEventListener("click", leaveRoom);
roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoom();
});

buttons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!isAcceptingAnswers) {
      sendStatus.textContent = "지금은 응답할 수 없어요";
      return;
    }

    const answer = btn.dataset.answer;
    const response = await fetch("/student/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, participantId, roomCode })
    });

    if (!response.ok) {
      let reason = "unknown";
      try {
        const body = await response.json();
        reason = body.reason || "unknown";
      } catch {}

      if (reason === "closed") {
        sendStatus.textContent = "응답 시간이 마감됐어요";
      } else if (reason === "room_not_found") {
        sendStatus.textContent = "방이 종료되었어요. 다시 입장해 주세요";
      } else {
        sendStatus.textContent = "전송 실패, 다시 시도해 주세요";
      }
      return;
    }

    sendStatus.textContent = `${answer} 전송 완료!`;
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 160);
  });
});

async function joinRoom() {
  const inputCode = roomCodeInput.value.replace(/\D/g, "").slice(0, 6);
  roomCodeInput.value = inputCode;
  if (inputCode.length !== 6) {
    sendStatus.textContent = "방 코드는 숫자 6자리예요";
    return;
  }

  try {
    const check = await fetch(`/room/exists?roomCode=${encodeURIComponent(inputCode)}`);
    const json = await check.json();
    if (!check.ok || !json.exists) {
      sendStatus.textContent = "방 코드를 다시 확인해 주세요";
      return;
    }
    roomCode = inputCode;
    connectEvents();
    await fetch("/student/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, participantId })
    });
    joinCard.style.display = "none";
    setQuizVisible(true);
    sendStatus.textContent = `${roomCode} 방에 입장했어요`;
  } catch {
    sendStatus.textContent = "입장 실패, 다시 시도해 주세요";
  }
}

function connectEvents() {
  if (events) events.close();
  events = new EventSource(`/events?roomCode=${encodeURIComponent(roomCode)}`);

  events.addEventListener("question", (e) => {
    const { question } = JSON.parse(e.data);
    studentQuestion.textContent = question;
  });

  events.addEventListener("status", (e) => {
    const { isAcceptingAnswers: next } = JSON.parse(e.data);
    isAcceptingAnswers = next;
    answerWindowStatus.textContent = next ? "응답 가능 시간입니다" : "응답 마감 상태입니다";
    buttons.forEach((btn) => {
      btn.disabled = !next;
    });
  });

  events.onerror = () => {
    sendStatus.textContent = "연결이 잠시 끊겼어요. 잠시 후 다시 시도해 주세요";
  };
}

function setQuizVisible(visible) {
  studentQuestion.style.display = visible ? "block" : "none";
  answerWindowStatus.style.display = visible ? "block" : "none";
  document.querySelector(".button-zone").style.display = visible ? "grid" : "none";
  leaveRoomBtn.style.display = visible ? "inline-flex" : "none";
}

function leaveRoom() {
  if (events) {
    events.close();
    events = null;
  }
  roomCode = "";
  isAcceptingAnswers = false;
  buttons.forEach((btn) => {
    btn.disabled = true;
  });
  joinCard.style.display = "block";
  setQuizVisible(false);
  sendStatus.textContent = "방에서 나왔어요";
}

function getOrCreateParticipantId() {
  const saved = localStorage.getItem(participantIdKey);
  if (saved) return saved;
  const created = `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(participantIdKey, created);
  return created;
}
