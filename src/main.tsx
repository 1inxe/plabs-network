import * as Tooltip from '@radix-ui/react-tooltip';
import { MotionConfig } from 'motion/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { QueryProvider } from '@/app/providers/QueryProvider';
import { router } from '@/app/router';
import { WalletProvider } from '@/features/wallet';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@/shared/styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <Tooltip.Provider>
          <MotionConfig reducedMotion="user">
            <WalletProvider>
              <RouterProvider router={router} />
            </WalletProvider>
          </MotionConfig>
        </Tooltip.Provider>
      </QueryProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
