import { useEffect, useState } from "react";

interface PreviewProps {
  pdfBase64: string | null;
  error: string | null;
}

export default function Preview({ pdfBase64, error }: PreviewProps) {
  const [url, setUrl] = useState<string | null>(null);

  // Convert base64 to a Blob URL: more reliable across WebViews (WebView2,
  // WebKitGTK) than large data: URLs, and still entirely local.
  useEffect(() => {
    if (!pdfBase64) return;
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const next = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [pdfBase64]);

  return (
    <div className="preview">
      {url ? (
        <iframe title="PDF preview" src={url} />
      ) : (
        <div className="preview-empty">No PDF yet</div>
      )}
      {error && <pre className="error-log">{error}</pre>}
    </div>
  );
}
