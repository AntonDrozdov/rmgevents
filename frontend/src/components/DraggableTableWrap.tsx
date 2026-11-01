import React, { useEffect, useRef } from "react";

interface DraggableTableWrapProps {
  children: React.ReactNode;
  className?: string;
}

export const DraggableTableWrap: React.FC<DraggableTableWrapProps> = ({ children, className = "" }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; scrollLeft: number; active: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const container = containerRef.current;
      const drag = dragRef.current;
      if (!container || !drag) return;

      const distance = event.clientX - drag.startX;
      if (!drag.active && Math.abs(distance) < 4) return;
      drag.active = true;
      event.preventDefault();
      container.classList.add("table-wrap-dragging");
      container.scrollLeft = drag.scrollLeft - distance;
    };

    const handleMouseUp = () => {
      const container = containerRef.current;
      const drag = dragRef.current;
      if (drag?.active) {
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      }
      container?.classList.remove("table-wrap-dragging");
      dragRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return <div
    ref={containerRef}
    className={["table-wrap", className].filter(Boolean).join(" ")}
    onMouseDown={event => {
      if (event.button !== 0 || event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return;
      const container = containerRef.current;
      if (!container || container.scrollWidth <= container.clientWidth) return;
      dragRef.current = { startX: event.clientX, scrollLeft: container.scrollLeft, active: false };
    }}
    onClickCapture={event => {
      if (!suppressClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
    }}
  >{children}</div>;
};
