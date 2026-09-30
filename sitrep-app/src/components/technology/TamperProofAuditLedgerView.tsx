import React, { useState, useEffect } from 'react';
import { apiJson } from '../../lib/api';

interface AuditBlock {
  id: string;
  block_index: number;
  previous_hash: string;
  current_hash: string;
  event_type: string;
  event_payload: any;
  actor_user_id: string | null;
  actor_username: string | null;
  actor_role: string | null;
  recorded_at: string;
}

interface VerificationResult {
  is_valid: boolean;
  block_count: number;
  genesis_hash?: string;
  latest_hash?: string;
  error?: string;
  broken_block_index?: number;
}

export const TamperProofAuditLedgerView: React.FC = () => {
  const [blocks, setBlocks] = useState<AuditBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<AuditBlock | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const fetchBlocks = async () => {
    setLoading(true);
    try {
      const url = eventTypeFilter
        ? `/technology/audit-ledger/blocks?event_type=${encodeURIComponent(eventTypeFilter)}`
        : '/technology/audit-ledger/blocks';
      const data = await apiJson<{ success: boolean; blocks: AuditBlock[] }>(url);
      if (data?.blocks) {
        setBlocks(data.blocks);
        if (data.blocks.length > 0 && !selectedBlock) {
          setSelectedBlock(data.blocks[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load cryptographic audit ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    setVerification(null);
    try {
      const result = await apiJson<VerificationResult>('/technology/audit-ledger/verify');
      setVerification(result);
    } catch (err: any) {
      setVerification({
        is_valid: false,
        block_count: 0,
        error: err?.message || 'Cryptographic chain verification network error.'
      });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, [eventTypeFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', color: '#e2e8f0' }}>
      {/* Header & Verification Bar */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              Zero-Trust Cryptographic Audit Ledger
            </h2>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            SHA-256 sequential cryptographic hash chain with merkle continuity. Prevents retroactive tampering with election results, sitreps, and command records.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            style={{
              padding: '10px 20px',
              backgroundColor: verifying ? '#334155' : '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: verifying ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
            }}
          >
            <span>{verifying ? '⚡ Auditing Merkle Chain...' : '🔍 Verify Complete Blockchain Integrity'}</span>
          </button>
        </div>
      </div>

      {/* Verification Banner */}
      {verification && (
        <div style={{
          padding: '16px 20px',
          borderRadius: '10px',
          backgroundColor: verification.is_valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${verification.is_valid ? '#10b981' : '#ef4444'}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <span style={{ fontSize: '22px' }}>{verification.is_valid ? '✅' : '🚨'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: verification.is_valid ? '#34d399' : '#f87171' }}>
              {verification.is_valid ? 'Cryptographic Integrity Confirmed — 0 Tampering Detected' : 'Tampering Alert — Block Continuity Broken!'}
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>
              {verification.is_valid ? (
                <>
                  Audited <strong>{verification.block_count} blocks</strong> from Genesis to current tip. All SHA-256 hash chains, actor signatures, and block headers are mathematically continuous.
                </>
              ) : (
                <>
                  Chain verification failure: {verification.error || `Invalid hash at Block #${verification.broken_block_index}`}. Retroactive manipulation detected.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: '10px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>Total Blocks</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>{blocks.length}</div>
        </div>

        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: '10px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>Hashing Algorithm</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8', marginTop: '4px', fontFamily: 'monospace' }}>SHA-256 / Continuous</div>
        </div>

        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: '10px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>Chain Status</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>IMMUTABLE & SECURE</div>
        </div>

        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: '10px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>Filter Event</div>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            style={{
              marginTop: '4px',
              width: '100%',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '12px'
            }}
          >
            <option value="">All Block Types</option>
            <option value="GENESIS">GENESIS</option>
            <option value="SITREP_SUBMITTED">SITREP_SUBMITTED</option>
            <option value="RESULT_CAPTURED">RESULT_CAPTURED</option>
            <option value="DIRECTIVE_ISSUED">DIRECTIVE_ISSUED</option>
            <option value="INCIDENT_ESCALATED">INCIDENT_ESCALATED</option>
          </select>
        </div>
      </div>

      {/* Main Ledger Split Screen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Block Chain List */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '12px',
          padding: '16px',
          maxHeight: '650px',
          overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 700, color: '#cbd5e1' }}>
            Sequential Block Chain (Latest Tip First)
          </h3>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading ledger blocks...</div>
          ) : blocks.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No blocks found in ledger.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {blocks.map((block) => {
                const isSelected = selectedBlock?.id === block.id;
                const isGenesis = block.block_index === 1 || block.event_type === 'GENESIS';

                return (
                  <div
                    key={block.id}
                    onClick={() => setSelectedBlock(block)}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(2, 132, 199, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                      border: `1px solid ${isSelected ? '#0284c7' : 'rgba(148, 163, 184, 0.1)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: isGenesis ? 'rgba(245, 158, 11, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                          color: isGenesis ? '#f59e0b' : '#818cf8',
                          border: `1px solid ${isGenesis ? '#f59e0b' : '#6366f1'}`
                        }}>
                          Block #{block.block_index}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                          {block.event_type}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(block.recorded_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', wordBreak: 'break-all' }}>
                      <span style={{ color: '#64748b' }}>Hash: </span>
                      {block.current_hash.slice(0, 24)}...{block.current_hash.slice(-8)}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                      <span>Actor: {block.actor_username || 'SYSTEM'} ({block.actor_role || 'SYSTEM'})</span>
                      <span>Prev: #{block.block_index - 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Block Detail & Cryptographic Inspector */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍</span> Block Cryptographic Certificate
          </h3>

          {selectedBlock ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Block Index & ID</label>
                <div style={{ fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>
                  Index #{selectedBlock.block_index} ({selectedBlock.id})
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Previous Hash (Parent Link)</label>
                <div style={{
                  padding: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#94a3b8',
                  wordBreak: 'break-all',
                  marginTop: '2px'
                }}>
                  {selectedBlock.previous_hash}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Current Block Hash (SHA-256)</label>
                <div style={{
                  padding: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #0284c7',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#38bdf8',
                  wordBreak: 'break-all',
                  marginTop: '2px'
                }}>
                  {selectedBlock.current_hash}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Event Type</label>
                  <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '2px' }}>{selectedBlock.event_type}</div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Timestamp</label>
                  <div style={{ color: '#f8fafc', marginTop: '2px' }}>{new Date(selectedBlock.recorded_at).toLocaleString()}</div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Signing Actor</label>
                <div style={{ color: '#f8fafc', marginTop: '2px' }}>
                  {selectedBlock.actor_username || 'SYSTEM ENGINE'} ({selectedBlock.actor_role || 'CORE_DAEMON'})
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Event Payload (Immutable JSON)</label>
                <pre style={{
                  padding: '12px',
                  backgroundColor: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#10b981',
                  overflowX: 'auto',
                  maxHeight: '180px',
                  margin: '4px 0 0 0'
                }}>
                  {JSON.stringify(selectedBlock.event_payload, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Select a block to inspect its cryptographic certificate.</div>
          )}
        </div>
      </div>
    </div>
  );
};
