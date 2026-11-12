// Draws a ticket's QR code. The drawing library is loaded the first time a
// ticket is shown. If it cannot load, the ticket shows its code in words,
// which the host can type in at the door.

const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';

let libraryPromise = null;

function loadLibrary() {
  if (libraryPromise === null) {
    libraryPromise = import(LIBRARY_URL)
      .then((module) => module.default ?? module)
      .catch((error) => {
        libraryPromise = null;
        throw error;
      });
  }
  return libraryPromise;
}

/**
 * @param {string} code the ticket's code (letters and numbers only)
 * @returns {Promise<string | null>} an SVG picture of the QR code, or null
 */
export async function qrSvg(code) {
  if (!/^[A-Z0-9]{6,32}$/.test(String(code))) return null;
  try {
    const qrcode = await loadLibrary();
    const qr = qrcode(0, 'M');
    qr.addData(code);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch {
    return null;
  }
}
