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

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const result = await scan();
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
      <button onClick={runScan} disabled={loading}>
        {loading ? "Scanning..." : "Scan"}
      </button>
      {error && <p className="error">{error}</p>}

      {records.length > 0 && (
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
                  <td>{r.install_hint.ready ? "yes" : "no"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
