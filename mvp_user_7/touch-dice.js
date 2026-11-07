// Touch taps use the button's native click. A drag takes over after the finger moves.
export function enableTouchDice(panel, {start, over, drop, cancel}) {
  let gesture = null;
  let suppressClick = false;

  function allyAt(x, y) {
    const cell = document.elementFromPoint(x, y)?.closest('.bt-cell.ally.filled');
    return cell && panel.contains(cell) ? cell : null;
  }

  function paint() {
    const g = gesture;
    if (!g?.ghost || !panel.isConnected) return;
    g.frame = 0;
    const {x, y, ghost} = g;
    ghost.style.transform = `translate(${x - ghost.offsetWidth / 2}px,${y - ghost.offsetHeight - 10}px)`;
    const cell = allyAt(x, y);
    if (g.cell !== cell) {
      g.cell?.classList.remove('bt-touch-target');
      g.cell = cell;
      cell?.classList.add('bt-touch-target');
      over(cell);
    }
    // Both banks of the circular board are reachable when they span two screens.
    const edge = 52;
    const speed = y < edge ? -Math.ceil((edge-y)/4) : y > innerHeight-edge ? Math.ceil((y-innerHeight+edge)/4) : 0;
    if (speed) {
      const previous = window.scrollY;
      window.scrollBy(0, Math.max(-16, Math.min(16, speed)));
      if (window.scrollY !== previous) g.frame = requestAnimationFrame(paint);
    }
  }

  function end(event, canDrop) {
    const g = gesture;
    if (!g || event.pointerId !== g.id) return;
    gesture = null;
    g.die.draggable = g.draggable;
    if (!g.ghost) return;
    cancelAnimationFrame(g.frame);
    g.cell?.classList.remove('bt-touch-target');
    g.ghost.remove();
    suppressClick = true;
    if (event.cancelable) event.preventDefault();
    const cell = canDrop && allyAt(event.clientX, event.clientY);
    if (cell) drop(cell);
    else cancel();
  }

  panel.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    suppressClick = false;
    if (event.pointerType === 'mouse' || gesture || event.button !== 0) return;
    const die = event.target.closest('.bt-die');
    if (!die || die.disabled || panel.getAttribute('aria-busy') === 'true') return;
    gesture = {id:event.pointerId, die, draggable:die.draggable, startX:event.clientX, startY:event.clientY, cell:null, frame:0};
    die.draggable = false;
    die.setPointerCapture(event.pointerId);
  });
  panel.addEventListener('pointermove', event => {
    const g = gesture;
    if (!g || event.pointerId !== g.id) return;
    g.x = event.clientX;
    g.y = event.clientY;
    if (!g.ghost) {
      if (Math.hypot(g.x-g.startX, g.y-g.startY) < 7) return;
      if (!start(g.die)) {
        end(event,false);
        return;
      }
      g.ghost = document.createElement('span');
      g.ghost.className = 'bt-touch-ghost';
      g.ghost.dataset.direction = g.die.dataset.direction;
      g.ghost.setAttribute('aria-hidden','true');
      g.ghost.append(g.die.querySelector('.bt-pips').cloneNode(true), g.die.querySelector('.bt-die-arrow').cloneNode(true));
      panel.append(g.ghost);
    }
    event.preventDefault();
    if (!g.frame) g.frame = requestAnimationFrame(paint);
  }, {passive:false});
  panel.addEventListener('pointerup', event => end(event,true));
  panel.addEventListener('pointercancel', event => end(event,false));
  panel.addEventListener('lostpointercapture', event => {
    if (event.target === gesture?.die) end(event,false);
  });
  panel.addEventListener('click', event => {
    if (!suppressClick || !event.detail) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
}
