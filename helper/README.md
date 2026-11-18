# Harbor Helper

Node program that runs on the manager's Windows PC and drives an Android phone over adb (cable or Wi-Fi) for the
Pre-call module. The Harbor website reaches it through Harbor Bridge. It only listens on this PC (`127.0.0.1:47800`).

## Install

1. Put this folder somewhere it will stay, e.g. `C:\harbor-helper`.
2. Double-click `setup.bat`. It installs Node.js and the Android platform tools (adb) if they're missing, starts the
   helper, adds it to Windows startup and prints the helper token.
3. In the website: gear > Harbor Helper > paste the token > Save & test.
4. On the phone, turn on USB debugging (or Wireless debugging) and connect it. The Phone connection card at the bottom
   of the sidebar turns green.

`setup.bat` also installs `uiautomator2` with pip if Python is available (faster screen reads). Without Python the
helper falls back to plain adb.

## Day to day

It starts by itself when you log in. `restart-helper.bat` restarts it, `stop.bat` stops it, `start-visible.bat` runs
it in a console window. `test-dry-run.bat` runs a Pre-call dry run for one customer without sending anything.

- Log: `%USERPROFILE%\.harbor-helper\helper.log`
- Settings and token: `%USERPROFILE%\.harbor-helper\config.json`

The token is generated on first run on each PC and stays there. Don't share it.

## From the command line

```
npm start                                  run the server
npm run status
npm run token
node src/cli.js precall --mode dry --customer "Jane Doe" --date "Nov 13"
```

Requires Node 18 or newer.
