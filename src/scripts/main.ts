/**
 * Page bootstrap: smooth scroll, reveals, navigation, the 3D world, the lab,
 * dialogs and utilities. Everything is progressive: content reads without it.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initCapabilityMap } from './capmap';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) root.classList.add('reduced');

// ------------------------------------------------------------ smooth scroll (off for reduced motion)
let lenis: Lenis | null = null;
if (!reduced) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const scrollY = () => (lenis ? lenis.scroll : window.scrollY);

// ------------------------------------------------------------ navigation
const nav = document.getElementById('nav')!;
const menuBtn = nav.querySelector<HTMLButtonElement>('.nav-menu')!;
const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('.nav-links a'));
function closeMenu() { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) links[0]?.focus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); menuBtn.focus(); }
});

// in-page links go through Lenis so the camera path is travelled, not skipped
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href')!;
  const el = id === '#top' ? document.body : document.querySelector<HTMLElement>(id);
  if (!el) return;
  e.preventDefault();
  closeMenu();
  if (lenis) lenis.scrollTo(id === '#top' ? 0 : el, { offset: id === '#top' ? 0 : -64, duration: 1.8 });
  else if (id === '#top') window.scrollTo({ top: 0 });
  else el.scrollIntoView();
  history.replaceState(null, '', id);
  const focusTarget = id === '#top' ? document.getElementById('hero-name') : el;
  if (focusTarget) { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true }); }
});

const sections = links
  .map((a) => document.querySelector<HTMLElement>(a.getAttribute('href')!))
  .filter((s): s is HTMLElement => !!s);
function updateNav() {
  const y = scrollY();
  nav.classList.toggle('solid', y > innerHeight * 0.6);
  const max = document.documentElement.scrollHeight - innerHeight;
  nav.style.setProperty('--progress', String(max > 0 ? Math.min(1, y / max) : 0));
  let current = -1;
  sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= innerHeight * 0.4) current = i; });
  links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
}
if (lenis) lenis.on('scroll', updateNav); else addEventListener('scroll', updateNav, { passive: true });
updateNav();

// ------------------------------------------------------------ reveals: visible by default, animated in only with motion
if (!reduced) {
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) return;
    gsap.fromTo(el, { autoAlpha: 0, y: 16 }, {
      autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
}

// ------------------------------------------------------------ world
const canvas = document.getElementById('world-canvas') as HTMLCanvasElement;
const cssLayer = document.getElementById('world-css') as HTMLElement;
const overlay = document.getElementById('world-ann') as unknown as SVGSVGElement;
const worldEl = canvas.parentElement!;
const introEls = Array.from(document.querySelectorAll<HTMLElement>('[data-intro]'));
let introDone = false;

function introText() {
  if (introDone) return;
  introDone = true;
  if (reduced) return;
  gsap.fromTo(introEls, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1.6, ease: 'expo.out', stagger: 0.12, delay: 0.5 });
}
function fallback() {
  root.classList.add('no-webgl');
  root.classList.remove('panels-3d');
  introText();
}
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// project screens live inside the 3D world on wide screens; elsewhere they stay in the page flow
const webgl = hasWebGL();
const panels3d = webgl && innerWidth >= 1000 && innerHeight >= 560;
root.classList.toggle('panels-3d', panels3d);

if (webgl) {
  if (!reduced) gsap.set(introEls, { autoAlpha: 0 });
  setTimeout(introText, 2600); // never hold the name hostage to a slow model download
  import('./world/world').then(({ createWorld }) => {
    const world = createWorld({
      canvas, cssLayer, overlay, reduced, panels3d, scrollY,
      onReady: () => { worldEl.classList.add('ready'); introText(); },
      onFail: fallback,
    });
    // dim the world behind the long reading sections
    const reading = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.intersectionRatio > 0.5 ? reading.add(en.target) : reading.delete(en.target)));
      worldEl.classList.toggle('dim', reading.size > 0);
    }, { threshold: [0, 0.5, 1] });
    ['skills', 'profile'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    const remeasure = () => world.measure();
    document.fonts?.ready.then(remeasure);
    addEventListener('load', remeasure);
    ScrollTrigger.addEventListener('refresh', remeasure);
    document.addEventListener('visibilitychange', () => world.setActive(!document.hidden));
    addEventListener('pagehide', () => world.dispose(), { once: true });
    initLab();
  }).catch(fallback);
} else {
  fallback();
}

// ------------------------------------------------------------ lab: drives the same arm in the world
interface LabApi {
  setTarget(x: number, y: number, z: number, pitch: number): { ok: boolean; branch?: string; pitch: number; D: number; candidates: unknown[] };
  setJoints(q1: number, q2: number, q3: number, q4: number): { x: number; y: number; z: number; pitch: number };
  setEffective(on: boolean): void;
  runSequence(onStep: (label: string, ok: boolean) => void): void;
}
function initLab() {
  const api = (window as unknown as { __labApi?: LabApi }).__labApi;
  const panel = document.getElementById('lab-panel');
  if (!api || !panel) return;
  const status = panel.querySelector<HTMLElement>('#lab-status')!;
  const ikIn = panel.querySelector<HTMLElement>('#lab-ik-inputs')!;
  const fkIn = panel.querySelector<HTMLElement>('#lab-fk-inputs')!;
  let mode: 'ik' | 'fk' = 'ik';
  const val = (fs: HTMLElement, k: string) => Number(fs.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!.value);
  const sync = (inp: HTMLInputElement) => {
    const out = inp.parentElement!.querySelector('output')!;
    const v = Number(inp.value), u = out.dataset.unit || '';
    out.textContent = `${v < 0 ? '−' : ''}${Math.abs(v)}${u === '°' ? '°' : ' ' + u}`;
  };
  const fmt = (v: number) => `${v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
  function apply() {
    api!.setEffective(false);
    if (mode === 'ik') {
      const s = api!.setTarget(val(ikIn, 'x'), val(ikIn, 'y'), val(ikIn, 'z'), val(ikIn, 'pitch'));
      status.dataset.state = s.ok ? 'ok' : 'warn';
      status.textContent = s.ok
        ? `Solved on the ${s.branch} branch at pitch ${fmt(s.pitch)}°.`
        : s.candidates.length ? 'Reachable, but no elbow branch stays within the joint limits.' : `Out of reach: D = ${s.D.toFixed(3)}, outside [−1, 1].`;
    } else {
      const p = api!.setJoints(val(fkIn, 'q1'), val(fkIn, 'q2'), val(fkIn, 'q3'), val(fkIn, 'q4'));
      status.dataset.state = 'ok';
      status.textContent = `Forward kinematics: gripper tip at (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}) mm, pitch ${fmt(p.pitch)}°.`;
    }
  }
  panel.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((inp) => {
    sync(inp);
    inp.addEventListener('input', () => { sync(inp); apply(); });
  });
  panel.querySelectorAll<HTMLInputElement>('input[name="lab-mode"]').forEach((r) => r.addEventListener('change', () => {
    mode = r.value as 'ik' | 'fk';
    ikIn.hidden = mode !== 'ik';
    fkIn.hidden = mode !== 'fk';
    apply();
  }));
  const runBtn = panel.querySelector<HTMLButtonElement>('#lab-run')!;
  runBtn.addEventListener('click', () => {
    runBtn.disabled = true;
    api!.runSequence((label, ok) => {
      status.dataset.state = ok ? 'ok' : 'warn';
      if (label === 'Sequence complete') {
        status.textContent = 'Sequence complete: picked at (150, 50), placed at (120, −40), using the thesis 40 mm effective wrist.';
        runBtn.disabled = false;
      } else status.textContent = `${label}${ok ? '' : ', no solution'}.`;
    });
  });
  // take control as soon as the lab scene is reached
  new IntersectionObserver((en) => { if (en[0].isIntersecting) apply(); }, { threshold: 0.5 }).observe(document.getElementById('lab')!);
}

// ------------------------------------------------------------ dialogs (case studies, workcell)
let workcellReady = false;
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const opener = t.closest<HTMLElement>('[data-open]');
  if (opener) {
    const d = document.getElementById(opener.dataset.open!) as HTMLDialogElement | null;
    if (!d) return;
    d.showModal();
    lenis?.stop();
    if (d.id === 'workcell-dialog' && !workcellReady) {
      workcellReady = true;
      import('./lab/workcell').then(({ createWorkcell }) => createWorkcell());
    }
    return;
  }
  if (t.closest('[data-close]')) t.closest('dialog')?.close();
  else if (t.tagName === 'DIALOG') (t as HTMLDialogElement).close(); // click on the backdrop
});
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('close', () => lenis?.start()));

// ------------------------------------------------------------ capability map, copy, print
initCapabilityMap(reduced);

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => {
  const label = b.querySelector('span') || b;
  const orig = label.textContent;
  b.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(b.dataset.copy!); ok = true; } catch { ok = false; }
    if (!ok) {
      const m = document.querySelector('.contact-mail');
      if (m) {
        const r = document.createRange(); r.selectNodeContents(m);
        const s = getSelection(); s?.removeAllRanges(); s?.addRange(r);
      }
    }
    label.textContent = ok ? 'Copied' : 'Address selected, press Ctrl+C';
    setTimeout(() => { label.textContent = orig; }, 2000);
  });
});
document.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => print()));
