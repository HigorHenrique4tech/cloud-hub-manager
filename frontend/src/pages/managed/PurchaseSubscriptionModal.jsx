import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  X, ChevronRight, Search, Package, Zap, Check, AlertCircle, RefreshCw,
} from 'lucide-react';
import LoadingSpinner from '../../components/common/loadingspinner';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import orgService from '../../services/orgService';

const TARGET_VIEWS = [
  { value: 'Online', label: 'Microsoft 365 / Online', Icon: Package },
  { value: 'Azure', label: 'Azure', Icon: Zap },
];

const STEPS = ['Produto', 'SKU & Termo', 'Confirmação'];

export default function PurchaseSubscriptionModal({ customer, orgSlug, workspaceId, onClose, onPurchased }) {
  useEscapeKey(true, onClose);

  const [step, setStep] = useState(1);
  const [targetView, setTargetView] = useState('Online');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSku, setSelectedSku] = useState(null);
  const [selectedAvailability, setSelectedAvailability] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [submitError, setSubmitError] = useState('');

  const country = customer?.country || 'BR';

  const productsQ = useQuery({
    queryKey: ['pc-products', orgSlug, workspaceId, country, targetView],
    queryFn: () => orgService.pcListProducts(orgSlug, workspaceId, { country, target_view: targetView }),
    enabled: step === 1 && Boolean(country),
    staleTime: 30 * 60_000,
  });

  const skusQ = useQuery({
    queryKey: ['pc-skus', orgSlug, workspaceId, selectedProduct?.id, country],
    queryFn: () => orgService.pcListSkus(orgSlug, workspaceId, selectedProduct.id, country),
    enabled: step === 2 && Boolean(selectedProduct?.id),
    staleTime: 30 * 60_000,
  });

  const availQ = useQuery({
    queryKey: ['pc-availabilities', orgSlug, workspaceId, selectedProduct?.id, selectedSku?.id, country],
    queryFn: () => orgService.pcListAvailabilities(orgSlug, workspaceId, selectedProduct.id, selectedSku.id, country),
    enabled: step === 2 && Boolean(selectedProduct?.id && selectedSku?.id),
    staleTime: 30 * 60_000,
  });

  const checkoutMut = useMutation({
    mutationFn: () => orgService.pcCheckoutCart(orgSlug, workspaceId, customer.id, {
      line_items: [{
        catalog_item_id: selectedAvailability.catalog_item_id,
        quantity,
        billing_cycle: selectedAvailability.billing_cycle || 'monthly',
        term_duration: selectedAvailability.term_duration || 'P1Y',
      }],
    }),
    onSuccess: (data) => {
      onPurchased?.(data);
    },
    onError: (err) => {
      setSubmitError(err.response?.data?.detail || err.message || 'Falha ao finalizar compra.');
    },
  });

  const products = productsQ.data?.products || [];
  const skus = skusQ.data?.skus || [];
  const avs = availQ.data?.availabilities || [];

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.trim().toLowerCase();
    return products.filter(p =>
      (p.title || '').toLowerCase().includes(q)
      || (p.description || '').toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const goNext = () => setStep(s => Math.min(s + 1, 3));
  const goBack = () => setStep(s => Math.max(s - 1, 1));

  const canNext = (
    (step === 1 && selectedProduct)
    || (step === 2 && selectedSku && selectedAvailability && quantity >= 1)
  );

  const submit = () => {
    setSubmitError('');
    checkoutMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Nova Assinatura</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Cliente: {customer.name} · País: {country}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          {STEPS.map((label, idx) => {
            const num = idx + 1;
            const isActive = step === num;
            const isDone = step > num;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  isDone
                    ? 'bg-green-500 text-white'
                    : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {isDone ? <Check size={14} /> : num}
                </div>
                <span className={`text-xs font-medium ${isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                  {label}
                </span>
                {num < STEPS.length && <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {TARGET_VIEWS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => { setTargetView(value); setSelectedProduct(null); }}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      targetView === value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar produto..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {productsQ.isLoading ? (
                <div className="flex justify-center py-10"><LoadingSpinner /></div>
              ) : productsQ.isError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{productsQ.error?.response?.data?.detail || 'Erro ao carregar produtos'}</p>
              ) : filteredProducts.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-10">Nenhum produto encontrado.</p>
              ) : (
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProduct(p); setSelectedSku(null); setSelectedAvailability(null); }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedProduct?.id === p.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.title}</p>
                      {p.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{p.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                        {p.product_type && <span>{p.product_type}</span>}
                        {p.billing_type && <span>· {p.billing_type}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && selectedProduct && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Produto selecionado</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedProduct.title}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">SKU</p>
                {skusQ.isLoading ? (
                  <div className="flex justify-center py-6"><LoadingSpinner /></div>
                ) : skus.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Nenhum SKU disponível.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[20vh] overflow-y-auto">
                    {skus.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedSku(s); setSelectedAvailability(null); }}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          selectedSku?.id === s.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500'
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.title}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                          Qty mín {s.minimum_quantity} {s.maximum_quantity ? `· máx ${s.maximum_quantity}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedSku && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Termo / Billing</p>
                  {availQ.isLoading ? (
                    <div className="flex justify-center py-6"><LoadingSpinner /></div>
                  ) : avs.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Nenhuma disponibilidade.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-[20vh] overflow-y-auto">
                      {avs.map(a => (
                        <button
                          key={a.id || a.catalog_item_id}
                          onClick={() => setSelectedAvailability(a)}
                          className={`text-left p-2.5 rounded-lg border transition-colors ${
                            selectedAvailability?.catalog_item_id === a.catalog_item_id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'
                          }`}
                        >
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                            {a.term_duration || '—'} · {a.billing_cycle || '—'}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            {a.segment} · {a.default_currency || ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedAvailability && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Quantidade</label>
                  <input
                    type="number"
                    min={selectedSku?.minimum_quantity || 1}
                    max={selectedSku?.maximum_quantity || undefined}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && selectedAvailability && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-4 space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Resumo da compra</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-gray-500 dark:text-gray-400">Cliente:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{customer.name}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">País:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{country}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Produto:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{selectedProduct.title}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">SKU:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{selectedSku.title}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Termo:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{selectedAvailability.term_duration}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Billing:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{selectedAvailability.billing_cycle}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Quantidade:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{quantity}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Moeda:</span> <span className="font-medium text-gray-900 dark:text-gray-100">{selectedAvailability.default_currency || '—'}</span></div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex gap-2">
                <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Esta compra será efetivada imediatamente no Partner Center. A nova assinatura será adicionada à conta do cliente.
                </p>
              </div>

              {submitError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex-shrink-0">
          <button
            type="button"
            onClick={step === 1 ? onClose : goBack}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg"
            >
              Próximo
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={checkoutMut.isPending}
              className="inline-flex items-center px-4 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg"
            >
              {checkoutMut.isPending && <RefreshCw size={14} className="mr-2 animate-spin" />}
              {checkoutMut.isPending ? 'Comprando...' : 'Comprar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
