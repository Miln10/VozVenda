/**
 * VozVenda — main.js
 * Processo principal. Roda invisível em background no Windows.
 * 
 * Proteções:
 * - Invisível (sem janela, sem taskbar)
 * - Auto-launch no boot do Windows
 * - Atualização automática silenciosa
 * - Licença validada online
 * - Instância única
 */

const { app, ipcMain, Notification, Tray, Menu, nativeImage, shell, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const { createClient } = require('@supabase/supabase-js');
const recorder = require('./recorder');
const analyzer = require('./analyzer');

// ── Config persistente (criptografada no disco) ───────────────────────────
const store = new Store({ encryptionKey: 'vozvenda-k3y-2024' });

// ── Supabase ──────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://qnyfxlcyhufwvbwdcsqz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFueWZ4bGN5aHVmd3Zid2Rjc3F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTM2MzIsImV4cCI6MjA5NTEyOTYzMn0.Kr7tyo1jEXxUFCGED3GcASecs97lM-V0AZ5Xufa7OI4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Estado ────────────────────────────────────────────────────────────────
let tray           = null;
let isRunning      = false;
let currentSession = null;
let licenseValid   = false;

// ─────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {

  // 1. Esconde do dock (macOS) e impede que fechar janelas encerre o app
  app.dock?.hide();

  // 2. Garante instância única
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }

  // 3. Configura auto-launch no Windows
  await setupAutoLaunch();

  // 4. Configura atualizações automáticas
  setupUpdater();

  // 5. Valida licença
  licenseValid = await validateLicense();

  if (!licenseValid) {
    setupTray(false);
    openActivationWindow();
    return;
  }

  // 6. Tudo OK — inicia escuta
  setupTray(true);
  startRecording();
});

