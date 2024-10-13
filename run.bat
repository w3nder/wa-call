@echo off
cd C:\Users\Wender\Downloads\electron-v12.2.0-win32-x64
electron.exe --disable-sandbox --enable-logging ..\..\dist\voip\index.js
pause
