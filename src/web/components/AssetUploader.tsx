import { useState, useRef } from 'react';
import { useAssets } from '../hooks/useAssets.js';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

export function AssetUploader() {
  const { assets, loading, uploadAsset, processAsset } = useAssets();
  const { token } = useAuth();
  const [licenses, setLicenses] = useState<any[]>([]);
  const [selectedLicense, setSelectedLicense] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useState(() => {
    if (token) apiFetch('/api/v1/licenses', token).then(setLicenses);
  });

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedLicense) return;
    await uploadAsset(file, selectedLicense);
  };

  if (loading) return <div className="text-[var(--color-text-muted)]">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Assets</h2>

      <div className="card mb-6 space-y-3">
        <h3 className="font-semibold">Upload Audio</h3>
        <div className="bg-[var(--color-warning)]/20 text-[var(--color-warning)] p-3 rounded text-sm">
          Only upload audio you own or have licensed rights to. Each upload must be linked to a valid license.
        </div>
        <select value={selectedLicense} onChange={(e) => setSelectedLicense(e.target.value)}>
          <option value="">Select license...</option>
          {licenses.filter(l => l.status === 'attested' || l.status === 'verified').map((l) => (
            <option key={l.id} value={l.id}>{l.licenseType.replace(/_/g, ' ')} — {l.rightsHolder || 'No holder'}</option>
          ))}
        </select>
        <input ref={fileRef} type="file" accept=".mp3,.m4a,.wav,.flac,.ogg,.opus,.aac" />
        <button onClick={handleUpload} className="btn btn-primary" disabled={!selectedLicense}>Upload</button>
      </div>

      {assets.length === 0 ? (
        <div className="card text-center text-[var(--color-text-muted)]">No assets yet.</div>
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => (
            <div key={asset.id} className="card flex justify-between items-center">
              <div>
                <div className="font-semibold">{asset.originalFilename || 'Stream URL'}</div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  {asset.sourceType} · {asset.processingStatus}
                  {asset.fileSizeBytes ? ` · ${(asset.fileSizeBytes / 1024 / 1024).toFixed(1)}MB` : ''}
                </div>
              </div>
              {asset.processingStatus === 'pending' && (
                <button onClick={() => processAsset(asset.id)} className="btn btn-primary text-sm">
                  Process
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
