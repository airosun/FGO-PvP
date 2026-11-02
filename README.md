# Grand Order PvP — online

A Fate/Grand Order-style PvP battler you play in the browser with friends.

- **Rooms of up to 6 people.** Create a room, share the 4-letter code or the invite link.
- **Battle queue and spectator stands.** The top two people in the queue fight; everyone else watches.
- **Winner stays on.** After a battle the winner can play the next challenger (or play again if nobody else is queued), or send everyone back to the lobby.
- **Hidden choices.** Battlefields, lineups, skills and cards stay private until both players lock in. Opponents see only each other's starters, not reserves. Spectators see both hands and both reserve lines.
- **Battle the CPU.** The host can fight a computer opponent, even alone in the room. The CPU drafts from measured servant strength, picks battlefields its team likes, and chooses each turn's cards by playing every option out on a private copy of the battle.
- **One-device mode** is still there from the landing page ("Play on one device instead").

## Run it locally

```bash
npm install
npm run dev        # builds public/index.html and starts the server on http://localhost:3000
```

## Deploy on Render

1. Push this folder to a GitHub repository.
2. On [render.com](https://render.com): **New → Blueprint**, pick the repository. Render reads `render.yaml` and creates a free web service.
   (Or **New → Web Service**: build command `npm install && npm run build`, start command `npm start`.)
3. Open the service URL, create a room and share the link.

Free Render services sleep after a period without traffic; the first visit after that takes a little while to wake up. Rooms live in the server's memory, so a restart or redeploy clears them.

## How it works

- `server.js` — Express + Socket.IO. Holds rooms, the battle queue and each match. It runs the same battle engine as the browser to check every pick, keeps hidden choices until both players have locked in, then broadcasts them.
- `src/` — the game: `engine.js` (rules), `kits.js` and `roster.json` (servant data), `ui.js` (screens, animations and the online client), `template.html` (styles and page shell), plus icons, scenes, role and description helpers, and `ai.js` / `cpu_power.json` for the CPU opponent.
- `build.js` — inlines everything from `src/` into `public/index.html`.

Every browser replays the same moves through the engine with the same random seed, so all screens show the identical battle. A refresh or a late spectator catches up by replaying the match so far.
