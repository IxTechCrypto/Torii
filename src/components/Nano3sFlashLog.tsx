import { useEffect, useRef, useState } from "react";
import { flashNano3s, onNano3sFlashDone, onNano3sFlashLog, onNano3sFlashProgress } from "../api";
import type { Nano3sImageRole } from "../types";

interface Props {
  imagePath: string;
  role: Nano3sImageRole;
  acceptWarnings: boolean;
  onDone: (exitCode: number) => void;
}

export default function Nano3sFlashLog({ imagePath, role, acceptWarnings, onDone }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [percent, setPercent] = useState<number | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  // Set when the backend refuses before k230-flash ever starts (no device,
  // bad image), in which case no done event arrives.
  const [refusal, setRefusal] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    async function run() {
      for (const subscribe of [
        () => onNano3sFlashLog((line) => setLines((prev) => [...prev, line])),
        () => onNano3sFlashProgress((p) => setPercent(p)),
        () =>
          onNano3sFlashDone((code) => {
            setExitCode(code);
            onDone(code);
          }),
      ]) {
        const un = await subscribe();
        if (cancelled) {
          un();
          return;
        }
        unlisten.push(un);
      }

      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      try {
        await flashNano3s(imagePath, role, acceptWarnings);
      } catch (e) {
        setLines((prev) => [...prev, `error: ${String(e)}`]);
        setRefusal(String(e));
      }
    }

    run();
    return () => {
      cancelled = true;
      unlisten.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    preRef.current?.scrollTo({ top: preRef.current.scrollHeight });
  }, [lines]);

  return (
    <div>
      <h2>{role === "mujina" ? "Installing nano-mujina" : "Restoring Canaan stock firmware"} on the Nano 3S</h2>
      {exitCode === null && refusal === null && (
        <p className="scan-hint">Don't unplug the cable or power until this finishes.</p>
      )}
      {exitCode === null && refusal !== null && (
        <p className="error">Nothing was written to the device. Go back to step 1 to fix this and try again.</p>
      )}
      {percent !== null && (
        <div style={{ margin: "0.5rem 0", border: "1px solid var(--border)", height: "1.25rem", position: "relative" }}>
          <div style={{ width: `${Math.min(percent, 100)}%`, height: "100%", backgroundColor: "var(--cyan)" }} />
          <span style={{ position: "absolute", inset: 0, textAlign: "center", fontSize: "0.85rem" }}>
            {percent.toFixed(0)}%
          </span>
        </div>
      )}
      <div className="install-log-frame">
        <pre ref={preRef} className="install-log">
          {lines.join("\n")}
        </pre>
      </div>
      {exitCode !== null && exitCode !== 0 && (
        <p className="error">
          k230-flash exited with code {exitCode}. The K230's burn mode lives in its boot ROM, so a failed flash can
          be retried: power the Nano 3S off, re-enter burn mode and flash again.
        </p>
      )}
    </div>
  );
}
