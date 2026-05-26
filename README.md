# Protect My Env - VS Code Extension

Esta extensão protege arquivos `.env` contra exposição visual acidental de dados sensíveis na tela (ideal para apresentações, compartilhamento de tela ou transmissões ao vivo) e fornece suporte para mitigar a leitura de credenciais por agentes de IA.

---

## ✨ Recursos

1. **Ocultação de Valores:** Oculta visualmente os valores das variáveis de ambiente com `••••••••` ou com comprimento customizado, mantendo as chaves legíveis.
2. **Ocultação de Comentários (Opcional):** Permite mascarar comentários de linha inteira (ex: `# Config`) e comentários inline (ex: `DB_PASS=123 # senha`). Comentários inline são revelados dinamicamente junto com o valor da sua variável correspondente.
3. **Ações Rápidas Inline (CodeLens):**
   - `👁️ Reveal KEY`: Revela individualmente o valor de uma variável específica e seu comentário inline.
   - `🙈 Hide KEY`: Mascara novamente a variável revelada.
   - `➕ Hide KEY`: Adiciona a variável selecionada às regras personalizadas de ocultação.
4. **Controles Globais do Editor:** Botões dedicados na barra de ferramentas do editor (canto superior direito) para **Revelar Tudo** (`👁️`) ou **Esconder Tudo** (`🙈`).
5. **Filtros por Padrões (Wildcards):** Oculte chaves usando padrões clássicos (ex: `*_SECRET`, `*_KEY`, `*_PASSWORD`, `*_TOKEN`).
6. **Mitigação de Agentes de IA:** Comando rápido na paleta de comandos para gerar ou atualizar regras no `.gitignore` e no `.copilotignore` para instruir os agentes de IA a ignorarem a indexação de arquivos de ambiente.

---

## ⚙️ Configurações (`settings.json`)

Você pode configurar o comportamento da extensão em suas configurações do VS Code:

* `protectMyEnv.obfuscationMode`: Define se deve ocultar todas as chaves (`all`) ou apenas aquelas que correspondem a regras/padrões (`pattern`). *Padrão: `"all"`*.
* `protectMyEnv.patterns`: Lista de padrões glob para ocultação (ex: `["*_SECRET", "*_KEY"]`). *Padrão: `["*_SECRET", "*_KEY", "*_PASSWORD", "*_TOKEN", "PASSWORD", "SECRET", "TOKEN", "KEY"]`*.
* `protectMyEnv.rules`: Lista exata de chaves a ocultar (gerenciada automaticamente ao clicar no CodeLens `➕ Hide KEY`).
* `protectMyEnv.maskCharacter`: Caractere visual de máscara. *Padrão: `"•"`*.
* `protectMyEnv.maskLength`: Número fixo de caracteres exibidos. Se configurado como `0`, o tamanho visual corresponderá ao comprimento real do valor da variável. *Padrão: `8`*.
* `protectMyEnv.protectComments`: Se habilitado (`true`), oculta visualmente comentários (linha inteira e inline) sob as mesmas regras de máscara. *Padrão: `false`*.

---

## 🚀 Como Executar e Depurar Localmente

1. Abra a pasta do projeto no VS Code.
2. Compile o código executando no terminal:
   ```bash
   npm run compile
   ```
3. Pressione a tecla **F5** no teclado para iniciar a janela **Extension Development Host**.
4. Abra o arquivo `test.env` contido na pasta raiz e experimente os CodeLenses e os botões de controle na barra de ferramentas.

---

## 🏗️ Comandos Disponíveis (Scripts)

* `npm run compile`: Compila o TypeScript em modo estrito.
* `npm run esbuild-base`: Empacota os arquivos TypeScript em um único bundle em `out/extension.js` via esbuild.
* `npm run watch`: Executa o bundler esbuild em modo de observação em background para auto-compilar a cada alteração.
* `npm run vscode:prepublish`: Compila e minifica o código para publicação/produção.

---

## 📦 Como Publicar ou Gerar Pacote VSIX

Para gerar o arquivo `.vsix` instalável para o VS Code:
1. Instale o utilitário `vsce` globalmente:
   ```bash
   npm install -g @vscode/vsce
   ```
2. Gere o pacote de distribuição:
   ```bash
   vsce package
   ```
3. O arquivo `protect-my-env-0.1.0.vsix` será gerado. Você pode instalá-lo diretamente no VS Code acessando a aba Extensions -> ícone de três pontos `...` -> **Install from VSIX...**.
