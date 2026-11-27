/**
 * Capability map, ported from the previous site: skills and projects highlight
 * each other; on wide screens, traces are drawn from each skill to its projects.
 */
const NS = 'http://www.w3.org/2000/svg';

export function initCapabilityMap(reduced: boolean) {
  const map = document.getElementById('map');
  const traces = document.getElementById('traces') as unknown as SVGSVGElement | null;
  const statusEl = document.getElementById('map-status');
  if (!map || !traces || !statusEl) return;
  const skills = Array.from(map.querySelectorAll<HTMLButtonElement>('.skill'));
  const parts = Array.from(map.querySelectorAll<HTMLButtonElement>('.part'));
  const partById = new Map(parts.map((p) => [p.dataset.part!, p]));
  const wide = matchMedia('(min-width: 961px)');
  type Sel = { type: 'skill' | 'part'; el: HTMLButtonElement } | null;
  let locked: Sel = null;
  let lastPairs: [HTMLElement, HTMLElement][] = [];

  const ids = (s: HTMLElement) => (s.dataset.p || '').split(' ');
  const link = (p: HTMLElement) => {
    const a = document.createElement('a');
    a.href = p.dataset.href!;
    a.textContent = p.textContent;
    return a;
  };
  function joinInto(node: HTMLElement, items: (string | Node)[]) {
    items.forEach((it, k) => {
      if (k > 0) node.append(k === items.length - 1 ? ' and ' : ', ');
      node.append(it);
    });
  }
  function setStatus(sel: Sel) {
    statusEl!.textContent = '';
    if (!sel) { statusEl!.textContent = 'Select a skill or a project to see how they connect.'; return; }
    const b = document.createElement('b');
    if (sel.type === 'skill') {
      b.textContent = sel.el.textContent;
      statusEl!.append(b, ' is used in ');
      joinInto(statusEl!, ids(sel.el).map((id) => link(partById.get(id)!)));
    } else {
      b.append(link(sel.el));
      statusEl!.append(b, ' uses ');
      joinInto(statusEl!, skills.filter((s) => ids(s).includes(sel.el.dataset.part!)).map((s) => s.textContent || ''));
    }
    statusEl!.append('.');
  }
  function apply(sel: Sel) {
    [...skills, ...parts].forEach((n) => n.classList.remove('on'));
    if (!sel) { map!.classList.remove('dim'); drawTraces([]); setStatus(null); return; }
    const pairs: [HTMLElement, HTMLElement][] = [];
    sel.el.classList.add('on');
    if (sel.type === 'skill') {
      ids(sel.el).forEach((id) => { const p = partById.get(id)!; p.classList.add('on'); pairs.push([sel.el, p]); });
    } else {
      skills.forEach((s) => { if (ids(s).includes(sel.el.dataset.part!)) { s.classList.add('on'); pairs.push([s, sel.el]); } });
    }
    map!.classList.add('dim');
    drawTraces(pairs);
    setStatus(sel);
  }
  function drawTraces(pairs: [HTMLElement, HTMLElement][]) {
    lastPairs = pairs;
    traces!.replaceChildren();
    if (!wide.matches || !pairs.length) return;
    const mr = map!.getBoundingClientRect();
    const gx = map!.querySelector('.parts')!.getBoundingClientRect().left - mr.left - 40;
    pairs.forEach(([a0, b0], k) => {
      const a = a0.getBoundingClientRect(), b = b0.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - mr.left, y1 = a.top + a.height / 2 - mr.top;
      const yg = a.bottom - mr.top + 4;
      const x2 = b.left - mr.left, y2 = b.top + b.height / 2 - mr.top;
      const lane = gx - (k % 5) * 7, dy = y2 - yg, s = dy < 0 ? -1 : 1, r = Math.min(10, Math.abs(dy) / 2);
      const d = `M${x1} ${y1}V${yg - 5}L${x1 + 5} ${yg}` + (Math.abs(dy) < 1 ? `H${x2}`
        : `H${lane - r}L${lane} ${yg + s * r}V${y2 - s * r}L${lane + r} ${y2}H${x2}`);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      traces!.appendChild(p);
      if (!reduced) {
        const len = p.getTotalLength();
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
        p.getBoundingClientRect();
        p.style.strokeDashoffset = '0';
      }
      for (const [cx, cy] of [[x1, a.bottom - mr.top + 1], [x2, y2]]) {
        const o = document.createElementNS(NS, 'circle');
        o.setAttribute('cx', String(cx)); o.setAttribute('cy', String(cy)); o.setAttribute('r', '3');
        traces!.appendChild(o);
      }
    });
  }
  function bind(node: HTMLButtonElement, type: 'skill' | 'part') {
    const preview = () => { if (!locked) apply({ type, el: node }); };
    const clear = () => { if (!locked) apply(null); };
    node.addEventListener('mouseenter', preview);
    node.addEventListener('mouseleave', clear);
    node.addEventListener('focus', preview);
    node.addEventListener('blur', clear);
    node.addEventListener('click', () => {
      if (locked && locked.el === node) { node.setAttribute('aria-pressed', 'false'); locked = null; apply(null); return; }
      if (locked) locked.el.setAttribute('aria-pressed', 'false');
      locked = { type, el: node };
      node.setAttribute('aria-pressed', 'true');
      apply(locked);
    });
  }
  skills.forEach((s) => bind(s, 'skill'));
  parts.forEach((p) => bind(p, 'part'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && locked) { locked.el.setAttribute('aria-pressed', 'false'); locked = null; apply(null); }
  });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => drawTraces(lastPairs), 120); });
}
