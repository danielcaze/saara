<p align="center">
  <img src="src/renderer/src/assets/saara-logo.png" alt="Saara" height="80">
</p>

Saara is a desktop app for bringing order to a folder of photos. Point it at an SD card or any folder, review the groups it finds, then copy them to your computer or upload them to Google Drive.

It keeps the source files untouched and never overwrites a file at the destination.

## What Saara does

- Finds photos, RAW files, and videos in a folder and its subfolders.
- Groups files into moments based on the time between shots. You can rename groups, rename files, move photos between groups, and reorder them before exporting.
- Copies groups to a local folder or uploads them to a dedicated Google Drive folder.
- Lets interrupted Google Drive uploads resume safely. Running the same session again skips files that are already there.
- Shows video thumbnails and plays videos that your system can decode.

## Keeping groups and order

Each local group that Saara creates contains a small `.saara.json` file. It stores the group name and the order of its files.

When you later open that exported folder as a source, Saara finds those files and restores the same groups and order. If a folder has no `.saara.json` file, Saara simply groups its media by date as usual.

If you want the order to be visible outside Saara too, turn on **Prefix copied filenames with their order in Saara** in Settings. Local copies will use names like `0001_IMG_0001.JPG`. Existing matching prefixes are kept, so exporting the same files again does not create names such as `0001_0001_IMG_0001.JPG`.

Google Drive uploads keep the filenames you see in Saara.

## Getting started

Install the dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

## Google Drive setup

Using a local destination needs no extra setup. Google Drive is optional.

To connect Google Drive, create a Desktop OAuth client in the [Google Cloud console](https://console.cloud.google.com/):

1. Create a Google Cloud project, or choose one you already have.
2. In **APIs & Services**, enable the **Google Drive API**.
3. Open **OAuth consent screen**, choose **External**, and fill in the app details. While the app is in testing, add the Google accounts that should be allowed to sign in as test users.
4. Open **Credentials**, create an **OAuth client ID**, and choose **Desktop app**.
5. Copy the client ID and client secret into a `.env` file in the project root. You can start by copying `.env.example`.

```env
MAIN_VITE_GOOGLE_DRIVE_CLIENT_ID=
MAIN_VITE_GOOGLE_DRIVE_CLIENT_SECRET=
```

## Building installers

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## License

[MIT](./LICENSE)
