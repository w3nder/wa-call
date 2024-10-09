import makeWASocket, {
  BufferJSON,
  useMultiFileAuthState,
  DisconnectReason,
  BinaryNode,
  Browsers,
} from "@whiskeysockets/baileys";
import {
  endCall,
  initialize_wavoip,
  sendAcceptToWavoip,
  startCall,
} from "../wavoip/wavoip_handler";
import P from "pino";
import { spawn } from "child_process";

let playerProcess: any;

function startCallw() {
  const jid = "911234567890";
  startCall(jid);
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    browser: Browsers.macOS("Desktop"),
    logger: P({ level: "error" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("call", handleCallEvents);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect = true;
      console.log(
        "Connection closed due to",
        lastDisconnect?.error,
        ", reconnecting:",
        shouldReconnect
      );

      if (shouldReconnect) {
        await connectToWhatsApp();
      }
    }

    if (connection === "open") {
      initialize_wavoip(sock);
      setTimeout(startCallw, 15000);
    }
  });
}

function handleCallEvents(event: any) {
  switch (event.event) {
    case "offer":
      setTimeout(sendAcceptToWavoip, 2000);
      break;
    case "connected":
      playerProcess = spawn("./audio.exe", ["audio", "sound.mp3"]);

      if (!playerProcess) {
        console.error("Error spawning audio.exe");
        return;
      }

      playerProcess.on("close", (err: any) => {
        endCall();
      });
      break;
    case "terminated":
      if (playerProcess) {
        playerProcess.kill();
      }
      break;
    default:
      console.log("Unknown call event:", event);
  }
}

connectToWhatsApp();
