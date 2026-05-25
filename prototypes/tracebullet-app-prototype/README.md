# TraceBullet App Prototype

PROTOTYPE - throwaway UI for seeing the TraceBullet app end to end before real implementation.

Question: What should the TraceBullet investigation experience look like when every screen has exactly one job?

Run it:

```bash
python3 -m http.server 4173 --directory prototypes/tracebullet-app-prototype
```

Then open:

```text
http://localhost:4173/?screen=issue
```

Flow:

- `issue` - choose the Sentry Issue ID
- `suspect` - read the Suspected Causing PR
- `evidence` - check the Evidence
- `command` - copy the Suggested Revert Command
- `machine` - inspect the Machine Report

This prototype uses only in-memory synthetic data. It does not query Coral, GitHub, Sentry, or Slack.
