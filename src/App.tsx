import { useState } from "react";
import ScanTable from "./components/ScanTable";
import type { HostRecord } from "./types";
import "./styles.css";

type Screen = "scan" | "config" | "installing" | "telemetry";

function App() {
  const [screen, setScreen] = useState<Screen>("scan");
  // Placeholder selection state; Worker B wires the real scan -> config
  // transition and consumes this.
  const [selected, setSelected] = useState<{ record: HostRecord; scanFile: string } | null>(null);

  function handleSelect(record: HostRecord, scanFile: string) {
    console.log("selected installable host", record, scanFile);
    setSelected({ record, scanFile });
    // TODO(Worker B): setScreen("config");
  }

  return (
    <main className="container">
      <h1>Torii</h1>

      <nav className="screen-nav">
        {(["scan", "config", "installing", "telemetry"] as Screen[]).map((s) => (
          <button
            key={s}
            className={s === screen ? "screen-nav-active" : ""}
            onClick={() => setScreen(s)}
          >
            {s}
          </button>
        ))}
      </nav>

      {screen === "scan" && <ScanTable onSelect={handleSelect} />}
      {screen === "config" && <div>TODO: screen config (Worker B)</div>}
      {screen === "installing" && <div>TODO: screen installing (Worker B)</div>}
      {screen === "telemetry" && <div>TODO: screen telemetry (Worker B)</div>}

      {selected && screen === "scan" && (
        <p className="selection-hint">
          Selected {selected.record.host} ({selected.record.model ?? "unknown model"}) — config
          screen not wired yet.
        </p>
      )}
    </main>
  );
}

export default App;
