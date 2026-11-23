/**
 * Page bootstrap: smooth scroll, reveals, navigation, WebGL stage, lab, utilities.
 * Everything here is progressive: content is readable without any of it.
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
  if (lenis) lenis.scrollTo(id === '#top' ? 0 : el, { offset: id === '#top' ? 0 : -64, duration: 1.6 });
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

// ------------------------------------------------------------ stage
const canvas = document.getElementById('stage-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('stage-ann') as unknown as SVGSVGElement;
const stageEl = canvas.parentElement!;
const introEls = Array.from(document.querySelectorAll<HTMLElement>('[data-intro]'));
let introDone = false;

function introText() {
  if (introDone) return;
  introDone = true;
  if (reduced) return;
  gsap.fromTo(introEls, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1.6, ease: 'expo.out', stagger: 0.14, delay: 0.6 });
}
function fallback() {
  root.classList.add('no-webgl');
  introText();
}
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

if (hasWebGL()) {
  if (!reduced) gsap.set(introEls, { autoAlpha: 0 });
  // never hold the name hostage to a slow model download
  setTimeout(introText, 2600);
  import('./stage/stage').then(({ createStage }) => {
    const stage = createStage({
      canvas, overlay, reduced, scrollY,
      telemetry: document.getElementById('telemetry'),
      onReady: () => { stageEl.classList.add('ready'); introText(); },
      onFail: fallback,
    });
    // render only while the film or the contact scene can be seen
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
      const on = visible.size > 0;
      stageEl.classList.toggle('off', !on);
      stage.setActive(on);
    });
    ['film', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    const remeasure = () => stage.measure();
    document.fonts?.ready.then(remeasure);
    addEventListener('load', remeasure);
    ScrollTrigger.addEventListener('refresh', remeasure);
    addEventListener('pagehide', () => stage.dispose(), { once: true });
  }).catch(fallback);
} else {
  fallback();
}

// ------------------------------------------------------------ lab (lazy)
const lab = document.getElementById('lab-ik');
if (lab) {
  const io = new IntersectionObserver((entries, obs) => {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    if (hasWebGL()) import('./lab/lab3d').then(({ createLab }) => createLab(lab, reduced));
    else lab.classList.add('no-webgl');
    import('./lab/workcell').then(({ createWorkcell }) => createWorkcell());
  }, { rootMargin: '800px 0px' });
  io.observe(lab);
}

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
