import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import orgService from '../services/orgService';
import { fmtCurrency, fmtUSD, fmtBRL } from '../utils/formatters';

/**
 * Hook for multi-currency cost display.
 *
 * Each cloud provider may return costs in different currencies:
 *  - AWS: always USD
 *  - Azure: billing currency (BRL for Brazilian subscriptions, USD for others)
 *  - GCP: estimated in USD
 *
 * fmtCost(value, sourceCurrency):
 *  - If source is already the display currency → format directly, no conversion.
 *  - If source differs → convert using exchange rate.
 *  - If no sourceCurrency provided → assumes USD (backward compatible).
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

  /**
   * Format a cost value for display.
   * @param {number} value - The cost amount
   * @param {string} [sourceCurrency='USD'] - The currency the value is already in ('USD'|'BRL')
   */
  const fmtCost = useCallback(
    (value, sourceCurrency = 'USD') => {
      if (value == null) return '—';
      const src = (sourceCurrency || 'USD').toUpperCase();

      // If source matches display → no conversion needed
      if (src === currency) {
        return currency === 'BRL' ? fmtBRL(value) : fmtUSD(value);
      }

      // Source is BRL, display is USD → divide by rate
      if (src === 'BRL' && currency === 'USD' && rate) {
        return fmtUSD(Number(value) / rate);
      }

      // Source is USD, display is BRL → multiply by rate
      if (src === 'USD' && currency === 'BRL' && rate) {
        return fmtBRL(Number(value) * rate);
      }

      // Fallback: format in source currency (no rate available)
      return src === 'BRL' ? fmtBRL(value) : fmtUSD(value);
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
