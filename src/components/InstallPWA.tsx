'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      console.log('PWA 安装提示已准备');
      setSupportsPWA(true);
      setPromptInstall(e);
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);

    // 检查是否已安装
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  const onClick = async (evt: React.MouseEvent) => {
    evt.preventDefault();
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
    const { outcome } = await promptInstall.userChoice;
    if (outcome === 'accepted') {
      setPromptInstall(null);
      setSupportsPWA(false);
    }
  };

  if (isInstalled) {
    return null;
  }

  if (!supportsPWA) {
    return null;
  }

  return (
    <button
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 border-2 border-[var(--atelier-ink)] bg-[var(--atelier-signal)] px-5 py-3 font-bold text-[#1d1b18] shadow-[4px_4px_0_var(--atelier-ink)] transition-transform hover:-translate-y-0.5"
      onClick={onClick}
      aria-label="安装应用"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-4-4m4 4l4-4M5 12h14" />
      </svg>
      安装应用
    </button>
  );
}
