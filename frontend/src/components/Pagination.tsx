interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ←
      </button>
      <span className="text-sm text-(--text) tabular-nums px-1">
        {page} / {totalPages}
      </span>
      <button className="page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        →
      </button>
    </div>
  );
}
