# Backend tests

Run the Node.js test suite from the project root:

```sh
node --test backend/test/*.test.js
```

The engine tests cover Gold wins, claim priority and ties, retained Chi, Kong
replacements, special chains, exhaustion and rejected actions. Full-wall scenarios
check unique physical tile ownership and conservation of all 144 tiles after each
transition. Claim deadlines use an injected clock without real sleeps.

Room and message tests cover waiting-room membership, readiness, disconnects and
invalid requests. Private game snapshots and active-round disconnect handling
remain for their later implementation tasks.