// ─────────────────────────────────────────────────────────────────────────
// AUTO-LAUNCH
// ─────────────────────────────────────────────────────────────────────────
async function setupAutoLaunch() {
  try {
    const launcher = new AutoLaunch({
      name: 'VozVenda',
      path: process.execPath,
      isHidden: true,
    });

    const enabled = await launcher.isEnabled();
    if (!enabled) await launcher.enable();
  } catch (e) {
    console.error('[AutoLaunch]', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// AUTO-UPDATER (atualização silenciosa)
// ─────────────────────────────────────────────────────────────────────────
function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall(true, true);
  });

  autoUpdater.on('error', () => {});

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────
// SYSTEM TRAY
// ─────────────────────────────────────────────────────────────────────────
function setupTray(active) {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('VozVenda');
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'VozVenda', enabled: false },
    { label: isRunning ? '🟢 Escutando' : '🔴 Pausado', enabled: false },
    { type: 'separator' },
    {
      label: isRunning ? 'Pausar escuta' : 'Retomar escuta',
      click: () => { isRunning ? stopRecording() : startRecording(); }
    },
    { label: 'Ver painel online', click: () => shell.openExternal('https://vozvenda.app/dashboard') },
    { type: 'separator' },
    { label: `Versão ${app.getVersion()}`, enabled: false },
    { label: 'Sair', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(isRunning ? 'VozVenda — Escutando...' : 'VozVenda — Pausado');
}

// ─────────────────────────────────────────────────────────────────────────
// VALIDAÇÃO DE LICENÇA
// ─────────────────────────────────────────────────────────────────────────
async function validateLicense() {
  try {
    const key = store.get('license_key', '');
    if (!key) return false;

    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('key', key)
      .eq('active', true)
      .single();

    if (error || !data) return false;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return false;

    currentSession = {
      clientId:     data.client_id,
      businessName: data.business_name,
      geminiKey:    data.gemini_key,
      menuItems:    data.menu_items || [],
      windowSize:   data.window_size || 60,
      minVoice:     data.min_voice   || 5,
      keywordMode:  data.keyword_mode || 'soft',
    };

    await supabase.from('devices').upsert({
      license_key: key,
      client_id:   data.client_id,
      device_id:   getDeviceId(),
      last_seen:   new Date().toISOString(),
      app_version: app.getVersion(),
    }, { onConflict: 'device_id' });

    return true;
  } catch (e) {
    console.error('[License]', e.message);
    return store.get('last_valid', 0) > Date.now() - 86400000;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GRAVAÇÃO
// ─────────────────────────────────────────────────────────────────────────
function startRecording() {
  if (isRunning || !currentSession) return;
  isRunning = true;

  recorder.start(currentSession, async (transcription, voiceSeconds) => {

    if (voiceSeconds < (currentSession.minVoice || 5)) return;

    if ((currentSession.keywordMode || 'soft') === 'strict' && !hasKeyword(transcription)) return;

    try {
      const result = await analyzer.analyze(transcription, currentSession);
      if (!result || result.categoria === 'none') return;

      await saveTransaction(result, transcription);

      if (result.categoria === 'fraud') {
        notify('⚠️ VozVenda', result.alerta || 'Alerta detectado — verifique o painel.');
      }

      store.set('last_valid', Date.now());

    } catch (e) {
      console.error('[Analyzer]', e.message);
    }
  });

  updateTrayMenu();
}

function stopRecording() {
  if (!isRunning) return;
  isRunning = false;
  recorder.stop();
  updateTrayMenu();
}

// ─────────────────────────────────────────────────────────────────────────
// SALVAR TRANSAÇÃO
// ─────────────────────────────────────────────────────────────────────────
async function saveTransaction(result, transcription) {
  try {
    await supabase.from('transactions').insert({
      client_id:     currentSession.clientId,
      business_name: currentSession.businessName,
      categoria:     result.categoria,
      resumo:        result.resumo,
      vendas:        result.vendas || [],
      alerta:        result.alerta,
      observacoes:   result.observacoes,
      transcricao:   transcription,
      device_id:     getDeviceId(),
      app_version:   app.getVersion(),
      timestamp:     new Date().toISOString(),
    });
  } catch (e) {
    const queue = store.get('offline_queue', []);
    queue.push({ result, transcription, ts: new Date().toISOString() });
    store.set('offline_queue', queue.slice(-100));
  }
}

setInterval(async () => {
  const queue = store.get('offline_queue', []);
  if (!queue.length) return;
  const failed = [];
  for (const item of queue) {
    try {
      await supabase.from('transactions').insert({
        client_id:     currentSession?.clientId,
        business_name: currentSession?.businessName,
        categoria:     item.result.categoria,
        resumo:        item.result.resumo,
        vendas:        item.result.vendas || [],
        alerta:        item.result.alerta,
        observacoes:   item.result.observacoes,
        transcricao:   item.transcription,
        device_id:     getDeviceId(),
        timestamp:     item.ts,
      });
    } catch {
      failed.push(item);
    }
  }
  store.set('offline_queue', failed);
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────
// TELA DE ATIVAÇÃO
// ─────────────────────────────────────────────────────────────────────────
function openActivationWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 300,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    frame: true,
    title: 'VozVenda — Ativação',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'activation.html'));
}

ipcMain.on('retry-activation', async () => {
  licenseValid = await validateLicense();
  if (licenseValid) {
    BrowserWindow.getAllWindows().forEach(w => w.close());
    setupTray(true);
    startRecording();
  } else {
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('activation-failed');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────
const BASE_KEYWORDS = [
  'quanto','preço','preco','custa','valor','pagar','troco','cartão','cartao',
  'pix','quero','me dá','me da','pedido','combo','lanche','suco','água','agua',
  'bebida','frango','carne','reais','r$','não tem','acabou','desconto'
];

function hasKeyword(text) {
  const lower = text.toLowerCase();
  const menuKws = (currentSession?.menuItems || []).map(i => i.name?.toLowerCase().split(' ')[0]).filter(Boolean);
  return [...BASE_KEYWORDS, ...menuKws].some(k => lower.includes(k));
}

function getDeviceId() {
  let id = store.get('device_id');
  if (!id) { id = 'dev_' + Math.random().toString(36).substr(2, 16); store.set('device_id', id); }
  return id;
}

function notify(title, body) {
  try { new Notification({ title, body, silent: true }).show(); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {});
app.on('before-quit', () => recorder.stop());
app.on('second-instance', () => {});
