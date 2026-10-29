import { useEffect, useState } from 'react';
import { toast } from '../../../store/toastStore';
import { reportInvokeFailure } from '../../../lib/errorReporter';
import { invoke } from '@tauri-apps/api/core';
import { PageHeader, PageSection, SettingRow, Toggle } from '../SettingRow';
import { registerSetting } from '../index';

const cat = { group: 'privacy-about', page: 'privacy' } as const;
['external-summaries'].forEach((id) =>
  registerSetting({ category: cat, id, label: id.replace(/-/g, ' '), keywords: ['privacy'] })
);

export default function PrivacyPage() {
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  useEffect(() => {
    invoke<boolean>('get_summary_enabled').then(setSummaryEnabled).catch(() => {
      // Fail closed: the backend also checks consent on every request.
    });
  }, []);

  return (
    <div>
      <PageHeader title="Privacy" />

      <PageSection title="Session summaries">
        <SettingRow label="External AI summaries" description="Off by default. When enabled, sends up to the last 16 KiB of terminal output to the model service configured in your Claude CLI. Known secrets are scrubbed, but source code and other sensitive text may remain. Leave off to keep session logs local.">
          <Toggle label="External AI summaries" value={summaryEnabled} onChange={(enabled) => {
            invoke('set_summary_enabled', { enabled }).then(() => setSummaryEnabled(enabled)).catch((err) => {
              toast.error('Could not change summary preference');
              reportInvokeFailure('set_summary_enabled', err);
            });
          }} />
        </SettingRow>
      </PageSection>
    </div>
  );
}
