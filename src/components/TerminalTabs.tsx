import { Suspense, lazy, useMemo, useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { X, XCircle, Grid3X3, Maximize2, SplitSquareHorizontal, RotateCw, GitBranch, File as FileIcon, Flag } from 'lucide-react';
import { useTerminalStore } from '../store/terminalStore';
import { useAppStore } from '../store/appStore';
import { toast } from '../store/toastStore';
import { reportInvokeFailure } from '../lib/errorReporter';
import { confirmAction } from '../lib/confirmDialog';
import { TerminalView } from './TerminalView';
import { TerminalGrid } from './TerminalGrid';
import { SplitView } from './SplitView';
import { SessionInsights } from './SessionInsights';
import { SessionMetricsPanel } from './SessionMetricsPanel';
// Monaco-backed views load on first use so the editor runtime isn't in memory
// until a file is actually opened.
const FileEditorView = lazy(() => import('./FileEditorView').then((m) => ({ default: m.FileEditorView })));
import { WelcomeScreen } from './WelcomeScreen';
import { ScriptsMenu } from './ScriptsMenu';
import { ScriptChildPane } from './ScriptChildPane';
import { BottomTerminalPane } from './BottomTerminalPane';
import { useNowTick } from '../hooks/useNowTick';
import { getLastOutputAt } from '../lib/terminalActivity';
import { StateDot } from './StateDot';
import { BrandIcon } from './BrandIcon';
import { specFor } from '../lib/agents';
import { getAnyModelBadgeClasses, getModelBadgeLabel } from '../lib/agentModels';
import { Tooltip } from './ui/Tooltip';
import { TaskBadge } from './TaskBadge';
import { CiRepairBadge } from './CiRepairBadge';
import { PrChip } from './PrChip';
import { RaceGridHeader } from './RaceHeader';
const RaceCompareView = lazy(() => import('./RaceCompareView').then((m) => ({ default: m.RaceCompareView })));
import { closeWithConfirm } from '../lib/closeConfirm';
import type { SessionState } from '../lib/terminalState';

function fileBasename(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

function formatCost(usd: number): string {
  if (usd <= 0) return '';
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

/**
 * The session-first main area. Session switching lives in the sidebar's
 * SessionCards (the old horizontal tab strip is gone - one switcher, not
 * two); this component renders a clean session HEADER for the active
 * session (agent · name · folder · branch · status · cost), the open-file
 * pills, and the terminal content underneath. Grid and split modes replace
 * the whole area when active.
 */
export function TerminalTabs() {
  const { terminals, activeTerminalId, scriptChildren, closeScript } = useTerminalStore();
  const { gridMode, toggleGridMode, gridTerminalIds, splitMode, splitTerminalIds, splitOrientation, splitRatio, setSplitOrientation, setSplitRatio, clearSplit, openFiles, activeFilePath, setActiveFilePath, closeFileTab, showFileTree, showTabActivity, fileSplit, fileSplitRatio, setFileSplit, setFileSplitRatio } = useAppStore();
  // A file opens beside the active terminal (draggable divider) or, when the
  // user picks full width or there is no terminal to sit beside, over it.
  const fileOpen = Boolean(activeFilePath && openFiles.some((t) => t.path === activeFilePath));
  const fileSplitActive = fileOpen && fileSplit && Boolean(activeTerminalId);
  const fileCovers = fileOpen && !fileSplitActive;
  const splitRef = useRef<HTMLDivElement>(null);
  const dividerDrag = useRef<{ x: number; ratio: number; width: number } | null>(null);
  const onDividerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dividerDrag.current = { x: e.clientX, ratio: fileSplitRatio, width: splitRef.current?.clientWidth || 1 };
  };
  const onDividerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dividerDrag.current;
    if (d) setFileSplitRatio(d.ratio + (e.clientX - d.x) / d.width);
  };
  const endDividerDrag = () => { dividerDrag.current = null; };
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') setFileSplitRatio(fileSplitRatio - step);
    else if (e.key === 'ArrowRight') setFileSplitRatio(fileSplitRatio + step);
    else return;
    e.preventDefault();
  };
  const now = useNowTick();
  const terminalStates = useTerminalStore((s) => s.terminalStates);
  const terminalMetrics = useTerminalStore((s) => s.terminalMetrics);
  const gitInfoCache = useTerminalStore((s) => s.gitInfoCache);

  const focusFile = useCallback((path: string) => {
    setActiveFilePath(path);
  }, [setActiveFilePath]);

  const requestCloseFile = async (path: string) => {
    const tab = useAppStore.getState().openFiles.find(t => t.path === path);
    if (tab && tab.content !== tab.original) {
      const ok = await confirmAction(`Discard unsaved changes in ${fileBasename(path)}?`, { okLabel: 'Discard' });
      if (!ok) return;
    }
    closeFileTab(path);
  };

  // Close the active session from the header (#59). Mirrors the sidebar
  // SessionCards' `closeWithReport` so error handling + telemetry stay
  // consistent with the existing close paths (per CLAUDE.md's frontend
  // error-handling rules).
  const closeActiveSession = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const id = activeTerminalId;
    if (!id) return;
    closeWithConfirm(id, e.currentTarget).catch((err) => {
      toast.error('Close failed', 'Could not close the session.');
      reportInvokeFailure('close_terminal', err);
    });
  }, [activeTerminalId]);

  // Script-child terminals are rendered below their parent and bottom-pane
  // shells are rendered in BottomTerminalPane - neither belongs in the main
  // content stack.
  const terminalList = useMemo(
    () =>
      Array.from(terminals.values())
        .filter((t) => !t.scriptParentId && !t.isShellTerminal)
        .map((t) => t.config),
    [terminals]
  );

  // Keep keyboard focus on the active terminal across session switches. Every
  // terminal is permanently mounted (so its xterm + scrollback survive a
  // switch - see the content area below), which means switching only flips
  // visibility; it no longer remounts and auto-focuses the terminal. So focus
  // the newly-shown terminal's xterm here. rAF waits for the visibility flip to
  // paint, since xterm can't focus a `visibility: hidden` textarea.
  useEffect(() => {
    if (!activeTerminalId || fileCovers) return;
    const id = activeTerminalId;
    const raf = requestAnimationFrame(() => {
      useTerminalStore.getState().terminals.get(id)?.xterm?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTerminalId, fileCovers]);

  // If split mode is active with valid terminals, show split view
  if (splitMode && splitTerminalIds && terminals.has(splitTerminalIds[0]) && terminals.has(splitTerminalIds[1])) {
    return (
      <div className="h-full flex flex-col">
        {/* Split Toolbar */}
        <div className="py-1.5 px-3 border-b border-seam flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal size={13} className="text-accent-primary" strokeWidth={1.75} />
            <span className="text-text-primary text-[12px] font-medium">Split View</span>
            <span className="text-text-tertiary text-[11px]">
              {terminals.get(splitTerminalIds[0])?.config.nickname || terminals.get(splitTerminalIds[0])?.config.label}
              {' · '}
              {terminals.get(splitTerminalIds[1])?.config.nickname || terminals.get(splitTerminalIds[1])?.config.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip label="Toggle orientation">
            <button
              onClick={() => setSplitOrientation(splitOrientation === 'horizontal' ? 'vertical' : 'horizontal')}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] text-text-secondary hover:bg-fill-hover hover:text-text-primary transition-colors"
            >
              <RotateCw size={12} strokeWidth={1.75} />
              {splitOrientation === 'horizontal' ? 'Vertical' : 'Horizontal'}
            </button>
            </Tooltip>
            <button
              onClick={clearSplit}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] text-text-secondary hover:bg-fill-hover hover:text-text-primary transition-colors"
            >
              <X size={12} strokeWidth={1.75} />
              Exit Split
            </button>
          </div>
        </div>
        <div className="flex-1">
          <SplitView
            terminalIds={splitTerminalIds}
            orientation={splitOrientation}
            ratio={splitRatio}
            onRatioChange={setSplitRatio}
          />
        </div>
      </div>
    );
  }

  // If grid mode is active, show the grid
  if (gridMode) {
    return (
      <div className="h-full flex flex-col">
        <RaceGridHeader />
        <div className="flex-1 min-h-0">
          <TerminalGrid />
        </div>
      </div>
    );
  }

  const activeInst = activeTerminalId ? terminals.get(activeTerminalId) : null;
  const activeConfig = activeInst?.config;
  const showHeader = Boolean(activeConfig) || openFiles.length > 0;

  // Live session state for the header dot: prefer the poller's classified
  // state; fall back to the live activity timer so the dot lights up
  // instantly on first output before the first poll tick lands.
  let headerState: SessionState = 'idle';
  if (activeConfig) {
    const lastOutputAt = getLastOutputAt(activeConfig.id);
    const liveBusy = lastOutputAt != null && now - lastOutputAt < 2000;
    headerState = terminalStates.get(activeConfig.id) ?? (liveBusy ? 'busy' : 'idle');
  }
  const headerCost = activeConfig ? formatCost(terminalMetrics.get(activeConfig.id)?.costUsd ?? 0) : '';
  const headerGit = activeConfig ? gitInfoCache.get(activeConfig.id) : undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Clean session header - identity of the ACTIVE session only. Switching
          sessions happens in the sidebar's SessionCards; open files render as
          pills after the divider. */}
      {showHeader && (
        <div className="py-1.5 px-2.5 border-b border-seam flex items-center gap-2 min-w-0">
          {activeConfig && (
            <div
              className={`flex items-center gap-2 min-w-0 ${fileCovers ? 'opacity-60' : ''}`}
              data-session-header
            >
              {headerState !== 'idle' && showTabActivity && <StateDot state={headerState} />}
              <Tooltip label={`Agent: ${specFor(activeConfig.agent).displayName}`}>
                <span className="flex-shrink-0 flex items-center">
                  <BrandIcon kind={activeConfig.agent} size={15} />
                </span>
              </Tooltip>
              <span className="text-[13px] font-medium text-text-primary max-w-[220px] truncate">
                {activeConfig.nickname || activeConfig.label}
              </span>
              {terminals.get(activeConfig.id)?.sessionContext?.title && terminals.get(activeConfig.id)?.sessionContext?.title !== (activeConfig.nickname || activeConfig.label) && (
                <>
                  <span className="w-px h-3.5 bg-seam-strong flex-shrink-0" aria-hidden />
                  <span className="text-[12px] text-text-secondary max-w-[260px] truncate" title={terminals.get(activeConfig.id)?.sessionContext?.title}>
                    {terminals.get(activeConfig.id)?.sessionContext?.title}
                  </span>
                </>
              )}
              {activeConfig.working_directory && (
                <>
                  <span className="w-px h-3.5 bg-seam-strong flex-shrink-0" aria-hidden />
                  <span className="text-[11px] text-text-tertiary max-w-[160px] truncate">
                    {fileBasename(activeConfig.working_directory)}
                  </span>
                </>
              )}
              {/* Branch deliberately absent: the interactive branch switcher
                  lives in the titlebar directly above and the status bar
                  carries the rich chip (dirty/ahead/behind) - a third static
                  copy here was duplication. Worktree sessions still get a
                  subtle fork glyph. */}
              {activeConfig.task ? (
                <>
                  <TaskBadge terminalId={activeConfig.id} task={activeConfig.task} />
                  <CiRepairBadge terminalId={activeConfig.id} task={activeConfig.task} />
                </>
              ) : headerGit?.is_worktree && (
                <Tooltip label={`Worktree · ${headerGit.current_branch ?? ''}`}>
                  <GitBranch size={11} className="text-purple-400 flex-shrink-0" />
                </Tooltip>
              )}
              <PrChip terminalId={activeConfig.id} />
              {activeInst?.model && (
                <span className={`text-[9px] px-1.5 h-[16px] flex items-center rounded-md font-medium flex-shrink-0 ${getAnyModelBadgeClasses(activeInst.model)}`}>
                  {getModelBadgeLabel(activeInst.model)}
                </span>
              )}
              {headerCost && (
                <Tooltip label="Estimated session cost (live)">
                  <span className="text-[9px] px-1.5 h-[16px] flex items-center rounded-md font-medium flex-shrink-0 bg-emerald-500/15 text-emerald-400 tabular-nums">
                    {headerCost}
                  </span>
                </Tooltip>
              )}
              {activeInst?.loopInfo && (
                <Tooltip label={`Loop: ${activeInst.loopInfo.interval}`}>
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />
                </Tooltip>
              )}
            </div>
          )}

          {/* Open-file pills */}
          {openFiles.length > 0 && (
            <>
              {activeConfig && (
                <span className="w-px h-5 bg-seam-strong mx-1 flex-shrink-0" aria-hidden />
              )}
              <div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
                {openFiles.map((tab) => {
                  const isActive = activeFilePath === tab.path;
                  const isRace = tab.mode === 'race';
                  const dirty = !isRace && tab.content !== tab.original;
                  return (
                    <Tooltip key={tab.path} label={isRace ? `Race: ${tab.content}` : tab.path}>
                    <button
                      onClick={() => focusFile(tab.path)}
                      onAuxClick={(e) => {
                        if (e.button !== 1) return;
                        e.preventDefault();
                        requestCloseFile(tab.path);
                      }}
                      className={`group relative flex items-center gap-1.5 px-2.5 h-7 rounded-[10px] text-[12px] transition-colors flex-shrink-0 ${
                        isActive
                          ? 'bg-fill-active text-text-primary ring-1 ring-inset ring-seam-strong'
                          : 'hover:bg-fill-hover text-text-secondary'
                      }`}
                    >
                      {isRace
                        ? <Flag size={11} className="text-accent-primary flex-shrink-0" strokeWidth={1.75} />
                        : <FileIcon size={11} className="text-text-tertiary flex-shrink-0" strokeWidth={1.75} />}
                      <span className="max-w-[140px] truncate">{isRace ? tab.content : fileBasename(tab.path)}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          requestCloseFile(tab.path);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            requestCloseFile(tab.path);
                          }
                        }}
                        className="p-0.5 rounded hover:bg-fill-active text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center"
                        aria-label={dirty ? 'Unsaved changes' : 'Close'}
                      >
                        {dirty ? (
                          <span className="w-2 h-2 rounded-full bg-accent-primary" />
                        ) : (
                          <X size={12} />
                        )}
                      </span>
                    </button>
                    </Tooltip>
                  );
                })}
              </div>
            </>
          )}

          {/* Right cluster: project scripts + grid toggle + close active */}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {showFileTree && activeTerminalId && !fileCovers && (() => {
              const inst = terminals.get(activeTerminalId);
              if (!inst || inst.scriptParentId) return null;
              return <ScriptsMenu terminalId={activeTerminalId} cwd={inst.config.working_directory} />;
            })()}
            {gridTerminalIds.length > 0 && (
              <span className="text-[10.5px] text-text-tertiary mr-1 uppercase tracking-wide">
                {gridTerminalIds.length} in grid
              </span>
            )}
            {fileOpen && activeTerminalId && (
              <Tooltip label={fileSplit ? 'Show the file full width' : 'Show the file beside the terminal'}>
                <button
                  onClick={() => setFileSplit(!fileSplit)}
                  aria-pressed={fileSplit}
                  aria-label={fileSplit ? 'Show the file full width' : 'Show the file beside the terminal'}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-medium hover:bg-fill-hover text-text-secondary hover:text-text-primary transition-colors"
                >
                  {fileSplit ? <Maximize2 size={13} strokeWidth={1.75} /> : <SplitSquareHorizontal size={13} strokeWidth={1.75} />}
                  <span className="hidden sm:inline">{fileSplit ? 'Full width' : 'Side by side'}</span>
                </button>
              </Tooltip>
            )}
            <Tooltip label="Toggle Grid View">
              <button
                onClick={toggleGridMode}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-medium transition-colors ${
                  gridTerminalIds.length > 0
                    ? 'bg-accent-primary/18 text-accent-primary ring-1 ring-inset ring-accent-primary/30 hover:bg-accent-primary/25'
                    : 'hover:bg-fill-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                <Grid3X3 size={13} strokeWidth={1.75} />
                <span className="hidden sm:inline">Grid</span>
              </button>
            </Tooltip>
            {/* Close active session (#59). Only visible while a real terminal
                is focused - hidden while browsing a file, and hidden entirely
                when there is no active session. Like the sidebar card X it
                asks first (CloseSessionConfirm); Ctrl+W anchors there too. */}
            {activeConfig && !fileCovers && (
              <>
                <span className="w-px h-4 bg-seam-strong mx-0.5 flex-shrink-0" aria-hidden />
                {/* Labelled, circled glyph so it never reads as the window's
                    caption X that sits right above it. */}
                <Tooltip label="Close this session" shortcut="Ctrl+W">
                  <button
                    onClick={closeActiveSession}
                    aria-label="Close Session"
                    data-close-session-anchor
                    aria-keyshortcuts="Control+W"
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-medium hover:bg-fill-hover text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <XCircle size={13} strokeWidth={1.75} />
                    <span className="hidden sm:inline">Close session</span>
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content area - EVERY terminal stays mounted so its xterm instance and
          scrollback survive session switches; only the active one is visible
          (the rest are `visibility: hidden`, which keeps their layout box sized
          so xterm's fit stays correct, and makes them non-interactive). This
          mirrors grid mode, which already mounts many terminals at once, and
          keeps background terminals' buffers current as their PTYs stream. The
          file editor overlays on top (z-10) when a file tab is active. */}
      <div ref={splitRef} className="flex-1 min-h-0 relative flex">
        <div
          className={`relative min-w-0 h-full ${fileSplitActive ? 'shrink-0' : 'flex-1'}`}
          style={fileSplitActive ? { width: `${fileSplitRatio * 100}%` } : undefined}
        >
        {terminalList.map((terminal) => {
          const tid = terminal.id;
          const isVisible = tid === activeTerminalId && !fileCovers;
          const inst = terminals.get(tid);
          const scriptChildId = scriptChildren.get(tid);
          const scriptInst = scriptChildId ? terminals.get(scriptChildId) : null;
          return (
            <div
              key={tid}
              className="absolute inset-0 flex flex-col"
              style={{ visibility: isVisible ? 'visible' : 'hidden' }}
              aria-hidden={!isVisible}
            >
              <div className="flex-1 min-h-0 flex flex-col">
                <TerminalView terminalId={tid} />
              </div>
              {inst?.config.status === 'Stopped' && inst?.sessionSummary && (
                <SessionInsights summary={inst.sessionSummary} />
              )}
              {inst && terminalMetrics.get(tid) && (
                <SessionMetricsPanel terminalId={tid} />
              )}
              {scriptInst && scriptChildId && (
                <ScriptChildPane
                  parentId={tid}
                  childId={scriptChildId}
                  scriptName={scriptInst.scriptName ?? ''}
                  status={scriptInst.config.status}
                  onClose={() => { void closeScript(tid); }}
                />
              )}
            </div>
          );
        })}
        {!activeTerminalId && !fileOpen && <WelcomeScreen />}
        </div>

        {fileSplitActive && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize terminal and file"
            aria-valuenow={Math.round(fileSplitRatio * 100)}
            tabIndex={0}
            title="Drag to resize"
            onPointerDown={onDividerDown}
            onPointerMove={onDividerMove}
            onPointerUp={endDividerDrag}
            onPointerCancel={endDividerDrag}
            onKeyDown={onDividerKey}
            className="group w-[7px] shrink-0 flex justify-center cursor-col-resize touch-none outline-none"
          >
            <div className="w-px h-full bg-seam-strong group-hover:bg-accent-primary/60 group-focus-visible:bg-accent-primary transition-colors" />
          </div>
        )}

        {fileOpen && activeFilePath && (
          <div
            key={`file:${activeFilePath}`}
            className={fileSplitActive ? 'relative flex-1 min-w-0 bg-elevation-0' : 'absolute inset-0 z-10 bg-elevation-0'}
          >
            <Suspense
              fallback={<div className="h-full flex items-center justify-center text-text-tertiary text-[12px]">Loading editor…</div>}
            >
              {openFiles.find((t) => t.path === activeFilePath)?.mode === 'race'
                ? <RaceCompareView raceId={activeFilePath.slice('race:'.length)} />
                : <FileEditorView path={activeFilePath} />}
            </Suspense>
          </div>
        )}
      </div>

      <BottomTerminalPane />
    </div>
  );
}
