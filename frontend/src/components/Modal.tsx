import React, { useEffect } from "react";

interface ModalProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ title, description, children, onClose, className = "" }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.classList.add("modal-open");
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={["modal-card", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        {children}
      </section>
    </div>
  );
};
