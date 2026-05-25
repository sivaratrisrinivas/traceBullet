# Prototype Notes

PROTOTYPE - delete or absorb after the visual direction is chosen.

## Question

What should TraceBullet look and feel like end to end when every screen has exactly one job?

The prototype shows the user flow from choosing a Sentry Issue ID, reading the Suspected Causing PR, checking Evidence, copying a Suggested Revert Command, and viewing the Machine Report.

## Direction

- Minimal instrument, not dashboard.
- One primary action per screen.
- Sparse copy, hard edges, warm status lights, and physical controls.
- Only keep facts that help a user decide the next step.

## Verdict

- Chosen direction: keep the one-action-per-screen instrument UI as the visual reference.
- Keep: sparse copy, hard-edged controls, warm status lights, the five-step flow, and only the facts needed for the next user decision.
- Remove: dashboard density, variant switchers, and any interface that hides the investigation behind a generic chatbot.
- Delete or promote plan: keep this prototype as a disposable visual reference while the real CLI-first implementation is built.
