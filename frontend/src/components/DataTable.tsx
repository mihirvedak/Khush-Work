import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, flexRender,
  type ColumnDef, type SortingState, type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Download, Search } from 'lucide-react';
import { EmptyState } from './primitives';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** stable row id, used for selection + React keys */
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** px height of the scroll viewport */
  height?: number;
  rowHeight?: number;
  /** show the search box */
  searchable?: boolean;
  searchPlaceholder?: string;
  exportName?: string;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  /** highlight rule, e.g. ongoing events */
  rowClassName?: (row: T) => string | undefined;
  initialSorting?: SortingState;
  density?: 'compact' | 'comfortable';
}

/**
 * UI-07 DataTable: virtualised rows, sticky header, column chooser, CSV export,
 * row-click drawer and a "Showing 1-25 of 84,350" footer. Empty cells render `-`.
 */
export function DataTable<T>({
  data, columns, getRowId, onRowClick, height = 420, rowHeight = 34,
  searchable = true, searchPlaceholder = 'Search', exportName, toolbar,
  emptyTitle = 'No rows for this selection', emptyHint, rowClassName,
  initialSorting = [], density = 'compact',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState('');
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [chooser, setChooser] = useState(false);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId,
    globalFilterFn: 'includesString',
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowH = density === 'compact' ? rowHeight : rowHeight + 8;

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 12,
  });

  const items = virt.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virt.getTotalSize() - items[items.length - 1].end : 0;

  const exportCsv = () => {
    const visible = table.getVisibleLeafColumns();
    const head = visible.map((c) => String((c.columnDef.meta as { csv?: string })?.csv ?? c.id));
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push(
        visible
          .map((c) => {
            const v = r.getValue(c.id);
            const s = v === null || v === undefined ? '' : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const shown = rows.length;
  const total = data.length;

  return (
    <div className="flex min-h-0 flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        {searchable && (
          <label className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt-muted" aria-hidden />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-56 rounded-ctl border border-line bg-subtle py-1 pl-7 pr-2 text-xs text-txt-primary placeholder:text-txt-muted"
            />
          </label>
        )}
        {toolbar}
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setChooser((v) => !v)}
              aria-expanded={chooser}
              title="Choose columns"
              className="rounded p-1.5 text-txt-muted hover:bg-subtle hover:text-txt-secondary"
            >
              <Columns3 size={14} />
            </button>
            {chooser && (
              <div className="absolute right-0 z-30 mt-1 max-h-72 w-56 overflow-auto rounded-ctl border border-line bg-surface p-2 shadow-drawer">
                {table.getAllLeafColumns().map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-subtle">
                    <input
                      type="checkbox"
                      checked={c.getIsVisible()}
                      onChange={c.getToggleVisibilityHandler()}
                    />
                    {String((c.columnDef.meta as { csv?: string })?.csv ?? c.id)}
                  </label>
                ))}
              </div>
            )}
          </div>
          {exportName && (
            <button
              type="button"
              onClick={exportCsv}
              title="Export CSV"
              className="rounded p-1.5 text-txt-muted hover:bg-subtle hover:text-txt-secondary"
            >
              <Download size={14} />
            </button>
          )}
        </div>
      </div>

      {/* body */}
      {shown === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <div ref={scrollRef} className="min-h-0 overflow-auto" style={{ height }}>
          <table className="w-full border-collapse text-xs tnum">
            <thead className="sticky top-0 z-10 bg-subtle">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted();
                    const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                    return (
                      <th
                        key={h.id}
                        style={{ width: h.getSize() }}
                        className="whitespace-nowrap border-b border-line px-2 py-1.5 text-left align-middle font-semibold text-txt-secondary"
                      >
                        {h.isPlaceholder ? null : h.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 hover:text-txt-primary"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <Icon size={11} className={sorted ? 'text-azure-600' : 'text-txt-muted'} aria-hidden />
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {padTop > 0 && <tr style={{ height: padTop }} aria-hidden />}
              {items.map((vi) => {
                const row = rows[vi.index];
                return (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => { if (e.key === 'Enter') onRowClick(row.original); }
                        : undefined
                    }
                    className={clsx(
                      'border-b border-line',
                      vi.index % 2 === 1 && 'bg-subtle/40',
                      onRowClick && 'cursor-pointer hover:bg-azure-50',
                      rowClassName?.(row.original),
                    )}
                    style={{ height: rowH }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="whitespace-nowrap px-2 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {padBottom > 0 && <tr style={{ height: padBottom }} aria-hidden />}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-line px-3 py-1.5 text-2xs text-txt-muted tnum">
        Showing {shown.toLocaleString()} of {total.toLocaleString()} rows
      </footer>
    </div>
  );
}

/** Helper for building columns with a CSV header label. */
export function col<T>(
  id: string, header: string, cell: (row: T) => ReactNode,
  opts: { size?: number; sortFn?: (row: T) => string | number; sortable?: boolean } = {},
): ColumnDef<T, unknown> {
  return {
    id,
    header,
    size: opts.size,
    enableSorting: opts.sortable !== false,
    accessorFn: opts.sortFn ? (r) => opts.sortFn!(r) : undefined,
    cell: (ctx) => cell(ctx.row.original),
    meta: { csv: header },
  } as ColumnDef<T, unknown>;
}

export const useMemoColumns = useMemo;
