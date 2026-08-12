import { PwaStatus } from './types';

let deferredInstallPrompt: any = null;

export function registerServiceWorker(onStatusChange: (status: Partial<PwaStatus>) => void) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[PWA] ServiceWorker registration successful with scope: ', registration.scope);
          
          onStatusChange({
            hasServiceWorker: true,
            swState: registration.active ? 'activated' : 'installing'
          });

          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('[PWA] New content is available; please refresh.');
                  } else {
                    console.log('[PWA] Content is cached for offline use.');
                  }
                }
              };
            }
          };
        })
        .catch((err) => {
          console.error('[PWA] ServiceWorker registration failed: ', err);
          onStatusChange({
            hasServiceWorker: false,
            swState: 'none'
          });
        });
    });
  }

  // Handle BeforeInstallPrompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[PWA] beforeinstallprompt fired, prompt deferred');
    onStatusChange({ canInstall: true });
  });

  // Handle App installed event
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    console.log('[PWA] App successfully installed!');
    onStatusChange({ isInstalled: true, canInstall: false });
  });
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) {
    console.warn('[PWA] No deferred install prompt available');
    return false;
  }
  
  deferredInstallPrompt.prompt();
  const choiceResult = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  
  return choiceResult.outcome === 'accepted';
}
