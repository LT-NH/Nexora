"""临时：还原旧的 useBranding（直接写 dark class），验证用例 5 能抓到回归。用完即删。"""

import os
import shutil

SRC = r"C:\Users\lihaoqi\Desktop\nexora-preview\nexora-optimized\frontend\src\hooks"
cur = os.path.join(SRC, "useBranding.ts")
backup = os.path.join(SRC, "useBranding.new.bak")

OLD = '''import { useEffect } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';

export const useBranding = () => {
  const { currentWorkspace } = useWorkspace();
  useEffect(() => {
    const color = currentWorkspace?.brand_color || '#7C3AED';
    const brandDark = currentWorkspace?.brand_dark_mode ?? false;
    const root = document.documentElement;
    root.style.setProperty('--brand-color', color);
    let userTheme: string | null = null;
    try { userTheme = localStorage.getItem('nexora-theme'); } catch {}
    if (userTheme === 'light') {
      root.classList.remove('dark');
    } else if (userTheme === 'dark') {
      root.classList.add('dark');
    } else {
      if (brandDark) root.classList.add('dark');
      else root.classList.remove('dark');
    }
  }, [currentWorkspace]);
};
'''

if not os.path.exists(backup):
    shutil.copyfile(cur, backup)
open(cur, "w", encoding="utf-8").write(OLD)
print("已切回旧版 useBranding（新实现备份在 useBranding.new.bak）")
