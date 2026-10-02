# Office Ludo (ഓഫീസ് ലുഡോ)

Private multiplayer Ludo for up to 8 people, played on each person's own phone.

## Folder layout (keep exactly like this)
- .github/workflows/build-apk.yml  -> builds the APK on GitHub
- www/index.html                   -> the game (Malayalam, office theme, sound selector)
- assets/                          -> app icon (3 PNG files)
- server/                          -> multiplayer server (deploy on Render, NOT part of the APK)
- package.json, capacitor.config.json

## 1. Get the APK
1. Upload everything (except the server folder if you like) to a private GitHub repo.
2. Actions tab -> Build APK -> Run workflow.
3. When it turns green, open the run, download "office-ludo-apk" under Artifacts, unzip, install app-debug.apk.

## 2. Start the multiplayer server (once)
1. render.com -> New -> Web Service -> connect the repo.
2. Root Directory: server | Build Command: npm install | Start Command: npm start | Plan: Free.
3. Copy the address Render gives you, e.g. https://office-ludo.onrender.com

## 3. Tell the app where the server is
Either edit www/index.html: DEFAULT_SERVER = "wss://office-ludo.onrender.com" (wss:// not https://)
and build again, or type it once in the app under "സെർവർ വിലാസം".

The free server sleeps when idle; the first connection can take about 30 seconds.

## Changing sounds
Players pick sounds in the app (ശബ്ദങ്ങൾ button). To add new sounds, edit the SND block near the top
of the script in www/index.html and the LBL list (Malayalam names) just below it.
