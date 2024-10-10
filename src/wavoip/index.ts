import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
} from "@whiskeysockets/baileys";
import P from "pino";
import { spawn } from "child_process";
import { WavoipManager } from "../wavoip/wavoipHandler"; 

let playerProcess: any;
let wavoipManager: WavoipManager; 

function startCallw() {
  const jid = "556484338175@s.whatsapp.net";
  wavoipManager.startCall(jid);
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
      wavoipManager = new WavoipManager(sock);
      wavoipManager.initialize();
      setTimeout(startCallw, 15000); 
    }
  });
}

function handleCallEvents(event: any) {
  switch (event.status) {
    case "offer":
      setTimeout(() => wavoipManager.sendAcceptToWavoip(), 2000);
      break;
    case "connected":
      playerProcess = spawn("./audio.exe", ["audio", "sound.mp3"]);

      if (!playerProcess) {
        console.error("Error spawning audio.exe");
        process.exit(1);
      }

      playerProcess.on("close", (err: any) => {
        wavoipManager.endCall();
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
