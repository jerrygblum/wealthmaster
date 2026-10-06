export function Feedback({ action }: { action: { error: string | null; cooldown: number } }) {
  return (
    <>
      {action.error && (
        <p role="alert" className="error">
          {action.error}
        </p>
      )}
      {action.cooldown > 0 && <p role="status">Try again in {action.cooldown} seconds.</p>}
    </>
  );
}
