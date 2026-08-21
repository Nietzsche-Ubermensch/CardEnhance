export function PagePending({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function PageError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="font-display text-xl">Could not load</h1>
      <p className="max-w-md text-sm text-destructive">{message}</p>
    </div>
  );
}

export function PageEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-6 py-16 text-center">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}
