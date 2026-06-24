@echo off
title Freitas Assist - Parar
cd /d "c:\Projetos Dev\all-assist"

echo Parando o Freitas Assist...
docker compose stop

echo.
echo ==========================================
echo   Freitas Assist parado.
echo   Seus dados e a conexao do WhatsApp
echo   ficam salvos.
echo.
echo   Para ligar de novo, rode:
echo   iniciar-freitas.bat
echo ==========================================
echo.
pause
