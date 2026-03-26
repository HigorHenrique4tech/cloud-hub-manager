import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Palette, Upload, RotateCcw, Eye, Mail, Type, Image, Send } from 'lucide-react';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useBranding } from '../../contexts/BrandingContext';
import orgService from '../../services/orgService';
import { useToast } from '../../contexts/ToastContext';

export default function WhiteLabelSettings() {
  const { currentOrg, refreshOrgs } = useOrgWorkspace();
  const branding = useBranding();
  const qc = useQueryClient();
  const { toast } = useToast();
  const slug = currentOrg?.slug;

  // Form state initialized from current branding
  const [form, setForm] = useState({
    platform_name: '',
    color_primary: '#1E6FD9',
    color_accent: '#0EA5E9',
    powered_by: true,
    email_sender_name: '',
  });
  const [logoLight, setLogoLight] = useState(null); // { preview, file, base64, mime }
  const [logoDark, setLogoDark] = useState(null);
  const [favicon, setFavicon] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Sync form from branding on load
  useEffect(() => {
    if (branding) {
      setForm({
        platform_name: branding.platform_name === 'CloudAtlas' ? '' : branding.platform_name,
        color_primary: branding.color_primary || '#1E6FD9',
        color_accent: branding.color_accent || '#0EA5E9',
        powered_by: branding.powered_by ?? true,
        email_sender_name: branding.email_sender_name === 'CloudAtlas' ? '' : branding.email_sender_name,
      });
    }
  }, [branding]);

  const handleFileSelect = (setter, maxKb) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxKb * 1024) {
      alert(`Arquivo muito grande. Máximo: ${maxKb}KB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setter({
        preview: reader.result,
        base64: reader.result.split(',')[1],
        mime: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      const payload = {};
      if (form.platform_name.trim()) payload.platform_name = form.platform_name.trim();
      if (form.color_primary !== '#1E6FD9') payload.color_primary = form.color_primary;
      if (form.color_accent !== '#0EA5E9') payload.color_accent = form.color_accent;
      payload.powered_by = form.powered_by;
      if (form.email_sender_name.trim()) payload.email_sender_name = form.email_sender_name.trim();
      if (logoLight) {
        payload.logo_light = logoLight.base64;
        payload.logo_mime = logoLight.mime;
      }
      if (logoDark) {
        payload.logo_dark = logoDark.base64;
        if (!payload.logo_mime) payload.logo_mime = logoDark.mime;
      }
      if (favicon) {
        payload.favicon = favicon.base64;
        payload.favicon_mime = favicon.mime;
      }
      await orgService.updateBranding(slug, payload);
      qc.invalidateQueries({ queryKey: ['orgs'] });
      await refreshOrgs();
      toast.success('Personalização salva com sucesso!');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar branding');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Resetar toda a personalização para o padrão CloudAtlas?')) return;
    setSaving(true);
    try {
      await orgService.resetBranding(slug);
      qc.invalidateQueries({ queryKey: ['orgs'] });
      setLogoLight(null);
      setLogoDark(null);
      setFavicon(null);
      setForm({
        platform_name: '',
        color_primary: '#1E6FD9',
        color_accent: '#0EA5E9',
        powered_by: true,
        email_sender_name: '',
      });
      await refreshOrgs();
      // Restore default favicon
      const link = document.querySelector("link[rel~='icon']");
      if (link) link.href = '/favicon.ico';
      toast.success('Personalização resetada para o padrão CloudAtlas');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao resetar');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setSendingTest(true);
    try {
      const res = await orgService.sendTestBrandingEmail(slug);
      toast.success(res.detail || 'E-mail de teste enviado!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao enviar e-mail de teste');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Palette size={20} className="text-purple-500" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">White Label</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">Personalize a plataforma com a marca da sua empresa</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <RotateCcw size={13} /> Resetar
        </button>
      </div>

      {/* Platform Name */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            <Type size={13} className="inline mr-1" /> Nome da Plataforma
          </label>
          <input
            value={form.platform_name}
            onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
            placeholder="CloudAtlas"
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Será exibido na sidebar, header, e-mails e relatórios</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            <Mail size={13} className="inline mr-1" /> Nome do Remetente (E-mail)
          </label>
          <input
            value={form.email_sender_name}
            onChange={(e) => setForm({ ...form, email_sender_name: e.target.value })}
            placeholder="CloudAtlas"
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Aparece como remetente nos e-mails (ex: "MinhaEmpresa")</p>
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Cor Primária</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color_primary}
              onChange={(e) => setForm({ ...form, color_primary: e.target.value })}
              className="h-10 w-14 rounded-lg border border-gray-300 dark:border-slate-700 cursor-pointer"
            />
            <input
              value={form.color_primary}
              onChange={(e) => setForm({ ...form, color_primary: e.target.value })}
              placeholder="#1E6FD9"
              maxLength={7}
              className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Cor Accent</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color_accent}
              onChange={(e) => setForm({ ...form, color_accent: e.target.value })}
              className="h-10 w-14 rounded-lg border border-gray-300 dark:border-slate-700 cursor-pointer"
            />
            <input
              value={form.color_accent}
              onChange={(e) => setForm({ ...form, color_accent: e.target.value })}
              placeholder="#0EA5E9"
              maxLength={7}
              className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Logo Uploads */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Logo Light */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            <Image size={13} className="inline mr-1" /> Logo (fundo claro)
          </label>
          <div className="relative rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 text-center hover:border-primary transition-colors">
            {logoLight?.preview || (branding.is_white_labeled && branding.logo_light_url !== '/logo.png') ? (
              <div className="flex flex-col items-center gap-2">
                <img src={logoLight?.preview || branding.logo_light_url} alt="Logo claro" className="h-16 object-contain" />
                <button onClick={() => setLogoLight(null)} className="text-xs text-red-500 hover:text-red-400">Remover</button>
              </div>
            ) : (
              <label className="cursor-pointer flex flex-col items-center gap-1.5">
                <Upload size={20} className="text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-slate-400">PNG, SVG ou WEBP (max 300KB)</span>
                <input type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={handleFileSelect(setLogoLight, 300)} />
              </label>
            )}
          </div>
        </div>

        {/* Logo Dark */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            <Image size={13} className="inline mr-1" /> Logo (fundo escuro)
          </label>
          <div className="relative rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-slate-900 p-4 text-center hover:border-primary transition-colors">
            {logoDark?.preview || (branding.is_white_labeled && branding.logo_dark_url !== '/logoblack.png') ? (
              <div className="flex flex-col items-center gap-2">
                <img src={logoDark?.preview || branding.logo_dark_url} alt="Logo escuro" className="h-16 object-contain" />
                <button onClick={() => setLogoDark(null)} className="text-xs text-red-500 hover:text-red-400">Remover</button>
              </div>
            ) : (
              <label className="cursor-pointer flex flex-col items-center gap-1.5">
                <Upload size={20} className="text-slate-500" />
                <span className="text-xs text-slate-400">PNG, SVG ou WEBP (max 300KB)</span>
                <input type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={handleFileSelect(setLogoDark, 300)} />
              </label>
            )}
          </div>
        </div>

        {/* Favicon */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            <Image size={13} className="inline mr-1" /> Favicon
          </label>
          <div className="relative rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 text-center hover:border-primary transition-colors">
            {favicon?.preview || branding.favicon_url ? (
              <div className="flex flex-col items-center gap-2">
                <img src={favicon?.preview || branding.favicon_url} alt="Favicon" className="h-10 w-10 object-contain" />
                <button onClick={() => setFavicon(null)} className="text-xs text-red-500 hover:text-red-400">Remover</button>
              </div>
            ) : (
              <label className="cursor-pointer flex flex-col items-center gap-1.5">
                <Upload size={20} className="text-gray-400" />
                <span className="text-xs text-gray-500 dark:text-slate-400">ICO ou PNG (max 100KB)</span>
                <input type="file" accept="image/x-icon,image/png,image/vnd.microsoft.icon" className="hidden" onChange={handleFileSelect(setFavicon, 100)} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Powered by toggle */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Powered by CloudAtlas</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">Exibir "Powered by CloudAtlas" no rodapé de e-mails e relatórios</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.powered_by}
          onClick={() => setForm({ ...form, powered_by: !form.powered_by })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            form.powered_by ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            form.powered_by ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Live Preview */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 flex items-center gap-1.5"><Eye size={13} /> Preview</p>
        </div>
        <div className="p-4 flex items-center gap-6">
          {/* Mini sidebar preview */}
          <div className="rounded-lg bg-gray-900 p-3 w-48">
            <div className="flex items-center gap-2 mb-3">
              <img src={logoLight?.preview || branding.logo_light_url} alt="" className="h-6 w-6 object-contain" />
              <span className="text-white text-sm font-bold truncate">{form.platform_name || 'CloudAtlas'}</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 rounded bg-gray-700 w-full" />
              <div className="h-2 rounded bg-gray-700 w-3/4" />
              <div className="h-2 rounded w-5/6" style={{ backgroundColor: form.color_primary }} />
              <div className="h-2 rounded bg-gray-700 w-2/3" />
            </div>
          </div>
          {/* Mini email preview */}
          <div className="flex-1 rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden">
            <div className="px-3 py-2 text-xs" style={{ background: `linear-gradient(135deg, ${form.color_primary}, #1e293b)`, color: '#fff' }}>
              <strong>{form.platform_name || 'CloudAtlas'}</strong> — Gestão Multi-Cloud
            </div>
            <div className="px-3 py-2 text-xs text-gray-600 dark:text-slate-300">
              Olá, esta é uma prévia do e-mail...
            </div>
            <div className="px-3 py-1.5 border-t border-gray-100 dark:border-slate-700 text-center text-[10px] text-gray-400">
              {form.platform_name || 'CloudAtlas'} — Gerenciamento multi-cloud
              {form.powered_by && ' · Powered by CloudAtlas'}
            </div>
          </div>
        </div>
      </div>

      {/* Save + Test Email buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors"
        >
          {saving ? 'Salvando…' : 'Salvar Personalização'}
        </button>
        <button
          onClick={handleTestEmail}
          disabled={sendingTest || saving}
          className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors"
        >
          <Send size={14} />
          {sendingTest ? 'Enviando…' : 'Testar E-mail'}
        </button>
        {success && (
          <span className="text-sm text-green-500 font-medium">Salvo com sucesso!</span>
        )}
      </div>
    </div>
  );
}
