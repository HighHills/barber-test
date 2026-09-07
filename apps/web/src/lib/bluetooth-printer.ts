// Web Bluetooth API types declaration for TypeScript
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: {
        filters?: Array<{ name?: string; namePrefix?: string; services?: string[] }>;
        optionalServices?: string[];
        acceptAllDevices?: boolean;
      }): Promise<any>;
    };
  }
}

// Well-known thermal printer Bluetooth GATT Services & Characteristics
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Common ESC/POS Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Serial
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 BLE
];

const PRINTER_CHARACTERISTICS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // Standard POS Printer Data
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // ESC/POS write
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // ISSC write
  '0000ffe1-0000-1000-8000-00805f9b34fb', // HM-10 write
];

/**
 * Check if the current browser environment supports the Web Bluetooth API
 */
export function isBluetoothSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function');
}

export interface BluetoothPrinterConnection {
  deviceName: string;
  printData: (data: Uint8Array) => Promise<void>;
  disconnect: () => void;
}

/**
 * Connect to a Bluetooth thermal printer and return print callback
 */
export async function connectBluetoothPrinter(): Promise<BluetoothPrinterConnection> {
  if (!isBluetoothSupported()) {
    throw new Error(
      'Web Bluetooth tidak didukung pada browser ini. Gunakan Google Chrome, Microsoft Edge, atau browser berbasis Chromium pada desktop/Android.'
    );
  }

  // Request Bluetooth Device
  const device = await navigator.bluetooth!.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });

  if (!device) {
    throw new Error('Tidak ada perangkat printer yang dipilih.');
  }

  const deviceName = device.name || 'Thermal Printer';

  // Connect to GATT Server
  if (!device.gatt) {
    throw new Error('GATT server tidak tersedia pada perangkat Bluetooth ini.');
  }

  const server = await device.gatt.connect();

  // Find suitable primary service
  let primaryService: any = null;
  for (const sUuid of PRINTER_SERVICES) {
    try {
      primaryService = await server.getPrimaryService(sUuid);
      if (primaryService) break;
    } catch {
      // Continue searching
    }
  }

  // If known services not found, query all available services
  if (!primaryService) {
    try {
      const services = await server.getPrimaryServices();
      if (services.length > 0) {
        primaryService = services[0];
      }
    } catch {
      // Ignore
    }
  }

  if (!primaryService) {
    throw new Error('Layanan printer Bluetooth (GATT Service) tidak ditemukan.');
  }

  // Find writable characteristic
  let writeCharacteristic: any = null;
  for (const cUuid of PRINTER_CHARACTERISTICS) {
    try {
      writeCharacteristic = await primaryService.getCharacteristic(cUuid);
      if (writeCharacteristic) break;
    } catch {
      // Continue searching
    }
  }

  if (!writeCharacteristic) {
    // Try any characteristic that supports write or writeWithoutResponse
    const characteristics = await primaryService.getCharacteristics();
    for (const c of characteristics) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        writeCharacteristic = c;
        break;
      }
    }
  }

  if (!writeCharacteristic) {
    throw new Error('Karakteristik penulisan data (Write Characteristic) tidak ditemukan.');
  }

  // Sender function with chunking (512 bytes per slice to prevent buffer overflow)
  const printData = async (data: Uint8Array): Promise<void> => {
    const CHUNK_SIZE = 512;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      if (writeCharacteristic.writeValueWithoutResponse) {
        await writeCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await writeCharacteristic.writeValue(chunk);
      }
      // Small pause between chunks
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };

  const disconnect = () => {
    try {
      if (device.gatt && device.gatt.connected) {
        device.gatt.disconnect();
      }
    } catch {
      // Ignore error during disconnect
    }
  };

  return {
    deviceName,
    printData,
    disconnect,
  };
}

/**
 * Convenient one-shot Bluetooth print helper
 */
export async function printViaBluetooth(
  data: Uint8Array
): Promise<{ success: boolean; deviceName?: string; error?: string }> {
  try {
    const conn = await connectBluetoothPrinter();
    await conn.printData(data);
    // Keep connection briefly for last bytes transmission then disconnect
    setTimeout(() => {
      conn.disconnect();
    }, 1500);
    return { success: true, deviceName: conn.deviceName };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal mencetak via Bluetooth';
    return { success: false, error: msg };
  }
}
