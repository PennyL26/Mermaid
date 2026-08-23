SheetJS (xlsx.full.min.js) — vendoring note
============================================

This delivery does NOT include a copy of xlsx.full.min.js in this folder,
because the environment that generated this app has no general internet
access and cannot fetch/verify third-party binaries.

What the app does instead (see index.html):
  1. It always tries to load ./vendor/xlsx.full.min.js first (a local file
     you provide — see below).
  2. If that file is missing, a small inline script in index.html detects
     the failed <script> load and automatically injects the CDN build
     instead (https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js),
     so the app still works immediately, as long as you're online.

To get FULL offline capability (required by spec §6), do this once:

  1. Download the file from either of these official sources:
       https://cdn.sheetjs.com/xlsx-0.18.5/package/dist/xlsx.full.min.js
       https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
  2. Save it as:
       vendor/xlsx.full.min.js
  3. Reload the app once while online so the service worker (sw.js) caches
     it for future offline use.

After that, the app will never need network access to read Excel files.
