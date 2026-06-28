#!/bin/bash

# IBR Checklists — Script de Atualização
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   IBR Checklists — Atualizando...   ║"
echo "╚══════════════════════════════════════╝"
echo ""

echo "📦 Instalando dependências..."
npm install --silent
if [ $? -ne 0 ]; then
  echo "❌ Erro ao instalar dependências."
  read -p "Pressione Enter para fechar..."
  exit 1
fi

echo "🚀 Publicando na Vercel..."
npx vercel --prod
if [ $? -ne 0 ]; then
  echo "❌ Erro no deploy."
  read -p "Pressione Enter para fechar..."
  exit 1
fi

echo ""
echo "✅ App atualizado com sucesso!"
echo "   Link: https://ibr-checklists-app.vercel.app"
echo ""
read -p "Pressione Enter para fechar..."
