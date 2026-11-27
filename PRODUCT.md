# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro + TypeScript, Three.js, GSAP ScrollTrigger, Lenis (named in the owner's brief). Static output deployed to GitHub Pages (user site `saintbdrh.github.io`). 3D assets are produced procedurally in Blender 5.2 via `bpy` and exported as `.glb`.

## Users

- **Hiring engineers and technical leads** in embedded systems, robotics, automation and IoT, evaluating D. Uuganbadrakh as a candidate. They skim for proof of real hardware work, then dig into one project in depth.
- **Recruiters** who need name, role, location, availability and a contact route within seconds.
- **Collaborators** in robotics and electronics who want to see how he thinks: the kinematics, the architecture, the trade-offs.

## Product Purpose

A personal portfolio for D. Uuganbadrakh, electronics engineer (Ulaanbaatar, Mongolia). It exists to win roles and collaborations in embedded systems, robotics and automation, or IoT engineering. Success means a technical visitor leaves convinced he builds real, working systems end to end, and knows how to contact him.

## Positioning

He works across the whole signal chain, from sensor interface and firmware through control logic and kinematics to the operator's dashboard. The site proves it rather than claiming it: its interactive demos run his actual thesis inverse-kinematics method with the measured link geometry from his robot.

## Operating Context

Visitors arrive from a CV, LinkedIn or GitHub link, often on desktop, sometimes on a phone. Some save the page as a PDF. GitHub profile: https://github.com/saintbdrh.

## Capabilities and Constraints

- Single-page site built as one continuous 3D world (owner decision, 2026-11-27, after reviewing fojcikdominik.com): hero, vision, kinematics, project screens, Engineering Lab, profile, contact. Clean look: no CRT, glitch or scanlines.
- Must keep: the interactive workcell sorting demo (geometric IK), the project details, the capability map (skill ↔ project), copy-email, Save as PDF (print stylesheet), JSON-LD Person data, OG image, keyboard and screen-reader access, `prefers-reduced-motion` support.
- Dark-only theme (owner decision, 2026-11-23); the old light/dark toggle is retired. Print output stays light.
- The robot in the 3D world is a stylised model of the thesis Yahboom DOFBOT, built to its measured link lengths (owner decision, 2026-11-27). Every motion on the site is simulated and labelled as such.
- Simulations are always labeled as simulations; no physical-hardware demonstration exists on the site.

## Brand Commitments

- Name display: "D. Uuganbadrakh". Role: Electronics Engineer. Hero lines from the owner: "ELECTRONICS ENGINEER", "ROBOTICS & INTELLIGENT SYSTEMS", tagline "Engineering intelligence into motion."
- Palette pinned by the owner: background #080A0C, elevated surface #111417, primary text #F2F2EF, secondary text #8E949A, accent #91B7C7 (sparingly).
- Fonts pinned by the owner: Geist or Inter for UI; an editorial display face for large headings; monospace only for engineering data.
- Explicitly banned by the owner: glitch, RGB split, VHS, CRT, scanlines, flicker, heavy neon, cyberpunk, generic gradients, glassmorphism card grids, random floating objects, excessive particles, loud hovers, typewriter text, per-letter chaos, gratuitous loaders.

## Evidence on Hand

All from the incumbent `index.html` (commit d8d7858) and the owner's public repos:

- **Vision-guided 6-DOF pick-and-place robot** (bachelor's thesis, National University of Mongolia). Yahboom DOFBOT, Intel RealSense D435i, HSV segmentation, AprilTag fiducials, planar homography, host PC → Jetson Nano B01 over TCP port 5000, geometric IK. **2.8 mm mean camera-to-workspace calibration error.** Repo: https://github.com/saintbdrh/Vision-guided-robot-sorting. Measured geometry in `config.py`: L1 90, L2 83, L3 83, L4 79.6, L5 102.7 mm; joint limits Q1 ±135°, Q2 −40…100°, Q3 ±135°, Q4 ±160°; pitch-constrained two-branch geometric IK in `ik_core.py`.
- **DOFBOT hand gesture control.** MediaPipe hand tracking on a laptop maps gestures to base, shoulder, elbow, wrist and gripper; a Jetson Nano receiver drives the arm. Repo: https://github.com/saintbdrh/dofbot-hand-gesture-control.
- **Smart greenhouse.** Two ESP32 nodes over ESP-NOW; DHT22, LDR, soil moisture; relay-driven fans, pumps and grow lights; Wi-Fi web dashboard; Telegram alerts. Four monitored quantities.
- **Industrial conveyor safety system.** Siemens S7-1200, TIA Portal ladder logic, E-stop, light curtains, safety relays; parallel OpenCV vision layer on an embedded IPC (proximity, intrusion, misalignment); HMI with event log. **E-stop response < 50 ms.**
- Smaller builds: ESP32 smart waste bin controller; ESP32 Bluetooth A2DP audio player; Flask + Google Calendar OAuth 2.0 meeting-room OLED display.
- Also experienced with: ROS, MoveIt, Zephyr RTOS, LoRa, MQTT, Raspberry Pi, Verilog/VHDL for FPGA, CTF practice (TryHackMe, Hack The Box, picoCTF).
- Profile: Electronics Engineer at Brainstorm Holding (current); Electronics Engineering, National University of Mongolia (MTES / EHIT); tour guide and operations manager; completed mandatory military service. Languages: Mongolian (native), English (professional working), Russian (conversational). Interests: drone systems, open-source robotics, OSINT and ethical hacking.
- Contact: email already public on the incumbent site; GitHub saintbdrh.

**Absent, must not be fabricated:** photos or video of the physical builds, repositories for the greenhouse, conveyor and smaller builds, testimonials, employers' project details, any FPGA project, any numeric results beyond the two above.

## Product Principles

1. Proof over adjectives: every claim traces to a project, a number or a running demo.
2. Real mathematics: demos implement the actual method, with honest labels for what is simulated or illustrative.
3. The artifact leads: the robot and the engineering are the hero; the interface recedes.
4. Never trade usability for spectacle: text readable, navigation working, motion optional.

## Accessibility & Inclusion

WCAG 2.2 AA contrast; full keyboard operation of every demo; screen-reader labels and live regions for demo state; `prefers-reduced-motion` honored (no scroll-driven camera, no smoothing); a non-WebGL fallback that still presents all content.
