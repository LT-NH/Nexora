"""临时：把 hooks/useTheme.ts 换成旧实现，验证回归测试有效性。用完即删。"""

import os
import shutil

SRC = r"C:\Users\lihaoqi\Desktop\nexora-preview\nexora-optimized\frontend\src\hooks"
cur = os.path.join(SRC, "useTheme.ts")
backup = os.path.join(SRC, "useTheme.context.bak")
old = os.path.join(SRC, "useTheme.old.ts.txt")

if not os.path.exists(backup):
    shutil.copyfile(cur, backup)  # 保存新实现
shutil.copyfile(old, cur)         # 换成旧实现
print("已切换为旧实现（新实现备份在 useTheme.context.bak）")
