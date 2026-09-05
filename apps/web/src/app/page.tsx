'use client';

import React from 'react';
import { PosProvider } from '../context/pos-context';
import { PosScreen } from '../components/pos/pos-screen';

export default function HomePage(): React.JSX.Element {
  return (
    <PosProvider>
      <PosScreen />
    </PosProvider>
  );
}
