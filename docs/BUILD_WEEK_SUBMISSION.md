# OpenAI Build Week Submission Package

## Recommended project identity

**Project name:** PowerTrain XR  
**Subtitle:** Industrial Motor Training Digital Twin  
**Track:** Education  
**Tagline:** Turn decades of industrial electrical knowledge into an operable, headset-ready training environment.

## One-sentence pitch

PowerTrain XR is a Codex-built, browser and WebXR training simulator where electricians and operators can safely practice medium-voltage switching, synchronous motor controls, remote breaker racking, protection, troubleshooting, and lockout/tagout.

## Short description

PowerTrain XR converts legacy industrial knowledge into an interactive digital twin for technical training. Learners can operate a double-ended medium-voltage lineup, remotely rack and lock out breakers, start a brushed synchronous motor, follow its excitation and valve sequence, inject realistic faults, read protection targets, and recover safely. It runs in a browser, on mobile, or in a compatible VR headset without special software or a login.

## Inspiration

Industrial facilities depend on experienced electricians and operators who understand equipment that may be decades old. Much of that knowledge lives in old drawings, personal experience, and the memories of the people who have kept the equipment running. Static presentations cannot reproduce the decisions, consequences, and system interactions involved in real troubleshooting.

I have worked as an electrician since 1998 and now lead electrical maintenance for critical public-water infrastructure. I wanted a safer and more engaging way to transfer hard-earned field knowledge—especially for medium-voltage equipment, synchronous motors, protection, remote racking, and lockout/tagout. PowerTrain XR is the first working version of that idea.

## What it does

The simulator presents a complete industrial motor floor with:

- a double-ended 4.8 kV switchgear lineup with 16 feeder breakers and Main 1–Tie–Main 2;
- working local breaker controls and automatic transfer logic;
- remote racking through `CONNECTED`, `TEST`, and `DISCONNECTED` positions;
- usable yellow locks, hasps, danger tags, a group lockbox, and gated restoration;
- a single-speed 2,500 hp brushed synchronous motor, pump, and 36-inch discharge valve;
- an M-G excitation set, field application relay, field contactor, and discharge resistor;
- a motor protection relay with metering, targets, events, five RTDs, and vibration inputs;
- fault injection and latched trips that require the cause to be cleared before reset;
- DCS, field, and starter control authority; and
- a responsive 3D/WebXR scene with animated equipment and sound.

Every control operates against the same state model. A lock applied at one breaker blocks closing from the local panel, DCS, and automatic transfer logic. A learner can therefore see the system-level consequence of an action rather than interacting with disconnected mock controls.

## How we built it

I supplied the industrial knowledge: the control sequence, equipment relationships, protection expectations, operating problems, and corrections. GPT-5.6 and Codex translated that evolving specification into TypeScript, React, Three.js, WebXR, Web Audio, and responsive control interfaces.

The most important use of Codex was iterative engineering. I could review a working version as an operator, identify a real-world problem—such as a breaker being able to reclose while locked out, a tie lacking controls, a trip resetting incorrectly, or labels obscuring equipment—and have Codex trace the related state and visual code, implement the correction, validate it, and publish a new version. That feedback loop turned a written idea into a coherent simulator in days.

## Challenges

The hardest problem was keeping visual equipment and control logic synchronized. The motor can be commanded from multiple locations, the bus can transfer between sources, protection can trip independently, and LOTO must override every possible close path. A visually convincing breaker is not enough; all manual, remote, and automatic commands must respect its racked and locked state.

The project also had to remain usable on a laptop and mobile device while supporting a navigable Three.js/WebXR equipment room. We addressed that with one shared plant state, layered operator dialogs, responsive controls, and 3D objects that mirror the same state.

## Accomplishments

- Converted field experience and a legacy motor-control concept into a public, working simulator.
- Built a non-trivial interlocked state model rather than a scripted animation.
- Made 19 drawout breakers individually operable, rackable, lockable, and documented.
- Enforced trip-latch, reset, transfer, racking, and LOTO rules across control locations.
- Preserved advanced training systems—protection, RTDs, vibration, excitation, valve logic, DCS, and fault injection—inside a browser-delivered experience.
- Produced a project that a learner can immediately test without an account or rebuild.

## What I learned

Codex changes who can create specialized technical software. I am not a traditional software developer; I am a domain expert who knows how the equipment should behave. The most effective workflow was not asking AI to invent the system. It was operating each version, explaining where it differed from real equipment, and using Codex to make that knowledge explicit in code.

I also learned that training quality depends on consequences. A simulator becomes meaningful when the wrong action is blocked for the right reason, a trip remains latched until its cause is cleared, and restoration requires the correct sequence.

## What is next

The next version will turn PowerTrain XR into a configurable industrial-training platform. A facility could provide photographs, drawings, approved SOPs, and equipment data to create a private training twin. Planned features include instructor-authored scenarios, hidden faults, learner scoring, event playback, team sessions, and integration with plant digital-twin or SCADA training environments.

Potential users include water and wastewater utilities, hospitals, manufacturing plants, technical schools, apprenticeship programs, and data centers.

## Built with

GPT-5.6, Codex, Codex Sites, TypeScript, React, Three.js, WebXR, Web Audio API, Vinext, Vite, HTML, and CSS.

## Required submission links and identifiers

- **Live project:** https://synchronous-pump-trainer.nayteward.chatgpt.site
- **Direct 3D simulator:** https://synchronous-pump-trainer.nayteward.chatgpt.site/motor-floor-vr
- **Public YouTube demo:** `[ADD AFTER UPLOAD]`
- **Code repository:** `[ADD PUBLIC REPOSITORY OR SHARE PRIVATE REPOSITORY WITH JUDGES]`
- **Codex /feedback Session ID:** `[RUN /feedback IN THE PRIMARY BUILD SESSION AND PASTE ID]`

## Final Devpost checklist

- [ ] Choose **Education**.
- [ ] Paste the submission text above into the matching Devpost sections.
- [ ] Upload a public YouTube demo shorter than three minutes.
- [ ] In the video audio, explicitly explain both GPT-5.6 and Codex usage.
- [ ] Provide the live project URL.
- [ ] Provide a repository URL.
- [ ] If the repository is public, add the selected license.
- [ ] If private, share it with `testing@devpost.com` and `build-week-event@openai.com`.
- [ ] Confirm the README contains setup, testing, and judging instructions.
- [ ] Run `/feedback` in the primary Codex build session and paste the Session ID.
- [ ] Submit before **Tuesday, July 21, 2026 at 5:00 PM Pacific / 8:00 PM Eastern**.

