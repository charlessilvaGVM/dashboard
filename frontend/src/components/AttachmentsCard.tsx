import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload, Trash2, Download, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  getAttachments, uploadAttachment, deleteAttachment, downloadAttachment,
  isAdmin, type Attachment,
} from '@/services/api';
import { toast } from '@/hooks/use-toast';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const colors: Record<string, string> = {
    pdf: '#dc2626', doc: '#2563eb', docx: '#2563eb',
    xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a',
    ppt: '#ea580c', pptx: '#ea580c',
    zip: '#7c3aed', rar: '#7c3aed',
    txt: '#6b7280', png: '#0891b2', jpg: '#0891b2', jpeg: '#0891b2',
  };
  return (
    <div style={{
      width: '2rem', height: '2rem', borderRadius: '0.375rem', flexShrink: 0,
      background: colors[ext] ?? '#6b7280',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <FileText style={{ width: '1rem', height: '1rem', color: '#fff' }} />
    </div>
  );
}

interface Props {
  dashboardId: number;
  readOnly?: boolean; // non-admin: can download but not upload/delete
}

export default function AttachmentsCard({ dashboardId, readOnly }: Props) {
  const qc        = useQueryClient();
  const fileRef   = useRef<HTMLInputElement>(null);
  const admin     = isAdmin();
  const canEdit   = admin && !readOnly;
  const [downloading, setDownloading] = useState<number | null>(null);
  const [deleting,    setDeleting]    = useState<number | null>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['attachments', dashboardId],
    queryFn: () => getAttachments(dashboardId),
    staleTime: 1000 * 30,
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadAttachment(dashboardId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', dashboardId] });
      toast({ title: 'Arquivo enviado com sucesso' });
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Erro ao enviar', description: err.message }),
  });

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(f => uploadMut.mutate(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleDownload = async (att: Attachment) => {
    setDownloading(att.id);
    try { await downloadAttachment(att.id, att.original_name); }
    catch (err: unknown) { toast({ variant: 'destructive', title: 'Erro ao baixar', description: err instanceof Error ? err.message : '' }); }
    finally { setDownloading(null); }
  };

  const handleDelete = async (att: Attachment) => {
    if (!confirm(`Remover "${att.original_name}"?`)) return;
    setDeleting(att.id);
    try {
      await deleteAttachment(att.id);
      qc.invalidateQueries({ queryKey: ['attachments', dashboardId] });
      toast({ title: 'Arquivo removido' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Erro ao remover', description: err instanceof Error ? err.message : '' });
    } finally { setDeleting(null); }
  };

  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4 text-primary" />
              Documentação
            </CardTitle>
            <CardDescription className="mt-1">
              {canEdit ? 'Anexe documentos, planilhas ou qualquer arquivo relacionado a este dashboard.' : 'Arquivos anexados a este dashboard.'}
            </CardDescription>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadMut.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.875rem', borderRadius: '0.375rem',
                fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
                border: '1px solid #d1d5db', background: '#fff', color: '#374151',
                transition: 'background 0.15s',
                opacity: uploadMut.isPending ? 0.6 : 1,
              }}
              onMouseOver={e => { e.currentTarget.style.background = '#f9fafb'; }}
              onMouseOut={e => { e.currentTarget.style.background = '#fff'; }}
            >
              {uploadMut.isPending
                ? <Loader2 style={{ width: '0.875rem', height: '0.875rem', animation: 'spin 1s linear infinite' }} />
                : <Upload style={{ width: '0.875rem', height: '0.875rem' }} />
              }
              {uploadMut.isPending ? 'Enviando...' : 'Adicionar arquivo'}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <input
          ref={fileRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        {/* drop zone (visible only when can edit and no files) */}
        {canEdit && files.length === 0 && !isLoading && (
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed #e2e8f0', borderRadius: '0.5rem',
              padding: '2rem', textAlign: 'center', cursor: 'pointer',
              color: '#94a3b8', fontSize: '0.875rem', transition: 'border-color 0.15s',
            }}
            onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#93c5fd'; }}
            onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}
          >
            <Upload style={{ width: '1.5rem', height: '1.5rem', margin: '0 auto 0.5rem', opacity: 0.5 }} />
            <p>Clique ou arraste arquivos aqui</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.7 }}>Qualquer tipo de arquivo</p>
          </div>
        )}

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.875rem', padding: '0.5rem 0' }}>
            <Loader2 style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }} />
            Carregando...
          </div>
        )}

        {!isLoading && files.length > 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={e => { if (canEdit) e.preventDefault(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
          >
            {files.map(att => (
              <div
                key={att.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb', background: '#fafafa',
                  transition: 'background 0.12s',
                }}
                onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.background = '#f1f5f9'; }}
                onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.background = '#fafafa'; }}
              >
                {fileIcon(att.original_name)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.original_name}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                    {formatSize(att.size)} · {formatDate(att.created_at)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  <button
                    onClick={() => handleDownload(att)}
                    disabled={downloading === att.id}
                    title="Baixar"
                    style={{ padding: '0.35rem', borderRadius: '0.35rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#2563eb', display: 'flex', alignItems: 'center' }}
                    onMouseOver={e => { e.currentTarget.style.background = '#eff6ff'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {downloading === att.id
                      ? <Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} />
                      : <Download style={{ width: '0.9rem', height: '0.9rem' }} />
                    }
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(att)}
                      disabled={deleting === att.id}
                      title="Remover"
                      style={{ padding: '0.35rem', borderRadius: '0.35rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                      onMouseOver={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fff1f2'; }}
                      onMouseOut={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      {deleting === att.id
                        ? <Loader2 style={{ width: '0.9rem', height: '0.9rem', animation: 'spin 1s linear infinite' }} />
                        : <Trash2 style={{ width: '0.9rem', height: '0.9rem' }} />
                      }
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* drop hint when files exist */}
            {canEdit && (
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center', marginTop: '0.25rem' }}>
                Arraste mais arquivos aqui ou use o botão acima
              </p>
            )}
          </div>
        )}

        {!isLoading && files.length === 0 && !canEdit && (
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Nenhum arquivo anexado.</p>
        )}
      </CardContent>
    </Card>
  );
}
