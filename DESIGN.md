---
name: D. Uuganbadrakh — Portfolio
description: A dark product-photography studio in which one machine is the CV.
colors:
  studio-black: "#080A0C"
  graphite-surface: "#111417"
  graphite-surface-raised: "#161A1E"
  bone: "#F2F2EF"
  steel-grey: "#8E949A"
  anodized-blue: "#91B7C7"
  rule: "rgba(242, 242, 239, 0.09)"
  rule-strong: "rgba(242, 242, 239, 0.17)"
typography:
  display:
    fontFamily: "Source Serif 4 Variable, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2.5rem, 7vw, 6rem)"
    fontWeight: 340
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  heading-2:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "clamp(2.2rem, 4.3vw, 4rem)"
    fontWeight: 340
    lineHeight: 1.04
    letterSpacing: "-0.022em"
  heading-3:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "clamp(1.75rem, 2.7vw, 2.6rem)"
    fontWeight: 340
    lineHeight: 1.08
  heading-4:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 560
    lineHeight: 1.3
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.62
  lead:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1.25vw, 1.25rem)"
    lineHeight: 1.55
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 560
  data:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.78125rem"
rounded:
  hairline: "2px"
  panel: "3px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
  s10: "144px"
components:
  button-primary:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.studio-black}"
    rounded: "{rounded.hairline}"
    padding: "0 24px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.studio-black}"
    textColor: "{colors.bone}"
    rounded: "{rounded.hairline}"
    padding: "0 24px"
    height: "44px"
  panel:
    backgroundColor: "{colors.graphite-surface}"
    rounded: "{rounded.panel}"
    padding: "32px"
  chip-skill:
    backgroundColor: "{colors.studio-black}"
    textColor: "{colors.bone}"
    rounded: "{rounded.hairline}"
    height: "36px"
---

## Overview

One continuous 3D world. The page is a dark studio: a model of the thesis DOFBOT sorts blocks on its workspace mat with the real IK solver, while the scroll-driven camera travels through the RealSense view, the kinematics, project screens floating in a ring around the robot, and a lab where visitors drive the arm. Nothing glows, flickers or bounces. The interface steps back and the machine and the engineering carry the page.

Character: calm, exact, Japanese-spatial, industrial. Asymmetric twelve-column editorial layouts, generous negative space, one cool accent.

## Colors

### Primary
- **Anodized Blue `#91B7C7`**: the only chromatic colour. Reserved for live data, the signal path, focus rings, joint axes, annotation leaders and the active-nav dot. It never fills a large area.

### Neutral
- **Studio Black `#080A0C`**: page ground and WebGL clear colour. The floor shader fades to exactly this value, so the 3D studio has no edge.
- **Graphite Surface `#111417`** / **Raised `#161A1E`**: figures, the lab panel, the workcell.
- **Bone `#F2F2EF`**: primary text, primary buttons.
- **Steel Grey `#8E949A`**: secondary text. It reaches 6.9:1 on the ground, so it is safe for body copy.
- **Rules** at 9% and 17% bone: every separation is a hairline, never a box shadow.

### Named Rules
- **One accent.** If something needs emphasis, use weight, size or bone; only data, focus and signal flow earn the blue.
- **Simulation hues.** The workcell's three bins use desaturated hue swatches (H 38°, 194°, 330°) because hue is the data being sorted there; nowhere else.

## Typography

Source Serif 4 at its display optical size, light (340), no italics, carries every large heading. Its optical-size axis recalibrates contrast from 6rem down to 1.75rem, like an instrument calibrated per range. Geist carries the interface and body. Geist Mono appears only for engineering data: joint angles, coordinates, link lengths, part designations.

### Hierarchy
display (hero name) → heading-2 (chapter titles) → heading-3 (capabilities, projects, profile lede) → heading-4 (Geist, sub-systems) → label (Geist 560, section labels in steel grey) → body / lead → data.

### Named Rules
- **Mono is for numbers.** Never use monospace as a costume for "technical".
- **No eyebrows.** A heading carries its own weight; context goes after it, never above.
- **Uppercase only for the hero role lines** (owner-pinned), tracked 0.12em.

## Layout

Fluid margins `clamp(16px, 5.2vw, 88px)`, gutter `clamp(16px, 2.4vw, 36px)`, max width 1440px, section rhythm `clamp(96px, 15vh, 176px)`. Projects use a 12-column grid: intro 1–5 / figure 7–12, mirrored on every other project. Over the stage, text holds the left column while the camera frames the robot right of centre (view offset +0.2); the thesis mirrors this (text right, robot left).

Portrait screens: the robot moves to the upper half (view offset y +0.27); text sits at the bottom on an 82% black scrim.

## Elevation & Depth

Flat. Depth comes from the 3D scene's light and from tone steps (ground → surface → raised), never from drop shadows. The only gradients are functional fades between the WebGL stage and opaque sections.

## Shapes

Near-square: 2px for controls, 3px for panels and figures. Circles only for joints, sensors, slider thumbs and the active-nav dot.

## Components

- **Buttons**: primary is solid bone with black text; quiet is a hairline outline. Both are 44px tall.
- **Links**: text with a hairline underline and a drawn chevron; the underline turns blue on hover.
- **Figures**: line drawings on graphite. Strokes in steel grey, signal wires in blue with a slow dash flow, nodes as black boxes with hairline borders, external systems dashed.
- **Spec tables**: two-column definition rows on hairlines.
- **Lab controls**: hairline range tracks with bone thumbs, a segmented mode switch, square checkboxes that fill blue.

## Do's and Don'ts

- Do let the DOFBOT, working, lead the first viewport; keep the name at lower left.
- Do move the camera by orbiting around a named part of the model (anchor-relative shots, spherical interpolation).
- Do label every simulation and the illustrative model as such.
- Don't use glitch, scanlines, RGB split, neon glow, glass cards, particles or typewriter text (owner bans).
- Don't use card grids, kickers or section numbers, side-stripe borders, gradient text or hard offset shadows.
- Don't add a second accent colour.
