// Move the camera only as far as needed to keep each end of the strike in view.
function visibleScroll(card, viewport, originalScroll, maxScroll) {
  const overflow = card.left < viewport.left ? card.left - viewport.left :
    Math.max(0, card.right - viewport.right);
  return Math.max(0, Math.min(maxScroll, originalScroll + overflow));
}

export async function animateStrike({track, guestSlot, targetFloor}) {
  if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || !guestSlot?.isConnected) return;
  const target = track.querySelector('.column[data-floor="' + Number(targetFloor) + '"] .floor-card');
  if (!target) return;
  const sourceRect = guestSlot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const viewport = track.getBoundingClientRect();
  const scroll = track.scrollLeft;
  const limit = track.scrollWidth - track.clientWidth;
  const startScroll = visibleScroll(sourceRect, viewport, scroll, limit);
  const endScroll = visibleScroll(targetRect, viewport, scroll, limit);
  const dx = targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2;
  const dy = targetRect.top + targetRect.height * .4 - sourceRect.top - sourceRect.height / 2;
  const ghost = guestSlot.cloneNode(true);
  ghost.classList.add('guest-strike-ghost');
  ghost.dataset.fromFloor = guestSlot.closest('.column').dataset.floor;
  ghost.dataset.targetFloor = String(targetFloor);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.querySelector('.route-label')?.remove();
  Object.assign(ghost.style, {
    width: sourceRect.width + 'px', height: sourceRect.height + 'px',
    left: sourceRect.left + 'px', top: sourceRect.top + 'px',
  });
  let frame;
  let finish;
  try {
    track.classList.add('strike-camera');
    guestSlot.classList.add('lunging');
    document.body.append(ghost);
    await new Promise((resolve, reject) => {
      finish = resolve;
      document.addEventListener('visibilitychange', finish, {once: true});
      const start = performance.now();
      let contactShown = false;
      function paint(time) {
        if (!track.isConnected || !guestSlot.isConnected || !target.isConnected || document.hidden) return resolve();
        const t = Math.min(1, Math.max(0, (time - start) / 360));
        // Reach the target, hold at contact, then return to the exact same upper slot.
        // Even when the display skips frames, paint one actual contact before retreating.
        const contact = t >= .43 && (!contactShown || t <= .59);
        const p = contact ? 1 : t < .43 ? Math.sin(t / .43 * Math.PI / 2) :
          Math.cos((t - .59) / .41 * Math.PI / 2);
        if (contact) contactShown = true;
        track.scrollLeft = startScroll + (endScroll - startScroll) * p;
        const x = dx * p + scroll - track.scrollLeft;
        const y = dy * p + track.getBoundingClientRect().top - viewport.top;
        ghost.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + (1 - .18*p) + ')';
        target.classList.toggle('strike-impact', contact);
        if (t < 1 || contact) frame = requestAnimationFrame(step);
        else resolve();
      }
      function step(time) {
        try { paint(time); }
        catch (error) { reject(error); }
      }
      step(start);
    });
  } finally {
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', finish);
    target.classList.remove('strike-impact');
    ghost.remove();
    guestSlot.classList.remove('lunging');
    track.scrollLeft = scroll;
    track.classList.remove('strike-camera');
  }
}
