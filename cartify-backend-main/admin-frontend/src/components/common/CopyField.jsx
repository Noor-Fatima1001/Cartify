import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const CopyField = ({ value }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
        } catch (e) {
            const el = document.createElement('textarea');
            el.value = value;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{value}</span>
            <button
                type="button"
                onClick={handleCopy}
                title="Copy"
                style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                    color: copied ? 'var(--dash-success)' : 'var(--dash-ink-soft)', display: 'inline-flex',
                }}
            >
                {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
        </span>
    );
};

export default CopyField;
