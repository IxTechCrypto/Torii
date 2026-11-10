import React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export default function Toggle({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}: ToggleProps) {
  function handleClick() {
    if (!disabled) {
      onChange(!checked);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!disabled && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      onChange(!checked);
    }
  }

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`cyber-toggle-wrap ${checked ? "cyber-toggle-active" : ""} ${
        disabled ? "cyber-toggle-disabled" : ""
      }`}
    >
      <div className="cyber-toggle-track" aria-hidden="true">
        <div className="cyber-toggle-thumb" />
      </div>
      <div className="cyber-toggle-label-group">
        <span className="cyber-toggle-title">{title}</span>
        {description && <span className="cyber-toggle-desc">{description}</span>}
      </div>
    </div>
  );
}
