export type call_event = {
  event: "offer" | "connected" | "terminated";
  from: string;
  type: "audio" | "video";
};

export interface Device {
  deviceType: number;
  uid: string;
  isDefault: number;
  isSelected: number;
  name: string;
}