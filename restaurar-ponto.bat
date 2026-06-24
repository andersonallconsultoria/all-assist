@echo off
title Freitas Assist - Restaurar ponto antes dos botoes
cd /d "c:\Projetos Dev\all-assist"
echo ============================================================
echo  RESTAURAR para o ponto ANTES da tentativa de botoes
echo  (Evolution v2.3.7 + menu numerado, tudo funcionando)
echo ============================================================
echo.
echo Isto vai:
echo  - Voltar o codigo para a tag ponto-restauro-pre-botoes
echo  - Voltar o docker-compose.yml (imagem v2.3.7)
echo  - Restaurar os dados e a sessao do WhatsApp
echo.
pause
echo Parando containers...
docker compose stop
echo Restaurando codigo...
git checkout ponto-restauro-pre-botoes -- src public docker-compose.yml 2>nul
copy /Y docker-compose.pre-botoes.yml docker-compose.yml
echo Restaurando dados...
rmdir /S /Q data
xcopy /E /I /H /Y data-backup-pre-botoes data >nul
echo Subindo containers...
docker compose up -d --build
echo.
echo ============================================================
echo  Restaurado! Acesse: http://localhost:3010
echo ============================================================
pause
