@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo ===================================================
echo DEGERLER EGITIMI: CINARALTI HATIRALARI VR SUNUCUSU
echo Lutfen bu siyah pencereyi kapatmayin! Kapatirsaniz 3D yayin durur.
echo ===================================================
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:8000"
python -m http.server 8000
pause
