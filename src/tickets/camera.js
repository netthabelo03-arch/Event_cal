// Reads QR codes with the phone's camera. Uses the browser's own QR reader
// where there is one (Chrome on Android); otherwise loads a small library.
// If neither works, the host types the code in.

const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';

async function makeReader() {
  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
    } catch {
      // Fall through to the library.
    }
  }
  const module = await import(LIBRARY_URL);
  const jsQR = module.default ?? module;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    // A smaller picture is read faster and is still sharp enough for a QR code.
    const scale = Math.min(1, 640 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
  };
}

/**
 * Start the back camera in `video` and call onText for every QR code seen.
 * Stops by itself when the video leaves the page.
 * @returns {Promise<() => void>} call it to stop the camera
 * @throws when the camera cannot be used (no permission, no camera, no reader)
 */
export async function startCamera(video, onText) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no_camera');
  const read = await makeReader();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  let running = true;
  let timer = null;
  const stop = () => {
    running = false;
    clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };
  const tick = async () => {
    if (!running) return;
    if (!video.isConnected) {
      stop();
      return;
    }
    try {
      const text = await read(video);
      if (text) onText(text);
    } catch {
      // A frame that cannot be read is skipped.
    }
    if (running) timer = setTimeout(tick, 200);
  };
  tick();
  return stop;
}
