// Shared "save a base64 payload as a file" helper: native share sheet on
// Capacitor (Android/desktop shell), anchor-click download in the browser.

function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function downloadBase64(b64: string, filename: string, mime: string) {
  const isNative = typeof window !== 'undefined'
    && !!(window as any)?.Capacitor
    && ((window as any).Capacitor.isNativePlatform?.() || (window as any).Capacitor.isNative);

  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or Share' });
      return;
    } catch {
      /* fall through to browser download */
    }
  }

  const url = URL.createObjectURL(base64ToBlob(b64, mime));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
