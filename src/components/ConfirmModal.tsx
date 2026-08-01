interface Props {
  previewText: string;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  warning?: string;
  actionLabel?: string;
  // Disable the confirm action (e.g. while identity is still being read, or
  // when the target is known-unsupported). Cancel always stays enabled.
  confirmDisabled?: boolean;
  // Optional banner shown above the preview — used to surface ASIC-support
  // status. `danger` for a blocking problem, `info` for neutral status.
  notice?: { level: "danger" | "info"; text: string } | null;
  // Render inline as a card instead of fixed screen-blocking overlay
  isInline?: boolean;
}

export default function ConfirmModal({
  previewText,
  onConfirm,
  onCancel,
  title = "Confirm install",
  warning = "This will flash the miner's NAND. This cannot be undone from software.",
  actionLabel = "Flash NAND — this is destructive",
  confirmDisabled = false,
  notice = null,
  isInline = false,
}: Props) {
  const content = (
    <div className="confirm-modal-wrap" style={isInline ? { width: "100%", maxWidth: "100%", maxHeight: "none" } : undefined}>
      <div className="confirm-modal-ring" aria-hidden="true" />
      <div className="confirm-modal">
        <h2 className="confirm-modal-title">{title}</h2>
        <p>{warning}</p>
        {notice && (
          <p className={`confirm-modal-notice confirm-modal-notice-${notice.level}`}>
            {notice.text}
          </p>
        )}
        <pre className="confirm-modal-preview" style={isInline ? { maxHeight: "300px" } : undefined}>{previewText}</pre>
        <div className="confirm-modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-modal-danger"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (isInline) {
    return content;
  }

  return (
    <div className="confirm-modal-overlay">
      {content}
    </div>
  );
}
