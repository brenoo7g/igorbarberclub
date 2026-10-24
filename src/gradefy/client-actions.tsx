import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Pencil, UserRound } from 'lucide-react';

export function ClientActions({
  name,
  editable,
  onSelect,
  onView,
  onEdit,
}: {
  name: string;
  editable: boolean;
  onSelect: () => void;
  onView: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const focus = window.requestAnimationFrame(() =>
      menu.current?.querySelector('button')?.focus(),
    );
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const scroll = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.cancelAnimationFrame(focus);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.bottom + 120 > window.innerHeight ? rect.top - 112 : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)),
      });
      onSelect();
    }
    setOpen((previous) => !previous);
  }

  return (
    <>
      <button
        type="button"
        className="gf-client-action-trigger"
        ref={trigger}
        aria-label={'Ações de ' + name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <MoreHorizontal size={19} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            id={menuId}
            ref={menu}
            className="gf-client-action-menu"
            role="menu"
            aria-label={'Ações de ' + name}
            style={position}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              event.preventDefault();
              const buttons = Array.from(menu.current?.querySelectorAll('button') || []);
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[
                (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              ]?.focus();
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onView();
              }}
            >
              <UserRound size={16} aria-hidden="true" /> Ver detalhes e histórico
            </button>
            {editable && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                <Pencil size={16} aria-hidden="true" /> Editar dados
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
