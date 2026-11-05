const pulseDuration = 150;
const pulseKinds = new Set(['fear', 'anxiety', 'greed', 'prophecy']);

export async function flashFeedback(guestSlot, sourceCard, kind) {
  if (!pulseKinds.has(kind) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const overlays = [];
  for (const card of new Set([guestSlot, sourceCard])) {
    if (!card?.isConnected) continue;
    const flash = card.ownerDocument.createElement('span');
    flash.className = 'feedback-flash';
    flash.dataset.feedback = kind;
    flash.setAttribute('aria-hidden', 'true');
    flash.style.animationDuration = pulseDuration + 'ms';
    card.append(flash);
    overlays.push(flash);
  }
  if (!overlays.length) return;
  // A redraw can detach a card before a CSS animation emits its end event.
  await new Promise(resolve => setTimeout(resolve, pulseDuration));
  for (const overlay of overlays) overlay.remove();
}
