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

  useEffect(() => {
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    async function run() {
      const logUn = await onInstallLog((line) => {
        setLines((prev) => [...prev, line]);
      });
      const doneUn = await onInstallDone((code) => {
        setExitCode(code);
        onDone(code);
      });
      unlisten.push(logUn, doneUn);

      if (cancelled) return;
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
      <pre ref={preRef} className="install-log">
        {lines.join("\n")}
      </pre>
      {exitCode !== null && <p>Install script exited with code {exitCode}.</p>}
    </div>
  );
}
