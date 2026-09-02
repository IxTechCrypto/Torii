import { useState } from "react";
import { listUsbDevices } from "../api";
import { type UsbDeviceRecord } from "../types";

interface Props {
  onSelect: (record: UsbDeviceRecord) => void;
}

export default function BitaxeUsbTable({ onSelect }: Props) {
  const [devices, setDevices] = useState<UsbDeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function runDetect() {
    setLoading(true);
    setError(null);
    try {
      setDevices(await listUsbDevices());
      setSearched(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="scan-controls">
        <button onClick={runDetect} disabled={loading}>
          {loading ? "Detecting..." : "Detect USB devices"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {searched && devices.length === 0 && !error && (
        <p className="scan-hint">
          No Bitaxe-shaped USB device found. Plug it in over USB and try again.
        </p>
      )}

      {devices.length > 0 && (
        <>
          <p className="scan-hint">
            "flash-candidate" devices match the ESP32-S3's generic default USB identity (stock AxeOS).
            "raw-installed" devices are running bitaxe-raw firmware. Click any device to flash or re-flash.
          </p>
          <div className="scan-table-wrap">
            <div className="scan-table-ring" aria-hidden="true" />
            <table className="scan-table">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>VID:PID</th>
                  <th>Manufacturer</th>
                  <th>Product</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  return (
                    <tr
                      key={d.port}
                      className="row-installable"
                      title={d.status === "flash-candidate" ? "Stock firmware (ready to flash)" : "Already running bitaxe-raw (click to re-flash)"}
                      onClick={() => onSelect(d)}
                    >
                      <td>{d.port}</td>
                      <td>
                        {d.vid.toString(16).padStart(4, "0").toUpperCase()}:
                        {d.pid.toString(16).padStart(4, "0").toUpperCase()}
                      </td>
                      <td>{d.manufacturer ?? "-"}</td>
                      <td>{d.product ?? "-"}</td>
                      <td>{d.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
