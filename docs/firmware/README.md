# Firmware and privacy verification matrix

Firmware/app scope audited on 2026-10-20: website foundation plus sibling `iot/README.md` planning placeholder. No supported board, wiring, firmware source/build, IMU driver, motor control, local-summary implementation or physical device is available. There is no firmware version to report. No signal algorithm is inferred from backlog titles. Hardware and simulated firmware tests therefore remain blocked by E12-11/-13/-12/-14/-15; creating plausible sample values would not verify these dependencies.

| Case | Expected requirement | Evidence category | Actual outcome |
|---|---|---|---|
| Voluntary capacity rejects sensorData, strainReason, healthStatus, wearableSummary | 400, no authoritative data from wearable fields | Automated website software/API | Covered by executed artisan/E16 integration cases |
| Capacity requires explicit artisan processing consent and active craft skill | Forbidden without consent; no implicit upload | Automated website software/API | Executed owner/replay tests; persisted revision checks |
| Assisted access requires scoped consent and revocation takes effect | No cross-user capacity exposure/mutation | Automated website integration/browser | Executed delegation/revocation tests |
| Outbox excludes snapshots, reasons and wearable values | Only approved metadata columns | Automated software/API/DB | Executed sentinel-reason test; no JSON event payload |
| Valid/invalid/NaN IMU signal and threshold edges | Follow implemented device contract | Simulated firmware | BLOCKED: no firmware algorithm/build or fixture contract |
| Rest/reset, cooldown, false reminders | Follow implemented reminder policy | Simulated and observed device | BLOCKED: no reminder implementation |
| Motor/vibration and power behavior | Verified actuator behavior | Physical hardware | BLOCKED: no device, wiring or firmware |
| Disconnect/reconnect and offline local summary | Preserve local control/privacy | Simulated and physical | BLOCKED: no communication/local-summary implementation |
| Local deletion | Confirm actual device storage deletion | Observed/physical | BLOCKED: no device storage contract |
| Network non-upload | Packet capture proves individual signals stay local | Observed traffic on device/app | BLOCKED: no wearable app/build/traffic source |
| Physical accuracy and sustained-device behavior | Measurements recorded by operator with device/build IDs | Physically verified hardware | BLOCKED; no measurements made |

Software schema rejection is not evidence of device network non-upload. No simulator, physical measurement, verified hardware result or medical efficacy result is claimed. When hardware becomes available, record board/firmware commit, wiring, configuration, threshold fixtures, expected/observed behavior, raw traffic-capture reference and operator/date separately for each row. Wearable personal signals must never enter commercial events, analytics or settlement. Future capacity remains voluntary rather than sensor-derived.
