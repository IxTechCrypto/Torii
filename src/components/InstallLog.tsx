import { useEffect, useRef, useState } from "react";
import { install, onInstallDone, onInstallLog } from "../api";
import type { InstallConfig } from "../types";

interface Props {
  config: InstallConfig;
  onDone: (exitCode: number) => void;
}

export default function InstallLog({ config, onDone }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    async function run() {
      const logUn = await onInstallLog((line) => {
        setLines((prev) => [...prev, line]);
      });
      if (cancelled) {
        logUn();
        return;
      }
      unlisten.push(logUn);

      const doneUn = await onInstallDone((code) => {
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
        await install(config);
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
      <h2>Installing on {config.host}</h2>
      <div className="install-log-frame">
        <pre ref={preRef} className="install-log">
          {lines.join("\n")}
        </pre>
      </div>
      {exitCode !== null && <p>Install script exited with code {exitCode}.</p>}
    </div>
  );
}
