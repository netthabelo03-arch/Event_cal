// Phone notifications in the browser: whether they can work here, and
// signing this device up or off.

import { VAPID_PUBLIC_KEY } from '../config.js';

/**
 * What this device can do, as one of:
 *  'ready'        notifications can be turned on
 *  'install'      an iPhone or iPad that must add the app to the home screen first
 *  'blocked'      the person said no earlier; it can only be changed in the browser's settings
 *  'unsupported'  this browser cannot receive them
 */
export function pushStatus({ hasServiceWorker, hasPushManager, hasNotification, permission, isIos, isStandalone }) {
  if (isIos && !isStandalone) return 'install';
  if (!hasServiceWorker || !hasPushManager || !hasNotification) return 'unsupported';
  if (permission === 'denied') return 'blocked';
  return 'ready';
}

/** Turn the public key into the form the browser asks for. */
export function keyBytes(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function devicePushStatus() {
  const nav = window.navigator;
  const isIos = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
  return pushStatus({
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'default',
    isIos,
    isStandalone,
  });
}

/** @returns {Promise<PushSubscription | null>} this device's current sign-up, if any */
export async function currentDevice() {
  if (devicePushStatus() !== 'ready') return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Ask the person for permission and sign this device up.
 * @returns {Promise<PushSubscription>} throws { code: 'permission_denied' } if they say no
 */
export async function signUpDevice() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw { code: 'permission_denied' };
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
}
