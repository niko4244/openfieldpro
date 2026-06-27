# iPhone access via public tunnel

> **Windows required.** This script uses `Get-NetTCPConnection` + `$env:LOCALAPPDATA`
> + WinGet-canonical paths. macOS / Linux / WSL need a sibling script that
> targets `/api/tunnels` differently. Out of scope for this PR.

Expose your laptop's already-running Odysseus server (`127.0.0.1:7000`) to your
iPhone over a public HTTPS URL via [ngrok](https://ngrok.com). ngrok is
already installed on this laptop (WinGet). No iPhone-side install needed — you
open the URL in Safari.

## One-time setup

1. Sign up at https://dashboard.ngrok.com (free tier is OK for personal use).
2. Copy your authtoken from the dashboard.
3. From PowerShell on your laptop, run **once**:
   ```
   ngrok config add-authtoken <TOKEN>
   ```
   This writes to `%USERPROFILE%\.ngrok2\ngrok.yml`.

## Each time you want to use your iPhone

1. Make sure Odysseus is running on `127.0.0.1:7000` (e.g. `run_uvicorn.ps1`
   or your usual launcher). If it isn't, the tunnel script will boot it for
   you with `LOCALHOST_BYPASS=true AUTH_ENABLED=false`.
2. From the repo root, run:
   ```
   .\scripts\start-iphone-tunnel.ps1
   ```
3. The script prints a `https://…ngrok*.app` URL. Open that URL in iPhone
   Safari. Pin it to your Home Screen for one-tap access later.

## When you're done

```
.\scripts\stop-iphone-tunnel.ps1
```

Stops ngrok; leaves uvicorn running so local dev keeps working.

## Notes

- **Free tier URL is random per run.** Add `--domain=yourname.ngrok-free.app`
  to the `ngrok http 7000` invocation (paid tier) for a stable URL.
- **Ngrok free URLs are public** — anyone who knows (or guesses) the URL can
  hit your laptop. Treat as untrusted input. `LOCALHOST_BYPASS=true` skips the
  auth gate, so don't enable any side-effect-heavy endpoint while a tunnel is
  live.
- For a private (tailnet) alternative, `tailscale serve` is also installed; that
  keeps traffic confined to devices on your Tailscale network at the cost of a
  one-time Tailscale app install on the iPhone. Not the default here because
  you picked the *public* tunnel mode.
- Logs land at `./uvicorn.{out,err}.log` and `./ngrok.{out,err}.log` in the
  repo root. The current public URL is persisted to `./.ofp-tunnel-url` so the
  dashboard / other scripts can read it without re-polling ngrok.

## Files

| Path                                          | Role                              |
|---|---|
| `scripts/start-iphone-tunnel.ps1`             | Boots uvicorn + ngrok, prints URL |
| `scripts/stop-iphone-tunnel.ps1`              | Kills ngrok                       |
| `.ofp-tunnel-url`                             | Last-known public URL (text)      |
| `ngrok.{out,err}.log`                         | ngrok log streams (gitignored as `*.log`) |

## Repo hygiene

The runtime artifacts are pre-gitignored: `.ofp-tunnel-url` (the live URL),
`.ofp-store.json` (OFP route persistence — every POST/PUT/DELETE), and
`ngrok.{out,err}.log` (covered by the global `*.log` rule). Don't unignore
these without a reason — leaking the tunnel URL is unfixable (rotate the
ngrok tunnel) and leaking `.ofp-store.json` ships real user data.
