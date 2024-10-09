import {
  BinaryNode,
  jidDecode,
  proto,
  unpadRandomMax16,
  WASocket,
} from "@whiskeysockets/baileys";

export async function decodePkmsg(
  from: string,
  array: Uint8Array,
  baileys_state: WASocket,
  e2etype: "pkmsg" | "msg"
): Promise<Uint8Array> {
  const msgBuffer = await baileys_state.signalRepository.decryptMessage({
    jid: from,
    type: e2etype,
    ciphertext: array,
  });

  if (!(msgBuffer instanceof Buffer)) {
    console.error("Error decrypting");
    return new Uint8Array();
  }

  const msg: proto.IMessage = proto.Message.decode(unpadRandomMax16(msgBuffer));
  return msg.call?.callKey || new Uint8Array();
}

export type AttrsFormat = {
  [key: string]: string;
};

export async function encmsg(
  buffer: Uint8Array,
  jids: string[],
  waSocket: any
): Promise<BinaryNode> {
  const msg: proto.IMessage = {
    call: {
      callKey: buffer,
    },
    messageContextInfo: {},
  };

  console.log(jids);
  await waSocket.assertSessions(jids, false);
  const patched = await waSocket.createParticipantNodes(jids, msg);

  return patched.nodes[0].content[0];
}

export function jidStringToObj(jid: string): { _jid: any } {
  const returnObj: { _jid: any } = { _jid: {} };
  const jidObj = jidDecode(jid);

  if (jidObj) {
    returnObj._jid = {
      user: jidObj.user,
      type: jidObj.device ? 1 : 0,
      ...(jidObj.device
        ? { device: jidObj.device, domainType: 0 }
        : { server: "s.whatsapp.net" }),
    };
  }

  return returnObj;
}

export async function sendCustomAck(
  node: BinaryNode,
  sock: WASocket
): Promise<void> {
  const stanza: BinaryNode = {
    tag: "ack",
    attrs: {
      id: node.attrs.id,
      to: node.attrs.from,
      class: node.tag,
      ...(node.tag === "call" && node.content instanceof Array
        ? { type: node.content[0].tag }
        : {}),
    },
  };

  if (node.tag === "receipt") {
    const jid = jidDecode(sock.user?.id);
    stanza.attrs.from = jid?.user + "@s.whatsapp.net";
  }

  await sock.sendNode(stanza);
}
