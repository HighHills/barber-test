'use client';

import React from 'react';
import { PosProvider } from '../../context/pos-context';
import { RoleGuard } from '../../components/auth/role-guard';
import { SettingsShell } from '../../components/settings/settings-shell';

export default function SettingsPage(): React.JSX.Element {
  return (
    <PosProvider>
      <RoleGuard allowedRoles={['OWNER', 'ADMIN']} pageTitle="Settings">
        <SettingsShell />
      </RoleGuard>
    </PosProvider>
  );
}
