# PowerTrain XR — Demo Video Script

Target duration: **2 minutes 45 seconds**  
Maximum allowed: **under 3 minutes**  
Format: public YouTube video with spoken audio

## Recording setup

- Record on a laptop in landscape orientation at 1080p if possible.
- Use the public simulator so the URL is visible and judges know it is runnable.
- Close unrelated tabs and notifications.
- Turn simulator sound on, but keep it low enough that the narration is clear.
- Practice the breaker workflow once before recording.
- Speak naturally. Field credibility matters more than sounding like an advertisement.

## Shot list and narration

### 0:00–0:18 — Hook and problem

**Screen:** Public project landing page, then hover over “Launch the 3D motor floor.”

**Narration:**

> I’m Naythan Ward. I’ve been an electrician since 1998 and now lead electrical maintenance for critical public-water infrastructure. Industrial knowledge like this often lives in old drawings and in the experience of the people maintaining the equipment. PowerTrain XR turns that knowledge into a safe, interactive training environment.

### 0:18–0:38 — Enter the motor floor

**Screen:** Launch the 3D motor floor and slowly show the double-ended switchgear, field cabinet, motor, M-G set, pump, and valve.

**Narration:**

> This browser and WebXR simulator represents a medium-voltage synchronous motor system. It includes a complete double-ended bus, an exciter cabinet, motor protection, remote DCS control, a brushed synchronous motor, pump, and discharge valve.

### 0:38–1:18 — Breaker racking and lockout

**Screen:** Open **Breakers / RRS-1**, select `52-A1`, open the breaker, switch to the RRS-1 page, check the four setup items, rack from CONNECTED to TEST and then DISCONNECTED, return to Breaker / LOTO, and apply the yellow lock/tag.

**Narration:**

> Every breaker is operable. Here I open the motor feeder, complete the ArcSafe-style remote-racking checks, and move the drawout breaker through connected, test, and disconnected. I can then apply the simulated hasp, yellow isolation lock, and danger tag to this exact compartment.

### 1:18–1:32 — Demonstrate a consequence

**Screen:** Press CLOSE while locked, then show the blocked message. Briefly open the breaker-specific SOP.

**Narration:**

> This is not just animation. The lock blocks local closing, remote closing, automatic transfer, and even the reset-all shortcut. Each breaker also has its own training SOP and can launch the full group lockout exercise.

### 1:32–2:05 — Motor and protection

**Screen:** Use Reset only after properly restoring or use a pre-restored recording cut. Start the motor from DCS. Show M, M-G, 56/FAR, 41, the valve reaching 30%, and RUNNING. Open Training Inputs and raise motor vibration to `0.20`.

**Narration:**

> The motor start sequence coordinates the main contactor, M-G excitation set, field application relay, field contactor, discharge resistor, and the valve’s 45-second seal-in and 30-percent run permissive. Protection includes five bearing temperatures and motor and pump vibration. At point-two inches per second, the motor relay trips and latches until the actual cause is cleared.

### 2:05–2:35 — Explain Codex and GPT-5.6

**Screen:** Show the 3D scene, then the public project overview. Optionally overlay a brief image of the README architecture diagram.

**Narration:**

> I brought the equipment knowledge and operating judgment. GPT-5.6 and Codex translated my iterative feedback into the Three.js scene, shared state logic, protection, breaker interlocks, responsive controls, tests, and public deployment. The breakthrough was being able to operate each version like an electrician, explain what was wrong, and have Codex trace and correct the complete system.

### 2:35–2:52 — Impact and close

**Screen:** Finish on the motor floor with the public URL visible.

**Narration:**

> The goal is a platform that turns facility drawings, photographs, procedures, and veteran knowledge into safe training twins for utilities, hospitals, manufacturing, technical schools, and data centers. PowerTrain XR is live now and requires no login. Thank you.

## Must-show items

- The public project working in the browser
- Double-ended switchgear
- Breaker position changing twice
- A yellow lock/tag visibly applied
- A blocked unsafe command
- The synchronous motor sequence or protection trip
- Spoken explanation of how **GPT-5.6 and Codex** were used
- Public project URL at the end

## YouTube details

**Recommended title:** PowerTrain XR — OpenAI Build Week Demo  
**Recommended description:**

> PowerTrain XR is a browser and WebXR industrial training simulator built with GPT-5.6 and Codex for the OpenAI Build Week Education track. It converts expert electrical-maintenance knowledge into an operable digital twin for medium-voltage switching, synchronous motor controls, remote breaker racking, protection, troubleshooting, and lockout/tagout. Live demo: https://synchronous-pump-trainer.nayteward.chatgpt.site

Set visibility to **Public**, not Private or Unlisted, unless the official submission page explicitly confirms Unlisted is accepted as public-accessible.

