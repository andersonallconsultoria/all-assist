@echo off
title Freitas Assist - Iniciar
cd /d "c:\Projetos Dev\all-assist"

echo Verificando o Docker...
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker nao esta rodando. Abrindo o Docker Desktop...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  echo Aguardando o Docker subir ^(pode levar ~1 minuto^)...
  :wait
  timeout /t 5 >nul
  docker info >nul 2>&1
  if errorlevel 1 goto wait
)

echo Iniciando o Freitas Assist...
docker compose up -d

echo.
echo ==========================================
echo   Freitas Assist iniciado com sucesso!
echo.
echo   Acesse no navegador:
echo   http://localhost:3010
echo ==========================================
echo.
pause
