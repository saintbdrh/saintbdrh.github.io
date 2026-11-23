// @ts-nocheck — verbatim port of the workcell demo from the previous site (git d8d7858).
/* Planar 3-joint arm, tool held vertical. Geometric IK: law of cosines at the elbow (elbow-up), atan2 at the shoulder. */
export function createWorkcell() {
  'use strict';
  var svg = document.getElementById('cell');
  if (!svg) return;
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var X0 = 60, Y0 = 300;                       // world (mm, y up) to SVG units
  function sx(x) { return x + X0; }
  function sy(y) { return Y0 - y; }
  var S = { x: 0, y: 70 }, L1 = 190, L2 = 175, L3 = 60, FING = 24, HALF = 15;
  var HOME = { x: 170, y: 150 }, TRAVEL = 100, OPEN = 42, SHUT = 31;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(e);
    return e;
  }

  /* Scene */
  var defs = el('defs', {});
  var pg = el('pattern', { id: 'c-grid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M20 0H0V20', 'class': 'c-gridl' }, pg);
  var ph = el('pattern', { id: 'c-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 6, 'class': 'c-hatch' }, ph);
  el('rect', { x: 0, y: 0, width: 460, height: 300, fill: 'url(#c-grid)' });
  el('circle', { cx: sx(S.x), cy: sy(S.y - L3), r: L1 + L2, 'class': 'c-reach' });
  var ra = 40 * Math.PI / 180;
  el('text', { x: sx((L1 + L2) * Math.cos(ra)) + 6, y: sy(S.y - L3 + (L1 + L2) * Math.sin(ra)) - 2, 'class': 'c-note' }).textContent = 'tool reach';

  var BINS = [{ x: 245, c: 'c1', hue: 41 }, { x: 288, c: 'c2', hue: 191 }, { x: 331, c: 'c3', hue: 326 }];
  BINS.forEach(function (b) {
    var g = el('g', { 'class': b.c });
    el('rect', { x: sx(b.x - 19), y: sy(42), width: 38, height: 42, 'class': 'c-binfloor' }, g);
    el('path', { d: 'M' + sx(b.x - 19) + ' ' + sy(42) + 'V' + sy(1.5) + 'H' + sx(b.x + 19) + 'V' + sy(42), 'class': 'c-bin' }, g);
    el('text', { x: sx(b.x), y: sy(50), 'class': 'c-binlabel' }, g).textContent = 'H ' + b.hue + '°';
  });
  el('rect', { x: 0, y: 300, width: 460, height: 30, 'class': 'c-tablebg' });
  el('rect', { x: 0, y: 300, width: 460, height: 30, fill: 'url(#c-hatch)' });
  el('line', { x1: 0, y1: 300, x2: 460, y2: 300, 'class': 'c-tabletop' });

  var blocksG = el('g', {}), detG = el('g', {});
  var BLOCKS = [
    { x: 104, c: 'c2', hue: 191, name: 'cyan' },
    { x: 150, c: 'c3', hue: 326, name: 'magenta' },
    { x: 196, c: 'c1', hue: 41, name: 'amber' }
  ];
  BLOCKS.forEach(function (b) {
    b.x0 = b.x; b.y = HALF; b.sorted = false;
    b.bin = BINS.filter(function (k) { return k.c === b.c; })[0];
    var g = el('g', { 'class': 'c-block ' + b.c, tabindex: 0, role: 'button', 'aria-label': 'Sort the ' + b.name + ' block, hue ' + b.hue + ' degrees' }, blocksG);
    el('rect', { x: -26, y: -44, width: 52, height: 66, 'class': 'c-hit' }, g);
    el('rect', { x: -HALF, y: -HALF, width: 30, height: 30, rx: 2, 'class': 'body' }, g);
    el('rect', { x: -HALF + 3, y: -HALF + 3, width: 24, height: 6, rx: 1, 'class': 'face' }, g);
    b.g = g;
    var d = el('g', { 'class': 'c-detg ' + b.c }, detG);
    el('rect', { x: -HALF - 4, y: -HALF - 4, width: 38, height: 38, 'class': 'c-det' }, d);
    el('path', { d: 'M-4 0H4M0 -4V4', 'class': 'c-cross' }, d);
    el('text', { x: -HALF - 4, y: -HALF - 8, 'class': 'c-detlabel' }, d).textContent = 'H ' + b.hue + '°';
    b.d = d;
    g.addEventListener('click', function (e) { e.stopPropagation(); pick(b); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(b); }
    });
  });

  var armG = el('g', {});
  el('rect', { x: sx(-46), y: sy(10), width: 92, height: 10, rx: 2, 'class': 'c-ped' }, armG);
  el('rect', { x: sx(-30), y: sy(S.y), width: 60, height: S.y - 10, rx: 3, 'class': 'c-ped' }, armG);
  function link(w) {
    return { o: el('path', { 'class': 'lo', 'stroke-width': w + 3 }, armG), i: el('path', { 'class': 'li', 'stroke-width': w }, armG) };
  }
  var lk1 = link(20), lk2 = link(16), lk3 = link(10);
  var palm = el('line', { 'class': 'c-palm' }, armG);
  var fL = el('rect', { width: 5, height: FING, rx: 1.5, 'class': 'c-finger' }, armG);
  var fR = el('rect', { width: 5, height: FING, rx: 1.5, 'class': 'c-finger' }, armG);
  function joint(r) {
    var g = el('g', {}, armG);
    el('circle', { r: r, 'class': 'c-joint' }, g);
    el('circle', { r: 2.2, 'class': 'c-pin' }, g);
    return g;
  }
  var jS = joint(11), jE = joint(9), jW = joint(7);
  var arcs = [1, 2, 3].map(function (n) { return el('path', { 'class': 'c-arc a' + n }, armG); });
  var labs = [1, 2, 3].map(function (n) { var t = el('text', { 'class': 'c-alabel t' + n }, armG); t.textContent = 'θ' + n; return t; });
  var tgt = el('g', { 'class': 'c-target', opacity: 0 });
  el('circle', { r: 6 }, tgt);
  el('path', { d: 'M-12 0H-3M3 0H12M0 -12V-3M0 3V12' }, tgt);
  var cg = el('g', { 'class': 'c-corner' });
  ['M8 22V8H22', 'M438 8H452V22', 'M452 308V322H438', 'M22 322H8V308'].forEach(function (d) { el('path', { d: d }, cg); });

  /* Kinematics */
  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
  function solve(t) {
    var wx = t.x - S.x, wy = t.y + L3 - S.y;
    var c = (wx * wx + wy * wy - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    var a2 = -Math.acos(Math.max(-1, Math.min(1, c)));
    var a1 = Math.atan2(wy, wx) - Math.atan2(L2 * Math.sin(a2), L1 + L2 * Math.cos(a2));
    return { a1: a1, a2: a2, a3: norm(-Math.PI / 2 - a1 - a2) };
  }
  function clampGoal(p) {
    var x = Math.max(48, Math.min(392, p.x)), y = Math.max(8, Math.min(285, p.y));
    if (x > 86 && x < 356) y = Math.max(y, 52);          // keep clear of blocks and bins while steering
    var wx = x - S.x, wy = y + L3 - S.y, d = Math.sqrt(wx * wx + wy * wy);
    var dmax = (L1 + L2) * 0.985, dmin = Math.abs(L1 - L2) + 12;
    if (d > dmax) { wx *= dmax / d; wy *= dmax / d; }
    else if (d < dmin) { var k = dmin / (d || 1); wx *= k; wy *= k; }
    return { x: S.x + wx, y: S.y + wy - L3 };
  }

  /* Rendering */
  var tm = {};
  ['a1', 'a2', 'a3', 'g', 'x', 'y', 's', 'n'].forEach(function (k) { tm[k] = document.getElementById('tm-' + k); });
  function f(v) { return v.toFixed(1); }
  function deg(a) { var v = a * 180 / Math.PI; return (v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1) + '°'; }
  function mm(v) { return (v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1) + ' mm'; }
  function pt(p) { return f(sx(p.x)) + ' ' + f(sy(p.y)); }
  function setLink(lk, a, b) { var d = 'M' + pt(a) + 'L' + pt(b); lk.o.setAttribute('d', d); lk.i.setAttribute('d', d); }
  function place(g, p) { g.setAttribute('transform', 'translate(' + pt(p) + ')'); }
  function arcD(c, r, a0, a1) {
    var d = a1 - a0;
    if (Math.abs(d) < 0.03) return '';
    var p0 = { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) }, p1 = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) };
    return 'M' + pt(p0) + 'A' + r + ' ' + r + ' 0 ' + (Math.abs(d) > Math.PI ? 1 : 0) + ' ' + (d > 0 ? 0 : 1) + ' ' + pt(p1);
  }

  var tip = { x: HOME.x, y: HOME.y }, goal = { x: HOME.x, y: HOME.y };
  var gap = OPEN, held = null, steps = [], step = null, seg = null, pending = [];
  var pointerIn = false, sorted = 0, dirty = true, visible = true;

  function draw() {
    var q = solve(tip);
    var E = { x: S.x + L1 * Math.cos(q.a1), y: S.y + L1 * Math.sin(q.a1) };
    var b12 = q.a1 + q.a2;
    var W = { x: E.x + L2 * Math.cos(b12), y: E.y + L2 * Math.sin(b12) };
    var P = { x: W.x, y: W.y - (L3 - FING) };
    setLink(lk1, S, E); setLink(lk2, E, W); setLink(lk3, W, P);
    place(jS, S); place(jE, E); place(jW, W);
    var h = gap / 2;
    palm.setAttribute('x1', f(sx(P.x - h - 5))); palm.setAttribute('x2', f(sx(P.x + h + 5)));
    palm.setAttribute('y1', f(sy(P.y))); palm.setAttribute('y2', f(sy(P.y)));
    fL.setAttribute('x', f(sx(P.x - h - 5))); fL.setAttribute('y', f(sy(P.y)));
    fR.setAttribute('x', f(sx(P.x + h))); fR.setAttribute('y', f(sy(P.y)));
    [[S, 30, 0, q.a1], [E, 24, q.a1, b12], [W, 17, b12, b12 + q.a3]].forEach(function (a, k) {
      arcs[k].setAttribute('d', arcD(a[0], a[1], a[2], a[3]));
      var m = (a[2] + a[3]) / 2, rr = a[1] + 10;
      labs[k].setAttribute('x', f(sx(a[0].x + rr * Math.cos(m))));
      labs[k].setAttribute('y', f(sy(a[0].y + rr * Math.sin(m))));
    });
    if (held) { held.x = tip.x; held.y = tip.y + 3; }
    BLOCKS.forEach(function (b) { place(b.g, b); place(b.d, b); });
    var showT = pointerIn && !busy() && !reduce;
    tgt.setAttribute('opacity', showT ? 1 : 0);
    if (showT) place(tgt, goal);
    tm.a1.textContent = deg(q.a1); tm.a2.textContent = deg(q.a2); tm.a3.textContent = deg(q.a3);
    tm.x.textContent = mm(tip.x); tm.y.textContent = mm(tip.y);
    tm.g.textContent = gap < (OPEN + SHUT) / 2 ? 'Closed' : 'Open';
  }

  /* Pick-and-place sequencer (a small state machine) */
  var live = document.getElementById('cell-live');
  var sortAll = document.getElementById('sort-all'), resetBtn = document.getElementById('reset');
  function say(m) { live.textContent = m; }
  function busy() { return !!step || steps.length > 0; }
  function setState(s) { tm.s.textContent = s; }
  function updateButtons() {
    sortAll.disabled = busy() || !BLOCKS.some(function (b) { return !b.sorted; });
    resetBtn.disabled = busy() || sorted === 0;
    tm.n.textContent = sorted + ' of ' + BLOCKS.length;
  }
  function plan(b) {
    var bx = b.x, tx = b.bin.x;
    return [
      { s: 'Approach', to: { x: bx, y: TRAVEL } },
      { s: 'Descend', to: { x: bx, y: HALF - 3 } },
      { s: 'Grasp', grip: SHUT, attach: b },
      { s: 'Lift', to: { x: bx, y: TRAVEL } },
      { s: 'Transfer', to: { x: tx, y: TRAVEL } },
      { s: 'Lower', to: { x: tx, y: HALF } },
      { s: 'Release', grip: OPEN, detach: b },
      { s: 'Retract', to: { x: tx, y: TRAVEL } }
    ];
  }
  function run(b) {
    steps = plan(b);
    say('Sorting the ' + b.name + ' block.');
    next(performance.now());
  }
  function next(now) {
    step = steps.shift() || null;
    if (!step) {
      var nb = pending.shift();
      while (nb && nb.sorted) nb = pending.shift();
      if (nb) { run(nb); return; }
      setState('Idle');
      if (!pointerIn) goal = { x: HOME.x, y: HOME.y };
      else goal = clampGoal(goal);
      if (sorted === BLOCKS.length) say('All blocks sorted by hue.');
      updateButtons();
      return;
    }
    setState(step.s);
    if (step.to) {
      var dist = Math.sqrt(Math.pow(step.to.x - tip.x, 2) + Math.pow(step.to.y - tip.y, 2));
      seg = { move: true, from: { x: tip.x, y: tip.y }, to: step.to, t0: now, dur: reduce ? 1 : Math.max(240, Math.min(950, dist * 3.2)) };
    } else {
      seg = { move: false, from: gap, to: step.grip, t0: now, dur: reduce ? 1 : 260 };
    }
    updateButtons();
  }
  function pick(b) {
    if (b.sorted || b === held) return;
    if (busy()) { if (pending.indexOf(b) < 0) pending.push(b); return; }
    run(b);
  }
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(64, now - last); last = now;
    if (seg) {
      var p = Math.min(1, (now - seg.t0) / seg.dur), e = ease(p);
      if (seg.move) { tip.x = seg.from.x + (seg.to.x - seg.from.x) * e; tip.y = seg.from.y + (seg.to.y - seg.from.y) * e; }
      else gap = seg.from + (seg.to - seg.from) * e;
      dirty = true;
      if (p >= 1) {
        var st = step;
        seg = null; step = null;
        if (st.attach) held = st.attach;
        if (st.detach) {
          var b = st.detach;
          held = null; b.x = b.bin.x; b.y = HALF + 3; b.sorted = true; sorted++;
          b.g.classList.add('sorted'); b.g.setAttribute('aria-disabled', 'true'); b.d.style.display = 'none';
          say('The ' + b.name + ' block is in the H ' + b.hue + '° bin.');
        }
        next(now);
      }
    } else if (!busy()) {
      var k = reduce ? 1 : 1 - Math.exp(-dt / 120);
      var dx = goal.x - tip.x, dy = goal.y - tip.y;
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) { tip.x += dx * k; tip.y += dy * k; dirty = true; }
    }
    if (dirty && visible) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }

  /* Input */
  function toWorld(e) {
    var m = svg.getScreenCTM();
    if (!m) return null;
    var p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x - X0, y: Y0 - p.y };
  }
  svg.addEventListener('pointermove', function (e) {
    if (reduce || e.pointerType === 'touch') return;
    var w = toWorld(e);
    if (!w) return;
    pointerIn = true; goal = clampGoal(w); dirty = true;
  });
  svg.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'touch') return;
    pointerIn = false; goal = { x: HOME.x, y: HOME.y }; dirty = true;
  });
  svg.addEventListener('click', function (e) {
    if (busy()) return;
    var w = toWorld(e);
    if (w) { goal = clampGoal(w); dirty = true; }
  });
  document.getElementById('det-toggle').addEventListener('change', function (e) {
    svg.classList.toggle('no-det', !e.target.checked);
  });
  sortAll.addEventListener('click', function () {
    var todo = BLOCKS.filter(function (b) { return !b.sorted; });
    if (!todo.length || busy()) return;
    pending = todo.slice(1);
    run(todo[0]);
  });
  resetBtn.addEventListener('click', function () {
    if (busy()) return;
    BLOCKS.forEach(function (b) {
      b.x = b.x0; b.y = HALF; b.sorted = false;
      b.g.classList.remove('sorted'); b.g.removeAttribute('aria-disabled'); b.d.style.display = '';
    });
    sorted = 0; pending = []; dirty = true;
    say('Blocks reset to the pick area.');
    updateButtons();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) dirty = true; }).observe(svg);
  }

  setState('Idle');
  updateButtons();
  draw();
  requestAnimationFrame(frame);
}
