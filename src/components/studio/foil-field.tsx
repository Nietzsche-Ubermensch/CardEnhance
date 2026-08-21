export function FoilField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="foil-grid absolute inset-0" />
      <div className="foil-wash absolute -left-1/4 top-[-20%] h-[60%] w-[70%] rounded-full" />
      <div className="foil-wash-alt absolute -right-1/5 bottom-[-10%] h-[50%] w-[55%] rounded-full" />
    </div>
  );
}
