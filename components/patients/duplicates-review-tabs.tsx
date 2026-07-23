"use client";

import { useState } from "react";
import { IntakeMatchesList } from "@/components/patients/intake-matches-list";
import { DuplicateCandidatesList } from "@/components/patients/duplicate-candidates-list";

type Tab = "intake" | "existing";

const TABS: { key: Tab; label: string }[] = [
  { key: "intake", label: "Solicitudes nuevas" },
  { key: "existing", label: "Expedientes existentes" },
];

export function DuplicatesReviewTabs() {
  const [tab, setTab] = useState<Tab>("intake");

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
      {tab === "intake" ? <IntakeMatchesList /> : <DuplicateCandidatesList />}
    </div>
  );
}
