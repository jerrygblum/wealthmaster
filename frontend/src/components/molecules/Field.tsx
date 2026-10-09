import type { ComponentProps, ReactNode } from "react";
export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
export function FieldError({ id, children }: ComponentProps<"span">) {
  return (
    <span id={id} className="field-error">
      {children}
    </span>
  );
}
