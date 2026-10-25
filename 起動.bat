@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo 柳本幸子サイト 編集用プログラムを起動しています...
echo この黒い画面は、編集が終わるまで閉じないでください。
echo.
python server.py
pause
