"use client";

import { useState } from "react";
import { OrphanEvaluationsList } from "@/components/patients/orphan-evaluations-list";
import { AllFoliosList } from "@/components/patients/all-folios-list";

type Tab = "orphan" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "orphan", label: "Sin expediente" },
  { key: "all", label: "Todos los folios" },
];

export function FoliosTabs() {
  const [tab, setTab] = useState<Tab>("orphan");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "orphan" && <OrphanEvaluationsList />}
      {tab === "all" && <AllFoliosList />}
    </div>
  );
}
