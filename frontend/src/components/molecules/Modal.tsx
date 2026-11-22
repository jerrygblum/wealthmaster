import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "../atoms/Controls";
export function Modal({
  titleId,
  title,
  children,
  onClose,
  busy = false,
}: {
  titleId: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && dialog.close) dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="settings-modal-heading">
        <h2 id={titleId}>{title}</h2>
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
          Done
        </Button>
      </div>
      {children}
    </dialog>
  );
}
