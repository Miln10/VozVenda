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

// ── Estado ────────────────────────────────────────────────────────────
