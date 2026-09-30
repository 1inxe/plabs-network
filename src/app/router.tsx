import { lazy, Suspense } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet } from 'react-router-dom';
import { RouteSkeleton } from '@/shared/ui/RouteSkeleton';
import { ErrorBoundary } from './ErrorBoundary';
import { Layout } from './shell/AppShell';

const Gateway = lazy(() => import('@/features/gateway'));
const Trading = lazy(() => import('@/features/trading'));
const Explorer = lazy(() => import('@/features/explorer'));
const History = lazy(() => import('@/features/history'));
const Collectibles = lazy(() => import('@/features/collectibles'));
const Ecosystem = lazy(() => import('@/features/ecosystem'));
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        element: (
          <ErrorBoundary>
            <Suspense fallback={<RouteSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        ),
        children: [
          { index: true, element: <Navigate to="/assets" replace /> },
          { path: 'assets', element: <Gateway /> },
          { path: 'shield', element: <Navigate to="/assets?mode=deposit" replace /> },
          { path: 'privacyfi', element: <Navigate to="/assets" replace /> },
          { path: 'privasea/whitelist', element: <Navigate to="/p-sea" replace /> },
          { path: 'privasea', element: <Navigate to="/p-sea" replace /> },
          { path: 'browser', element: <Navigate to="/explorer" replace /> },
          { path: 'privacyfun', element: <Navigate to="/p-fun" replace /> },
          { path: 'privacypay', element: <Navigate to="/assets?mode=transfer" replace /> },
          { path: 'pay', element: <Navigate to="/assets?mode=transfer" replace /> },
          { path: 'pex', element: <Trading /> },
          { path: 'p-sea', element: <Collectibles /> },
          { path: 'explorer', element: <Explorer /> },
          { path: 'history', element: <History /> },
          { path: 'p-fun', element: <Ecosystem /> },
          { path: 'pefi', element: <Navigate to="/assets" replace /> },
          {
            path: '*',
            element: (
              <div className="page">
                <h1>This page is off the grid.</h1>
                <p>We couldn’t find the page you’re looking for.</p>
                <Link className="primary-button" to="/assets">
                  Back to assets
                </Link>
              </div>
            ),
          },
        ],
      },
    ],
  },
]);
