import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import * as mediasoup from 'mediasoup';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let worker;
let router;
const transports = new Map(); // Map<socket.id, transport>
const producers = new Map();  // Map<socket.id, producer>

async function startMediasoup() {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: { 'x-google-start-bitrate': 1000 },
      },
    ],
  });
  console.log("Mediasoup worker and router created");
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("joinRoom", ({ roomId }, callback) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    callback(router.rtpCapabilities); // Send router capabilities to client
  });

  socket.on("createSendTransport", async ({ roomId }, callback) => {
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: "127.0.0.1", announcedIp: null }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    transports.set(socket.id, transport);

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  });

  socket.on("connectTransport", async ({ dtlsParameters, roomId }, callback) => {
    const transport = transports.get(socket.id);
    if (!transport) return;
    await transport.connect({ dtlsParameters });
    callback();
  });

  socket.on("produce", async ({ kind, rtpParameters, roomId }, callback) => {
    const transport = transports.get(socket.id);
    if (!transport) return;

    const producer = await transport.produce({ kind, rtpParameters });
    producers.set(socket.id, producer);

    callback({ id: producer.id });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Cleanup
    const transport = transports.get(socket.id);
    if (transport) {
      transport.close();
      transports.delete(socket.id);
    }

    const producer = producers.get(socket.id);
    if (producer) {
      producer.close();
      producers.delete(socket.id);
    }
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
  startMediasoup();
});
