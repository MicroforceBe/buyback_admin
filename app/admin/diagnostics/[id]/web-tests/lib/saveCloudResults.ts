
export async function saveCloudResult({
  cloudSessionToken,
  testKey,
  status,
}: {
  cloudSessionToken: string | null;
  testKey: string;
  status: string;
}) {
  if (!cloudSessionToken) {
    return;
  }

  try {
    await fetch("/api/diagnostics/sessions/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: cloudSessionToken,
        status: "running",
        resultPatch: {
          [testKey]: status,
        },
      }),
    });
  } catch (error) {
    console.error(error);
  }
}
