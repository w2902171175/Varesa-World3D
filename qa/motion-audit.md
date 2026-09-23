# Varesa motion audit

This audit uses the original `assets/character/official/瓦雷莎.pmx`, its 34,917 vertices, 328 bones, real bind matrices, and real skin weights. Tests replace only image/material loading with basic materials. They do not use a simplified skeleton.

## Root cause in the earlier controller

The visible legs are weighted to the PMX deformation chains named `足D`, `ひざD`, and `足首D`. The earlier controller rotated `足`, `ひざ`, and `足首` but never evaluated the model's 26 grant relationships. All six of those control bones have zero direct skin weight. The left deformation thigh/knee/ankle have approximately 426 / 912 / 430 equivalent vertices of weight; the right have 358 / 829 / 431. Therefore an apparently changing gait state and rotating control bones did not establish that any leg skin was moving.

A regression fixture explicitly rotates the original left thigh control: the sampled weighted leg vertices remain unchanged. Copying its rotation to the matching D bone moves actual leg geometry by more than 20 cm. The replacement controller must transfer the solved rotations and update descendant matrices in the same frame.

Two additional problems in the earlier code amplify stiffness: several arm/body bones were slerped toward a base pose and an action pose during the same frame, producing a time-step-dependent compromise; the final hand CCD solve bypassed those blends and could move a hand abruptly when an action began. Old cadence scaling also stopped increasing at 1.35×, below the ratio between the outdoor walking speed (2.35 m/s) and its assumed walking speed (1.6 m/s).

## Automated verification

Run `node --test tests/character-motion.test.mjs` from the project directory. The suite checks:

- Actual weighted leg vertex displacement and control/D-chain world-transform agreement.
- Stable idle after walking, without accumulated grant rotations.
- A planted ankle remaining near its world contact at the actual outdoor walk speed.
- No advancing walking cycle when collision rejects all world travel.
- Maximum per-frame skinned-vertex displacement through starts, stops, and a moving turn.
- Finite normalized bones, skinning matrices, facial morphs, and deformed vertices while walking slowly, running, jumping, holding an umbrella, eating, drinking, and cycling.
- Upright, metre-sized hand sockets and bounded action-transition displacement.
- Closely matching real skinned poses for equal travel at 30, 60, and 120 Hz.

Status: all 9 motion tests pass against the replacement controller. The ninth regression covers initial spawn translation/rotation and foot contact after mounting and dismounting. The full project suite contains 43 passing tests.

| Check | Measured result |
| --- | --- |
| Real weighted leg excursion during walking | 0.2253 m maximum RMS; 0.3164 m maximum sampled vertex excursion |
| Idle drift after settling | 0.003149 m RMS |
| Planted contact at 2.35 m/s | 120 / 120 sampled frames retain a planted ankle |
| Maximum 60 Hz start/stop/turn vertex step | 0.096611 m |
| Maximum 60 Hz action hand step | 0.123596 m |
| Running elbow angle, shoulder/elbow/wrist world joints | Left 57.79–94.96°, right 56.93–94.07°; both bent in 45 / 45 settled frames |
| Maximum 30 / 60 Hz skin-pose difference | 0.037289 m RMS |
| Maximum 60 / 120 Hz skin-pose difference | 0.021193 m RMS |

The tests also found and drove corrections to three transition issues during implementation. Touchdown initially captured the previous frame's swing point, producing frame-rate-dependent landing positions. Completing a step after stopping initially overshot its contact boundary by a whole time step. The first recovery step could leave a knee at full extension and then bend it abruptly. Exact contact-time evaluation, bounded stopping phase, and earlier recovery toe-off corrected those failures. A direct eating-to-cycling arm override was also replaced with a continuous layer transition.

The source model's grant records are all rotational, and their rest bone quaternions are identity. The implemented ordered rotational pass therefore covers every grant present in this PMX, including the negative waist/shoulder cancellation ratios and partial knee/arm inheritance. Tests verify the solved control and D-chain world transforms agree rather than assuming that control rotations imply visible deformation.
