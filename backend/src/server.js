import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { setIo } from "./utils/socket.js";
import { startEscalationJob } from "./utils/escalationJob.js";
import { startWorkOrderEscalationJob } from "./utils/workOrderEscalationJob.js";

const port = Number(process.env.PORT || 4000);

// Wrap Express with a plain HTTP server so Socket.IO can share the same port.
const httpServer = createServer(app);

const allowedOrigins = process.env.ALLOW_ORIGIN?.split(",").map((o) => o.trim());
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins?.length ? allowedOrigins : false,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Allow long-polling fallback for environments that block WebSockets
  transports: ["websocket", "polling"],
});

// Register the shared io instance so route handlers can emit events without a
// circular dependency on server.js.
setIo(io);

io.on("connection", (socket) => {
  // Portal/dashboard clients join a company-specific room so we can broadcast
  // targeted updates without sending events to all connected clients.
  socket.on("join-company", (companyId) => {
    const id = Number(companyId);
    if (Number.isInteger(id) && id > 0) socket.join(`company-${id}`);
  });

  socket.on("leave-company", (companyId) => {
    const id = Number(companyId);
    if (Number.isInteger(id) && id > 0) socket.leave(`company-${id}`);
  });
});

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[server] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[server] Uncaught exception:", err);
  process.exit(1);
});

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API + WebSocket running on port ${port}`);
  startEscalationJob();
  startWorkOrderEscalationJob();
});
