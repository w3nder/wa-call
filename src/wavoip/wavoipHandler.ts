
var wavoip = require("./wavoip.node");

import {
  BinaryNode,
  encodeSignedDeviceIdentity,
  FullJid,
  generateMessageID,
  generateMessageIDV2,
  isJidUser,
  jidEncode,
  WACallEvent,
  WASocket,
} from "@whiskeysockets/baileys";
import {
  AttrsFormat,
  decodePkmsg,
  encmsg,
  jidStringToObj,
  sendCustomAck,
} from "../helpers";

export class WavoipManager {
  private waSocket: WASocket;

  constructor(waSocket: WASocket) {
    this.waSocket = waSocket;
  }

  initialize() {
    const jid = this.waSocket.user?.id;
    wavoip.init(jid, true, true, true, false);

    wavoip.registerAVDeviceChangedCallback(() => {});
    wavoip.registerAVDeviceStatusChangedCallback(
      (e: any, r: any, n: any, i: any) => {}
    );

    wavoip.registerEventCallback(this.eventCallback.bind(this));
    wavoip.registerSignalingXmppCallback(this.xmppCallback.bind(this));
    wavoip.registerLoggingCallback(this.loggingCallback);

    // Configurações adicionais
    wavoip.updateNetworkMedium(2, 0);
    wavoip.setScreenSize(1920, 1080);
    wavoip.updateAudioVideoSwitch(true);

    this.waSocket.ws.on("CB:call", (node: BinaryNode) =>
      this.handleCall(node)
    );
    this.waSocket.ws.on("CB:ack,class:call", (node: BinaryNode) =>
      this.handleAck(node)
    );
  }

  loggingCallback(...args: any[]) {
    console.log(args);
  }

  eventCallback(event_code: number, t: any, r: any) {
    if (event_code === 14) {
      const event: any = {
        event: "connected",
        from: r.peer_raw_jid,
        type: "audio",
      };
      this.waSocket.ev.emit("call", event);
    } else if (event_code === 46) {
      this.endCall();
    }
  }

  xmppCallback(call_id: any, from: any, node: any) {
    switch (node[0]) {
      case "relaylatency":
      case "preaccept":
      case "accept":
      case "transport":
      case "terminate":
        this.handleEventFromWavoip(call_id, from, node);
        if (node[0] === "terminate" && node[2]) {
          const event: any = {
            event: "terminated",
            from,
            type: "audio",
          };
          this.waSocket.ev.emit("call", event);
        }
        break;
      case "offer":
        this.sendOffer(call_id, from, node);
        break;
    }
  }

  endCall() {
    wavoip.end(true, "");
  }

  handleEventFromWavoip(call_id: string, peer_jid: string, obj: any) {
    const node: BinaryNode = {
      tag: "call",
      attrs: {
        to: peer_jid,
        id: this.waSocket.generateMessageTag(),
      },
    };
    this.objectToBinaryNode(obj).then((binaryNode) => {
      node.content = [binaryNode];
      this.waSocket.sendNode(node);
    });
  }

  async sendOffer(call_id: string, peer_jid: string, obj: any) {
    const node = await this.objectToBinaryNode(obj);
    if (node.content instanceof Array) {
      node.content.push({
        tag: "device-identity",
        attrs: {},
        content: encodeSignedDeviceIdentity(
          this.waSocket.authState.creds.account!,
          true
        ),
      });
    }
    const fnode: BinaryNode = {
      tag: "call",
      attrs: {
        id: this.waSocket.generateMessageTag(),
        to: peer_jid,
      },
      content: [node],
    };
    this.waSocket.sendNode(fnode);
  }

  async objectToBinaryNode(obj: any): Promise<BinaryNode> {
    const node: BinaryNode = {
      tag: obj[0],
      attrs: obj[1] ? this.formatAttrs(obj[1]) : {},
    };

    if (obj[2]) {
      if (node.tag === "to") {
        node.content = [
          (await encmsg(
            new Uint8Array(obj[2][0][2]),
            [node.attrs.jid],
            this.waSocket
          )) as BinaryNode,
        ];
      } else if (Array.isArray(obj[2][0])) {
        node.content = [];
        for (const con of obj[2]) {
          if (con[0] === "to" && con[1].jid.device === 26) continue;
          node.content.push(await this.objectToBinaryNode(con));
        }
      } else {
        node.content = new Uint8Array(obj[2]);
      }
    }

    return node;
  }

  formatAttrs(attrs: any): AttrsFormat {
    for (const key of Object.keys(attrs)) {
      if (key === "call-creator" || key === "jid") {
        attrs[key] = jidEncode(attrs[key].user, "s.whatsapp.net", attrs[key].device);
      }
      if (typeof attrs[key] !== "string") {
        attrs[key] = attrs[key].toString();
      }
    }
    return attrs;
  }

  handleCall(node: BinaryNode) {
    if (!(node.content && typeof node.content[0] === "object")) return;
    switch (node.content[0].tag) {
      case "offer":
        this.handleOffer(node);
        break;
      default:
        this.handleEventFromSocket(node); 
        break;
    }
  }

