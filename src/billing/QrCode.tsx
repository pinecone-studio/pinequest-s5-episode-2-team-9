import { useEffect, useState } from 'react'

/** Draws Wire's QR payload locally; falls back to Wire's hosted image when there's no payload. */
export function QrCode({
  text,
  imageUrl,
  alt,
}: {
  text: string | null
  imageUrl: string | null
  alt: string
}) {
  const [src, setSrc] = useState<string | null>(text ? null : imageUrl)
  useEffect(() => {
    if (!text) return
    let live = true
    void import('qrcode')
      .then((qr) => qr.toDataURL(text, { margin: 1, width: 480, errorCorrectionLevel: 'M' }))
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(imageUrl))
    return () => {
      live = false
    }
  }, [text, imageUrl])
  return src ? (
    <img className="billing-qr" src={src} alt={alt} width={240} height={240} />
  ) : (
    <div className="billing-qr" />
  )
}
