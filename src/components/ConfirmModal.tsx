interface Props {
  previewText: string;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  warning?: string;
  actionLabel?: string;
}

export default function ConfirmModal({
  previewText,
  onConfirm,
  onCancel,
  title = "Confirm install",
  warning = "This will flash the miner's NAND. This cannot be undone from software.",
  actionLabel = "Flash NAND — this is destructive",
}: Props) {
  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal-wrap">
        <div className="confirm-modal-ring" aria-hidden="true" />
        <div className="confirm-modal">
          <h2 className="confirm-modal-title">{title}</h2>
          <p>{warning}</p>
          <pre className="confirm-modal-preview">{previewText}</pre>
          <div className="confirm-modal-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="confirm-modal-danger" onClick={onConfirm}>
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
