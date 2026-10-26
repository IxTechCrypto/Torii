/**
 * Utility to save / export in-memory logs as a downloadable text file
 * or copy directly to clipboard.
 */
export function downloadLogFile(filename: string, lines: string[]): void {
  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyLogToClipboard(lines: string[]): Promise<boolean> {
  const content = lines.join("\n");
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}
