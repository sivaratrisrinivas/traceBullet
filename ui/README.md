# TraceBullet UI

A precision incident instrument.

**Design direction**: Masaru Ibuka’s obsession with human-scale, inevitable tools + Teenage Engineering’s instrument-first minimalism. One primary action per screen. No cognitive debt. The interface should feel like a high-end measurement device, not software.

## Open

```text
ui/index.html
```

Or serve locally:

```bash
python3 -m http.server 4174 --directory ui
# then open http://localhost:4174
```

## Philosophy (non-negotiable)

- **One action per screen**. The left rail shows physical "positions" on the instrument. Each screen exists for exactly one decision or one piece of focused information.
- **Instrument, not dashboard**. Language and controls borrow from 1970s–80s precision equipment and modern boutique instruments (Sony research spirit × Teenage Engineering restraint).
- **Deterministic first**. The UI renders the same Machine Report the CLI produces. No narrative layer, no guessing.
- **Tactility through restraint**. Warm paper stock, machined details, confident orange-red accent, generous breathing room, physical-feeling primary controls.

## Controls

- `←` / `→` or `h` / `l` — move between positions
- `r` — reset to reference trace
- On the **LOCK** position you can paste a fresh `Machine Report` JSON (from the CLI) using the LIVE / REFERENCE switch

## Data

Ships with the live `CHECKOUT-4` Coral sandbox trace. Paste new output from:

```bash
node src/cli.ts investigate CHECKOUT-4 --source coral --json
```

The same contract is used by the agent tool and the CLI. The UI is a viewer, not a different source of truth.
