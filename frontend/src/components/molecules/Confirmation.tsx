import type { ComponentProps, ReactNode } from "react";
export function Confirmation({
  title,
  titleId,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & { title: ReactNode; titleId?: string }) {
  return (
    <section {...props}>
      <h2 id={titleId}>{title}</h2>
      {children}
    </section>
  );
}
