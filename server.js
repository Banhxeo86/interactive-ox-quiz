import http from "http";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const clientsByRoom = new Map();

function createRoomState() {
  return {
    currentQuestion: "지구는 둥글다?",
    counts: { O: 0, X: 0 },
    isAcceptingAnswers: false,
    participantState: new Map()
  };
}

function generateRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) rooms.set(roomCode, createRoomState());
  return rooms.get(roomCode);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function broadcast(roomCode, event, payload) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  const clients = clientsByRoom.get(roomCode);
  if (!clients) return;
  for (const client of clients) {
    client.write(chunk);
  }
}

async function readBody(req) {
  let raw = "";
  for await (const part of req) raw += part;
  if (!raw) return {};
  return JSON.parse(raw);
}

function getContentType(filepath) {
  if (filepath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filepath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filepath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/teacher/create-room") {
      let roomCode = generateRoomCode();
      while (rooms.has(roomCode)) roomCode = generateRoomCode();
      rooms.set(roomCode, createRoomState());
      return sendJson(res, 200, { ok: true, roomCode });
    }

    if (req.method === "GET" && url.pathname === "/room/exists") {
      const roomCode = (url.searchParams.get("roomCode") || "").toUpperCase().trim();
      return sendJson(res, 200, { ok: true, exists: rooms.has(roomCode) });
    }

    if (req.method === "GET" && url.pathname === "/events") {
      const roomCode = (url.searchParams.get("roomCode") || "").toUpperCase().trim();
      if (!roomCode || !rooms.has(roomCode)) {
        return sendJson(res, 404, { ok: false, reason: "room_not_found" });
      }

      if (!clientsByRoom.has(roomCode)) clientsByRoom.set(roomCode, new Set());
      const roomClients = clientsByRoom.get(roomCode);
      const room = rooms.get(roomCode);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

      roomClients.add(res);
      res.write(`event: question\ndata: ${JSON.stringify({ question: room.currentQuestion })}\n\n`);
      res.write(`event: counts\ndata: ${JSON.stringify(room.counts)}\n\n`);
      res.write(`event: status\ndata: ${JSON.stringify({ isAcceptingAnswers: room.isAcceptingAnswers })}\n\n`);

      req.on("close", () => {
        roomClients.delete(res);
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/teacher/question") {
      const body = await readBody(req);
      const roomCode = (body.roomCode || "").toUpperCase().trim();
      if (!rooms.has(roomCode)) return sendJson(res, 404, { ok: false, reason: "room_not_found" });
      if (typeof body.question !== "string") return sendJson(res, 400, { ok: false });
      const room = rooms.get(roomCode);

      room.currentQuestion = body.question.trim() || "(문제를 입력해 주세요)";
      room.counts = { O: 0, X: 0 };
      room.participantState.clear();

      broadcast(roomCode, "question", { question: room.currentQuestion });
      broadcast(roomCode, "counts", room.counts);
      broadcast(roomCode, "reset", { ok: true });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/teacher/status") {
      const body = await readBody(req);
      const roomCode = (body.roomCode || "").toUpperCase().trim();
      if (!rooms.has(roomCode)) return sendJson(res, 404, { ok: false, reason: "room_not_found" });
      if (typeof body.isAcceptingAnswers !== "boolean") return sendJson(res, 400, { ok: false });
      const room = rooms.get(roomCode);

      room.isAcceptingAnswers = body.isAcceptingAnswers;
      broadcast(roomCode, "status", { isAcceptingAnswers: room.isAcceptingAnswers });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/student/answer") {
      const body = await readBody(req);
      const roomCode = (body.roomCode || "").toUpperCase().trim();
      if (!rooms.has(roomCode)) return sendJson(res, 404, { ok: false, reason: "room_not_found" });
      const room = rooms.get(roomCode);
      if (!room.isAcceptingAnswers) return sendJson(res, 403, { ok: false, reason: "closed" });

      const answer = body.answer;
      const participantId = typeof body.participantId === "string" ? body.participantId : "";
      if (answer !== "O" && answer !== "X") return sendJson(res, 400, { ok: false });
      if (!participantId) return sendJson(res, 400, { ok: false, reason: "missing_participant" });

      room.counts[answer] += 1;
      const previousAnswer = room.participantState.get(participantId)?.lastAnswer || null;
      room.participantState.set(participantId, { lastAnswer: answer });

      const targetX = answer === "O" ? 41 : 59;
      const targetY = 50;
      broadcast(roomCode, "counts", room.counts);
      broadcast(roomCode, "animate", {
        participantId,
        answer,
        previousAnswer,
        targetX,
        targetY,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        startX: Math.random() * 100,
        startY: Math.random() * 100,
        controlX: 32 + Math.random() * 36,
        controlY: 8 + Math.random() * 36
      });

      return sendJson(res, 200, { ok: true });
    }

    const pathname = url.pathname === "/" ? "/teacher.html" : url.pathname;
    const safePath = path.normalize(path.join(publicDir, pathname));
    if (!safePath.startsWith(publicDir) || !existsSync(safePath)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const file = await readFile(safePath);
    res.writeHead(200, { "Content-Type": getContentType(safePath) });
    res.end(file);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: "server_error" });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
