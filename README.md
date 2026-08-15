# Saara

A desktop app that imports photos from an SD card, automatically groups them into events by timestamp, and copies or uploads each group to a local folder or Google Drive — without ever overwriting an existing file.

## Features

- **SD card import** — point it at a card or folder, it scans for photos, RAW files, and videos.
- **Automatic event grouping** — clusters files into events by time gaps between shots, with suggested names you can rename before copying.
- **Two destinations** — copy to a local folder, or upload straight to an app-managed folder in Google Drive.
- **Resumable, pausable Drive uploads** — a dropped connection pauses and resumes automatically; re-running a session skips files already uploaded instead of duplicating them.
- **Never overwrites** — existing files at the destination are always preserved; conflicts get a suffixed name instead of clobbering anything.

## Setup

### Install dependencies

```bash
npm install
```

### Google Drive (optional)

Local-folder destination works with no setup. To enable the Google Drive destination:

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a project (or reuse one).
2. **APIs & Services → Library** → enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill in app name/support email → under **Test users**, add the Google account(s) you'll sign in with (required while the app is in "Testing" status — avoids Google's app-verification review).
4. **APIs & Services → Credentials** → **Create Credentials → OAuth client ID** → type **Desktop app**.
5. Copy the generated **Client ID** and **Client Secret**.
6. Copy `.env.example` to `.env` in the project root and paste them in:

```
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
```

## Development

```bash
npm run dev
```

## Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## License

MIT — see [LICENSE](./LICENSE).
