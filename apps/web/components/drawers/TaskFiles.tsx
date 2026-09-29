'use client';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { AttachmentDTO } from '@masar/shared';
import { api, errorKey, uploadFile } from '@/lib/api';
import { keys, useLookup } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { fmtDate, fmtSize } from '@/lib/format';
import { Icon } from '../Icon';
import { useToast } from '../fx';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const fileKind = (mime: string) =>
  /^image\/(png|jpeg|gif|webp|avif)$/.test(mime) ? 'image'
  : /^video\/(mp4|webm|quicktime)$/.test(mime) ? 'video'
  : /^audio\//.test(mime) ? 'audio'
  : 'file';

export function useTaskFiles(taskId: string) {
  return useQuery({ queryKey: keys.attachments(taskId), queryFn: () => api<AttachmentDTO[]>(`/tasks/${taskId}/attachments`) });
}

/** Uploads files one by one (to the task, or to one of its steps). Returns how many succeeded. */
export function useUploader(taskId: string) {
  const { t } = usePrefs();
  const toast = useToast();
  const [uploading, setUploading] = useState<string | null>(null);
  const upload = async (files: File[], stepId?: string) => {
    let ok = 0;
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        toast(t('errFileTooBigNamed', { name: f.name }), 'err');
        continue;
      }
      setUploading(f.name);
      try {
        await uploadFile(`/tasks/${taskId}/attachments`, f, stepId ? { stepId } : {});
        ok++;
      } catch (e) {
        toast(`${f.name}: ${t(errorKey(e))}`, 'err');
      }
    }
    setUploading(null);
    return ok;
  };
  return { upload, uploading };
}

/** A small paperclip button that opens the file picker. */
export function AttachButton({ onFiles, label }: { onFiles: (files: File[]) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="icon-btn attach-btn" onClick={() => input.current?.click()} aria-label={label} title={label}>
        <Icon name="clip" className="sm" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files]);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** A drop area with a "choose files" link. */
export function DropZone({ onFiles, busy, compact }: { onFiles: (files: File[]) => void; busy?: string | null; compact?: boolean }) {
  const { t } = usePrefs();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${compact ? 'compact' : ''} ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
      }}
    >
      <Icon name="upload" />
      {busy ? (
        <p role="status">{t('uploading', { name: busy })}</p>
      ) : (
        <p>
          {t('dropFiles')}{' '}
          <button type="button" className="link-btn" onClick={() => input.current?.click()}>{t('chooseFiles')}</button>
        </p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Uploaded files: image and video previews, other files as download cards. `small` is the compact row used under steps. */
export function FileGrid({ files, canDelete, onDelete, small }: { files: AttachmentDTO[]; canDelete: (f: AttachmentDTO) => boolean; onDelete: (f: AttachmentDTO) => void; small?: boolean }) {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  return (
    <div className={small ? 'files small' : 'files'}>
      {files.map((f) => {
        const url = `/api/attachments/${f.id}`;
        const k = fileKind(f.mime);
        const by = L.person(f.uploaderId);
        return (
          <figure key={f.id} className={`fcard ${k}`}>
            {k === 'image' && (
              <a href={url} target="_blank" rel="noopener" aria-label={t('openFile', { name: f.name })} className="fthumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={f.name} loading="lazy" />
              </a>
            )}
            {k === 'video' && (small ? (
              <a href={url} target="_blank" rel="noopener" className="fthumb ficon" aria-label={t('openFile', { name: f.name })}><Icon name="activity" /></a>
            ) : (
              <video className="fthumb" src={url} controls preload="metadata" />
            ))}
            {k === 'audio' && !small && <audio src={url} controls preload="none" style={{ width: '100%' }} />}
            {(k === 'file' || (k === 'audio' && small)) && (
              <a href={url} className="fthumb ficon" aria-label={t('download')}>
                <Icon name="file" className={small ? '' : 'lg'} />
                {!small && <span className="ext">{(f.name.split('.').pop() || '').slice(0, 5).toUpperCase()}</span>}
              </a>
            )}
            <figcaption>
              <span className="fname" title={f.name} dir="auto">{f.name}</span>
              <span className="fmeta">
                {fmtSize(f.size, lang)}
                {!small && <> · {tx(by?.name).split(' ')[0] || t('someone')}, {fmtDate(f.createdAt, lang)}</>}
              </span>
            </figcaption>
            <div className="factions">
              <a className="icon-btn" href={url} download={f.name} aria-label={t('download')} title={t('download')}>
                <Icon name="download" className="sm" />
              </a>
              {canDelete(f) && (
                <button type="button" className="icon-btn" onClick={() => onDelete(f)} aria-label={t('deleteFile', { name: f.name })} title={t('deleteFile', { name: f.name })}>
                  <Icon name="trash" className="sm" />
                </button>
              )}
            </div>
          </figure>
        );
      })}
    </div>
  );
}

/** Files picked in a form but not uploaded yet. */
export function StagedFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const { t, lang } = usePrefs();
  if (!files.length) return null;
  return (
    <ul className="staged">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`}>
          <Icon name={f.type.startsWith('image/') ? 'overview' : f.type.startsWith('video/') ? 'activity' : 'file'} className="sm" />
          <span className="fname" dir="auto">{f.name}</span>
          <span className="fmeta">{fmtSize(f.size, lang)}</span>
          <button type="button" className="icon-btn" onClick={() => onRemove(i)} aria-label={t('deleteFile', { name: f.name })}>
            <Icon name="x" className="sm" />
          </button>
        </li>
      ))}
    </ul>
  );
}
