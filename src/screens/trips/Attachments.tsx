import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store } from '../../app/world';
import type { Attachment, OwnerType } from '../../domain/model';
import { fileSize, prepareFile, useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Confirm, Sheet } from '../../ui/kit';

/** Files of one record. For a record that is not saved yet, files wait in `pending` and are stored on save. */
export function AttachmentField({
  tripId,
  ownerType,
  ownerId,
  pending,
  setPending,
  label = 'Файлы и фото',
}: {
  tripId: string;
  ownerType: OwnerType;
  ownerId: string | null;
  pending: File[];
  setPending: (f: File[]) => void;
  label?: string;
}) {
  const toast = useToast();
  const saved = useLiveQuery(() => (ownerId ? db.attachments.where('ownerId').equals(ownerId).toArray() : Promise.resolve([] as Attachment[])), [ownerId], []);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!ownerId) {
      setPending([...pending, ...Array.from(files)]);
      return;
    }
    for (const f of Array.from(files)) {
      try {
        await store.addAttachment(tripId, ownerType, ownerId, await prepareFile(f));
      } catch (e) {
        toast(`${f.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  return (
    <div className="field">
      <span>{label}</span>
      <div className="att-grid">
        {saved.filter((a) => a.ownerType === ownerType).map((a) => (
          <AttachmentTile key={a.id} att={a} />
        ))}
        {pending.map((f, i) => (
          <div key={`${f.name}-${i}`} className="att-tile pending">
            <Icon name={f.type.startsWith('image/') ? 'image' : 'file'} size={22} />
            <span className="ellipsis tiny">{f.name}</span>
            <button type="button" className="att-x" aria-label={`Убрать ${f.name}`} onClick={() => setPending(pending.filter((_, k) => k !== i))}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        <label className="att-tile add">
          <Icon name="paperclip" size={22} />
          <span className="tiny">Добавить</span>
          <input type="file" className="sr" multiple accept="image/*,application/pdf,.pdf,.pkpass,.txt,.doc,.docx" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ''))} />
        </label>
      </div>
    </div>
  );
}

export function AttachmentTile({ att }: { att: Attachment }) {
  const [open, setOpen] = useState(false);
  const isImage = att.mime.startsWith('image/');
  const url = useAttachmentUrl(isImage ? att.id : null);
  return (
    <>
      <button type="button" className="att-tile" onClick={() => setOpen(true)} aria-label={`Открыть ${att.name}`}>
        {isImage && url ? <img src={url} alt="" /> : <Icon name="file" size={22} />}
        {!isImage && <span className="ellipsis tiny">{att.name}</span>}
      </button>
      {open && <AttachmentViewer att={att} onClose={() => setOpen(false)} />}
    </>
  );
}

function AttachmentViewer({ att, onClose }: { att: Attachment; onClose: () => void }) {
  const url = useAttachmentUrl(att.id);
  const toast = useToast();
  const [del, setDel] = useState(false);
  return (
    <Sheet
      title={att.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn danger" onClick={() => setDel(true)} aria-label="Удалить файл">
            <Icon name="trash" size={18} />
          </button>
          {url && (
            <a className="btn dark" href={url} download={att.name} target="_blank" rel="noopener">
              <Icon name="external" size={18} /> Открыть
            </a>
          )}
        </>
      }
    >
      <span className="faint small">{fileSize(att.size)}</span>
      {url && att.mime.startsWith('image/') && <img className="viewer-img" src={url} alt={att.name} />}
      {url && att.mime === 'application/pdf' && <iframe className="viewer-pdf" src={url} title={att.name} />}
      {!url && <span className="spinner" />}
      {del && (
        <Confirm
          title="Удалить файл?"
          text="Файл удалится с устройства без возможности восстановления."
          confirmLabel="Удалить"
          danger
          onConfirm={async () => {
            await store.deleteAttachment(att.id);
            toast('Файл удалён');
            onClose();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </Sheet>
  );
}

/** Saves files picked before the record existed. */
export async function savePending(tripId: string, ownerType: OwnerType, ownerId: string, files: File[], toast: (t: string) => void) {
  for (const f of files) {
    try {
      await store.addAttachment(tripId, ownerType, ownerId, await prepareFile(f));
    } catch (e) {
      toast(`${f.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** Read-only strip of a record's files on its card. */
export function AttachmentRow({ ownerId }: { ownerId: string }) {
  const files = useLiveQuery(() => db.attachments.where('ownerId').equals(ownerId).toArray(), [ownerId], []);
  if (files.length === 0) return null;
  return (
    <div className="att-grid small-grid" onClick={(e) => e.stopPropagation()}>
      {files.map((a) => (
        <AttachmentTile key={a.id} att={a} />
      ))}
    </div>
  );
}
