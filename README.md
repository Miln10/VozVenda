# VozVenda — App Desktop (Electron)

Sistema de reconhecimento de vendas por voz. Roda invisível em background no Windows.

## Estrutura

```
vozvenda-electron/
├── src/
│   ├── main.js          # Processo principal — gerencia tudo
│   ├── recorder.js      # Captura de áudio (janelas de tempo)
│   ├── recorder.html    # Página oculta com Web Speech API
│   ├── analyzer.js      # Envio para Gemini + análise
│   └── activation.html  # Tela de ativação de licença
├── assets/
│   ├── icon.ico         # Ícone do app (Windows)
│   └── tray-icon.png    # Ícone da bandeja (16x16)
└── package.json
```

## Como funciona

1. App inicia com o Windows (auto-launch)
2. Roda invisível — sem janela, sem taskbar
3. Aparece só na bandeja do sistema (system tray)
4. Captura áudio em janelas de tempo configuráveis
5. Filtra silêncio (VAD) + duração mínima + palavras-chave
6. Envia transcrição para Gemini API
7. Salva resultado no Supabase com timestamp
8. Dono acessa painel web remotamente

## Instalação (desenvolvimento)

```bash
npm install
npm start
```

## Build para Windows

```bash
npm run build
```
Gera instalador `.exe` em `/dist`.

## Variáveis necessárias (Supabase)

Configurar no `electron-store` ou via `.env`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Tabelas Supabase necessárias

### licenses
```sql
create table licenses (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  client_id uuid references auth.users,
  business_name text,
  gemini_key text,
  menu_items jsonb default '[]',
  active boolean default true,
  expires_at timestamptz,
  created_at timestamptz default now()
);
```

### transactions
```sql
create table transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  business_name text,
  categoria text,
  resumo text,
  vendas jsonb default '[]',
  alerta text,
  observacoes text,
  transcricao text,
  timestamp timestamptz default now(),
  device_id text
);
```

## Proteções anti-burla

- Roda como serviço invisível (show: false, skipTaskbar: true)
- Inicia automaticamente no boot via auto-launch
- Licença validada online — sem internet ou licença expirada = para
- Instância única (requestSingleInstanceLock)
- Dados criptografados localmente (electron-store com encryptionKey)
