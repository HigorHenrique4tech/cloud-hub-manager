import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import orgService from '../services/orgService';
import { fmtCurrency, fmtUSD } from '../utils/formatters';

/**
 * Hook for multi-currency cost display.
 *
 * Returns:
 *  - currency: 'USD' | 'BRL'
 *  - rate: exchange rate (float | null)
 *  - fmtCost(value): formatted cost string in the org's preferred currency
 *  - toggleCurrency(): switch between USD and BRL
 *  - isLoading: true while fetching exchange rate
 */
export function useCurrency() {
  const { currentOrg, refreshOrgs } = useOrgWorkspace();
  const qc = useQueryClient();
  const slug = currentOrg?.slug;

  const currency = currentOrg?.currency_display || 'USD';
  const manualRate = currentOrg?.exchange_rate_brl;
  const isAuto = currentOrg?.exchange_rate_auto || false;

  // Fetch live rate when auto is enabled or currency is BRL
  const { data: rateData, isLoading } = useQuery({
    queryKey: ['exchange-rate', slug],
    queryFn: () => orgService.getExchangeRate(slug),
    enabled: !!slug && (currency === 'BRL' || isAuto),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
  });

  const rate = currency === 'BRL'
    ? (isAuto ? rateData?.exchange_rate_brl : manualRate) || rateData?.bcb_rate || null
    : null;

  const fmtCost = useCallback(
    (value) => {
      if (value == null) return '—';
      return fmtCurrency(value, currency, rate);
    },
    [currency, rate],
  );

  const currencyLabel = currency === 'BRL' ? 'R$' : 'USD';

  // Toggle mutation
  const toggleMut = useMutation({
    mutationFn: () => {
      const next = currency === 'USD' ? 'BRL' : 'USD';
      return orgService.updateCurrency(slug, {
        currency_display: next,
        exchange_rate_brl: manualRate,
        exchange_rate_auto: isAuto,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exchange-rate', slug] });
      if (refreshOrgs) refreshOrgs();
    },
  });

  const toggleCurrency = useCallback(() => toggleMut.mutate(), [toggleMut]);

  return { currency, rate, fmtCost, toggleCurrency, currencyLabel, isLoading };
}

export default useCurrency;
