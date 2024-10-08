// import wavoip from "./wavoip/wavoip.node";

interface Device {
  deviceType: number;
  // Adicione outras propriedades do dispositivo, se necessário
}

const availableMics: Device[] = [];
const availableSpeakers: Device[] = [];

async function handleDevices(devices: Device[]): Promise<void> {
  for (const device of devices) {
    if (device.deviceType === 0) {
      availableMics.push(device);
    } else if (device.deviceType === 1) {
      availableSpeakers.push(device);
    }
  }

  console.log("Available mics: ", availableMics);
  console.log("---------------------------------");
  console.log("Available speakers: ", availableSpeakers);
}

// wavoip.init("55649843381750@s.whatsapp.net", true, true, true, false);
// wavoip.getAVDevices((devices: Device[]) => {
//   handleDevices(devices);
// });
