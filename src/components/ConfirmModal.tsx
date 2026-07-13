interface Props {
  previewText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ previewText, onConfirm, onCancel }: Props) {
  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal-wrap">
        <div className="confirm-modal-ring" aria-hidden="true" />
        <div className="confirm-modal">
          <h2 className="confirm-modal-title">Confirm install</h2>
          <p>This will flash the miner's NAND. This cannot be undone from software.</p>
          <pre className="confirm-modal-preview">{previewText}</pre>
          <div className="confirm-modal-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="confirm-modal-danger" onClick={onConfirm}>
              Flash NAND — this is destructive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
