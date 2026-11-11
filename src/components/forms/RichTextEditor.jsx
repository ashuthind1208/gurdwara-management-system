import { useEffect, useRef, useState } from 'react';
import uploadService from '../../services/uploadService';

const withSelection = (callback) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  callback(selection);
};

const insertTableHtml = (rows, cols) => {
  const safeRows = Math.max(1, Math.min(10, Number(rows) || 2));
  const safeCols = Math.max(1, Math.min(8, Number(cols) || 2));
  const rowMarkup = Array.from({ length: safeRows }, () => {
    const cellMarkup = Array.from({ length: safeCols }, () => '<td style="border:1px solid #cbd5e1;padding:6px;min-width:80px;">&nbsp;</td>').join('');
    return `<tr>${cellMarkup}</tr>`;
  }).join('');

  return `<table style="border-collapse:collapse;width:100%;margin:8px 0;"><tbody>${rowMarkup}</tbody></table><p><br/></p>`;
};

const RichTextEditor = ({ value = '', onChange, minHeight = 220 }) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const current = String(editor.innerHTML || '');
    const next = String(value || '');
    if (current !== next) {
      editor.innerHTML = next;
    }
  }, [value]);

  const emitChange = () => {
    if (typeof onChange !== 'function' || !editorRef.current) {
      return;
    }
    onChange(String(editorRef.current.innerHTML || '').trim());
  };

  const exec = (command, commandValue = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const handleInsertLink = () => {
    const url = window.prompt('Enter URL (include https://)');
    if (!url) {
      return;
    }

    withSelection((selection) => {
      if (selection.toString().trim()) {
        exec('createLink', url);
      } else {
        const text = window.prompt('Link text', url) || url;
        exec('insertHTML', `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
      }
    });
  };

  const handleInsertImage = () => {
    const url = String(imageUrlInput || '').trim();
    if (!url) {
      return;
    }
    exec('insertImage', url);
    setImageUrlInput('');
    setUploadError('');
    setUploadProgress(0);
    setIsImageModalOpen(false);
  };

  const handleImageFileUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }

    setUploadError('');
    setUploadProgress(0);
    setIsUploadingImage(true);

    try {
      const uploaded = await uploadService.uploadFile({
        service: 'cms',
        file,
        allowedMimeTypes: ['image/*'],
        maxSizeMB: 15,
        onProgress: (progress) => {
          setUploadProgress(progress);
        }
      });

      const uploadedUrl = String(uploaded?.url || '').trim();
      if (!uploadedUrl) {
        throw new Error('Upload succeeded but no URL was returned.');
      }

      setImageUrlInput(uploadedUrl);
      exec('insertImage', uploadedUrl);
      setUploadError('');
      setUploadProgress(0);
      setIsImageModalOpen(false);
    } catch (error) {
      setUploadError(String(error?.message || 'Unable to upload image.'));
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInsertTable = () => {
    const rows = window.prompt('Rows', '2');
    const cols = window.prompt('Columns', '2');
    exec('insertHTML', insertTableHtml(rows, cols));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-2">
        <button type="button" onClick={() => exec('bold')} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">B</button>
        <button type="button" onClick={() => exec('italic')} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold italic text-slate-700">I</button>
        <button type="button" onClick={() => exec('underline')} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold underline text-slate-700">U</button>

        <select
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          defaultValue="Manrope"
          onChange={(event) => exec('fontName', event.target.value)}
          title="Font family"
        >
          <option value="Manrope">Manrope</option>
          <option value="Crimson Text">Crimson Text</option>
          <option value="Georgia">Georgia</option>
          <option value="Arial">Arial</option>
          <option value="Verdana">Verdana</option>
        </select>

        <select
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          defaultValue="3"
          onChange={(event) => exec('fontSize', event.target.value)}
          title="Font size"
        >
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Large</option>
          <option value="5">XL</option>
        </select>

        <input
          type="color"
          className="h-8 w-9 rounded border border-slate-300 bg-white p-1"
          defaultValue="#0f172a"
          onChange={(event) => exec('foreColor', event.target.value)}
          title="Text color"
        />

        <button type="button" onClick={() => exec('removeFormat')} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Clear</button>
        <button type="button" onClick={handleInsertTable} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Table</button>
        <button type="button" onClick={handleInsertLink} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Link</button>
        <button
          type="button"
          onClick={() => {
            setUploadError('');
            setUploadProgress(0);
            setIsImageModalOpen(true);
          }}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
        >
          Insert Image
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label="Rich text content"
        aria-multiline="true"
        className="w-full px-3 py-3 text-sm text-slate-800 outline-none"
        style={{ minHeight }}
        onInput={emitChange}
      />

      {isImageModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/45" onClick={() => setIsImageModalOpen(false)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-slate-900">Insert Image</h4>
              <button
                type="button"
                onClick={() => setIsImageModalOpen(false)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <label className="block text-xs font-semibold text-slate-700">
                Image URL
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(event) => setImageUrlInput(event.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-xs text-slate-700"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Choose File
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleInsertImage}
                  disabled={!String(imageUrlInput || '').trim()}
                  className="inline-flex items-center justify-center rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use URL
                </button>
              </div>

              {isUploadingImage ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Uploading image... {uploadProgress}%
                </div>
              ) : null}

              {uploadError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {uploadError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RichTextEditor;
