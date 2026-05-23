/**
 * VozVenda — recorder.js
 * Captura áudio do microfone em janelas de tempo.
 * Usa Web Speech API via BrowserWindow oculta para transcrição.
 */

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let hiddenWindow = null;
let isRecording = false;
let onWindowComplete = null;

/**
 * Inicia a captura contínua de áudio.
 * @param {object} config - Configurações de captura
 * @param {function} callback - Chamado ao final de cada janela com (transcription, voiceSeconds)
 */
function start(config, callback) {
  if (isRecording) return;
  isRecording = true;
  onWindowComplete = callback;

  // Cria janela invisível com acesso ao microfone
  hiddenWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,           // invisível
    skipTaskbar: true,     // não aparece na barra de tarefas
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false  // não throttle em background
    }
  });

  // Carrega página de captura
  hiddenWindow.loadFile(path.join(__dirname, 'recorder.html'));

  // Inicia captura após carregar
  hiddenWindow.webContents.once('did-finish-load', () => {
    hiddenWindow.webContents.send('start-recording', config);
  });

  // Recebe resultado de cada janela
  ipcMain.on('window-result', (event, { transcription, voiceSeconds }) => {
    if (onWindowComplete && transcription?.trim()) {
      onWindowComplete(transcription, voiceSeconds);
    }
  });

  // Recebe erros
  ipcMain.on('recorder-error', (event, error) => {
    console.error('[Recorder]', error);
  });
}

/**
 * Para a captura de áudio.
 */
function stop() {
  isRecording = false;
  if (hiddenWindow && !hiddenWindow.isDestroyed()) {
    hiddenWindow.webContents.send('stop-recording');
    setTimeout(() => {
      if (hiddenWindow && !hiddenWindow.isDestroyed()) {
        hiddenWindow.destroy();
        hiddenWindow = null;
      }
    }, 1000);
  }
  ipcMain.removeAllListeners('window-result');
  ipcMain.removeAllListeners('recorder-error');
}

module.exports = { start, stop };
