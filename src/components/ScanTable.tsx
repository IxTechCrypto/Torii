import { useState } from "react";
import { scan } from "../api";
import { isInstallable, type HostRecord } from "../types";

interface Props {
  onSelect: (record: HostRecord, scanFile: string) => void;
}

export default function ScanTable({ onSelect }: Props) {
  const [records, setRecords] = useState<HostRecord[]>([]);
  const [scanFile, setScanFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cidr, setCidr] = useState("");

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const result = await scan(cidr.trim() || undefined);
      setRecords(result.records);
      setScanFile(result.scan_file);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="scan-controls">
        <input
          type="text"
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          placeholder="blank = auto-detect local /24"
          title="Leave blank for auto-detect (needed if a VPN is active, since auto-detect follows the default route), or enter a single host (192.168.4.226) or a CIDR block (192.168.4.0/24)"
        />
        <button onClick={runScan} disabled={loading}>
          {loading ? "Scanning..." : "Scan"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {records.length > 0 && (
        <>
        <p className="scan-hint">
          Only stock Bitmain firmware can be installed onto. Other rows are shown for
          visibility but greyed out and not selectable.
        </p>
        <div className="scan-table-wrap">
          <div className="scan-table-ring" aria-hidden="true" />
          <table className="scan-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Model</th>
              <th>Firmware</th>
              <th>Control Board</th>
              <th>Chip</th>
              <th>Ready</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const installable = isInstallable(r);
              return (
                <tr
                  key={r.host}
                  className={installable ? "row-installable" : "row-disabled"}
                  title={installable ? undefined : "non-stock firmware, not installable"}
                  onClick={() => {
                    if (installable && scanFile) onSelect(r, scanFile);
                  }}
                >
                  <td>{r.host}</td>
                  <td>{r.model ?? "-"}</td>
                  <td>{r.firmware}</td>
                  <td>{r.control_board}</td>
                  <td>{r.chip ?? "-"}</td>
                  <td>{installable && r.install_hint.ready ? "yes" : "no"}</td>
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
