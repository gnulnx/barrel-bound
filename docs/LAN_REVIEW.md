# LAN and game state review

Barrel Bound supports solo, shared-keyboard co-op, LAN co-op, and LAN alternating turns. One host owns LAN simulation and match state. Each browser sends controls for its assigned seat and renders the host's snapshots. Solo and shared-keyboard games run in that browser.

## Corrected behavior

- **Fresh games and reconnects have distinct meanings.** Selecting a new game with an old seat token ends that previous match and starts with the selected stage, three lives, zero score, fresh coins, hazards and checkpoints. Reloading or automatically reconnecting keeps the same suspended run. Every match has a unique ID; commands must also match the current turn, so commands from earlier games and handoffs are ignored.
- **Lost control connections pause play.** Controls previously arrived only when a key changed, allowing a broken connection to leave the previous movement held until the WebSocket heartbeat detected the failure. Clients now refresh held controls every 150 ms. The host pauses and clears both inputs after 1.5 seconds without the required player's controls. Both climbers are required in co-op; the active player is required in turn-taking.
- **Reserved seats stay reserved.** A new browser could previously reset an existing match when both players were offline, despite the advertised two-minute reservation. Seats now remain reserved until a participant explicitly ends or restarts the match, the game finishes, or a reservation expires.
- **Leaving during a disconnect remains an explicit cancellation.** The tab retains a cancellation marker until the host accepts a subsequent join. Starting again after Wi-Fi returns ends the old match rather than silently resuming it.
- **Old connection callbacks cannot change a new session.** Cancelled clients do not join or retry later, and late messages from an earlier socket or match are ignored. A replaced tab releases its local identity without ending the replacement tab's game. Reconnect and control timers stop when the session ends.
- **Turn dialogs do not focus End Game.** A watching player's first dialog button was End Game. Dialogs now focus a safe primary action or the dialog text, and repeated movement/jump keys from an earlier turn are ignored until released.
- **Pause works consistently.** Esc or P pauses and resumes LAN play for an eligible player. Losing focus pauses co-op as well as local and alternating play. Every pause, handoff and resume clears held controls.
- **Asynchronous scene loading respects cancellation.** An earlier local game launch cannot complete over a newer menu or game session. LAN callbacks also check that they belong to the current session.
- **Host updates request a reload.** A client with an incompatible network protocol cannot claim a seat. Reloading obtains the current hashed assets and matching protocol.

## State carried within a match

In alternating play, each player keeps a separate run, including score, stage, lives, checkpoint, coins, barrels and elapsed time. The inactive run stays frozen. A hit or a stage clear passes control to the other eligible player. An eliminated or finished player watches while the other completes their run.

In co-op, both players share the stage and score and keep independent controls and lives. Either player can ring the bell. A teammate with no lives rejoins the next stage with one life. Co-op advances through a ready screen between stages.

Finishing a match sends the final scores to both browsers and releases both seats immediately. Either player's End Game action ends the match for both. High score and sound preference are intentionally browser settings that survive new games; run progress does not.

## Verification

`npm test` covers simulation rules, client cancellation and reconnection, real WebSocket joins, explicit restarts with stale tokens, both offline seats, expiry, input timeout, turn isolation, separate co-op and alternating cabinets, final results, malformed packets, and serving only built assets.

`npm run test:browser` uses two separate Chromium processes, with one player in each. It exercises local modes, independent controls over LAN, pause from either co-op player, keyboard resume, focus loss, reloading the second player's tab, leaving and starting a fresh game, spectator input rejection, turn handoffs while holding Jump, separate stage progress, defeat and victory results, and returning to fresh solo play. Outcomes and screenshots are saved locally, outside Git history. Only the reviewed gameplay screenshot is included in the README.

The browser check moves a simulated player to a bell or applies a hit through the host's simulation to exercise transitions deterministically. It checks the resulting real network and browser behavior; it is not a difficulty or long-session human playtest.

## Running the reviewed game

Use one `npm start` process and its printed network address on both computers. Development or test hosts on other ports have independent matches. The static preview alone does not host a LAN match; the development proxy expects the regular host on port 4175.

Match state is held in host memory. Closing the host ends its matches. Reloading a tab within two minutes reclaims its seat; closing the tab for longer releases the match. Each LAN mode currently has one two-player cabinet rather than multiple named rooms.
