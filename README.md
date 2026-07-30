# LifeOS MVP v0.1

PWA local-first construída para uso pessoal no celular e publicação no GitHub Pages.

## O que já funciona

- Tela **Hoje** com Missão Ativa, próximo passo e mapa do dia.
- Troca manual da Missão Ativa.
- Passos sequenciais com dependências e bloqueios.
- Conclusão com XP, ouro, atributos, vibração, animação e **Desfazer**.
- Conclusão automática da missão e bônus final.
- Personagem único, níveis, prestígio, atributos e barras de progresso.
- Captura de **Ideia, Lembrete, Missão e Campanha**.
- Classificação e sugestões locais baseadas em regras, sem chave de API.
- Inbox e Modo Estratégico.
- Objetivos Permanentes → Campanhas → Missões → Passos.
- Loja editável com desbloqueio semanal, custo progressivo e saldo negativo configurável.
- Conquistas e cristais.
- Backup JSON, restauração e migração básica de dados antigos.
- IndexedDB com fallback para localStorage.
- PWA instalável e funcionamento offline.

## Limite desta versão

A “inteligência” atual é local e baseada em regras. IA generativa real, Google Calendar, Gmail, Drive e Classroom precisam de backend seguro e autenticação. Nenhuma chave secreta deve ser colocada em um repositório público.

## Testar no computador

Abrir a pasta em um servidor local. No Windows, com Python instalado:

```bash
python -m http.server 8000
```

Depois abrir:

```text
http://localhost:8000
```

Não abra apenas clicando no `index.html`, porque Service Worker e instalação PWA exigem HTTP/HTTPS.

## Publicar no GitHub Pages

1. Crie um repositório público.
2. Envie **os arquivos desta pasta**, deixando `index.html` na raiz.
3. Abra `Settings → Pages`.
4. Em `Source`, escolha `Deploy from a branch`.
5. Selecione `main` e `/ (root)`.
6. Abra o endereço fornecido pelo GitHub.
7. No Chrome Android, use `⋮ → Instalar app` ou `Adicionar à tela inicial`.

## Dados

Os dados ficam apenas no navegador/aparelho. Antes de limpar dados do Chrome, trocar de aparelho ou substituir o app, use:

`Mais → Exportar backup`

## Arquivos

- `index.html`: estrutura da PWA.
- `styles.css`: interface mobile-first.
- `app.js`: dados, regras, navegação e persistência.
- `manifest.webmanifest`: instalação.
- `sw.js`: cache offline.
- `icons/`: ícones do app.
