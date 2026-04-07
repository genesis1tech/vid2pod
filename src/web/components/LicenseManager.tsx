import { useState } from 'react';
import { useAuth, apiFetch } from '../hooks/useAuth.js';

export function LicenseManager() {
  const { token } = useAuth();
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    licenseType: 'owned_original' as string,
    rightsHolder: '',
    attributionText: '',
    validUntil: '',
    notes: '',
  });

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch('/api/v1/licenses', token);
      setLicenses(data);
    } finally {
      setLoading(false);
    }
  };

  useState(() => { refresh(); });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/v1/licenses', token, {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        attestation: {
          agreed: true,
          date: new Date().toISOString(),
          statement: `I attest that I have the legal right to use this content under the license type: ${form.licenseType}`,
        },
      }),
    });
    setShowCreate(false);
    await refresh();
  };

  if (loading) return <div className="text-[var(--color-text-muted)]">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Licenses</h2>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">Add License</button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3">
          <h3 className="font-semibold text-lg">New License & Rights Attestation</h3>
          <div className="bg-[var(--color-warning)]/20 text-[var(--color-warning)] p-3 rounded text-sm">
            By creating a license, you attest that you own or have legally obtained rights to the associated content.
            Providing false attestations may violate copyright law.
          </div>
          <select value={form.licenseType} onChange={(e) => setForm({ ...form, licenseType: e.target.value })}>
            <option value="owned_original">Original Content (I own it)</option>
            <option value="owned_license">Licensed Content</option>
            <option value="creative_commons">Creative Commons</option>
            <option value="public_domain">Public Domain</option>
            <option value="sync_license">Sync License</option>
            <option value="mechanical_license">Mechanical License</option>
            <option value="other">Other</option>
          </select>
          <input placeholder="Rights holder" value={form.rightsHolder} onChange={(e) => setForm({ ...form, rightsHolder: e.target.value })} />
          <textarea placeholder="Attribution text (if required)" value={form.attributionText} onChange={(e) => setForm({ ...form, attributionText: e.target.value })} rows={2} />
          <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Create & Attest</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {licenses.length === 0 ? (
        <div className="card text-center text-[var(--color-text-muted)]">
          No licenses yet. Add a license before uploading any audio content.
        </div>
      ) : (
        <div className="space-y-3">
          {licenses.map((lic) => (
            <div key={lic.id} className="card">
              <div className="flex justify-between">
                <div>
                  <span className="font-semibold">{lic.licenseType.replace(/_/g, ' ')}</span>
                  <span className={`ml-2 text-xs px-2 py-1 rounded ${
                    lic.status === 'attested' ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]' :
                    lic.status === 'expired' || lic.status === 'revoked' ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]' :
                    'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                  }`}>{lic.status}</span>
                </div>
                {lic.rightsHolder && <span className="text-sm text-[var(--color-text-muted)]">{lic.rightsHolder}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
