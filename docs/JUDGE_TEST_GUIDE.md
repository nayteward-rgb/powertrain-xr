# Judge Test Guide

## Fast path: 3–5 minutes

Live simulator: https://synchronous-pump-trainer.nayteward.chatgpt.site/motor-floor-vr

### 1. Test drawout-breaker interlocks

1. Select **Breakers / RRS-1**.
2. Select `52-A1 · Synchronous Motor Feeder`.
3. Press **OPEN / TRIP**.
4. Select **ArcSafe RRS-1**.
5. Complete all setup checks.
6. Press **RACK OUT** twice to reach `DISCONNECTED`.
7. Return to **Breaker / LOTO** and apply the yellow lock, hasp, and tag.
8. Attempt **CLOSE**. The command should be blocked.

### 2. Test group lockout/tagout

1. From the same breaker, select **Run full group LOTO**.
2. Follow the gated seven-step workflow.
3. Verify the try-start is blocked and restoration cannot occur until workers and locks are accounted for.

### 3. Test the motor sequence

1. Complete the release procedure and rack `52-A1` back to `CONNECTED`.
2. Close `52-A1`.
3. Select DCS/Remote control and press **START**.
4. Observe the M contactor, M-G set, 56/FAR, 41 field contactor, field-discharge resistor, valve, and RUNNING state.

### 4. Test protection

1. Open **Training inputs**.
2. Set any bearing to 75°C for alarm and 85°C for latched trip, or set vibration to `0.20 in/s RMS`.
3. Attempt reset while the condition remains active; reset should be blocked.
4. Normalize the input and reset the motor relay.

## What demonstrates technical depth

- One shared plant state drives both the 3D scene and every control surface.
- Multiple command origins respect the same authority and safety rules.
- Drawout position and lock state override local, remote, automatic-transfer, and reset paths.
- Trips are cause-dependent and latched rather than temporary UI messages.
- The simulator is directly runnable without accounts, sample data, or external APIs.

## Safety note

This is a training representation, not a switching order, approved LOTO procedure, or energized-work authorization.
