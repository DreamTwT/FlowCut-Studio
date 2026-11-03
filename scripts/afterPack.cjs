/**
 * FlowCut Pro — Pure-JS PE Icon & Metadata Patcher (afterPack hook)
 *
 * Replaces legacy `rcedit-x64.exe` (which fails with `Fatal error: Unable to commit changes`
 * after Electron 33 `addWinAsarIntegrity` rewrites `.rsrc` or when 360安全卫士 / Defender scans `.exe`).
 * Uses pure-JavaScript `resedit` (bundled with electron-builder) with anti-virus lock retries.
 */
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const icoPath = path.join(context.packager.projectDir, 'desktop', 'icon.ico');

  if (!fs.existsSync(exePath) || !fs.existsSync(icoPath)) {
    return;
  }

  let resedit;
  try {
    resedit = require('resedit');
  } catch {
    // Fallback resolution when invoked from external builder cache
    try {
      resedit = require(require.resolve('resedit', { paths: [context.packager.projectDir] }));
    } catch {
      console.log('[afterPack] Skipped optional resedit icon patch (module not found).');
      return;
    }
  }

  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      // Brief pause on first attempt too so 360 / Defender finishes scanning newly created FlowCutPro.exe
      await sleep(attempt === 1 ? 350 : 650);

      const exeBuf = fs.readFileSync(exePath);
      const exe = resedit.NtExecutable.from(exeBuf);
      const res = resedit.NtExecutableResource.from(exe);

      // 1. Replace Application Icon Group with our 4-size desktop/icon.ico
      const iconFile = resedit.Data.IconFile.from(fs.readFileSync(icoPath));
      const iconGroups = resedit.Resource.IconGroupEntry.fromEntries(res.entries);
      const groupId = iconGroups.length > 0 ? iconGroups[0].id : 1;
      const lang = iconGroups.length > 0 ? iconGroups[0].lang : 1033;

      resedit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        groupId,
        lang,
        iconFile.icons.map((item) => item.data)
      );

      // 2. Update Windows File Properties / Task Manager title dynamically from package.json version
      const rawVer = String(context.packager.appInfo.version || '2.1.0')
        .split('-')[0]
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
      const [vMaj = 2, vMin = 1, vPatch = 0] = rawVer;

      const viList = resedit.Resource.VersionInfo.fromEntries(res.entries);
      if (viList.length > 0) {
        const vi = viList[0];
        const langs = vi.getAllLanguagesForStringValues();
        const targetLang = langs.length > 0 ? langs[0] : { lang: 1033, codepage: 1200 };
        vi.setFileVersion(vMaj, vMin, vPatch, 0, targetLang.lang);
        vi.setProductVersion(vMaj, vMin, vPatch, 0, targetLang.lang);
        vi.setStringValues(targetLang, {
          CompanyName: 'FlowCut Studio',
          FileDescription: '流剪矩阵 FlowCut Pro - 短视频批量混剪工作台',
          ProductName: '流剪矩阵 FlowCut Pro',
          InternalName: 'FlowCutPro',
          OriginalFilename: exeName,
          LegalCopyright: 'Copyright (C) 2026 FlowCut Studio',
        });
        vi.outputToResourceEntries(res.entries);
      }

      res.outputResource(exe);
      const outBuf = Buffer.from(exe.generate());
      fs.writeFileSync(exePath, outBuf);
      console.log(`[afterPack] Pure-JS resedit patched icon & metadata -> ${exeName}`);
      return;
    } catch (err) {
      if (attempt < 8) {
        console.log(
          `[afterPack] Waiting for antivirus scan lock on ${exeName} (retry ${attempt}/8)...`
        );
      } else {
        console.warn(
          `[afterPack] Notice: Antivirus locked ${exeName} (${err.message}); continuing NSIS packaging.`
        );
      }
    }
  }
};
