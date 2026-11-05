import {esc, icon} from './ui.js';

export const mapKinds = {
  normal: ['일반 전투', 'key'], elite: ['엘리트', 'skull'], boss: ['보스', 'skull'],
  shop: ['상점', 'soul'], fusion: ['융합', 'fusion'], recovery: ['회복', 'heart'], event: ['이벤트', 'book'],
};
export const mapRoads = {좌: '왼쪽 길', 중: '가운데 길', 우: '오른쪽 길', 공통: '공통 경로'};
const laneIndex = {좌: 1, 중: 2, 우: 3, 공통: 2};
const stateNames = {current: '현재 진행 중', completed: '방문 완료', reachable: '방문 가능', future: '현재 방문 불가'};

function nodeState(n) {
  if (n.current && !n.completed) return 'current';
  if (n.completed) return 'completed';
  return n.reachable ? 'reachable' : 'future';
}

function routeLines(nodes, depthCount, selectedId) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const x = n => 100 * (n.depth - .5) / depthCount;
  const y = n => 100 * (laneIndex[n.col] - .5) / 3;
  const lines = [];
  for (const source of nodes) {
    for (const id of source.next) {
      const target = byId.get(id);
      if (!target) continue;
      let state = '';
      if (source.completed && (target.completed || target.current)) state = 'traveled';
      else if (source.completed && target.reachable) state = 'reachable';
      else if (source.id === selectedId) state = 'from-selection';
      const mid = (x(source) + x(target)) / 2;
      const d = `M ${x(source)} ${y(source)} C ${mid} ${y(source)}, ${mid} ${y(target)}, ${x(target)} ${y(target)}`;
      lines.push(`<path d="${d}" data-from="${esc(source.id)}" data-to="${esc(id)}" data-route="${state}"/>`);
    }
  }
  return `<svg class="adventure-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g>${lines.join('')}</g></svg>`;
}

function nodeButton(n, selectedId, positionId) {
  const [label, glyph] = mapKinds[n.kind];
  const state = nodeState(n);
  const here = n.id === positionId;
  const description = [n.depth+'번째', mapRoads[n.col], label, stateNames[state]];
  if (here && state === 'completed') description.push('현재 위치');
  const title = esc(description.join(' · '));
  const check = n.completed ? `<span class="adventure-check">${icon('check', 11)}</span>` : '';
  return `<button type="button" class="adventure-node" data-map-node="${esc(n.id)}" data-state="${state}" data-kind="${esc(n.kind)}"
    style="--depth:${n.depth};--lane:${laneIndex[n.col]}" aria-label="${title}" title="${title}"
    aria-pressed="${n.id === selectedId}"${here ? ' aria-current="location"' : ''}>
    <span class="adventure-seal">${icon(glyph, n.kind === 'boss' ? 23 : 19)}${check}</span>
    <span class="adventure-node-label">${esc(label)}</span>
  </button>`;
}

export function adventureMap(view, selectedId) {
  const nodes = view.map;
  const depthCount = Math.max(1, ...nodes.map(n => n.depth));
  const positionId = nodes.find(n => n.current)?.id ?? view.visited.at(-1);
  const acts = [1, 2, 3].map(act =>
    `<li${act === view.act ? ' aria-current="step"' : ''}>${act < view.act ? icon('check', 12) : ''}${act}막</li>`).join('');
  const depths = Array.from({length: depthCount}, (_, i) => `<span>${i+1}</span>`).join('');
  return `<section class="adventure-map" aria-label="${view.act}막 경로 지도" style="--depth-count:${depthCount}">
    <div class="adventure-margin">
      <ol class="adventure-acts" aria-label="막 진행">${acts}</ol>
      <span class="adventure-legend"><i aria-hidden="true"></i>방문 가능</span>
    </div>
    <div class="adventure-atlas">
      <div class="adventure-depths" aria-hidden="true">${depths}</div>
      <div class="adventure-graph">${routeLines(nodes, depthCount, selectedId)}${nodes.map(n => nodeButton(n, selectedId, positionId)).join('')}</div>
    </div>
  </section>`;
}
