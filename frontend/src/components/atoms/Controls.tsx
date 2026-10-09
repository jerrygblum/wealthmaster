import type { ComponentProps } from "react";
import { useCallback } from "react";
export function Button({
  variant,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      {...props}
      className={
        [variant === "secondary" ? "secondary" : "", className].filter(Boolean).join(" ") ||
        undefined
      }
    />
  );
}
export function Link({ children, ...props }: ComponentProps<"a">) {
  return <a {...props}>{children}</a>;
}
export function Input({
  focusOnMount,
  ref,
  ...props
}: ComponentProps<"input"> & { focusOnMount?: boolean }) {
  const assignRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (node && focusOnMount) node.focus();
      if (typeof ref === "function") return ref(node);
      if (ref) ref.current = node;
    },
    [focusOnMount, ref],
  );
  return <input {...props} ref={assignRef} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} />;
}
export function Checkbox(props: Omit<ComponentProps<"input">, "type">) {
  return <input {...props} type="checkbox" />;
}
export function Radio(props: Omit<ComponentProps<"input">, "type">) {
  return <input {...props} type="radio" />;
}
export function Badge(props: ComponentProps<"span">) {
  return <span {...props} />;
}
export function LoadingIndicator(props: ComponentProps<"p">) {
  return <p {...props} role="status" />;
}
