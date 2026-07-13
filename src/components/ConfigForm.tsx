import { useState } from "react";
import type { HostRecord, InstallConfig } from "../types";

interface Props {
  record: HostRecord;
  scanFile: string;
  onSubmit: (config: InstallConfig) => void;
  onBack: () => void;
}

export default function ConfigForm({ record, scanFile, onSubmit, onBack }: Props) {
  const [poolUrl, setPoolUrl] = useState("");
  const [worker, setWorker] = useState("");
  const [user, setUser] = useState("miner");
  const [password, setPassword] = useState("miner");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const config: InstallConfig = {
      scan_file: scanFile,
      host: record.host,
      user,
      password,
      pool_url: poolUrl || undefined,
      worker: worker || undefined,
    };
    onSubmit(config);
  }

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <h2>Configure {record.host}</h2>
      <p>
        Model: {record.model ?? "unknown"} · Control board: {record.control_board}
      </p>

      <label>
        Pool URL
        <input
          type="text"
          value={poolUrl}
          onChange={(e) => setPoolUrl(e.target.value)}
          placeholder="stratum+tcp://pool.example.com:3333"
        />
        <small>Not yet applied — v1 has no install-script flag for pool config yet (seeded via rootfs/env later).</small>
      </label>

      <label>
        Worker name
        <input
          type="text"
          value={worker}
          onChange={(e) => setWorker(e.target.value)}
          placeholder="worker1"
        />
        <small>Not yet applied — same caveat as pool URL above.</small>
      </label>

      <label>
        User
        <input type="text" value={user} onChange={(e) => setUser(e.target.value)} />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <div className="config-form-actions">
        <button type="button" onClick={onBack}>
          Back
        </button>
        <button type="submit">Preview install</button>
      </div>
    </form>
  );
}
