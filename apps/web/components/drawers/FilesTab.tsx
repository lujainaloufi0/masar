'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { canAttach, canManageTask, type AttachmentDTO, type TaskDTO } from '@masar/shared';
import { api, errorKey, uploadFile } from '@/lib/api';
import { keys, useLookup } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { fmtDate, fmtSize } from '@/lib/format';
import { Icon } from '../Icon';
import { Empty, Skeleton } from '../bits';
import { useToast } from '../fx';

const MAX_BYTES = 20 * 1024 * 1024;
const kind = (mime: string) =>
  /^image\/(png|jpeg|gif|webp|avif)$/.test(mime) ? 'image'
  : /^video\/(mp4|webm|quicktime)$/.test(mime) ? 'video'
  : /^audio\//.test(mime) ? 'audio'
  : 'file';

/** The task's Files tab: upload, preview, download and delete attachments. */
export function FilesTab({ task }: { task: TaskDTO }) {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const { data: files, isLoading } = useQuery({
    queryKey: keys.attachments(task.id),
    queryFn: () => api<AttachmentDTO[]>(`/tasks/${task.id}/attachments`),
  });
  const mayAdd = canAttach(me, task);
  const manager = canManageTask(me, task);

  const upload = async (list: FileList | File[]) => {
    const picked = [...list];
    let added = 0;
    for (const f of picked) {
      if (f.size > MAX_BYTES) {
        toast(t('errFileTooBigNamed', { name: f.name }), 'err');
        continue;
      }
      setUploading(f.name);
      try {
        await uploadFile(`/tasks/${task.id}/attachments`, f);
        added++;
      } catch (e) {
        toast(t(errorKey(e)), 'err');
      }
    }
    setUploading(null);
    if (input.current) input.current.value = '';
    qc.invalidateQueries({ queryKey: keys.attachments(task.id) });
    if (added) toast(added === 1 ? t('fileAdded') : t('filesAdded', { n: added }));
  };

  const remove = async (f: AttachmentDTO) => {
    try {
      await api(`/attachments/${f.id}`, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: keys.attachments(task.id) });
      toast(t('fileDeleted'));
    } catch (e) {
      toast(t(errorKey(e)), 'err');
    }
  };

  return (
    <div className="drawer-b">
      {mayAdd ? (
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
        >
          <Icon name="upload" className="lg" />
          {uploading ? (
            <p role="status">{t('uploading', { name: uploading })}</p>
          ) : (
            <p>
              {t('dropFiles')}{' '}
              <button type="button" className="link-btn" onClick={() => input.current?.click()}>{t('chooseFiles')}</button>
            </p>
          )}
          <span className="faint" style={{ fontSize: 12.5 }}>{t('fileLimit')}</span>
          <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
      ) : (
        <p className="readonly-note"><Icon name="lock" className="sm" />{t('filesReadOnly')}</p>
      )}

      {isLoading ? (
        <Skeleton h={140} />
      ) : !files?.length ? (
        <Empty icon="clip">{t('noFiles')}</Empty>
      ) : (
        <div className="files">
          {files.map((f) => {
            const url = `/api/attachments/${f.id}`;
            const k = kind(f.mime);
            const by = L.person(f.uploaderId);
            return (
              <figure key={f.id} className={`fcard ${k}`}>
                {k === 'image' && (
                  <a href={url} target="_blank" rel="noopener" aria-label={t('openFile', { name: f.name })} className="fthumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={f.name} loading="lazy" />
                  </a>
                )}
                {k === 'video' && <video className="fthumb" src={url} controls preload="metadata" />}
                {k === 'audio' && <audio src={url} controls preload="none" style={{ width: '100%' }} />}
                {k === 'file' && (
                  <a href={url} className="fthumb ficon" aria-label={t('download')}>
                    <Icon name="file" className="lg" />
                    <span className="ext">{(f.name.split('.').pop() || '').slice(0, 5).toUpperCase()}</span>
                  </a>
                )}
                <figcaption>
                  <span className="fname" title={f.name} dir="auto">{f.name}</span>
                  <span className="fmeta">
                    {fmtSize(f.size, lang)} · {tx(by?.name).split(' ')[0] || t('someone')}, {fmtDate(f.createdAt, lang)}
                  </span>
                </figcaption>
                <div className="factions">
                  <a className="icon-btn" href={url} download={f.name} aria-label={t('download')} title={t('download')}>
                    <Icon name="download" className="sm" />
                  </a>
                  {(f.uploaderId === me.id || manager) && (
                    <button className="icon-btn" onClick={() => remove(f)} aria-label={t('deleteFile', { name: f.name })} title={t('deleteFile', { name: f.name })}>
                      <Icon name="trash" className="sm" />
                    </button>
                  )}
                </div>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
