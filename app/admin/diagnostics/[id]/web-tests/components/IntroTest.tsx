type Props = {
  sessionId: string;
};

export default function IntroTest({
  sessionId,
}: Props) {
  return (
    <section className="flex min-h-full flex-col justify-center">
      <div className="mb-2 text-xs text-gray-500">
        Sessie {sessionId}
      </div>

      <h2 className="mb-4 text-2xl font-bold">
        Start web diagnostics
      </h2>

      <p className="text-gray-600">
        Deze test draait op de iPhone
        zelf via Safari.
      </p>

      <div className="mt-6 rounded border bg-gray-50 p-4 text-sm">
        Er wordt voorlopig niets
        opgeslagen. Eerst valideren we
        de volledige testervaring.
      </div>
    </section>
  );
}
