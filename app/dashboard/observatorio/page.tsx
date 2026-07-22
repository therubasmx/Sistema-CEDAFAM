import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const OBSERVATORIO_ITEMS = [
  {
    href: "/dashboard/observatorio/sdq",
    label: "SDQ",
    description: "Cuestionario de Capacidades y Dificultades.",
  },
  {
    href: "/dashboard/observatorio/ecom",
    label: "ECOM",
    description: "Escala de evaluación ECOM.",
  },
  {
    href: "/dashboard/observatorio/evaluacion",
    label: "Evaluación",
    description: "Evaluación general del paciente.",
  },
];

export default function ObservatorioHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Observatorio</h1>
        <p className="text-muted-foreground">
          Instrumentos de evaluación clínica.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OBSERVATORIO_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:border-primary hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  {item.label}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
