import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import orgService from '../services/orgService';

const OrgWorkspaceContext = createContext(null);

export const OrgWorkspaceProvider = ({ children }) => {
  const { user, token } = useAuth();
  const qc = useQueryClient();

  const [orgs, setOrgs] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);       // { id, name, slug, role, ... }
  const [currentWorkspace, setCurrentWorkspace] = useState(null); // { id, name, slug, ... }
  const [loading, setLoading] = useState(true);

  // Load orgs when user is authenticated
  useEffect(() => {
    if (!user || !token) {
      setOrgs([]);
      setCurrentOrg(null);
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const { organizations } = await orgService.listOrgs();
        setOrgs(organizations || []);

        // Restore selected org from localStorage or fall back to user's default
        const savedSlug = localStorage.getItem('selectedOrg');
        const match = organizations.find((o) => o.slug === savedSlug)
          || organizations.find((o) => o.id === user.default_org_id)
          || organizations[0];

        if (match) {
          setCurrentOrg(match);
          localStorage.setItem('selectedOrg', match.slug);
          await loadWorkspaces(match.slug);
        }
      } catch (err) {
        console.error('Failed to load organizations:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, token]);

  const loadWorkspaces = async (orgSlug) => {
    try {
      const { workspaces: wsList } = await orgService.listWorkspaces(orgSlug);
      setWorkspaces(wsList || []);

      const savedWsId = localStorage.getItem('selectedWorkspace');
      const match = wsList.find((w) => w.id === savedWsId) || wsList[0];
      if (match) {
        setCurrentWorkspace(match);
        localStorage.setItem('selectedWorkspace', match.id);
      } else {
        setCurrentWorkspace(null);
        localStorage.removeItem('selectedWorkspace');
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setWorkspaces([]);
      setCurrentWorkspace(null);
    }
  };

  const switchOrg = useCallback(async (orgSlug) => {
    const org = orgs.find((o) => o.slug === orgSlug);
    if (!org) return;
    setCurrentOrg(org);
    localStorage.setItem('selectedOrg', org.slug);
    await loadWorkspaces(org.slug);
    qc.removeQueries();
  }, [orgs, qc]);

  const switchWorkspace = useCallback((wsId) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (!ws) return;
    setCurrentWorkspace(ws);
    localStorage.setItem('selectedWorkspace', ws.id);
    qc.removeQueries();
  }, [workspaces, qc]);

  const refreshOrgs = useCallback(async () => {
    try {
      const { organizations } = await orgService.listOrgs();
      setOrgs(organizations || []);
    } catch (err) {
      console.error('Failed to refresh orgs:', err);
    }
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    if (currentOrg) {
      await loadWorkspaces(currentOrg.slug);
    }
  }, [currentOrg]);

  return (
    <OrgWorkspaceContext.Provider
      value={{
        orgs,
        workspaces,
        currentOrg,
        currentWorkspace,
        loading,
        switchOrg,
        switchWorkspace,
        refreshOrgs,
        refreshWorkspaces,
      }}
    >
      {children}
    </OrgWorkspaceContext.Provider>
  );
};

export const useOrgWorkspace = () => {
  const ctx = useContext(OrgWorkspaceContext);
  if (!ctx) throw new Error('useOrgWorkspace must be used inside OrgWorkspaceProvider');
  return ctx;
};
