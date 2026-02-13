import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Search, X, LayoutDashboard, Server, Cloud, DollarSign,
  FileText, Settings, Building2, Layers, Users, Globe, CornerDownLeft,
} from 'lucide-react';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useQuery } from '@tanstack/react-query';
import orgService from '../../services/orgService';

const PAGE_ITEMS = [
  { id: 'p-dash', label: 'Dashboard', path: '/', icon: LayoutDashboard, category: 'Páginas' },
  { id: 'p-aws', label: 'AWS', path: '/aws', icon: Server, category: 'Páginas' },
  { id: 'p-aws-ec2', label: 'AWS EC2', path: '/aws/ec2', icon: Server, category: 'Páginas' },
  { id: 'p-aws-s3', label: 'AWS S3', path: '/aws/s3', icon: Server, category: 'Páginas' },
  { id: 'p-aws-rds', label: 'AWS RDS', path: '/aws/rds', icon: Server, category: 'Páginas' },
  { id: 'p-aws-lambda', label: 'AWS Lambda', path: '/aws/lambda', icon: Server, category: 'Páginas' },
  { id: 'p-aws-vpc', label: 'AWS VPC', path: '/aws/vpc', icon: Server, category: 'Páginas' },
  { id: 'p-azure', label: 'Azure', path: '/azure', icon: Cloud, category: 'Páginas' },
  { id: 'p-azure-vms', label: 'Azure VMs', path: '/azure/vms', icon: Cloud, category: 'Páginas' },
  { id: 'p-azure-storage', label: 'Azure Storage', path: '/azure/storage', icon: Cloud, category: 'Páginas' },
  { id: 'p-azure-vnets', label: 'Azure VNets', path: '/azure/vnets', icon: Cloud, category: 'Páginas' },
  { id: 'p-azure-db', label: 'Azure Databases', path: '/azure/databases', icon: Cloud, category: 'Páginas' },
  { id: 'p-azure-app', label: 'Azure App Services', path: '/azure/app-services', icon: Cloud, category: 'Páginas' },
  { id: 'p-costs', label: 'Custos', path: '/costs', icon: DollarSign, category: 'Páginas' },
  { id: 'p-logs', label: 'Logs', path: '/logs', icon: FileText, category: 'Páginas' },
  { id: 'p-settings', label: 'Configurações', path: '/settings', icon: Settings, category: 'Páginas' },
  { id: 'p-org', label: 'Organização', path: '/org/settings', icon: Building2, category: 'Páginas' },
  { id: 'p-ws', label: 'Workspace', path: '/workspace/settings', icon: Layers, category: 'Páginas' },
];

const CommandPalette = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { currentOrg, workspaces, currentWorkspace } = useOrgWorkspace();
  const slug = currentOrg?.slug;
  const wsId = currentWorkspace?.id;

  const { data: membersData } = useQuery({
    queryKey: ['org-members', slug],
    queryFn: () => orgService.listMembers(slug),
    enabled: isOpen && !!slug,
    staleTime: 60000,
  });

  const { data: accountsData } = useQuery({
    queryKey: ['cloud-accounts-palette', slug, wsId],
    queryFn: () => orgService.listAccounts(slug, wsId),
    enabled: isOpen && !!slug && !!wsId,
    staleTime: 60000,
  });

  const members = membersData?.members || [];
  const accounts = accountsData?.accounts || [];

  const allItems = useMemo(() => {
    const items = [...PAGE_ITEMS];

    members.forEach((m) => {
      items.push({
        id: `m-${m.user_id}`,
        label: m.name,
        sublabel: m.email,
        path: '/org/settings',
        icon: Users,
        category: 'Membros',
      });
    });

    workspaces.forEach((ws) => {
      items.push({
        id: `ws-${ws.id}`,
        label: ws.name,
        sublabel: ws.slug,
        path: '/workspace/settings',
        icon: Layers,
        category: 'Workspaces',
      });
    });

    accounts.forEach((acc) => {
      items.push({
        id: `acc-${acc.id}`,
        label: acc.label,
        sublabel: `${acc.provider.toUpperCase()}${acc.account_id ? ` — ${acc.account_id}` : ''}`,
        path: '/workspace/settings',
        icon: Globe,
        category: 'Contas Cloud',
      });
    });

    return items;
  }, [members, workspaces, accounts]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(q)),
    );
  }, [allItems, query]);

  const groupedItems = useMemo(() => {
    const groups = {};
    filteredItems.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredItems]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item) {
          navigate(item.path);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [filteredItems, selectedIndex, navigate, onClose],
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIndex = -1;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar páginas, membros, workspaces..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              Sem resultados para &quot;{query}&quot;
            </p>
          ) : (
            Object.entries(groupedItems).map(([category, items]) => (
              <div key={category}>
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {category}
                </p>
                {items.map((item) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const isSelected = idx === selectedIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={() => {
                        navigate(item.path);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary dark:bg-primary/20'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0 opacity-60" />
                      <div className="flex-1 min-w-0">
                        <span className="block truncate">{item.label}</span>
                        {item.sublabel && (
                          <span className="block text-xs text-gray-400 truncate">{item.sublabel}</span>
                        )}
                      </div>
                      {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">↵</kbd> abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
