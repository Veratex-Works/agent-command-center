function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
}

interface DeviceIdentity {
  id: string
  publicKeyB64: string
  privateKey: CryptoKey
}

let cachedIdentity: DeviceIdentity | null = null

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (cachedIdentity) return cachedIdentity

  // Always generate fresh keypair (matching original behaviour — no persistence)
  localStorage.removeItem('openclaw_device')

  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pubRaw = await crypto.subtle.exportKey('spki', kp.publicKey)
  const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey)

  // Raw 32-byte Ed25519 public key is the last 32 bytes of SPKI
  const rawPubBytes = new Uint8Array(pubRaw).slice(-32)
  const publicKeyB64 = bufferToBase64(rawPubBytes)

  // Device ID: SHA-256(rawPublicKey) as hex
  const hashBuf = await crypto.subtle.digest('SHA-256', rawPubBytes)
  const id = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  localStorage.setItem(
    'openclaw_device',
    JSON.stringify({
      id,
      publicKey: publicKeyB64,
      publicKeyRaw: bufferToBase64(pubRaw),
      privateKeyRaw: bufferToBase64(privRaw),
    }),
  )

  cachedIdentity = { id, publicKeyB64, privateKey: kp.privateKey }
  return cachedIdentity
}

export async function signChallenge(
  nonce: string,
  signedAt: number,
  deviceId: string,
  authToken: string,
  privateKey: CryptoKey,
): Promise<string> {
  const scopes = 'operator.read,operator.write'
  const parts = [
    'v2',
    deviceId,
    'openclaw-control-ui',
    'webchat',
    'operator',
    scopes,
    String(signedAt),
    authToken ?? '',
    nonce,
  ]
  const payload = parts.join('|')
  const enc = new TextEncoder().encode(payload)
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, enc)
  return bufferToBase64(sig)
}
