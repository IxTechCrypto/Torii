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
}: Props) {
  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal-wrap">
        <div className="confirm-modal-ring" aria-hidden="true" />
        <div className="confirm-modal">
          <h2 className="confirm-modal-title">{title}</h2>
          <p>{warning}</p>
          {notice && (
            <p className={`confirm-modal-notice confirm-modal-notice-${notice.level}`}>
              {notice.text}
            </p>
          )}
          <pre className="confirm-modal-preview">{previewText}</pre>
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
    </div>
  );
}
