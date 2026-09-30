import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  BookOpen,
  ChartCandlestick,
  Gem,
  History,
  LockKeyhole,
  Menu,
  Rocket,
  ScanSearch,
  Search,
  Shield,
  Wallet,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NetworkSelector, useWallet, WalletDrawer } from '@/features/wallet';
import { unavailableFeatures } from '@/shared/config/product';
import { short } from '@/shared/lib/format';
import { NotificationViewport } from '@/shared/notifications';

const nav = [
  { to: '/assets', label: 'Assets', icon: Wallet, section: 'WORKSPACE', badge: '' },
  { to: '/pex', label: 'Trade', icon: ChartCandlestick, badge: 'Spot' },
  { to: '/history', label: 'Activity', icon: History },
  { to: '/explorer', label: 'Explorer', icon: ScanSearch },
  { to: '/p-sea', label: 'Genesis whitelist', icon: Gem, section: 'DISCOVER', badge: 'Check' },
  {
    to: '/p-fun',
    label: 'Token launch',
    icon: Rocket,
    badge: 'Unavailable',
    disabled: true,
    reason: unavailableFeatures.tokenLaunch,
  },
];
function Navigation({ close }: { close?: () => void }) {
  return (
    <>
      <a className="brand" href="/assets">
        <img src="/assets/plabs-network.png" alt="" />
        <div>
          PLabs <span>Network</span>
          <small>
            <span className="status-dot" />
            Your private workspace.
          </small>
        </div>
      </a>
      {nav.map((n) => (
        <div key={n.to}>
          {n.section && <div className="nav-section">{n.section}</div>}
          {n.disabled ? (
            <button
              type="button"
              className="nav-item nav-item-unavailable"
              disabled
              title={n.reason}
            >
              <n.icon aria-hidden="true" size={18} />
              <span>{n.label}</span>
              <span className="nav-badge">{n.badge}</span>
            </button>
          ) : (
            <NavLink
              to={n.to}
              onClick={close}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <n.icon aria-hidden="true" size={18} />
              <span>{n.label}</span>
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </NavLink>
          )}
        </div>
      ))}
      <a
        className="nav-item"
        href="https://plabs.gitbook.io/plabs-docs"
        target="_blank"
        rel="noreferrer"
      >
        <BookOpen aria-hidden="true" size={18} />
        <span>Docs</span>
        <ArrowUpRight aria-hidden="true" size={15} />
      </a>
    </>
  );
}
export function Layout() {
  const w = useWallet(),
    navigate = useNavigate(),
    location = useLocation(),
    reduce = useReducedMotion();
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const label = nav.find((item) => item.to === location.pathname)?.label ?? 'Workspace';
    document.title = `${label} · PLabs Network`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Navigation />
        <div className="sidebar-bottom">
          <div className="vault-mini">
            <div>
              <Shield aria-hidden="true" size={15} />
              <span>Extension wallet</span>
              <span className={`status-dot ${w.account ? '' : 'muted'}`} />
            </div>
            <p>{w.account ? 'Connected' : 'Your keys stay with you.'}</p>
            <button type="button" onClick={() => w.setModal(true)}>
              {w.account
                ? w.privacyAddress
                  ? short(w.privacyAddress)
                  : 'Privacy wallet'
                : 'Connect PLabs Wallet'}
              <ArrowUpRight aria-hidden="true" size={13} />
            </button>
          </div>
          <div className="sidebar-footer">
            <a href="https://x.com/_PLabs" target="_blank" rel="noreferrer">
              𝕏
            </a>
            <a href="https://github.com/PLabs4" target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            <span>NETWORK / 01</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu aria-hidden="true" />
          </button>
          <span className="mobile-brand">
            PLabs
            <span className="status-dot" />
          </span>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/explorer?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search aria-hidden="true" size={17} />
            <input
              ref={searchRef}
              aria-label="Search transaction or address"
              placeholder="Search a public address or transaction"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </form>
          <span className="top-status">
            <span className={`status-dot ${w.account ? '' : 'muted'}`} />
            {w.account ? 'Wallet connected' : 'Wallet not connected'}
          </span>
          <div className="topbar-actions">
            <NetworkSelector />
            <button
              type="button"
              className={`wallet-button ${w.account ? 'connected' : ''}`}
              onClick={() => w.setModal(true)}
            >
              <Wallet aria-hidden="true" size={16} />
              <span>
                {w.account
                  ? w.privacyAddress
                    ? short(w.privacyAddress)
                    : 'Privacy wallet'
                  : 'Connect wallet'}
              </span>
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: reduce ? 0 : 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
          >
            <Outlet />
          </motion.div>
        </main>
        <footer className="page-footer">
          <span>
            <LockKeyhole aria-hidden="true" size={12} />
            Built for a more private on-chain world.
          </span>
          <span>
            PLabs Network <span className="footer-dot">/</span> Powered by zero knowledge
          </span>
        </footer>
      </div>
      <nav className="mobile-bottom" aria-label="Mobile navigation">
        {['/assets', '/pex', '/history', '/explorer']
          .flatMap((path) => nav.filter((item) => item.to === path))
          .map((n) => (
            <NavLink key={n.to} to={n.to}>
              <n.icon size={20} />
              <span>{n.label}</span>
            </NavLink>
          ))}
      </nav>
      <Dialog.Root open={menu} onOpenChange={setMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="mobile-drawer" data-notification-layer="">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">PLabs Network pages</Dialog.Description>
            <Navigation close={() => setMenu(false)} />
            <Dialog.Close className="secondary-button mt-6">Close menu</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <WalletDrawer />
      <NotificationViewport />
    </div>
  );
}
