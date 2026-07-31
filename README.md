# LifeOS V1.2

PWA local-first para organizar o dia em tres essenciais, concluir com pouco atrito e recuperar o que nao coube sem culpa.

Esta versao foi alinhada a `Biblia_LifeOS_v1_0_Atualizada.docx`, usando a tela Hoje como nucleo da experiencia.

## O que funciona

- Tela **Hoje** com no maximo tres missoes essenciais visiveis.
- Tarefa em foco com conclusao em um toque, feedback curto, XP e ouro.
- Opcionais recolhidas para proteger a rotina principal.
- Criacao estruturada com sugestao de area, tamanho e tipo.
- Se ja houver tres essenciais, novas tarefas entram como opcionais.
- Limite de uma tarefa grande essencial por dia.
- Recuperacao inteligente: reduzir, remarcar ou arquivar sem punicao.
- Fechamento diario com energia simples e bonus de dia completo.
- Fechamento semanal com consistencia flexivel.
- Seis areas oficiais: Trabalho/Estudo, Saude/Energia, Casa/Rotina, Financas, Relacoes e Criacao/Projetos.
- Personagem unico, nivel geral, atributos, conquistas basicas, ouro e cristais.
- Catalogo de recompensas pessoais com custo explicito e preco progressivo por repeticao no dia.
- Backup e restauracao em JSON.
- IndexedDB com fallback para localStorage.
- PWA instalavel com cache offline.
- Tema claro/escuro, foco visivel e opcao de reduzir movimento.

## Fora da V1

- Login e sincronizacao em nuvem.
- Integracoes com calendario, Gmail, Drive ou Classroom.
- IA remota.
- Ranking social, comunidade, compra de moedas ou marketplace.
- Avatar complexo, arvore de habilidades, combate ou inventario extenso.

## Testar no computador

Abra a pasta em um servidor local. No Windows, com Python instalado:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

Para validar PWA e Service Worker, use HTTP/HTTPS em vez de abrir o `index.html` diretamente.

## Publicar no GitHub Pages

1. Envie os arquivos desta pasta para a branch `main`.
2. Abra `Settings > Pages`.
3. Em `Source`, escolha `Deploy from a branch`.
4. Selecione `main` e `/ (root)`.
5. Abra o endereco fornecido pelo GitHub.

## Dados

Os dados ficam no navegador/aparelho. Antes de limpar dados do Chrome, trocar de aparelho ou substituir o app, use **Perfil > Exportar JSON**.

## Arquivos

- `index.html`: estrutura da PWA.
- `styles.css`: interface responsiva e temas.
- `app.js`: dados, regras, navegacao e persistencia.
- `manifest.webmanifest`: instalacao.
- `sw.js`: cache offline.
- `icons/`: icones do app.
