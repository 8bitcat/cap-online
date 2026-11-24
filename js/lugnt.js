// Rita inte om en sida medan Haris fyller i något (Carl 2026-11-24: Haris sidor uppdateras av sig själva när någon
// bokar). Sidan ritas om först när ingen rört skärmen på tio sekunder och ingen ruta är markerad; annars tas det
// nya med vid nästa varv (var 20:e sekund).
let senast = 0;
for (const t of ['pointerdown', 'keydown', 'input', 'change', 'touchstart']) document.addEventListener(t, () => { senast = Date.now(); }, { capture: true, passive: true });
export const lugnt = () => Date.now() - senast > 10000 && !document.activeElement?.matches?.('input,textarea,select');
