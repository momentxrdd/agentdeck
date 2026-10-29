import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, Save, RefreshCw, FileCode2, GitCompareArrows } from 'lucide-react';
import Editor, { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppStore } from '../store/appStore';
import { toast } from '../store/toastStore';
import { languageFromPath } from './monacoSetup';
import { pathToFileUri } from '../lib/lsp/paths';
import { CODE_ONLY_OPTIONS, defineAgentdeckThemes, useEditorTheme } from '../lib/monacoTheme';

interface FileEditorViewProps {
  path: string;
}

/**
 * Inline Monaco editor for a single open file tab. Uses `path` as Monaco's
 * model key so switching between file tabs preserves per-file cursor position,
 * selection, and undo history - same behavior as VS Code.
 */
export function FileEditorView({ path }: FileEditorViewProps) {
  const tab = useAppStore((s) => s.openFiles.find((t) => t.path === path));
  const setFileTabContent = useAppStore((s) => s.setFileTabContent);
  const setFileTabMode = useAppStore((s) => s.setFileTabMode);
  const saveFileTab = useAppStore((s) => s.saveFileTab);
  const reloadFileTab = useAppStore((s) => s.reloadFileTab);
  const navigationTarget = useAppStore((s) => s.editorNavigationTarget);
  const clearEditorNavigation = useAppStore((s) => s.clearEditorNavigation);
  const editorTheme = useEditorTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  // Models the DiffEditor is currently showing. We own their disposal - see
  // the cleanup effect below for why @monaco-editor/react must not do it.
  const diffModelsRef = useRef<editor.IDiffEditorModel | null>(null);

  // Individual selectors, not useAppStore(): subscribing to the whole store
  // re-rendered this view (and re-applied every Monaco option) on each
  // keystroke and on unrelated state such as terminal output.
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const editorFontSize = useAppStore((s) => s.editorFontSize);
  const editorLineHeight = useAppStore((s) => s.editorLineHeight);
  const editorTabSize = useAppStore((s) => s.editorTabSize);
  const editorWordWrap = useAppStore((s) => s.editorWordWrap);
  const editorMinimap = useAppStore((s) => s.editorMinimap);
  const editorRenderWhitespace = useAppStore((s) => s.editorRenderWhitespace);
  // Stable between renders so @monaco-editor/react only calls updateOptions
  // when a setting actually changes.
  const options = useMemo<editor.IEditorOptions>(() => ({
    fontFamily: editorFontFamily,
    fontSize: editorFontSize,
    lineHeight: Math.round(editorFontSize * editorLineHeight),
    wordWrap: editorWordWrap ? 'on' : 'off',
    minimap: { enabled: editorMinimap },
    renderWhitespace: editorRenderWhitespace ? 'all' : 'none',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    padding: { top: 8, bottom: 8 },
    ...CODE_ONLY_OPTIONS,
  }), [editorFontFamily, editorFontSize, editorLineHeight, editorWordWrap, editorMinimap, editorRenderWhitespace]);
  const waitingForSave = useRef<(() => void) | null>(null);
  const autoSave = useCallback((): void => {
    const state = useAppStore.getState();
    const current = state.openFiles.find(t => t.path === path);
    if (!state.editorAutoSaveOnBlur || !current || current.loading || current.content === current.original) return;
    if (current.saving) {
      if (!waitingForSave.current) {
        waitingForSave.current = useAppStore.subscribe(next => {
          const latest = next.openFiles.find(t => t.path === path);
          if (latest?.saving) return;
          waitingForSave.current?.();
          waitingForSave.current = null;
          if (latest && !latest.error) autoSave();
        });
      }
      return;
    }
    state.saveFileTab(path).catch(err => toast.error('Auto-save failed', String(err)));
  }, [path]);
  useEffect(() => {
    window.addEventListener('blur', autoSave);
    return () => {
      window.removeEventListener('blur', autoSave);
      // Tab switches unmount the editor; closing/discarding removes the tab
      // from the store first, so it cannot accidentally save discarded edits.
      autoSave();
    };
  }, [autoSave]);
  useEffect(() => {
    editorRef.current?.getModel()?.updateOptions({ tabSize: editorTabSize });
    diffEditorRef.current?.getModifiedEditor().getModel()?.updateOptions({ tabSize: editorTabSize });
  }, [editorTabSize]);

  const dirty = tab ? tab.content !== tab.original : false;
  const language = useMemo(() => languageFromPath(path), [path]);
  // Model key as a proper file:// URI. Passing the raw Windows path would make
  // monaco.Uri.parse() treat 'C:' as a scheme and percent-encode the
  // backslashes, so LSP diagnostics (matched via pathKey) would never attach.
  const modelUri = useMemo(() => pathToFileUri(path), [path]);

  const applyNavigation = (ed: editor.IStandaloneCodeEditor) => {
    if (!navigationTarget || navigationTarget.path !== path) return;
    const position = { lineNumber: navigationTarget.line, column: navigationTarget.column };
    ed.setPosition(position);
    ed.revealPositionInCenter(position);
    ed.focus();
    clearEditorNavigation(navigationTarget.requestId);
  };

  useEffect(() => {
    const ed = tab?.mode === 'diff'
      ? diffEditorRef.current?.getModifiedEditor()
      : editorRef.current;
    if (ed) applyNavigation(ed);
  }, [navigationTarget, path, tab?.mode]);

  // Ctrl/Cmd+S saves the active file. Only active when this path is the
  // currently-focused file tab (the parent only mounts us for the active tab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!dirty) return;
        saveFileTab(path).catch((err) => {
          toast.error('Save failed', typeof err === 'string' ? err : 'Unknown error');
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [path, dirty, saveFileTab]);

  // @monaco-editor/react's DiffEditor cleanup disposes the original/modified
  // TextModels *before* disposing the widget, and DiffEditorWidget reports a
  // BugIndicatingError ("TextModel got disposed before DiffEditorWidget model
  // got reset") when a model it still holds dies under it. We opt out of the
  // library's disposal with keepCurrent*Model and detach the models first.
  // Runs whenever the DiffEditor goes away: mode toggle, file switch, unmount.
  useEffect(() => {
    if (tab?.mode !== 'diff') return;
    return () => {
      const models = diffModelsRef.current;
      diffModelsRef.current = null;
      if (!models) return;
      try {
        // No-op if the widget is already disposed; the guard is removed with it.
        diffEditorRef.current?.setModel(null);
      } catch {
        // Widget already gone - the models are detached either way.
      }
      diffEditorRef.current = null;
      models.original?.dispose();
      models.modified?.dispose();
    };
  }, [tab?.mode, path]);

  const onMount: OnMount = (ed) => {
    editorRef.current = ed;
    ed.getModel()?.updateOptions({ tabSize: editorTabSize });
    ed.focus();
    applyNavigation(ed);
  };

  const onDiffMount: DiffOnMount = (ed) => {
    diffEditorRef.current = ed;
    diffModelsRef.current = ed.getModel();
    const modified = ed.getModifiedEditor();
    modified.getModel()?.updateOptions({ tabSize: editorTabSize });
    // Treat the modified (right) side as editable and pipe its changes into
    // the store so dirty tracking and Save continue to work in diff mode.
    modified.onDidChangeModelContent(() => {
      setFileTabContent(path, modified.getValue());
    });
    modified.focus();
    applyNavigation(modified);
  };

  if (!tab) return null;

  return (
    <div className="group relative h-full flex flex-col bg-bg-primary" onBlurCapture={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) autoSave();
    }}>
      {/* Only the code is shown. The file actions float in on hover (the open
          file's name and unsaved dot live on its pill in the session header). */}
      <div
        className="absolute top-1.5 right-4 z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        title={path}
      >
        <div className="flex items-center gap-1 px-1 h-7 rounded-lg bg-elevation-4 ring-1 ring-seam-strong">
          {tab.repoRoot && (
            <button
              onClick={() => setFileTabMode(path, tab.mode === 'diff' ? 'edit' : 'diff')}
              className={`flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] transition-colors ${
                tab.mode === 'diff'
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-fill-hover'
              }`}
              title={tab.mode === 'diff' ? 'Switch to plain editor' : 'Show diff against HEAD'}
            >
              {tab.mode === 'diff' ? <FileCode2 size={10} strokeWidth={1.75} /> : <GitCompareArrows size={10} strokeWidth={1.75} />}
              {tab.mode === 'diff' ? 'Edit' : 'Diff'}
            </button>
          )}
          <button
            onClick={() => reloadFileTab(path)}
            disabled={tab.loading}
            className="flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] text-text-tertiary hover:text-text-primary hover:bg-fill-hover transition-colors disabled:opacity-40"
            title="Reload from disk"
          >
            <RefreshCw size={10} className={tab.loading ? 'animate-spin' : ''} strokeWidth={1.75} />
            Reload
          </button>
          <button
            onClick={() => {
              if (!dirty) return;
              saveFileTab(path).catch((err) => {
                toast.error('Save failed', typeof err === 'string' ? err : 'Unknown error');
              });
            }}
            disabled={!dirty || tab.saving || tab.loading}
            className="flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] font-medium bg-accent-primary hover:bg-accent-secondary text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Save"
          >
            {tab.saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {tab.loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80 z-10">
            <div className="flex items-center gap-2 text-text-secondary text-[12px]">
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          </div>
        )}
        {tab.error ? (
          <div className="flex items-start justify-center h-full p-6">
            <div className="flex items-start gap-2 max-w-md text-red-400 text-[12.5px]">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <p>{tab.error}</p>
            </div>
          </div>
        ) : tab.mode === 'diff' ? (
          <DiffEditor
            // Remount on file switch: the wrapper swaps the inner editor's
            // model when modifiedModelPath changes without telling the diff
            // widget, which then holds a stale model. A hard remount avoids it.
            key={path}
            height="100%"
            language={language}
            original={tab.headContent}
            modified={tab.content}
            // Key the editable (right) side by the real file URI so LSP
            // markers attach in diff mode too. The original (HEAD) side keeps
            // its auto-generated in-memory model - it gets no markers.
            modifiedModelPath={modelUri}
            keepCurrentOriginalModel
            keepCurrentModifiedModel
            onMount={onDiffMount}
            theme={editorTheme}
            beforeMount={defineAgentdeckThemes}
            options={{ ...options, renderSideBySide: true, readOnly: false, originalEditable: false }}
          />
        ) : (
          <Editor
            height="100%"
            language={language}
            path={modelUri}
            value={tab.content}
            onChange={(v) => setFileTabContent(path, v ?? '')}
            onMount={onMount}
            theme={editorTheme}
            beforeMount={defineAgentdeckThemes}
            options={{ ...options, tabSize: editorTabSize, cursorBlinking: 'smooth' }}
          />
        )}
      </div>
    </div>
  );
}
