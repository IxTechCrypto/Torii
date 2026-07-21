import { useEffect, useRef, useState } from "react";
import { flashBitaxeRaw, onBitaxeFlashDone, onBitaxeFlashLog } from "../api";

interface Props {
  port: string;
  onDone: (exitCode: number) => void;
}

export default function BitaxeFlashLog({ port, onDone }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    async function run() {
      const logUn = await onBitaxeFlashLog((line) => {
        setLines((prev) => [...prev, line]);
      });
      if (cancelled) {
        logUn();
        return;
      }
      unlisten.push(logUn);

      const doneUn = await onBitaxeFlashDone((code) => {
        setExitCode(code);
        onDone(code);
      });
      if (cancelled) {
        doneUn();
        return;
      }
      unlisten.push(doneUn);

      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      try {
        await flashBitaxeRaw(port);
      } catch (e) {
        setLines((prev) => [...prev, `error: ${String(e)}`]);
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
      <h2>Flashing bitaxe-raw onto {port}</h2>
      <div className="install-log-frame">
        <pre ref={preRef} className="install-log">
          {lines.join("\n")}
        </pre>
      </div>
      {exitCode !== null && <p>espflash exited with code {exitCode}.</p>}
      {exitCode === 0 && (
        <p className="scan-hint">
          If mujina-minerd doesn't pick the board up within a few seconds, press the
          Bitaxe's RESET button — this hardware doesn't always restart itself after a flash.
        </p>
      )}
    </div>
  );
}
