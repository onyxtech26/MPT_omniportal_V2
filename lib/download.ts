// Save a base64 payload as a file. V2 is a web app, so this is a plain browser
// download; the old Capacitor/native share path was removed with the mobile build.

function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function downloadBase64(b64: string, filename: string, mime: string) {
  const url = URL.createObjectURL(base64ToBlob(b64, mime));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
