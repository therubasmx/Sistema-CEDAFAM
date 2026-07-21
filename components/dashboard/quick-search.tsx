"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { serviceAreaLabels } from "@/lib/labels";
import type { ServiceArea } from "@prisma/client";

interface SearchResult {
  id: string;
  fullName: string;
  serviceArea: ServiceArea;
}

const MAX_RESULTS = 6;

export function QuickSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search against the patients API (name/phone/expediente).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(term)}`);
      if (res.ok) {
        const data = (await res.json()) as SearchResult[];
        setResults(data.slice(0, MAX_RESULTS));
        setOpen(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(id: string) {
    setOpen(false);
    setQ("");
    router.push(`/dashboard/patients/${id}`);
  }

  return (
    <div ref={boxRef} className="relative max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Buscar paciente por nombre o teléfono…"
        className="pl-9"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => go(r.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="min-w-0 truncate font-medium">{r.fullName}</span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {serviceAreaLabels[r.serviceArea]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
