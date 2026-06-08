import React, { useRef, useState } from 'react';
import { Download, Upload, FileX, CheckCircle2, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  downloadBackup, previewBackupImport, executeBackupImport,
  type BackupPreview, type BackupImportResult,
} from '@/services/api';

type ImportMode = 'skip' | 'overwrite';
type Step = 'idle' | 'previewing' | 'preview' | 'importing' | 'done';

function fmtDate(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR'); } catch { return s; }
}

export default function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Import
  const [step,    setStep]    = useState<Step>('idle');
  const [file,    setFile]    = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [mode,    setMode]    = useState<ImportMode>('skip');
  const [result,  setResult]  = useState<BackupImportResult | null>(null);

  // ── Export ────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadBackup();
      toast({ title: 'Backup exportado com sucesso' });
    } catch (e) {
      toast({ title: 'Erro ao exportar', description: String(e), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  // ── Selecionar arquivo ────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setStep('previewing');
    try {
      const prev = await previewBackupImport(f);
      setPreview(prev);
      setStep('preview');
    } catch (e) {
      toast({ title: 'Arquivo inválido', description: String(e), variant: 'destructive' });
      setStep('idle');
      setFile(null);
    }
    // reset input so same file can be re-selecionado
    e.target.value = '';
  };

  // ── Executar importação ────────────────────────────────────
  const handleImport = async () => {
    if (!file || !preview) return;
    setStep('importing');
    try {
      const res = await executeBackupImport(file, mode);
      setResult(res);
      setStep('done');
      toast({ title: 'Importação concluída' });
    } catch (e) {
      toast({ title: 'Erro na importação', description: String(e), variant: 'destructive' });
      setStep('preview');
    }
  };

  const handleReset = () => {
    setStep('idle');
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  const conflicts = (preview?.dashboards.filter(d => d.conflict).length ?? 0) +
                    (preview?.connections.filter(c => c.conflict).length ?? 0);

  return (
    <AppLayout title="Backup / Restauração">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-5 w-5 text-primary" />
              Exportar Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Gera um arquivo <code className="bg-muted px-1 rounded text-xs">.xml</code> com
              todos os dashboards e conexões desta instalação.
            </p>
            <Button onClick={handleExport} disabled={exporting} className="gap-2">
              {exporting
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando...</>
                : <><Download className="h-4 w-4" /> Baixar XML</>}
            </Button>
          </CardContent>
        </Card>

        {/* Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-5 w-5 text-primary" />
              Importar Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Aviso connection_id */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
              <span>
                Dashboards que usam <strong>conexão alternativa</strong> terão o vínculo removido
                ao importar (IDs diferem entre instalações). Reassigne a conexão no editor do dashboard.
              </span>
            </div>

            {/* Step: idle */}
            {(step === 'idle' || step === 'previewing') && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={step === 'previewing'}
                  className="gap-2"
                >
                  {step === 'previewing'
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Analisando...</>
                    : <><Upload className="h-4 w-4" /> Selecionar arquivo .xml</>}
                </Button>
              </div>
            )}

            {/* Step: preview */}
            {(step === 'preview' || step === 'importing') && preview && (
              <div className="space-y-4">
                {/* Cabeçalho do arquivo */}
                <div className="text-sm text-muted-foreground border rounded-lg p-3 space-y-1">
                  <div><span className="font-medium">Arquivo:</span> {file?.name}</div>
                  <div><span className="font-medium">Exportado em:</span> {fmtDate(preview.exportedAt)}</div>
                  <div>
                    <span className="font-medium">Conteúdo:</span>{' '}
                    {preview.dashboards.length} dashboard(s), {preview.connections.length} conexão(ões)
                    {conflicts > 0 && (
                      <span className="ml-2 text-yellow-600 font-medium">
                        — {conflicts} conflito(s) com nomes existentes
                      </span>
                    )}
                  </div>
                </div>

                {/* Lista de dashboards */}
                {preview.dashboards.length > 0 && (
                  <ItemList title="Dashboards" items={preview.dashboards} />
                )}

                {/* Lista de conexões */}
                {preview.connections.length > 0 && (
                  <ItemList title="Conexões" items={preview.connections} />
                )}

                {/* Modo de conflito */}
                {conflicts > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Ao encontrar nome já existente:</p>
                    <div className="flex gap-3">
                      <ModeButton active={mode === 'skip'} onClick={() => setMode('skip')}
                        label="Ignorar" desc="Mantém o existente" />
                      <ModeButton active={mode === 'overwrite'} onClick={() => setMode('overwrite')}
                        label="Sobrescrever" desc="Substitui o existente" color="destructive" />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button onClick={handleImport} disabled={step === 'importing'} className="gap-2">
                    {step === 'importing'
                      ? <><RefreshCw className="h-4 w-4 animate-spin" /> Importando...</>
                      : <><Upload className="h-4 w-4" /> Confirmar Importação</>}
                  </Button>
                  <Button variant="outline" onClick={handleReset} disabled={step === 'importing'}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Step: done */}
            {step === 'done' && result && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <CheckCircle2 className="h-5 w-5" />
                  Importação concluída
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ResultCard
                    title="Dashboards"
                    imported={result.dashboards.imported}
                    overwritten={result.dashboards.overwritten}
                    skipped={result.dashboards.skipped}
                  />
                  <ResultCard
                    title="Conexões"
                    imported={result.connections.imported}
                    overwritten={result.connections.overwritten}
                    skipped={result.connections.skipped}
                  />
                </div>

                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Nova importação
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// ── Subcomponentes ────────────────────────────────────────────
function ItemList({ title, items }: { title: string; items: { nome: string; conflict: boolean }[] }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">{title}</p>
      <div className="border rounded-lg divide-y max-h-48 overflow-y-auto text-sm">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5">
            <span className="truncate">{item.nome}</span>
            {item.conflict
              ? <span className="flex items-center gap-1 text-yellow-600 text-xs shrink-0 ml-2">
                  <AlertTriangle className="h-3 w-3" /> conflito
                </span>
              : <span className="flex items-center gap-1 text-green-600 text-xs shrink-0 ml-2">
                  <CheckCircle2 className="h-3 w-3" /> novo
                </span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, label, desc, color }: {
  active: boolean; onClick: () => void;
  label: string; desc: string; color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 rounded-lg border p-3 text-left text-sm transition-all',
        active
          ? color === 'destructive'
            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
            : 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/40',
      ].join(' ')}
    >
      <div className={['font-medium', active && color === 'destructive' ? 'text-red-600' : active ? 'text-primary' : ''].join(' ')}>
        {label}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </button>
  );
}

function ResultCard({ title, imported, overwritten, skipped }: {
  title: string; imported: number; overwritten: number; skipped: number;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-1 text-sm">
      <p className="font-medium">{title}</p>
      {imported    > 0 && <p className="text-green-600">+{imported} importado(s)</p>}
      {overwritten > 0 && <p className="text-yellow-600">{overwritten} sobrescrito(s)</p>}
      {skipped     > 0 && <p className="text-muted-foreground">{skipped} ignorado(s)</p>}
      {imported + overwritten + skipped === 0 && <p className="text-muted-foreground">Nenhuma alteração</p>}
    </div>
  );
}
