import { useEffect, useRef } from "react";

export default function FormDialog({ title, close, wide, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={ref} aria-label={title} className={"gw-form-dialog" + (wide ? " gw-wide" : "")}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => {
      if (event.target !== ref.current) return;
      const bounds = ref.current.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
    {children}
  </dialog>;
}
