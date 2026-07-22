export function ComingSoon({
  title,
  description = "Estamos trabajando en este módulo.",
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-card text-center">
        <div>
          <p className="text-lg font-medium">Próximamente</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