  handleEventFromSocket(node: BinaryNode) { 
    sendCustomAck(node, this.waSocket);

    const wavoip_obj: any = {
      elapsed_msec: undefined,
      epoch_msec: node.attrs.t + "000",
      is_offline: undefined,
      payload: [],
      peer_app_version: undefined,
      peer_jid: "",
      peer_platform: undefined,
    };

    if (node.content instanceof Array) {
      wavoip_obj.peer_jid = node.attrs.from;
      wavoip_obj.payload = this.binaryNodeToObject(node.content[0]);
    }

    wavoip.handleIncomingSignalingMsg(wavoip_obj);
    console.dir(wavoip_obj, { depth: null, colors: true });
  }

  handleAck(node: BinaryNode) {
    console.log("passing ack to wavoip");
    const ack_obj_n = {
      error: 0,
      peer_jid: node.attrs.from,
      type: node.attrs.type,
      ack: this.binaryNodeToObject(node), 
    };

    wavoip.handleIncomingSignalingAck(ack_obj_n);
  }

  binaryNodeToObject(node: BinaryNode) {
    const result = [node.tag, this.formatAttrsRev(node.attrs), node.content];
    if (node.content === undefined) {
      result[2] = null;
    } else if (node.content instanceof Uint8Array) {
      result[2] = Array.from(node.content);
    } else if (typeof node.content === "object") {
      result[2] = [];
      for (const xnode of node.content) {
        result[2].push(this.binaryNodeToObject(xnode));
      }
    }
    return result;
  }

  formatAttrsRev(attrs: any) {
    for (const key of Object.keys(attrs)) {
      if (isJidUser(attrs[key])) {
        attrs[key] = jidStringToObj(attrs[key]);
      }
    }
    return attrs;
  }

  async handleOffer(node: BinaryNode) {
    console.log("Offer received");
    this.sendReceipt(node);

    const call_info = {
      "call-creator": {
        _jid: {
          server: "s.whatsapp.net",
          type: 0,
          user: node.attrs.from.split("@")[0],
        },
      },
      "call-id": (node.content as any)[0].attrs["call-id"],
      device_class: (node.content as any)[0].attrs.device_class,
      joinable: (node.content as any)[0].attrs.joinable,
    };

    const voip_info = await this.processVoipInfo(node);

    const payload = ["offer", call_info, voip_info];
    const offer = {
      elapsed_msec: node.attrs.e,
      epoch_msec: node.attrs.t + "000",
      is_offline: undefined,
      payload,
      peer_app_version: node.attrs.version,
      peer_jid: node.attrs.from,
      peer_platform: node.attrs.platform,
    };

    wavoip.getNumParticipantsFromCallOffer(offer, (x: any) => {
      wavoip.handleIncomingSignalingOffer(offer, true, 5);
      console.log("Handled offer");
    });
  }

  async processVoipInfo(node: BinaryNode) {
    const voip_info: any[] = [];
    for (const t of (node.content as any)[0].content) {
      if (t.content === undefined) {
        t.content = null;
      } else if (t.content instanceof Uint8Array && t.tag === "enc") {
        t.content = await decodePkmsg(
          node.attrs.from,
          t.content as Uint8Array,
          this.waSocket,
          t.attrs.type
        );
        t.content = Array.from(t.content);
      }
      if (t.tag === "relay") {
        const relay_content: any[] = [];
        for (const x of t.content) {
          if (x.content === undefined) {
            x.content = null;
          } else if (x.content instanceof Uint8Array) {
            x.content = Array.from(x.content);
          }
          if (x.tag === "participant") {
            x.attrs.jid = {
              _jid: {
                type: 0,
                user: x.attrs.jid.split("@")[0],
                server: "s.whatsapp.net",
              },
            };
          }
          relay_content.push([x.tag, x.attrs, x.content]);
        }
        t.content = relay_content;
      }
      voip_info.push([t.tag, t.attrs, t.content]);
    }
    return voip_info;
  }

  sendReceipt(node: BinaryNode) {
    const userJid = this.waSocket.authState.creds.me!.id.split(":")[0] + "@s.whatsapp.net";
    const receipt_node: BinaryNode = {
      tag: "receipt",
      attrs: {
        from: userJid,
        to: node.attrs.from,
        id: node.attrs.id,
      },
      content: [
        {
          tag: "offer",
          attrs: {
            "call-id": (node.content as any)[0].attrs["call-id"],
            "call-creator": (node.content as any)[0].attrs["call-creator"],
          },
        },
      ],
    };
    this.waSocket.sendNode(receipt_node);
  }

  sendAcceptToWavoip() {
    wavoip.acceptCall(true, true);
  }

  async startCall(jid: string) {
    const call_id = generateMessageIDV2();
    const devices = await this.waSocket.getUSyncDevices([jid], false, false);
    
    if (!devices || devices.length === 0) return;
    const deviceList: string[] = [];
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      deviceList.push(`${device.user}:${device.device}@s.whatsapp.net`);
    }
  
    wavoip.startMD(
      jid,  
      deviceList,
      call_id,
      false
    );
  }
}
